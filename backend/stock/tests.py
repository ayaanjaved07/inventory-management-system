"""Tests for the four places where a silent bug is expensive."""

import pytest

from accounts.models import Role, User
from catalog.models import Item
from projects.models import Allocation, Project
from projects.services import allocate, available_quantity, issue, return_parts
from stock.models import Location, MovementType, StockMovement
from stock.services import InsufficientStock, on_hand, record_movement


# --------------------------------------------------------------------------
# Ledger arithmetic -- the plan's headline check
# --------------------------------------------------------------------------
def test_on_hand_is_derived_from_ledger(item, location, user):
    record_movement(item=item, location=location, quantity=100,
                    movement_type=MovementType.RECEIPT, user=user)
    record_movement(item=item, location=location, quantity=30,
                    movement_type=MovementType.ISSUE, user=user)
    record_movement(item=item, location=location, quantity=-5,
                    movement_type=MovementType.ADJUSTMENT, user=user)

    assert on_hand(item, location) == 65
    assert StockMovement.objects.filter(item=item).count() == 3


def test_directional_types_ignore_caller_sign(item, location, user):
    """An ISSUE of 30 removes 30 whether the caller passes 30 or -30."""
    record_movement(item=item, location=location, quantity=100,
                    movement_type=MovementType.RECEIPT, user=user)
    record_movement(item=item, location=location, quantity=-30,
                    movement_type=MovementType.ISSUE, user=user)
    assert on_hand(item, location) == 70


def test_adjustment_keeps_its_sign(item, location, user):
    record_movement(item=item, location=location, quantity=10,
                    movement_type=MovementType.RECEIPT, user=user)
    record_movement(item=item, location=location, quantity=3,
                    movement_type=MovementType.ADJUSTMENT, user=user)
    assert on_hand(item, location) == 13


def test_cannot_go_negative(item, location, user):
    record_movement(item=item, location=location, quantity=5,
                    movement_type=MovementType.RECEIPT, user=user)
    with pytest.raises(InsufficientStock):
        record_movement(item=item, location=location, quantity=6,
                        movement_type=MovementType.ISSUE, user=user)
    assert on_hand(item, location) == 5  # unchanged


def test_zero_quantity_rejected(item, location, user):
    with pytest.raises(ValueError):
        record_movement(item=item, location=location, quantity=0,
                        movement_type=MovementType.RECEIPT, user=user)


def test_levels_are_per_location(item, user):
    a = Location.objects.create(code="A", name="A")
    b = Location.objects.create(code="B", name="B")
    record_movement(item=item, location=a, quantity=10,
                    movement_type=MovementType.RECEIPT, user=user)
    record_movement(item=item, location=b, quantity=7,
                    movement_type=MovementType.RECEIPT, user=user)

    assert on_hand(item, a) == 10
    assert on_hand(item, b) == 7
    assert on_hand(item) == 17  # no location == across all locations


# --------------------------------------------------------------------------
# Reserved vs available -- the classic double-promise bug
# --------------------------------------------------------------------------
def test_allocating_reserves_without_moving_stock(item, location, user, project):
    record_movement(item=item, location=location, quantity=10,
                    movement_type=MovementType.RECEIPT, user=user)

    allocate(project=project, item=item, location=location, quantity=4, user=user)

    assert on_hand(item, location) == 10       # stock has NOT moved
    assert available_quantity(item, location) == 6  # but only 6 can be promised


def test_cannot_double_promise_the_same_unit(item, location, user, project):
    record_movement(item=item, location=location, quantity=10,
                    movement_type=MovementType.RECEIPT, user=user)
    allocate(project=project, item=item, location=location, quantity=8, user=user)

    with pytest.raises(InsufficientStock):
        allocate(project=project, item=item, location=location, quantity=5, user=user)


def test_issuing_moves_stock_and_frees_the_reservation(item, location, user, project):
    record_movement(item=item, location=location, quantity=10,
                    movement_type=MovementType.RECEIPT, user=user)
    alloc = allocate(project=project, item=item, location=location, quantity=4, user=user)

    issue(alloc, 4, user=user)
    alloc.refresh_from_db()

    assert on_hand(item, location) == 6
    assert available_quantity(item, location) == 6  # reservation consumed, not double counted
    assert alloc.status == Allocation.Status.ISSUED


def test_partial_issue_tracks_both_halves(item, location, user, project):
    record_movement(item=item, location=location, quantity=10,
                    movement_type=MovementType.RECEIPT, user=user)
    alloc = allocate(project=project, item=item, location=location, quantity=6, user=user)

    issue(alloc, 2, user=user)
    alloc.refresh_from_db()

    assert alloc.status == Allocation.Status.PARTIAL
    assert on_hand(item, location) == 8
    assert available_quantity(item, location) == 4  # 4 still reserved


