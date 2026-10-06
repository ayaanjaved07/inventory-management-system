"""Tests for CSV import/export.

The expensive bugs here are silent ones: a round trip that quietly drops every
category, a dry run whose numbers do not match what the commit does, or an
import that pretends to set stock.
"""

import pytest

from accounts.models import Role
from catalog.models import Category, Item
from core.models import ActivityLog, Currency
from stock.models import MovementType
from stock.services import on_hand, record_movement

HEADER = "sku,name,description,category_name,unit,unit_cost,currency_code,reorder_point,is_active"


def upload(text: str):
    """A CSV as Django sees an uploaded file."""
    from django.core.files.uploadedfile import SimpleUploadedFile

    return SimpleUploadedFile("items.csv", text.encode("utf-8"), content_type="text/csv")


@pytest.fixture
def catalog(db):
    inr = Currency.objects.create(code="INR", name="Rupee", is_base=True)
    electronics = Category.objects.create(name="Electronics")
    return {"currency": inr, "category": electronics}


# --------------------------------------------------------------------------
# Export
# --------------------------------------------------------------------------
def test_export_returns_csv_with_readable_names(client_for, catalog):
    Item.objects.create(
        sku="ELEC-001", name="Arduino", category=catalog["category"],
        currency=catalog["currency"], unit_cost=850, reorder_point=10,
    )
    client = client_for(Role.MANAGER.value)

    resp = client.get("/api/items/export/")

    assert resp.status_code == 200
    assert resp["Content-Type"].startswith("text/csv")
    assert "attachment; filename=" in resp["Content-Disposition"]
    body = resp.content.decode("utf-8")
    # Names, not raw PKs -- a spreadsheet of category IDs helps nobody.
    assert "ELEC-001" in body and "Electronics" in body and "INR" in body


def test_export_is_not_paginated(client_for, catalog):
    """PAGE_SIZE is a global 25; an export that silently stops there is useless."""
    for n in range(30):
        Item.objects.create(sku=f"BULK-{n:03d}", name=f"Item {n}")
    client = client_for(Role.MANAGER.value)

    body = client.get("/api/items/export/").content.decode("utf-8")

    assert len(body.strip().splitlines()) == 31  # 30 rows + header


def test_export_respects_filters(client_for, catalog):
    Item.objects.create(sku="KEEP-1", name="Findable Widget")
    Item.objects.create(sku="DROP-1", name="Unrelated Thing")
    client = client_for(Role.MANAGER.value)

    body = client.get("/api/items/export/?search=Findable").content.decode("utf-8")

    assert "KEEP-1" in body
    assert "DROP-1" not in body


def test_viewer_may_export(client_for, catalog):
    """Export is a GET of data the list endpoint already shows a Viewer."""
    Item.objects.create(sku="V-1", name="Visible")
    assert client_for(Role.VIEWER.value).get("/api/items/export/").status_code == 200


# --------------------------------------------------------------------------
# The round trip -- the trap this design exists to avoid
# --------------------------------------------------------------------------
def test_export_reimports_without_losing_category(client_for, catalog):
    """ItemSerializer has category_name read_only; a naive importer blanks it."""
    Item.objects.create(
        sku="RT-001", name="Round Trip", category=catalog["category"],
        currency=catalog["currency"],
    )
    client = client_for(Role.MANAGER.value)
    exported = client.get("/api/items/export/").content.decode("utf-8")

    resp = client.post(
        "/api/items/import/?commit=true", {"file": upload(exported)}, format="multipart"
    )

    assert resp.status_code == 200, resp.data
    assert resp.data["updated"] == 1 and resp.data["created"] == 0
    item = Item.objects.get(sku="RT-001")
    assert item.category == catalog["category"]
    assert item.currency == catalog["currency"]


# --------------------------------------------------------------------------
# Import
# --------------------------------------------------------------------------
def test_dry_run_reports_errors_and_writes_nothing(client_for, catalog):
    csv_text = (
        f"{HEADER}\n"
        "GOOD-1,First Widget,,Electronics,pc,10,INR,5,true\n"
        "GOOD-2,Second Widget,,Electronics,pc,20,INR,5,true\n"
        ",Nameless,,Electronics,pc,30,INR,5,true\n"
    )
    client = client_for(Role.MANAGER.value)

    resp = client.post("/api/items/import/", {"file": upload(csv_text)}, format="multipart")

    assert resp.status_code == 200
    assert resp.data["committed"] is False
    assert resp.data["created"] == 2
    assert len(resp.data["errors"]) == 1
    assert resp.data["errors"][0]["row"] == 4        # header is row 1
    assert "sku" in resp.data["errors"][0]["message"]
    assert Item.objects.count() == 0                  # nothing written


