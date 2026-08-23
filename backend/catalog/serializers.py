from rest_framework import serializers

from .models import Category, Item, ItemImage


class CategorySerializer(serializers.ModelSerializer):
    item_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Category
        fields = ["id", "name", "parent", "description", "item_count"]


class ItemImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ItemImage
        fields = ["id", "item", "image", "is_primary", "alt_text", "created_at"]
        read_only_fields = ["id", "created_at"]


class ItemSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    currency_code = serializers.CharField(source="currency.code", read_only=True)
    primary_image = serializers.SerializerMethodField()
    # Annotated by the viewset via stock.services.annotate_on_hand -- never a
    # stored column.
    on_hand = serializers.IntegerField(read_only=True, required=False)
    is_low_stock = serializers.SerializerMethodField()

    class Meta:
        model = Item
        fields = [
            "id",
            "sku",
            "name",
            "description",
            "category",
            "category_name",
            "unit",
            "unit_cost",
            "currency",
            "currency_code",
            "reorder_point",
            "is_active",
            "custom_fields",
            "on_hand",
            "is_low_stock",
            "primary_image",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_primary_image(self, obj) -> str | None:
        image = next(
            (i for i in obj.images.all() if i.is_primary),
            next(iter(obj.images.all()), None),
        )
        if not image:
            return None
        request = self.context.get("request")
        url = image.image.url
        return request.build_absolute_uri(url) if request else url

    def get_is_low_stock(self, obj) -> bool:
        on_hand = getattr(obj, "on_hand", None)
        if on_hand is None:
            return False
        return on_hand <= obj.reorder_point
