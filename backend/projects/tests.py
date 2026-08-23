"""Tests for the projects API.

`projects/services.py` was already covered by stock/tests.py. What was missing
was the API layer on top of it -- and specifically that its two bare
`ValueError`s become 400s rather than 500s.
"""

import pytest

from accounts.models import Role
from projects.models import Allocation
from projects.services import allocate
from stock.models import MovementType
from stock.services import on_hand, record_movement


@pytest.fixture
def stocked(db, item, location, user):
    record_movement(item=item, location=location, quantity=10,
                    movement_type=MovementType.RECEIPT, user=user)
    return item


# --------------------------------------------------------------------------
# Allocating reserves; it does not move stock
# --------------------------------------------------------------------------
def test_allocate_through_the_api_reserves_without_moving_stock(
    client_for, stocked, location, project
):
    client = client_for(Role.MANAGER.value)

    resp = client.post(
        "/api/allocations/",
        {"project": project.pk, "item": stocked.pk, "location": location.pk, "quantity": 4},
        format="json",
    )

    assert resp.status_code == 201, resp.data
    assert resp.data["outstanding_reservation"] == 4
    assert on_hand(stocked, location) == 10  # stock has NOT moved


def test_over_allocating_is_a_400_not_a_500(client_for, stocked, location, project):
    """allocate() raises InsufficientStock; unhandled it would be a server error."""
    client = client_for(Role.MANAGER.value)

    resp = client.post(
        "/api/allocations/",
        {"project": project.pk, "item": stocked.pk, "location": location.pk, "quantity": 99},
        format="json",
    )

    assert resp.status_code == 400
    assert Allocation.objects.count() == 0


def test_availability_reports_available_not_on_hand(
    client_for, stocked, location, project, user
):
    """The number a UI may offer. on_hand includes stock already promised."""
    allocate(project=project, item=stocked, location=location, quantity=4, user=user)
    client = client_for(Role.VIEWER.value)

    data = client.get(
        f"/api/allocations/availability/?item={stocked.pk}&location={location.pk}"
    ).data

    assert data["on_hand"] == 10
    assert data["reserved"] == 4
    assert data["available"] == 6


def test_availability_needs_a_real_item(client_for, stocked):
    resp = client_for(Role.VIEWER.value).get("/api/allocations/availability/?item=999999")
    assert resp.status_code == 400


# --------------------------------------------------------------------------
# Issuing is where stock actually leaves
# --------------------------------------------------------------------------
def test_issuing_moves_stock(client_for, stocked, location, project, user):
    alloc = allocate(project=project, item=stocked, location=location, quantity=4, user=user)
    client = client_for(Role.MANAGER.value)

    resp = client.post(f"/api/allocations/{alloc.pk}/issue/", {"quantity": 4}, format="json")

    assert resp.status_code == 200, resp.data
    assert resp.data["status"] == Allocation.Status.ISSUED
    assert on_hand(stocked, location) == 6


def test_partial_issue_is_reported_as_partial(client_for, stocked, location, project, user):
    alloc = allocate(project=project, item=stocked, location=location, quantity=4, user=user)
    client = client_for(Role.MANAGER.value)

    resp = client.post(f"/api/allocations/{alloc.pk}/issue/", {"quantity": 1}, format="json")

    assert resp.data["status"] == Allocation.Status.PARTIAL
    assert resp.data["outstanding_reservation"] == 3


def test_issuing_more_than_allocated_is_a_400_not_a_500(
    client_for, stocked, location, project, user
):
    """services.issue() raises a bare ValueError -- the view must catch it."""
    alloc = allocate(project=project, item=stocked, location=location, quantity=4, user=user)
    client = client_for(Role.MANAGER.value)

    resp = client.post(f"/api/allocations/{alloc.pk}/issue/", {"quantity": 5}, format="json")

    assert resp.status_code == 400
    alloc.refresh_from_db()
    assert alloc.quantity_issued == 0


def test_returning_more_than_issued_is_a_400_not_a_500(
    client_for, stocked, location, project, user
):
    alloc = allocate(project=project, item=stocked, location=location, quantity=4, user=user)
    client = client_for(Role.MANAGER.value)
    client.post(f"/api/allocations/{alloc.pk}/issue/", {"quantity": 2}, format="json")

    resp = client.post(f"/api/allocations/{alloc.pk}/return/", {"quantity": 3}, format="json")

    assert resp.status_code == 400


