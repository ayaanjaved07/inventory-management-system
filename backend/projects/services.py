"""Allocation logic: the reserved-vs-available distinction lives here."""

from __future__ import annotations

from django.db import transaction
from django.db.models import Sum
from django.utils.translation import gettext_lazy as _

from stock.models import MovementType
from stock.services import InsufficientStock, on_hand, record_movement

from .models import Allocation


def reserved_quantity(item, location=None) -> int:
    """Units promised to projects but not yet issued."""
    qs = Allocation.objects.filter(item=item).exclude(
        status__in=[Allocation.Status.CANCELLED, Allocation.Status.RETURNED]
    )
    if location is not None:
        qs = qs.filter(location=location)
    totals = qs.aggregate(alloc=Sum("quantity_allocated"), issued=Sum("quantity_issued"))
    return max((totals["alloc"] or 0) - (totals["issued"] or 0), 0)


def available_quantity(item, location=None) -> int:
    """What can actually be promised to someone new.

    on_hand stays put when stock is reserved; only this number moves. Showing
    on_hand where available belongs is how the same unit ends up promised twice.
    """
    return on_hand(item, location) - reserved_quantity(item, location)


@transaction.atomic
def allocate(*, project, item, location, quantity: int, assigned_to=None, user=None, note=""):
    """Reserve stock for a project. Deliberately does NOT move stock."""
    available = available_quantity(item, location)
    if quantity > available:
        raise InsufficientStock(item, location, quantity, available)

    return Allocation.objects.create(
        project=project,
        item=item,
        location=location,
        assigned_to=assigned_to,
        quantity_allocated=quantity,
        note=note,
        created_by=user,
        status=Allocation.Status.RESERVED,
    )


@transaction.atomic
def issue(allocation: Allocation, quantity: int, user=None) -> Allocation:
    """Hand parts to the assignee. THIS is where stock actually leaves."""
    remaining = allocation.quantity_allocated - allocation.quantity_issued
    if quantity <= 0 or quantity > remaining:
        raise ValueError(_("Can issue between 1 and %(n)d units.") % {"n": remaining})

    record_movement(
        item=allocation.item,
        location=allocation.location,
        movement_type=MovementType.PROJECT_ISSUE,
        quantity=quantity,
        user=user,
        reference_type="Allocation",
        reference_id=str(allocation.pk),
        note=_("Issued to project %(code)s") % {"code": allocation.project.code},
    )

    allocation.quantity_issued += quantity
    allocation.status = (
        Allocation.Status.ISSUED
        if allocation.quantity_issued >= allocation.quantity_allocated
        else Allocation.Status.PARTIAL
    )
    allocation.save(update_fields=["quantity_issued", "status", "updated_at"])
    return allocation


@transaction.atomic
def return_parts(allocation: Allocation, quantity: int, user=None) -> Allocation:
    """Unused parts come back into stock."""
    outstanding = allocation.quantity_outstanding
    if quantity <= 0 or quantity > outstanding:
        raise ValueError(_("Can return between 1 and %(n)d units.") % {"n": outstanding})

    record_movement(
        item=allocation.item,
        location=allocation.location,
        movement_type=MovementType.PROJECT_RETURN,
        quantity=quantity,
        user=user,
        reference_type="Allocation",
        reference_id=str(allocation.pk),
        note=_("Returned from project %(code)s") % {"code": allocation.project.code},
    )

    allocation.quantity_returned += quantity
    if allocation.quantity_returned >= allocation.quantity_issued:
        allocation.status = Allocation.Status.RETURNED
    allocation.save(update_fields=["quantity_returned", "status", "updated_at"])
    return allocation
