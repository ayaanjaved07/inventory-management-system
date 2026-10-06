"""CSV import/export for the item catalog.

Hand-rolled on the stdlib `csv` module -- the alternative (django-import-export)
was pulled because the round-trip needs custom name-to-FK resolution anyway, so
the library was buying us nothing.

Two rules shape everything here:

1. **Export and import share `CSV_COLUMNS`.** An exported file must re-import
   without edits. `ItemSerializer` cannot be reused for this: it declares
   `category_name` and `currency_code` as `read_only`, so feeding an export
   straight back through it would silently create every item with no category.
   Resolution happens here instead.
2. **Stock is never importable.** On-hand is derived from the ledger, so it can
   only be changed through `record_movement()`. `on_hand` is exported for the
   reader's benefit and ignored on the way back in.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.db import transaction

from core.models import ActivityLog, Currency

from .models import Category, Item

# Order matters -- this is the export header and the canonical column order.
CSV_COLUMNS = [
    "sku",
    "name",
    "description",
    "category_name",
    "unit",
    "unit_cost",
    "currency_code",
    "reorder_point",
    "expiry_date",
    "is_active",
    "on_hand",
]

# Read back from the file. `on_hand` is deliberately absent: see rule 2 above.
IMPORTABLE_COLUMNS = [c for c in CSV_COLUMNS if c != "on_hand"]

_TRUE = {"true", "t", "yes", "y", "1"}
_FALSE = {"false", "f", "no", "n", "0"}


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


def export_items_csv(items) -> str:
    """Render items as CSV text. `items` is any iterable of Item."""
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=CSV_COLUMNS, lineterminator="\n")
    writer.writeheader()
    for item in items:
        writer.writerow(
            {
                "sku": item.sku,
                "name": item.name,
                "description": item.description,
                "category_name": item.category.name if item.category else "",
                "unit": item.unit,
                "unit_cost": item.unit_cost,
                "currency_code": item.currency.code if item.currency else "",
                "reorder_point": item.reorder_point,
                "expiry_date": item.expiry_date.isoformat() if item.expiry_date else "",
                "is_active": "true" if item.is_active else "false",
                # Read-only context for whoever opens the file; ignored on import.
                "on_hand": getattr(item, "on_hand", ""),
            }
        )
    return buffer.getvalue()


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------


@dataclass
class ImportReport:
    """Outcome of one import run, dry or committed."""

    created: int = 0
    updated: int = 0
    errors: list[dict] = field(default_factory=list)
    committed: bool = False

    @property
    def ok(self) -> bool:
        return not self.errors

    def as_dict(self) -> dict:
        return {
            "committed": self.committed,
            "created": self.created,
            "updated": self.updated,
            "errors": self.errors,
        }


class CsvImportError(Exception):
    """A problem with the file as a whole, as opposed to one row."""


def _normalize_sku(raw: str) -> str:
    """Uppercase + strip.

    `Item.sku` is `unique=True` on a CharField, which is case-SENSITIVE on
    Postgres (production) and case-INSENSITIVE on SQLite (dev). Without
    normalizing, an import that updates a row locally would create a duplicate
    on Render. Folding to one case here makes both backends agree.
    """
    return raw.strip().upper()


def _parse_bool(raw: str, default: bool = True) -> bool:
    value = (raw or "").strip().lower()
    if not value:
        return default
    if value in _TRUE:
        return True
    if value in _FALSE:
        return False
    raise ValueError(f"is_active: expected true/false, got {raw!r}")


def _resolve_category(name: str, cache: dict) -> Category | None:
    name = (name or "").strip()
    if not name:
        return None
    if name in cache:
        return cache[name]
    # Category.name is NOT unique, so a name can be ambiguous. Refuse to guess.
    matches = list(Category.objects.filter(name__iexact=name)[:2])
    if not matches:
        raise ValueError(f"category_name: no category named {name!r}")
    if len(matches) > 1:
        raise ValueError(f"category_name: {name!r} matches more than one category")
    cache[name] = matches[0]
    return matches[0]


def _resolve_currency(code: str, cache: dict) -> Currency | None:
    code = (code or "").strip().upper()
    if not code:
        return None
    if code not in cache:
        currency = Currency.objects.filter(code=code).first()
        if currency is None:
            raise ValueError(f"currency_code: unknown currency {code!r}")
        cache[code] = currency
    return cache[code]


def _parse_row(row: dict, categories: dict, currencies: dict) -> dict:
    """One CSV row -> Item field values. Raises ValueError with a readable message."""
    sku = _normalize_sku(row.get("sku", ""))
    if not sku:
        raise ValueError("sku: required")

    name = (row.get("name") or "").strip()
    if not name:
        raise ValueError("name: required")

    unit = (row.get("unit") or Item.Unit.PIECE).strip()
    if unit not in Item.Unit.values:
        raise ValueError(f"unit: expected one of {', '.join(Item.Unit.values)}, got {unit!r}")

    try:
        unit_cost = Decimal((row.get("unit_cost") or "0").strip() or "0")
    except InvalidOperation:
        raise ValueError(f"unit_cost: not a number ({row.get('unit_cost')!r})") from None
    if unit_cost < 0:
        raise ValueError("unit_cost: must not be negative")

    try:
        reorder_point = int((row.get("reorder_point") or "0").strip() or "0")
    except ValueError:
        raise ValueError(f"reorder_point: not a whole number ({row.get('reorder_point')!r})") from None
    if reorder_point < 0:
        raise ValueError("reorder_point: must not be negative")

    # Optional. Blank means the item does not expire.
    raw_expiry = (row.get("expiry_date") or "").strip()
    try:
        expiry_date = date.fromisoformat(raw_expiry) if raw_expiry else None
    except ValueError:
        raise ValueError(f"expiry_date: expected YYYY-MM-DD, got {raw_expiry!r}") from None

    return {
        "sku": sku,
        "name": name,
        "description": (row.get("description") or "").strip(),
        "category": _resolve_category(row.get("category_name", ""), categories),
        "unit": unit,
        "unit_cost": unit_cost,
        "currency": _resolve_currency(row.get("currency_code", ""), currencies),
        "reorder_point": reorder_point,
        "expiry_date": expiry_date,
        # A re-imported SKU is reactivated unless the file says otherwise. Soft
        # deletes exist to protect ledger history, not to blocklist the SKU.
        "is_active": _parse_bool(row.get("is_active", ""), default=True),
    }


def import_items_csv(file_obj, user, commit: bool = False) -> ImportReport:
    """Validate a CSV of items, and apply it if `commit`.

    Dry run by default: the caller shows the counts and per-row errors, then
    re-posts with commit=true. A committed run is all-or-nothing -- one bad row
    aborts the whole file, so a half-applied catalog is not a state that exists.
    """
    try:
        text = file_obj.read()
    except Exception:  # pragma: no cover - defensive
        raise CsvImportError("Could not read the uploaded file.") from None
    if isinstance(text, bytes):
        try:
            # utf-8-sig: Excel writes a BOM, and it would end up glued to the
            # first header name ("﻿sku"), making every row fail on sku.
            text = text.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise CsvImportError("File must be UTF-8 encoded CSV.") from None

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise CsvImportError("The file is empty.")

    headers = {(h or "").strip().lower() for h in reader.fieldnames}
    missing = {"sku", "name"} - headers
    if missing:
        raise CsvImportError(
            f"Missing required column(s): {', '.join(sorted(missing))}. "
            f"Expected header: {','.join(IMPORTABLE_COLUMNS)}"
        )

    report = ImportReport()
    categories: dict = {}
    currencies: dict = {}
    seen_skus: dict[str, int] = {}
    parsed: list[tuple[int, dict]] = []
    max_rows = getattr(settings, "IMPORT_MAX_ROWS", 5000)

    for number, raw in enumerate(reader, start=2):  # row 1 is the header
        if len(parsed) + len(report.errors) >= max_rows:
            raise CsvImportError(f"File exceeds the {max_rows}-row limit.")

        # DictReader normalises nothing; strip the keys so " sku" still works.
        row = {(k or "").strip().lower(): v for k, v in raw.items() if k}
        try:
            values = _parse_row(row, categories, currencies)
        except ValueError as exc:
            report.errors.append(
                {"row": number, "sku": (row.get("sku") or "").strip(), "message": str(exc)}
            )
            continue

        if values["sku"] in seen_skus:
            report.errors.append(
                {
                    "row": number,
                    "sku": values["sku"],
                    "message": f"sku: duplicated in this file (also on row {seen_skus[values['sku']]})",
                }
            )
            continue
        seen_skus[values["sku"]] = number
        parsed.append((number, values))

    # Counts describe what WOULD happen, so the dry run and the commit agree.
    # Matching an existing SKU includes soft-deleted items on purpose.
    existing = set(
        Item.objects.filter(sku__in=[v["sku"] for _, v in parsed]).values_list("sku", flat=True)
    )
    report.created = sum(1 for _, v in parsed if v["sku"] not in existing)
    report.updated = len(parsed) - report.created

    if not commit or report.errors:
        return report

    with transaction.atomic():
        for _, values in parsed:
            sku = values.pop("sku")
            item, created = Item.objects.update_or_create(sku=sku, defaults=values)
            if created:
                # Match what ActivityLoggedMixin._creator_kwargs stamps elsewhere.
                item.created_by = user
                item.save(update_fields=["created_by"])

        # One summary row, not one per item: a 5,000-row import through the
        # normal mixin would bury every other entry on the activity page.
        ActivityLog.objects.create(
            user=user if (user and user.is_authenticated) else None,
            action=ActivityLog.Action.IMPORT,
            model_name="Item",
            object_id="",
            object_repr=f"CSV import: {report.created} created, {report.updated} updated",
            changes={"created": report.created, "updated": report.updated},
        )

    report.committed = True
    return report