def test_returning_puts_stock_back(client_for, stocked, location, project, user):
    alloc = allocate(project=project, item=stocked, location=location, quantity=4, user=user)
    client = client_for(Role.MANAGER.value)
    client.post(f"/api/allocations/{alloc.pk}/issue/", {"quantity": 4}, format="json")
    assert on_hand(stocked, location) == 6

    resp = client.post(f"/api/allocations/{alloc.pk}/return/", {"quantity": 4}, format="json")

    assert resp.status_code == 200
    assert resp.data["status"] == Allocation.Status.RETURNED
    assert on_hand(stocked, location) == 10


# --------------------------------------------------------------------------
# Cancelling releases a reservation
# --------------------------------------------------------------------------
def test_cancelling_frees_the_reservation(client_for, stocked, location, project, user):
    alloc = allocate(project=project, item=stocked, location=location, quantity=10, user=user)
    client = client_for(Role.MANAGER.value)
    assert client.get(
        f"/api/allocations/availability/?item={stocked.pk}&location={location.pk}"
    ).data["available"] == 0

    client.post(f"/api/allocations/{alloc.pk}/cancel/", {}, format="json")

    assert client.get(
        f"/api/allocations/availability/?item={stocked.pk}&location={location.pk}"
    ).data["available"] == 10


def test_cannot_cancel_once_parts_are_issued(client_for, stocked, location, project, user):
    """Those units left the building; the way back is return, not a status flip."""
    alloc = allocate(project=project, item=stocked, location=location, quantity=4, user=user)
    client = client_for(Role.MANAGER.value)
    client.post(f"/api/allocations/{alloc.pk}/issue/", {"quantity": 1}, format="json")

    resp = client.post(f"/api/allocations/{alloc.pk}/cancel/", {}, format="json")

    assert resp.status_code == 400


# --------------------------------------------------------------------------
# Allocations mirror the ledger, so they are not editable
# --------------------------------------------------------------------------
def test_allocations_cannot_be_patched_or_deleted(
    client_for, stocked, location, project, user
):
    """A PATCH to quantity_issued would claim stock the ledger never saw."""
    alloc = allocate(project=project, item=stocked, location=location, quantity=4, user=user)
    client = client_for(Role.ADMIN.value)

    assert client.patch(
        f"/api/allocations/{alloc.pk}/", {"quantity_issued": 4}, format="json"
    ).status_code == 405
    assert client.delete(f"/api/allocations/{alloc.pk}/").status_code == 405


# --------------------------------------------------------------------------
# Permissions -- asserted by status code
# --------------------------------------------------------------------------
def test_viewer_can_read_but_not_allocate(client_for, stocked, location, project):
    client = client_for(Role.VIEWER.value)

    assert client.get("/api/projects/").status_code == 200
    assert client.get("/api/allocations/").status_code == 200
    assert client.post(
        "/api/allocations/",
        {"project": project.pk, "item": stocked.pk, "location": location.pk, "quantity": 1},
        format="json",
    ).status_code == 403


def test_storekeeper_cannot_allocate(client_for, stocked, location, project):
    """Storekeepers record movements; promising parts to a project is a manager call."""
    resp = client_for(Role.STOREKEEPER.value).post(
        "/api/allocations/",
        {"project": project.pk, "item": stocked.pk, "location": location.pk, "quantity": 1},
        format="json",
    )
    assert resp.status_code == 403


def test_manager_can_create_a_project(client_for, db):
    resp = client_for(Role.MANAGER.value).post(
        "/api/projects/", {"code": "PRJ-9", "name": "New Build"}, format="json"
    )
    assert resp.status_code == 201
    assert resp.data["status"] == "PLANNING"


def test_project_list_reports_allocation_count(client_for, stocked, location, project, user):
    allocate(project=project, item=stocked, location=location, quantity=2, user=user)

    data = client_for(Role.VIEWER.value).get("/api/projects/").data

    assert data["results"][0]["allocation_count"] == 1
