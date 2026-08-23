from django.db.models import Count
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from accounts.permissions import RoleBasedPermission
from catalog.models import Item
from core.mixins import ActivityLoggedMixin
from core.models import ActivityLog
from core.services import log_activity
from stock.models import Location
from stock.services import InsufficientStock, on_hand

from .models import Allocation, Project, ProjectMember
from .serializers import (
    AllocationCreateSerializer,
    AllocationSerializer,
    ProjectMemberSerializer,
    ProjectSerializer,
    QuantitySerializer,
)
# `issue` is aliased: the action method below has the same name, and while
# Python would still resolve the global correctly, the shadowing reads as a bug.
from .services import allocate, available_quantity, reserved_quantity, return_parts
from .services import issue as issue_parts


class ProjectViewSet(ActivityLoggedMixin, viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    permission_classes = [RoleBasedPermission]
    domain = "projects"
    filterset_fields = ["status", "manager"]
    search_fields = ["code", "name", "description"]
    ordering_fields = ["code", "name", "start_date", "created_at"]

    def get_queryset(self):
        return (
            Project.objects.select_related("manager")
            .annotate(allocation_count=Count("allocations"))
            .order_by("-created_at")
        )


class ProjectMemberViewSet(ActivityLoggedMixin, viewsets.ModelViewSet):
    queryset = ProjectMember.objects.select_related("project", "user")
    serializer_class = ProjectMemberSerializer
    permission_classes = [RoleBasedPermission]
    domain = "projects"
    filterset_fields = ["project", "user"]


class AllocationViewSet(viewsets.ReadOnlyModelViewSet):
    """Read + create + issue/return/cancel. Deliberately no update or destroy.

    `quantity_issued` and `quantity_returned` are mirrors of ledger rows. A PATCH
    that moved them would leave the allocation claiming stock the ledger never
    saw, so the only ways to change an allocation are the actions below -- each
    of which writes a StockMovement through `record_movement()`.
    """

    serializer_class = AllocationSerializer
    permission_classes = [RoleBasedPermission]
    domain = "projects"
    filterset_fields = ["project", "item", "location", "status", "assigned_to"]
    search_fields = ["item__sku", "item__name", "note"]
    ordering_fields = ["created_at", "quantity_allocated"]

    def get_queryset(self):
        return Allocation.objects.select_related(
            "project", "item", "location", "assigned_to"
        ).order_by("-created_at")

    def _respond(self, allocation, code=status.HTTP_200_OK):
        return Response(
            AllocationSerializer(allocation, context={"request": self.request}).data,
            status=code,
        )

    def create(self, request, *args, **kwargs):
        serializer = AllocationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            allocation = allocate(
                project=data["project"],
                item=data["item"],
                location=data["location"],
                quantity=data["quantity"],
                assigned_to=data.get("assigned_to"),
                user=request.user,
                note=data.get("note", ""),
            )
        except InsufficientStock as exc:
            # 400, not 500: the caller asked for more than is available, which
            # is a bad request rather than a server fault.
            raise ValidationError({"quantity": str(exc)}) from exc

        log_activity(request.user, ActivityLog.Action.CREATE, allocation)
        return self._respond(allocation, status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def issue(self, request, pk=None):
        """Hand the parts over. This is where stock actually leaves."""
        allocation = self.get_object()
        body = QuantitySerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            allocation = issue_parts(
                allocation, body.validated_data["quantity"], user=request.user
            )
        except InsufficientStock as exc:
            raise ValidationError({"quantity": str(exc)}) from exc
        except ValueError as exc:
            # services.issue raises a bare ValueError; unhandled it would 500.
            raise ValidationError({"quantity": str(exc)}) from exc

        log_activity(request.user, ActivityLog.Action.UPDATE, allocation,
                     {"quantity_issued": [None, allocation.quantity_issued]})
        return self._respond(allocation)

    @action(detail=True, methods=["post"], url_path="return")
    def return_(self, request, pk=None):
        """Unused parts come back into stock."""
        allocation = self.get_object()
        body = QuantitySerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            allocation = return_parts(
                allocation, body.validated_data["quantity"], user=request.user
            )
        except ValueError as exc:
            raise ValidationError({"quantity": str(exc)}) from exc

        log_activity(request.user, ActivityLog.Action.UPDATE, allocation,
                     {"quantity_returned": [None, allocation.quantity_returned]})
        return self._respond(allocation)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Release a reservation that was never issued.

        Refused once anything has been issued: those units left the building, so
        the way back is `return`, not a status flip that would quietly imply the
        stock is on the shelf.
        """
        allocation = self.get_object()
        if allocation.quantity_issued:
            raise ValidationError(
                {"status": "Parts have already been issued -- return them instead."}
            )
        if allocation.status == Allocation.Status.CANCELLED:
            raise ValidationError({"status": "Already cancelled."})

        allocation.status = Allocation.Status.CANCELLED
        allocation.save(update_fields=["status", "updated_at"])
        log_activity(request.user, ActivityLog.Action.UPDATE, allocation,
                     {"status": ["RESERVED", "CANCELLED"]})
        return self._respond(allocation)

    @action(detail=False, methods=["get"])
    def availability(self, request):
        """How much of an item may still be promised at a location.

        Its own endpoint rather than a field on every allocation row: the number
        the allocate form needs is for the item being chosen, and computing it
        per row would be two extra queries per allocation.
        """
        item = Item.objects.filter(pk=request.query_params.get("item")).first()
        if item is None:
            raise ValidationError({"item": "Unknown or missing item."})
        location = Location.objects.filter(pk=request.query_params.get("location")).first()

        return Response(
            {
                "item": item.pk,
                "location": location.pk if location else None,
                "on_hand": on_hand(item, location),
                "reserved": reserved_quantity(item, location),
                # The only number a UI may offer to a user. on_hand includes
                # stock already promised to someone else.
                "available": available_quantity(item, location),
            }
        )