def test_commit_is_all_or_nothing(client_for, catalog):
    csv_text = (
        f"{HEADER}\n"
        "OK-1,Fine,,Electronics,pc,10,INR,5,true\n"
        "BAD-1,Broken,,Nonexistent Category,pc,10,INR,5,true\n"
    )
    client = client_for(Role.MANAGER.value)

    resp = client.post(
        "/api/items/import/?commit=true", {"file": upload(csv_text)}, format="multipart"
    )

    assert resp.status_code == 400
    assert Item.objects.count() == 0  # the good row did NOT sneak in


def test_commit_creates_and_updates(client_for, catalog):
    Item.objects.create(sku="UP-1", name="Old Name", reorder_point=1)
    csv_text = (
        f"{HEADER}\n"
        "UP-1,New Name,,Electronics,pc,15,INR,9,true\n"
        "NEW-1,Brand New,,Electronics,box,25,INR,3,true\n"
    )
    client = client_for(Role.MANAGER.value)

    resp = client.post(
        "/api/items/import/?commit=true", {"file": upload(csv_text)}, format="multipart"
    )

    assert resp.status_code == 200
    assert (resp.data["created"], resp.data["updated"]) == (1, 1)
    updated = Item.objects.get(sku="UP-1")
    assert updated.name == "New Name" and updated.reorder_point == 9
    assert Item.objects.get(sku="NEW-1").unit == "box"


def test_import_never_sets_stock(client_for, catalog, location, user):
    """on_hand comes from the ledger. An import column must not be a back door."""
    item = Item.objects.create(sku="STK-1", name="Stocked")
    record_movement(item=item, location=location, quantity=7,
                    movement_type=MovementType.RECEIPT, user=user)
    csv_text = f"{HEADER},on_hand\nSTK-1,Stocked,,Electronics,pc,10,INR,5,true,9999\n"
    client = client_for(Role.MANAGER.value)

    client.post("/api/items/import/?commit=true", {"file": upload(csv_text)}, format="multipart")

    assert on_hand(item, location) == 7


def test_sku_case_is_normalised(client_for, catalog):
    """Postgres is case-sensitive here and SQLite is not; both must agree."""
    Item.objects.create(sku="CASE-1", name="Original")
    csv_text = f"{HEADER}\ncase-1,Updated,,Electronics,pc,10,INR,5,true\n"
    client = client_for(Role.MANAGER.value)

    resp = client.post(
        "/api/items/import/?commit=true", {"file": upload(csv_text)}, format="multipart"
    )

    assert resp.data["updated"] == 1 and resp.data["created"] == 0
    assert Item.objects.count() == 1
    assert Item.objects.get().name == "Updated"


def test_duplicate_sku_in_file_is_an_error(client_for, catalog):
    csv_text = (
        f"{HEADER}\n"
        "DUP-1,First,,Electronics,pc,10,INR,5,true\n"
        "DUP-1,Second,,Electronics,pc,10,INR,5,true\n"
    )
    client = client_for(Role.MANAGER.value)

    resp = client.post("/api/items/import/", {"file": upload(csv_text)}, format="multipart")

    assert len(resp.data["errors"]) == 1
    assert "duplicated" in resp.data["errors"][0]["message"]


def test_ambiguous_category_is_refused_not_guessed(client_for, catalog):
    Category.objects.create(name="Electronics")  # name is not unique
    csv_text = f"{HEADER}\nAMB-1,Ambiguous,,Electronics,pc,10,INR,5,true\n"
    client = client_for(Role.MANAGER.value)

    resp = client.post("/api/items/import/", {"file": upload(csv_text)}, format="multipart")

    assert "more than one" in resp.data["errors"][0]["message"]


def test_excel_byte_order_mark_is_tolerated(client_for, catalog):
    """Excel prefixes a BOM that would otherwise glue itself to the sku header."""
    from django.core.files.uploadedfile import SimpleUploadedFile

    csv_text = f"{HEADER}\nBOM-1,From Excel,,Electronics,pc,10,INR,5,true\n"
    file = SimpleUploadedFile(
        "items.csv", b"\xef\xbb\xbf" + csv_text.encode("utf-8"), content_type="text/csv"
    )
    client = client_for(Role.MANAGER.value)

    resp = client.post("/api/items/import/", {"file": file}, format="multipart")

    assert resp.data["errors"] == []
    assert resp.data["created"] == 1


