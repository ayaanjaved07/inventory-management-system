"""Tests for sales.

The expensive bug this app was built to fix: creating a Sale used to write an
invoice and leave the stock on the shelf. Every test here defends one half of
"invoice, ledger and frozen rate are all true together, or none of them are".
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest

from accounts.models import Role
from catalog.models import Item
from core.models import Currency, ExchangeRate
from sales.models import Sale
from sales.services import RateUnavailable, next_invoice_no, record_sale
from stock.models import MovementType, StockMovement
from stock.services import InsufficientStock, on_hand, record_movement


@pytest.fixture
def stocked_item(db, item, location, user):
    record_movement(item=item, location=location, quantity=100,
                    movement_type=MovementType.RECEIPT, user=user)
    return item


@pytest.fixture
def base_currency(db):
    return Currency.objects.create(code="INR", name="Rupee", is_base=True)


# --------------------------------------------------------------------------
# The ledger half of a sale
# --------------------------------------------------------------------------
def test_sale_writes_one_movement_per_line_and_drops_on_hand(
    stocked_item, location, user, base_currency
):
    sale = record_sale(
        invoice_no="INV-1", location=location, sale_date=date.today(), user=user,
        lines=[{"item": stocked_item, "quantity": 6, "unit_price": Decimal("25.00")}],
    )

    movements = StockMovement.objects.filter(
        reference_type="Sale", reference_id=str(sale.pk)
    )
    assert movements.count() == 1
    assert movements.get().movement_type == MovementType.SALE
    assert movements.get().quantity == -6      # SALE is outbound; sign applied by the service
    assert on_hand(stocked_item, location) == 94


def test_overselling_creates_no_sale_at_all(stocked_item, location, user, base_currency):
    """The invoice and the ledger rows share one transaction."""
    with pytest.raises(InsufficientStock):
        record_sale(
            invoice_no="INV-OVER", location=location, sale_date=date.today(), user=user,
            lines=[{"item": stocked_item, "quantity": 500, "unit_price": Decimal("1")}],
        )

    assert Sale.objects.count() == 0
    assert on_hand(stocked_item, location) == 100


def test_a_bad_second_line_rolls_back_the_first(
    stocked_item, location, user, base_currency, db
):
    plentiful = stocked_item
    scarce = Item.objects.create(sku="SCARCE-1", name="Almost Gone")
    record_movement(item=scarce, location=location, quantity=2,
                    movement_type=MovementType.RECEIPT, user=user)

    with pytest.raises(InsufficientStock):
        record_sale(
            invoice_no="INV-PARTIAL", location=location, sale_date=date.today(), user=user,
            lines=[
                {"item": plentiful, "quantity": 5, "unit_price": Decimal("10")},
                {"item": scarce, "quantity": 50, "unit_price": Decimal("10")},
            ],
        )

    assert Sale.objects.count() == 0
    assert on_hand(plentiful, location) == 100   # the good line did not stick
    assert on_hand(scarce, location) == 2


def test_total_is_recalculated_from_the_lines(stocked_item, location, user, base_currency):
    sale = record_sale(
        invoice_no="INV-TOT", location=location, sale_date=date.today(), user=user,
        lines=[
            {"item": stocked_item, "quantity": 3, "unit_price": Decimal("100.00")},
            {"item": stocked_item, "quantity": 2, "unit_price": Decimal("50.00")},
        ],
    )

    assert sale.total_amount == Decimal("400.00")


def test_unit_price_falls_back_to_item_cost(location, user, base_currency, db):
    priced = Item.objects.create(sku="PRICED-1", name="Has A Cost", unit_cost=Decimal("42.50"))
    record_movement(item=priced, location=location, quantity=10,
                    movement_type=MovementType.RECEIPT, user=user)

    sale = record_sale(
        invoice_no="INV-FALLBACK", location=location, sale_date=date.today(), user=user,
        lines=[{"item": priced, "quantity": 2}],
    )

    assert sale.total_amount == Decimal("85.00")


# --------------------------------------------------------------------------
# The frozen-rate half
# --------------------------------------------------------------------------
def test_rate_is_frozen_onto_the_sale(stocked_item, location, user, base_currency, db):
    """Historical revenue must not drift when today's rate changes."""
    Currency.objects.create(code="USD", name="Dollar")
    ExchangeRate.objects.create(base="USD", target="INR", rate=Decimal("80"))

    sale = record_sale(
        invoice_no="INV-FX", location=location, sale_date=date.today(), user=user,
        currency="USD",
        lines=[{"item": stocked_item, "quantity": 1, "unit_price": Decimal("10.00")}],
    )
    booked = sale.total_in_base_currency

    # The world moves on.
    ExchangeRate.objects.create(base="USD", target="INR", rate=Decimal("95"))
    sale.refresh_from_db()

    assert sale.exchange_rate_used == Decimal("80.000000")
    assert sale.total_in_base_currency == booked == Decimal("800.00")


def test_base_currency_sale_needs_no_rate_lookup(stocked_item, location, user, base_currency):
    sale = record_sale(
        invoice_no="INV-BASE", location=location, sale_date=date.today(), user=user,
        currency="INR",
        lines=[{"item": stocked_item, "quantity": 1, "unit_price": Decimal("10")}],
    )
    assert sale.exchange_rate_used == Decimal("1.000000")


def test_missing_rate_refuses_rather_than_inventing_one(
    stocked_item, location, user, base_currency
):
    """Offline with nothing stored: a silent fallback of 1 would misprice this."""
    with pytest.raises(RateUnavailable):
        record_sale(
            invoice_no="INV-NORATE", location=location, sale_date=date.today(), user=user,
            currency="EUR",
            lines=[{"item": stocked_item, "quantity": 1, "unit_price": Decimal("10")}],
        )

    assert Sale.objects.count() == 0


