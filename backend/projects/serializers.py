from rest_framework import serializers

from catalog.models import Item
from stock.models import Location

from .models import Allocation, Project, ProjectMember


class ProjectMemberSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = ProjectMember
        fields = ["id", "project", "user", "username", "role_in_project"]


class ProjectSerializer(serializers.ModelSerializer):
    manager_name = serializers.CharField(source="manager.username", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    # Annotated by the viewset; absent when the object is serialized elsewhere.
    allocation_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Project
        fields = [
            "id", "code", "name", "description", "status", "status_display",
            "start_date", "end_date", "manager", "manager_name",
            "allocation_count", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class AllocationSerializer(serializers.ModelSerializer):
    project_code = serializers.CharField(source="project.code", read_only=True)
    item_sku = serializers.CharField(source="item.sku", read_only=True)
    item_name = serializers.CharField(source="item.name", read_only=True)
    location_code = serializers.CharField(source="location.code", read_only=True)
    assigned_to_name = serializers.CharField(source="assigned_to.username", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    # Model properties, not columns: what is still reserved, and what the
    # assignee is still holding.
    outstanding_reservation = serializers.IntegerField(read_only=True)
    quantity_outstanding = serializers.IntegerField(read_only=True)

    class Meta:
        model = Allocation
        fields = [
            "id", "project", "project_code", "item", "item_sku", "item_name",
            "location", "location_code", "assigned_to", "assigned_to_name",
            "quantity_allocated", "quantity_issued", "quantity_returned",
            "outstanding_reservation", "quantity_outstanding",
            "status", "status_display", "note", "created_at",
        ]
        # Quantities move only through allocate/issue/return, never a PATCH --
        # a direct write here would desynchronise the allocation from the ledger.
        read_only_fields = fields


class AllocationCreateSerializer(serializers.Serializer):
    """Input for reserving stock. The service layer enforces availability."""

    project = serializers.PrimaryKeyRelatedField(queryset=Project.objects.all())
    item = serializers.PrimaryKeyRelatedField(queryset=Item.objects.all())
    location = serializers.PrimaryKeyRelatedField(queryset=Location.objects.all())
    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=Allocation._meta.get_field("assigned_to").related_model.objects.all(),
        required=False,
        allow_null=True,
    )
    quantity = serializers.IntegerField(min_value=1)
    note = serializers.CharField(required=False, allow_blank=True)


class QuantitySerializer(serializers.Serializer):
    """Body for the issue and return actions."""

    quantity = serializers.IntegerField(min_value=1)
