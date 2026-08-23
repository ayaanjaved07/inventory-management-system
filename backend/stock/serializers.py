from rest_framework import serializers

from catalog.models import Item

from .models import Location, MovementType, StockMovement


class LocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = ["id", "name", "code", "address", "is_active"]


class StockMovementSerializer(serializers.ModelSerializer):
    item_sku = serializers.CharField(source="item.sku", read_only=True)
    item_name = serializers.CharField(source="item.name", read_only=True)
    location_code = serializers.CharField(source="location.code", read_only=True)
    created_by_name = serializers.CharField(source="created_by.username", read_only=True)
    movement_type_display = serializers.CharField(
        source="get_movement_type_display", read_only=True
    )

    class Meta:
        model = StockMovement
        fields = [
            "id", "item", "item_sku", "item_name", "location", "location_code",
            "movement_type", "movement_type_display", "quantity", "unit_cost",
            "note", "reference_type", "reference_id",
            "created_by", "created_by_name", "created_at",
        ]
        read_only_fields = fields


class MovementCreateSerializer(serializers.Serializer):
    """Input shape for recording a movement.

    Quantity is a positive magnitude for directional types; the service layer
    applies the sign. ADJUSTMENT is the one type that takes a signed value,
    since it can correct in either direction.
    """

    item = serializers.PrimaryKeyRelatedField(queryset=Item.objects.all())
    location = serializers.PrimaryKeyRelatedField(queryset=Location.objects.all())
    movement_type = serializers.ChoiceField(choices=MovementType.choices)
    quantity = serializers.IntegerField()
    unit_cost = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, allow_null=True
    )
    note = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs["quantity"] == 0:
            raise serializers.ValidationError({"quantity": "Quantity cannot be zero."})
        if attrs["movement_type"] != MovementType.ADJUSTMENT and attrs["quantity"] < 0:
            raise serializers.ValidationError(
                {"quantity": "Use a positive quantity; only ADJUSTMENT may be negative."}
            )
        return attrs
