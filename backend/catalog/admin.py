from django.contrib import admin

from .models import Category, Item, ItemImage


class ItemImageInline(admin.TabularInline):
    model = ItemImage
    extra = 0


@admin.register(Item)
class ItemAdmin(admin.ModelAdmin):
    list_display = ("sku", "name", "category", "unit", "reorder_point", "is_active")
    list_filter = ("is_active", "category", "unit")
    search_fields = ("sku", "name")
    inlines = [ItemImageInline]


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "parent")
    search_fields = ("name",)
