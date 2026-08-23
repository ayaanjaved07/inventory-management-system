"""The ONLY sanctioned way to read or write stock.

On-hand quantity is never stored -- it is summed from the append-only
StockMovement ledger. Every write goes through `record_movement`, so there is
exactly one place where stock can change and one place to audit.
"""

from __future__ import annotations

from django.db import transaction
from django.db.models import Sum
from django.utils.translation import gettext_lazy as _

from .models import Location, MovementType, StockMovement

# Direction each movement type applies to the ledger.
_OUTBOUND = {
    MovementType.ISSUE,
    MovementType.TRANSFER_OUT,
    MovementType.SALE,
    MovementType.PROJECT_ISSUE,
}
_INBOUND = {
    MovementType.RECEIPT,
    MovementType.TRANSFER_IN,
    MovementType.RETURN,
    MovementType.PROJECT_RETURN,
}
# ADJUSTMENT is deliberately in neither: it carries its own sign.


class InsufficientStock(Exception):
    """Raised instead of letting on-hand go negative."""

    def __init__(self, item, location, requested: int, available: int):
        self.item, self.location = item, location
        self.requested, self.available = requested, available
        super().__init__(
            _("Cannot remove %(req)d of %(sku)s from %(loc)s: only %(avail)d on hand.")
            % {"req": requested, "sku": item.sku, "loc": location.code, "avail": available}
        )


def signed_quantity(movement_type: str, quantity: int) -> int:
    """Map a user-facing magnitude onto a signed ledger delta."""
    if movement_type in _OUTBOUND:
        return -abs(quantity)
    if movement_type in _INBOUND:
        return abs(quantity)
    return int(quantity)  # ADJUSTMENT keeps the caller's sign


def on_hand(item, location=None) -> int:
    """Current quantity, derived from the ledger."""
    qs = StockMovement.objects.filter(item=item)
    if location is not None:
        qs = qs.filter(location=location)
    return qs.aggregate(total=Sum("quantity"))["total"] or 0


def on_hand_as_of(item, when, location=None) -> int:
    """Quantity at a point in time -- free, because the ledger is immutable."""
    qs = StockMovement.objects.filter(item=item, created_at__lte=when)
    if location is not None:
        qs = qs.filter(location=location)
    return qs.aggregate(total=Sum("quantity"))["total"] or 0


def annotate_on_hand(item_queryset, location=None):
    """Attach `on_hand` to an Item queryset in one query, for list views."""
    from django.db.models import IntegerField, OuterRef, Subquery
    from django.db.models.functions import Coalesce

    movements = StockMovement.objects.filter(item=OuterRef("pk"))
    if location is not None:
        movements = movements.filter(location=location)
    subquery = (
        movements.values("item")
        .annotate(total=Sum("quantity"))
        .values("total")[:1]
    )
    return item_queryset.annotate(
        on_hand=Coalesce(Subquery(subquery, output_field=IntegerField()), 0)
    )


def levels_by_location(item):
    """Per-location breakdown for one item."""
    rows = (
        StockMovement.objects.filter(item=item)
        .values("location__id", "location__code", "location__name")
        .annotate(quantity=Sum("quantity"))
        .order_by("location__name")
    )
    return [
        {
            "location_id": r["location__id"],
            "location_code": r["location__code"],
            "location_name": r["location__name"],
            "quantity": r["quantity"] or 0,
        }
        for r in rows
    ]


@transaction.atomic
def record_movement(
    *,
    item,
    location: Location,
    movement_type: str,
    quantity: int,
    user=None,
    unit_cost=None,
    note: str = "",
    reference_type: str = "",
    reference_id: str = "",
    allow_negative: bool = False,
) -> StockMovement:
    """Append one row to the ledger.

    `quantity` is a positive magnitude for directional types; ADJUSTMENT keeps
    the sign it is given. Raises InsufficientStock rather than allowing a
    negative on-hand, unless `allow_negative` is set (used by stock-take
    corrections, where reality outranks the ledger).
    """
    if quantity == 0:
        raise ValueError(_("Quantity cannot be zero."))

    delta = signed_quantity(movement_type, quantity)

    if delta < 0 and not allow_negative:
        # Lock the item's rows so two concurrent issues can't both pass the check.
        current = (
            StockMovement.objects.select_for_update()
            .filter(item=item, location=location)
            .aggregate(total=Sum("quantity"))["total"]
            or 0
        )
        if current + delta < 0:
            raise InsufficientStock(item, location, abs(delta), current)

    return StockMovement.objects.create(
        item=item,
        location=location,
        movement_type=movement_type,
        quantity=delta,
        unit_cost=unit_cost,
        note=note,
        reference_type=reference_type,
        reference_id=reference_id,
        created_by=user if (user and user.is_authenticated) else None,
    )


def low_stock_items(threshold_field: str = "reorder_point"):
    """Items at or below their reorder point -- the low-stock alert feed."""
    from catalog.models import Item

    items = annotate_on_hand(Item.objects.filter(is_active=True))
    return [i for i in items if i.on_hand <= getattr(i, threshold_field, 0)]
