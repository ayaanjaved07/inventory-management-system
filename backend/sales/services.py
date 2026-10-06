"""The only sanctioned way to record a sale.

A sale is three facts that must all be true together, or none of them:

1. an invoice exists,
2. the stock it sold has left the ledger,
3. the exchange rate it was priced at is frozen onto the row.

Before this module existed, creating a `Sale` did none of (2) or (3) -- the
invoice was written and the stock stayed on the shelf. So this mirrors the rule
`stock/services.py` already sets: **nothing else may create a Sale.**
"""

from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils.translation import gettext_lazy as _

from core.services import get_rate
from stock.models import MovementType
from stock.services import record_movement

from .models import Purchase, PurchaseLine, Sale, SaleLine


class RateUnavailable(Exception):
    """No live rate and nothing stored to fall back on.

    Raised rather than defaulting to 1: an invented rate of 1 would silently
    misprice the sale, and the error is invisible once the row is written.
    """


@transaction.atomic
def record_sale(
    *,
    invoice_no: str,
    location,
    sale_date,
    lines: list[dict],
    customer=None,
    currency: str | None = None,
    note: str = "",
    user=None,
) -> Sale:
    """Create a sale, freeze its rate, and take the stock out of the ledger.

    `lines` is a list of ``{"item": Item, "quantity": int, "unit_price": Decimal}``;
    `unit_price` may be omitted, in which case the item's own unit_cost is used.

    Everything happens in one transaction. If any line oversells,
    `InsufficientStock` propagates and the whole sale is rolled back -- there is
    no such thing as a half-recorded invoice.
    """
    if not lines:
        raise ValueError(_("A sale needs at least one line."))

    currency = (currency or settings.BASE_CURRENCY).upper()

    # Frozen at sale time. Sale.total_in_base_currency multiplies by this, so
    # the direction is sale currency -> base currency.
    try:
        rate = get_rate(currency, settings.BASE_CURRENCY)
    except Exception as exc:
        raise RateUnavailable(
            _("No exchange rate available for %(cur)s.") % {"cur": currency}
        ) from exc

    sale = Sale.objects.create(
        invoice_no=invoice_no,
        customer=customer,
        location=location,
        sale_date=sale_date,
        currency=currency,
        exchange_rate_used=rate,
        note=note,
        created_by=user,
    )

    for line in lines:
        item = line["item"]
        quantity = int(line["quantity"])
        if quantity <= 0:
            raise ValueError(_("Line quantities must be positive."))
        unit_price = line.get("unit_price")
        if unit_price is None:
            unit_price = item.unit_cost

        # SaleLine.save() computes line_total from these two.
        SaleLine.objects.create(
            sale=sale, item=item, quantity=quantity, unit_price=Decimal(unit_price)
        )

        # The ledger write. SALE is already in _OUTBOUND, so the sign and the
        # negative-stock guard are handled by record_movement.
        record_movement(
            item=item,
            location=location,
            movement_type=MovementType.SALE,
            quantity=quantity,
            user=user,
            unit_cost=unit_price,
            reference_type="Sale",
            reference_id=str(sale.pk),
            note=_("Sold on %(invoice)s") % {"invoice": sale.invoice_no},
        )

    sale.recalculate_total()
    return sale


def next_invoice_no(prefix: str = "INV") -> str:
    """A unique-enough invoice number so the UI need not invent one.

    `invoice_no` is unique=True, so a collision is a 400 the caller can retry
    rather than silent corruption.
    """
    from django.utils import timezone

    year = timezone.localdate().year
    count = Sale.objects.filter(invoice_no__startswith=f"{prefix}-{year}-").count()
    return f"{prefix}-{year}-{count + 1:04d}"


@transaction.atomic
def record_purchase(
    *,
    reference_no: str,
    supplier,
    location,
    purchase_date,
    lines: list[dict],
    note: str = "",
    user=None,
) -> Purchase:
    """Record stock bought from a supplier: the purchase, its lines, and one
    RECEIPT movement per line, all in one transaction.

    `lines` is a list of ``{"item": Item, "quantity": int, "unit_cost": Decimal}``;
    if `unit_cost` is missing the item's own unit_cost is used.
    """
    if not lines:
        raise ValueError(_("A purchase needs at least one line."))

    purchase = Purchase.objects.create(
        reference_no=reference_no,
        supplier=supplier,
        location=location,
        purchase_date=purchase_date,
        note=note,
        created_by=user,
    )

    total = Decimal("0")
    for line in lines:
        item = line["item"]
        quantity = int(line["quantity"])
        if quantity <= 0:
            raise ValueError(_("Line quantities must be positive."))
        unit_cost = line.get("unit_cost")
        if unit_cost is None:
            unit_cost = item.unit_cost

        # PurchaseLine.save() works out line_total.
        purchase_line = PurchaseLine.objects.create(
            purchase=purchase, item=item, quantity=quantity, unit_cost=Decimal(unit_cost)
        )
        total += purchase_line.line_total

        # Buying adds stock, and stock only changes through the ledger.
        record_movement(
            item=item,
            location=location,
            movement_type=MovementType.RECEIPT,
            quantity=quantity,
            user=user,
            unit_cost=unit_cost,
            reference_type="Purchase",
            reference_id=str(purchase.pk),
            note=_("Bought from %(supplier)s on %(ref)s")
            % {"supplier": supplier.name, "ref": purchase.reference_no},
        )

    purchase.total_amount = total
    purchase.save(update_fields=["total_amount", "updated_at"])
    return purchase


def next_purchase_no() -> str:
    """Like next_invoice_no(), but for purchases: PUR-2026-0001."""
    from django.utils import timezone

    year = timezone.localdate().year
    count = Purchase.objects.filter(reference_no__startswith=f"PUR-{year}-").count()
    return f"PUR-{year}-{count + 1:04d}"