def test_empty_sale_is_rejected(location, user, base_currency):
    with pytest.raises(ValueError):
        record_sale(
            invoice_no="INV-EMPTY", location=location, sale_date=date.today(),
            user=user, lines=[],
        )


def test_next_invoice_no_increments(stocked_item, location, user, base_currency):
    first = next_invoice_no()
    record_sale(
        invoice_no=first, location=location, sale_date=date.today(), user=user,
        lines=[{"item": stocked_item, "quantity": 1, "unit_price": Decimal("1")}],
    )
    assert next_invoice_no() != first


# --------------------------------------------------------------------------
# Through the API
# --------------------------------------------------------------------------
def test_manager_can_record_a_sale_through_the_api(
    client_for, stocked_item, location, base_currency
):
    client = client_for(Role.MANAGER.value)

    resp = client.post(
        "/api/sales/",
        {
            "location": location.pk,
            "sale_date": str(date.today()),
            "lines": [{"item": stocked_item.pk, "quantity": 4, "unit_price": "12.50"}],
        },
        format="json",
    )

    assert resp.status_code == 201, resp.data
    assert resp.data["total_amount"] == "50.00"
    assert resp.data["invoice_no"]           # auto-generated
    assert on_hand(stocked_item, location) == 96


def test_overselling_through_the_api_is_a_400_not_a_500(
    client_for, stocked_item, location, base_currency
):
    client = client_for(Role.MANAGER.value)

    resp = client.post(
        "/api/sales/",
        {
            "location": location.pk,
            "sale_date": str(date.today()),
            "lines": [{"item": stocked_item.pk, "quantity": 9999}],
        },
        format="json",
    )

    assert resp.status_code == 400
    assert Sale.objects.count() == 0


def test_sales_cannot_be_edited_or_deleted(client_for, stocked_item, location, user, base_currency):
    """The invoice has ledger rows behind it; rewriting it would rewrite history."""
    sale = record_sale(
        invoice_no="INV-IMMUTABLE", location=location, sale_date=date.today(), user=user,
        lines=[{"item": stocked_item, "quantity": 1, "unit_price": Decimal("10")}],
    )
    client = client_for(Role.ADMIN.value)

    assert client.patch(f"/api/sales/{sale.pk}/", {"total_amount": "0"}).status_code == 405
    assert client.delete(f"/api/sales/{sale.pk}/").status_code == 405


def test_viewer_cannot_record_a_sale(client_for, stocked_item, location, base_currency):
    resp = client_for(Role.VIEWER.value).post(
        "/api/sales/",
        {
            "location": location.pk,
            "sale_date": str(date.today()),
            "lines": [{"item": stocked_item.pk, "quantity": 1}],
        },
        format="json",
    )
    assert resp.status_code == 403


def test_storekeeper_cannot_record_a_sale(client_for, stocked_item, location, base_currency):
    """Storekeepers move stock; billing a customer is a different authority."""
    resp = client_for(Role.STOREKEEPER.value).post(
        "/api/sales/",
        {
            "location": location.pk,
            "sale_date": str(date.today()),
            "lines": [{"item": stocked_item.pk, "quantity": 1}],
        },
        format="json",
    )
    assert resp.status_code == 403


def test_duplicate_invoice_number_is_a_400(client_for, stocked_item, location, user, base_currency):
    record_sale(
        invoice_no="INV-DUP", location=location, sale_date=date.today(), user=user,
        lines=[{"item": stocked_item, "quantity": 1, "unit_price": Decimal("1")}],
    )
    client = client_for(Role.MANAGER.value)

    resp = client.post(
        "/api/sales/",
        {
            "invoice_no": "INV-DUP",
            "location": location.pk,
            "sale_date": str(date.today()),
            "lines": [{"item": stocked_item.pk, "quantity": 1}],
        },
        format="json",
    )

    assert resp.status_code == 400


# --------------------------------------------------------------------------
# Statistics
# --------------------------------------------------------------------------
def test_sales_stats_report_frozen_revenue(client_for, stocked_item, location, user, base_currency):
    record_sale(
        invoice_no="INV-S1", location=location, sale_date=date.today(), user=user,
        lines=[{"item": stocked_item, "quantity": 2, "unit_price": Decimal("100")}],
    )
    client = client_for(Role.VIEWER.value)

    data = client.get("/api/stats/sales/").data

    assert data["invoice_count"] == 1
    assert Decimal(str(data["revenue_total"])) == Decimal("200.00")
    assert data["revenue_by_month"][0]["month"] == date.today().strftime("%Y-%m")
    assert data["top_items"][0]["sku"] == stocked_item.sku


def test_sales_stats_window_excludes_older_sales(
    client_for, stocked_item, location, user, base_currency
):
    record_sale(
        invoice_no="INV-OLD", location=location, user=user,
        sale_date=date.today() - timedelta(days=400),
        lines=[{"item": stocked_item, "quantity": 1, "unit_price": Decimal("999")}],
    )
    client = client_for(Role.VIEWER.value)

    data = client.get("/api/stats/sales/?days=30").data

    assert data["invoice_count"] == 0
    assert Decimal(str(data["revenue_total"])) == Decimal("0.00")


def test_dashboard_reports_revenue_and_invoice_count(
    client_for, stocked_item, location, user, base_currency
):
    record_sale(
        invoice_no="INV-D1", location=location, sale_date=date.today(), user=user,
        lines=[{"item": stocked_item, "quantity": 1, "unit_price": Decimal("75")}],
    )

    data = client_for(Role.VIEWER.value).get("/api/stats/dashboard/").data

    assert data["invoice_count"] == 1
    assert Decimal(str(data["revenue_30d"])) == Decimal("75.00")
    assert data["base_currency"] == "INR"
