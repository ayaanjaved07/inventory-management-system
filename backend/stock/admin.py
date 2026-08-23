from django.contrib import admin

from .models import Location, StockMovement


@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "is_active")
    search_fields = ("code", "name")


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ("created_at", "item", "location", "movement_type", "quantity", "created_by")
    list_filter = ("movement_type", "location")
    search_fields = ("item__sku", "item__name", "note")
    date_hierarchy = "created_at"

    # The ledger is append-only. Editing history in the admin would defeat the
    # entire point of having it.
    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