def test_missing_required_column_is_rejected(client_for, catalog):
    client = client_for(Role.MANAGER.value)

    resp = client.post(
        "/api/items/import/", {"file": upload("name,unit\nOnly a name,pc\n")}, format="multipart"
    )

    assert resp.status_code == 400
    assert "sku" in str(resp.data)


def test_import_logs_one_summary_row_not_one_per_item(client_for, catalog):
    """A 5,000-row import must not bury every other entry on the activity page."""
    rows = "".join(f"LOG-{n},Item {n},,Electronics,pc,1,INR,0,true\n" for n in range(5))
    client = client_for(Role.MANAGER.value)

    client.post(
        "/api/items/import/?commit=true", {"file": upload(HEADER + "\n" + rows)}, format="multipart"
    )

    logs = ActivityLog.objects.filter(action=ActivityLog.Action.IMPORT)
    assert logs.count() == 1
    assert logs.get().changes == {"created": 5, "updated": 0}
    assert not ActivityLog.objects.filter(action=ActivityLog.Action.CREATE).exists()


# --------------------------------------------------------------------------
# Permissions -- asserted by status code, not by a hidden button
# --------------------------------------------------------------------------
def test_viewer_cannot_import(client_for, catalog):
    csv_text = f"{HEADER}\nNO-1,Nope,,Electronics,pc,10,INR,5,true\n"

    resp = client_for(Role.VIEWER.value).post(
        "/api/items/import/", {"file": upload(csv_text)}, format="multipart"
    )

    assert resp.status_code == 403


def test_storekeeper_cannot_import(client_for, catalog):
    """Storekeepers move stock; they do not rewrite the catalog."""
    csv_text = f"{HEADER}\nNO-2,Nope,,Electronics,pc,10,INR,5,true\n"

    resp = client_for(Role.STOREKEEPER.value).post(
        "/api/items/import/", {"file": upload(csv_text)}, format="multipart"
    )

    assert resp.status_code == 403


def test_import_without_a_file_is_a_400(client_for, catalog):
    resp = client_for(Role.MANAGER.value).post("/api/items/import/", {}, format="multipart")
    assert resp.status_code == 400


# --------------------------------------------------------------------------
# Item images -- the multipart path, which no test previously exercised
# --------------------------------------------------------------------------
def _png() -> bytes:
    """Smallest valid PNG. Pillow validates ImageField uploads, so it must be real."""
    import base64

    return base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )


def _image_upload(name="shot.png"):
    from django.core.files.uploadedfile import SimpleUploadedFile

    return SimpleUploadedFile(name, _png(), content_type="image/png")


def test_manager_can_upload_an_image(client_for, catalog):
    item = Item.objects.create(sku="IMG-1", name="Photographed")
    client = client_for(Role.MANAGER.value)

    resp = client.post(
        f"/api/items/{item.pk}/images/",
        {"image": _image_upload(), "is_primary": "true", "alt_text": "front"},
        format="multipart",
    )

    assert resp.status_code == 201, resp.data
    assert item.images.count() == 1
    assert item.images.get().is_primary


def test_primary_image_surfaces_on_the_item(client_for, catalog):
    item = Item.objects.create(sku="IMG-2", name="Thumbed")
    client = client_for(Role.MANAGER.value)
    client.post(
        f"/api/items/{item.pk}/images/",
        {"image": _image_upload(), "is_primary": "true"},
        format="multipart",
    )

    data = client.get(f"/api/items/{item.pk}/").data

    assert data["primary_image"] and data["primary_image"].startswith("http")


def test_only_one_image_stays_primary(client_for, catalog):
    """ItemImage.save() demotes siblings; two primaries would be an ambiguous thumbnail."""
    item = Item.objects.create(sku="IMG-3", name="Two Shots")
    client = client_for(Role.MANAGER.value)
    for name in ("a.png", "b.png"):
        client.post(
            f"/api/items/{item.pk}/images/",
            {"image": _image_upload(name), "is_primary": "true"},
            format="multipart",
        )

    assert item.images.filter(is_primary=True).count() == 1


