"""Read-only tools the assistant may call.

Two rules, and the whole design follows from them:

**1. Every tool runs as the requesting user, through the same querysets and
services the REST API uses.** Never raw SQL, never a service account. Otherwise
"what's in the Delhi warehouse?" quietly becomes privilege escalation: the model
would be a way to read data the asker's own endpoints would refuse.

**2. Every tool is read-only.** There is no write tool and no `record_movement`
call anywhere in this module. Reads are open to any authenticated user in
`accounts/permissions.py` (the role map governs writes only), so a read-only
toolset cannot surface anything the caller's own REST endpoints would not.
*If a write tool is ever added, that reasoning stops holding* -- it would have
to check `WRITE_ROLES` for the calling user before doing anything.

Function calling rather than RAG: the data is structured, so typed tools beat
embeddings. There is nothing to chunk and no similarity to get wrong.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db.models import F, Sum
from django.utils import timezone

from catalog.models import Item
from projects.models import Allocation, Project
from projects.services import available_quantity, reserved_quantity
from sales.models import Sale, SaleLine
from stock.models import Location, StockMovement
from stock.services import annotate_on_hand, levels_by_location, on_hand

MAX_ROWS = 25


def _item_row(item) -> dict:
    return {
        "sku": item.sku,
        "name": item.name,
        "category": item.category.name if item.category else None,
        "unit": item.unit,
        "unit_cost": str(item.unit_cost),
        "on_hand": getattr(item, "on_hand", None),
        "reorder_point": item.reorder_point,
    }


def search_items(user, query: str = "", low_stock_only: bool = False, limit: int = 10) -> dict:
    """Find items by SKU, name or category."""
    qs = annotate_on_hand(
        Item.objects.filter(is_active=True).select_related("category")
    )
    if query:
        from django.db.models import Q

        qs = qs.filter(
            Q(sku__icontains=query)
            | Q(name__icontains=query)
            | Q(category__name__icontains=query)
        )
    if low_stock_only:
        qs = qs.filter(on_hand__lte=F("reorder_point"))

    rows = list(qs[: min(limit, MAX_ROWS)])
    return {"count": len(rows), "items": [_item_row(i) for i in rows]}


def get_stock_level(user, sku: str, location_code: str = "") -> dict:
    """On-hand, reserved and available for one item, optionally at one location.

    Returns all three because they are different numbers: on_hand includes units
    already promised to a project, and only `available` may be offered to
    someone new.
    """
    item = Item.objects.filter(sku__iexact=sku).first()
    if item is None:
        return {"error": f"No item with SKU {sku!r}."}

    location = None
    if location_code:
        location = Location.objects.filter(code__iexact=location_code).first()
        if location is None:
            return {"error": f"No location with code {location_code!r}."}

    return {
        "sku": item.sku,
        "name": item.name,
        "location": location.code if location else "all locations",
        "on_hand": on_hand(item, location),
        "reserved_for_projects": reserved_quantity(item, location),
        "available_to_promise": available_quantity(item, location),
        "reorder_point": item.reorder_point,
        "by_location": levels_by_location(item) if location is None else None,
    }


def list_low_stock(user, limit: int = 10) -> dict:
    """Items at or below their reorder point."""
    qs = annotate_on_hand(Item.objects.filter(is_active=True).select_related("category"))
    rows = list(qs.filter(on_hand__lte=F("reorder_point"))[: min(limit, MAX_ROWS)])
    return {"count": len(rows), "items": [_item_row(i) for i in rows]}


def get_recent_movements(user, sku: str = "", limit: int = 10) -> dict:
    """Recent ledger entries, newest first. The ledger is the audit trail."""
    qs = StockMovement.objects.select_related("item", "location", "created_by")
    if sku:
        qs = qs.filter(item__sku__iexact=sku)
    rows = list(qs.order_by("-created_at", "-id")[: min(limit, MAX_ROWS)])
    return {
        "count": len(rows),
        "movements": [
            {
                "date": m.created_at.isoformat(),
                "sku": m.item.sku,
                "location": m.location.code,
                "type": m.get_movement_type_display(),
                "quantity": m.quantity,   # signed: negative left the shelf
                "note": m.note,
                "by": m.created_by.username if m.created_by else None,
            }
            for m in rows
        ],
    }


def sales_summary(user, days: int = 30) -> dict:
    """Revenue and best sellers over a window.

    Revenue uses each sale's own `exchange_rate_used`, never a live conversion --
    historical totals must not drift when today's rate moves.
    """
    days = max(1, min(days, 365))
    since = timezone.localdate() - timedelta(days=days)
    sales = list(Sale.objects.filter(sale_date__gte=since))

    revenue = sum(
        (s.total_amount * s.exchange_rate_used for s in sales), start=Decimal("0")
    ).quantize(Decimal("0.01"))

    top = (
        SaleLine.objects.filter(sale__sale_date__gte=since)
        .values("item__sku", "item__name")
        .annotate(quantity=Sum("quantity"), revenue=Sum("line_total"))
        .order_by("-revenue")[:5]
    )

    return {
        "days": days,
        "currency": settings.BASE_CURRENCY,
        "invoice_count": len(sales),
        "revenue": str(revenue),
        "top_items": [
            {
                "sku": r["item__sku"],
                "name": r["item__name"],
                "quantity": r["quantity"],
                "revenue": str(r["revenue"]),
            }
            for r in top
        ],
    }


def project_allocations(user, project_code: str = "") -> dict:
    """What is reserved for, issued to, and still held by a project."""
    qs = Allocation.objects.select_related("project", "item", "location", "assigned_to")
    if project_code:
        project = Project.objects.filter(code__iexact=project_code).first()
        if project is None:
            return {"error": f"No project with code {project_code!r}."}
        qs = qs.filter(project=project)

    rows = list(qs.order_by("-created_at")[:MAX_ROWS])
    return {
        "count": len(rows),
        "allocations": [
            {
                "project": a.project.code,
                "sku": a.item.sku,
                "item": a.item.name,
                "location": a.location.code,
                "assigned_to": a.assigned_to.username if a.assigned_to else None,
                "allocated": a.quantity_allocated,
                "issued": a.quantity_issued,
                "returned": a.quantity_returned,
                "still_reserved": a.outstanding_reservation,
                "still_held": a.quantity_outstanding,
                "status": a.get_status_display(),
            }
            for a in rows
        ],
    }


def list_projects(user) -> dict:
    """All projects and their status."""
    rows = list(Project.objects.select_related("manager").order_by("-created_at")[:MAX_ROWS])
    return {
        "count": len(rows),
        "projects": [
            {
                "code": p.code,
                "name": p.name,
                "status": p.get_status_display(),
                "manager": p.manager.username if p.manager else None,
                "start_date": p.start_date.isoformat() if p.start_date else None,
            }
            for p in rows
        ],
    }


# Name -> (callable, JSON Schema for its arguments). The schema is what Gemini
# sees; `user` is injected by the runner and never exposed as a parameter.
TOOLS: dict[str, tuple] = {
    "search_items": (
        search_items,
        {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Text to match against SKU, name or category.",
                },
                "low_stock_only": {
                    "type": "boolean",
                    "description": "Only items at or below their reorder point.",
                },
                "limit": {"type": "integer", "description": "Max rows (default 10)."},
            },
        },
    ),
    "get_stock_level": (
        get_stock_level,
        {
            "type": "object",
            "properties": {
                "sku": {"type": "string", "description": "Exact SKU of the item."},
                "location_code": {
                    "type": "string",
                    "description": "Optional location code, e.g. MAIN or LAB.",
                },
            },
            "required": ["sku"],
        },
    ),
    "list_low_stock": (
        list_low_stock,
        {
            "type": "object",
            "properties": {"limit": {"type": "integer", "description": "Max rows."}},
        },
    ),
    "get_recent_movements": (
        get_recent_movements,
        {
            "type": "object",
            "properties": {
                "sku": {"type": "string", "description": "Optional: one item only."},
                "limit": {"type": "integer", "description": "Max rows."},
            },
        },
    ),
    "sales_summary": (
        sales_summary,
        {
            "type": "object",
            "properties": {
                "days": {"type": "integer", "description": "Window in days (default 30)."}
            },
        },
    ),
    "project_allocations": (
        project_allocations,
        {
            "type": "object",
            "properties": {
                "project_code": {
                    "type": "string",
                    "description": "Optional: one project only, e.g. PRJ-2026-01.",
                }
            },
        },
    ),
    "list_projects": (list_projects, {"type": "object", "properties": {}}),
}


def call_tool(name: str, args: dict, user) -> dict:
    """Run one tool as `user`. Unknown names are reported, never guessed at."""
    entry = TOOLS.get(name)
    if entry is None:
        return {"error": f"Unknown tool {name!r}."}
    func, _schema = entry
    try:
        return func(user, **(args or {}))
    except TypeError as exc:
        return {"error": f"Bad arguments for {name}: {exc}"}
