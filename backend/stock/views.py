from django.db.models import Sum
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from accounts.permissions import RoleBasedPermission
from catalog.models import Item
from core.mixins import ActivityLoggedMixin

from .models import Location, StockMovement
from .serializers import (
    LocationSerializer,
    MovementCreateSerializer,
    StockMovementSerializer,
)
from .services import InsufficientStock, annotate_on_hand, record_movement


class LocationViewSet(ActivityLoggedMixin, viewsets.ModelViewSet):
    queryset = Location.objects.all()
    serializer_class = LocationSerializer
    permission_classes = [RoleBasedPermission]
    domain = "stock"
    search_fields = ["name", "code"]
    ordering_fields = ["name", "code"]


class StockMovementViewSet(viewsets.ReadOnlyModelViewSet):
    """The ledger is append-only, so this is read + create only.

    There is deliberately no update or destroy: corrections are made by
    recording a compensating ADJUSTMENT, which keeps the history honest.
    """

    serializer_class = StockMovementSerializer
    permission_classes = [RoleBasedPermission]
    domain = "stock"
    filterset_fields = ["item", "location", "movement_type"]
    ordering_fields = ["created_at", "quantity"]
    search_fields = ["item__sku", "item__name", "note"]

    def get_queryset(self):
        return StockMovement.objects.select_related(
            "item", "location", "created_by"
        ).order_by("-created_at", "-id")

    def create(self, request, *args, **kwargs):
        serializer = MovementCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            movement = record_movement(
                item=data["item"],
                location=data["location"],
                movement_type=data["movement_type"],
                quantity=data["quantity"],
                user=request.user,
                unit_cost=data.get("unit_cost"),
                note=data.get("note", ""),
            )
        except InsufficientStock as exc:
            raise ValidationError({"quantity": str(exc)}) from exc
        except ValueError as exc:
            raise ValidationError({"quantity": str(exc)}) from exc

        return Response(
            StockMovementSerializer(movement, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class StockLevelViewSet(viewsets.ViewSet):
    """Derived view over the ledger -- there is no StockLevel table."""

    permission_classes = [RoleBasedPermission]
    domain = "stock"

    def list(self, request):
        location_id = request.query_params.get("location")
        location = Location.objects.filter(pk=location_id).first() if location_id else None

        items = annotate_on_hand(
            Item.objects.filter(is_active=True).select_related("category"), location
        )
        if request.query_params.get("low_stock") == "true":
            items = [i for i in items if i.on_hand <= i.reorder_point]

        return Response(
            [
                {
                    "item_id": i.id,
                    "sku": i.sku,
                    "name": i.name,
                    "category": i.category.name if i.category else None,
                    "unit": i.unit,
                    "on_hand": i.on_hand,
                    "reorder_point": i.reorder_point,
                    "is_low_stock": i.on_hand <= i.reorder_point,
                }
                for i in items
            ]
        )

    @action(detail=False, methods=["get"])
    def summary(self, request):
        total_units = StockMovement.objects.aggregate(t=Sum("quantity"))["t"] or 0
        items = annotate_on_hand(Item.objects.filter(is_active=True))
        low = [i for i in items if i.on_hand <= i.reorder_point]
        return Response(
            {
                "total_items": len(items),
                "total_units": total_units,
                "low_stock_count": len(low),
                "locations": Location.objects.filter(is_active=True).count(),
            }
        )