def test_returning_puts_stock_back(item, location, user, project):
    record_movement(item=item, location=location, quantity=10,
                    movement_type=MovementType.RECEIPT, user=user)
    alloc = allocate(project=project, item=item, location=location, quantity=4, user=user)
    issue(alloc, 4, user=user)

    return_parts(alloc, 3, user=user)
    alloc.refresh_from_db()

    assert on_hand(item, location) == 9
    assert alloc.quantity_outstanding == 1


def test_cannot_issue_more_than_allocated(item, location, user, project):
    record_movement(item=item, location=location, quantity=10,
                    movement_type=MovementType.RECEIPT, user=user)
    alloc = allocate(project=project, item=item, location=location, quantity=3, user=user)
    with pytest.raises(ValueError):
        issue(alloc, 4, user=user)


# --------------------------------------------------------------------------
# RBAC -- backend rejection is the real test, not a hidden button
# --------------------------------------------------------------------------
def test_viewer_cannot_create_items(client_for, db):
    client = client_for(Role.VIEWER.value)
    resp = client.post("/api/items/", {"sku": "X1", "name": "Nope"})
    assert resp.status_code == 403


def test_viewer_can_read_items(client_for, db, item):
    client = client_for(Role.VIEWER.value)
    assert client.get("/api/items/").status_code == 200


def test_manager_can_create_items(client_for, db):
    client = client_for(Role.MANAGER.value)
    resp = client.post("/api/items/", {"sku": "X2", "name": "Yes"})
    assert resp.status_code == 201


def test_storekeeper_can_record_movements_but_not_create_items(client_for, db, item, location):
    client = client_for(Role.STOREKEEPER.value)
    assert client.post("/api/items/", {"sku": "X3", "name": "No"}).status_code == 403
    resp = client.post(
        "/api/stock/movements/",
        {"item": item.pk, "location": location.pk,
         "movement_type": "RECEIPT", "quantity": 5},
    )
    assert resp.status_code == 201


def test_anonymous_is_rejected(db):
    from rest_framework.test import APIClient

    assert APIClient().get("/api/items/").status_code == 401


# --------------------------------------------------------------------------
# The ledger must be append-only at the API surface
# --------------------------------------------------------------------------
def test_movements_cannot_be_edited_or_deleted(client_for, db, item, location, user):
    from rest_framework.test import APIClient

    mv = record_movement(item=item, location=location, quantity=5,
                         movement_type=MovementType.RECEIPT, user=user)
    admin = User.objects.create_superuser(username="root", password="x")
    client = APIClient()
    client.force_authenticate(user=admin)

    assert client.put(f"/api/stock/movements/{mv.pk}/", {}).status_code == 405
    assert client.delete(f"/api/stock/movements/{mv.pk}/").status_code == 405


# --------------------------------------------------------------------------
# Activity log -- who changed what, and what actually changed
# --------------------------------------------------------------------------
def test_item_create_and_update_are_logged(client_for, db):
    from core.models import ActivityLog

    client = client_for(Role.MANAGER.value)
    created = client.post("/api/items/", {"sku": "LOG-1", "name": "Logged", "reorder_point": 10})
    assert created.status_code == 201

    entry = ActivityLog.objects.filter(model_name="Item", action="CREATE").first()
    assert entry is not None
    assert entry.object_repr.startswith("LOG-1")

    client.patch(
        f"/api/items/{created.data['id']}/",
        {"reorder_point": 25},
        format="json",
    )
    update = ActivityLog.objects.filter(model_name="Item", action="UPDATE").first()
    assert update is not None
    # The diff is the point -- "updated Item" alone tells you nothing.
    assert update.changes == {"reorder_point": [10, 25]}


def test_noop_update_is_not_logged(client_for, db):
    from core.models import ActivityLog

    client = client_for(Role.MANAGER.value)
    created = client.post("/api/items/", {"sku": "LOG-2", "name": "Same", "reorder_point": 5})
    before = ActivityLog.objects.filter(action="UPDATE").count()

    client.patch(f"/api/items/{created.data['id']}/", {"reorder_point": 5}, format="json")

    assert ActivityLog.objects.filter(action="UPDATE").count() == before


def test_password_never_lands_in_the_activity_log(client_for, db):
    from core.models import ActivityLog

    client = client_for(Role.ADMIN.value)
    resp = client.post(
        "/api/auth/users/",
        {"username": "newbie", "password": "sup3rsecret!", "roles": ["Viewer"]},
        format="json",
    )
    assert resp.status_code == 201
    for entry in ActivityLog.objects.all():
        assert "password" not in entry.changes
        assert "sup3rsecret!" not in str(entry.changes)
        assert "sup3rsecret!" not in entry.object_repr


def test_activity_endpoint_is_readable_by_any_authenticated_user(client_for, db):
    client = client_for(Role.VIEWER.value)
    assert client.get("/api/activity/").status_code == 200