def test_viewer_cannot_upload_an_image(client_for, catalog):
    item = Item.objects.create(sku="IMG-4", name="Protected")

    resp = client_for(Role.VIEWER.value).post(
        f"/api/items/{item.pk}/images/", {"image": _image_upload()}, format="multipart"
    )

    assert resp.status_code == 403


def test_list_is_25_by_default_but_page_size_can_ask_for_more(client_for, catalog):
    """The item dropdowns ask for page_size=200; without this they got only 25."""
    for n in range(30):
        Item.objects.create(sku=f"BULK-{n:03d}", name=f"Item {n}")
    client = client_for(Role.VIEWER.value)

    assert len(client.get("/api/items/").json()["results"]) == 25
    assert len(client.get("/api/items/?page_size=200").json()["results"]) == 30


# --------------------------------------------------------------------------
# Item filters, expiry and the dashboard
# --------------------------------------------------------------------------
@pytest.fixture
def stocked(db, location, user):
    """Three items: one empty, one low, one well stocked."""
    from datetime import timedelta

    from django.utils import timezone

    today = timezone.localdate()
    empty = Item.objects.create(sku="EMPTY", name="Empty", reorder_point=5)
    low = Item.objects.create(
        sku="LOW", name="Low", reorder_point=10, expiry_date=today + timedelta(days=5)
    )
    full = Item.objects.create(
        sku="FULL", name="Full", reorder_point=10, expiry_date=today - timedelta(days=1)
    )
    record_movement(item=low, location=location, quantity=4,
                    movement_type=MovementType.RECEIPT, user=user)
    record_movement(item=full, location=location, quantity=50,
                    movement_type=MovementType.RECEIPT, user=user)
    return {"empty": empty, "low": low, "full": full}


def skus(response):
    return sorted(row["sku"] for row in response.data["results"])


def test_items_filter_by_stock_status(client_for, stocked):
    client = client_for(Role.VIEWER.value)
    assert skus(client.get("/api/items/?stock=out")) == ["EMPTY"]
    assert skus(client.get("/api/items/?stock=low")) == ["EMPTY", "LOW"]
    assert skus(client.get("/api/items/?stock=ok")) == ["FULL"]


def test_items_filter_by_stock_range(client_for, stocked):
    client = client_for(Role.VIEWER.value)
    assert skus(client.get("/api/items/?min_stock=1&max_stock=10")) == ["LOW"]
    # A non-number is ignored rather than causing a 500.
    assert client.get("/api/items/?min_stock=abc").status_code == 200


def test_items_filter_by_expiry(client_for, stocked):
    client = client_for(Role.VIEWER.value)
    assert skus(client.get("/api/items/?expiry=expired")) == ["FULL"]
    assert skus(client.get("/api/items/?expiry=soon")) == ["LOW"]
    assert skus(client.get("/api/items/?expiry=none")) == ["EMPTY"]


def test_items_can_be_sorted_by_on_hand(client_for, stocked):
    client = client_for(Role.VIEWER.value)
    rows = client.get("/api/items/?ordering=-on_hand").data["results"]
    assert [r["sku"] for r in rows] == ["FULL", "LOW", "EMPTY"]


def test_expiry_status_is_sent_with_the_item(client_for, stocked):
    client = client_for(Role.VIEWER.value)
    row = client.get(f"/api/items/{stocked['full'].id}/").data
    assert row["expiry_status"] == "expired"


def test_expiry_date_round_trips_through_csv(client_for, catalog):
    client = client_for(Role.MANAGER.value)
    Item.objects.create(sku="MILK", name="Milk", expiry_date="2026-12-31")
    body = client.get("/api/items/export/").content.decode("utf-8")
    Item.objects.filter(sku="MILK").update(expiry_date=None)

    client.post("/api/items/import/?commit=true", {"file": upload(body)}, format="multipart")

    assert str(Item.objects.get(sku="MILK").expiry_date) == "2026-12-31"


def test_dashboard_lists_low_stock_worst_first(client_for, stocked):
    data = client_for(Role.VIEWER.value).get("/api/stats/dashboard/").data
    assert data["low_stock_count"] == 2
    assert data["out_of_stock_count"] == 1
    assert [i["sku"] for i in data["low_stock_items"]] == ["EMPTY", "LOW"]
    assert [i["sku"] for i in data["expiring_items"]] == ["FULL", "LOW"]
