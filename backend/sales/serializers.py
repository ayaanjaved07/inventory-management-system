from rest_framework import serializers

from catalog.models import Item
from stock.models import Location

from .models import Customer, Purchase, PurchaseLine, Sale, SaleLine, Supplier


class CustomerSerializer(serializers.ModelSerializer):
    # Both are added by CustomerViewSet.get_queryset().
    sale_count = serializers.IntegerField(read_only=True, required=False)
    total_sold = serializers.DecimalField(
        max_digits=18, decimal_places=2, read_only=True, required=False
    )

    class Meta:
        model = Customer
        fields = [
            "id", "name", "contact_person", "email", "phone", "address",
            "sale_count", "total_sold", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class SupplierSerializer(serializers.ModelSerializer):
    # Both are added by SupplierViewSet.get_queryset().
    purchase_count = serializers.IntegerField(read_only=True, required=False)
    total_purchased = serializers.DecimalField(
        max_digits=18, decimal_places=2, read_only=True, required=False
    )

    class Meta:
        model = Supplier
        fields = [
            "id", "name", "contact_person", "email", "phone", "address",
            "purchase_count", "total_purchased", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class SaleLineSerializer(serializers.ModelSerializer):
    item_sku = serializers.CharField(source="item.sku", read_only=True)
    item_name = serializers.CharField(source="item.name", read_only=True)

    class Meta:
        model = SaleLine
        fields = ["id", "item", "item_sku", "item_name", "quantity", "unit_price", "line_total"]
        read_only_fields = fields


class SaleSerializer(serializers.ModelSerializer):
    lines = SaleLineSerializer(many=True, read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    location_code = serializers.CharField(source="location.code", read_only=True)
    total_in_base_currency = serializers.DecimalField(
        max_digits=18, decimal_places=2, read_only=True
    )

    class Meta:
        model = Sale
        fields = [
            "id", "invoice_no", "customer", "customer_name", "location", "location_code",
            "sale_date", "currency", "exchange_rate_used", "total_amount",
            "total_in_base_currency", "note", "lines", "created_at",
        ]
        # Sales are written by record_sale() and never edited: the invoice has
        # matching rows in the append-only ledger, and a PATCH to total_amount
        # or exchange_rate_used would rewrite reported history.
        read_only_fields = fields


class SaleLineCreateSerializer(serializers.Serializer):
    item = serializers.PrimaryKeyRelatedField(queryset=Item.objects.all())
    quantity = serializers.IntegerField(min_value=1)
    # Falls back to the item's unit_cost in the service layer.
    unit_price = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, allow_null=True
    )


class SaleCreateSerializer(serializers.Serializer):
    """Input for recording a sale. `record_sale()` does the work."""

    invoice_no = serializers.CharField(max_length=32, required=False, allow_blank=True)
    customer = serializers.PrimaryKeyRelatedField(
        queryset=Customer.objects.all(), required=False, allow_null=True
    )
    location = serializers.PrimaryKeyRelatedField(queryset=Location.objects.all())
    sale_date = serializers.DateField()
    currency = serializers.CharField(max_length=3, required=False, allow_blank=True)
    note = serializers.CharField(required=False, allow_blank=True)
    lines = SaleLineCreateSerializer(many=True)

    def validate_lines(self, value):
        if not value:
            raise serializers.ValidationError("A sale needs at least one line.")
        return value

    def validate_invoice_no(self, value):
        value = (value or "").strip()
        if value and Sale.objects.filter(invoice_no=value).exists():
            raise serializers.ValidationError(f"Invoice {value} already exists.")
        return value


class PurchaseLineSerializer(serializers.ModelSerializer):
    item_sku = serializers.CharField(source="item.sku", read_only=True)
    item_name = serializers.CharField(source="item.name", read_only=True)

    class Meta:
        model = PurchaseLine
        fields = ["id", "item", "item_sku", "item_name", "quantity", "unit_cost", "line_total"]
        read_only_fields = fields


class PurchaseSerializer(serializers.ModelSerializer):
    lines = PurchaseLineSerializer(many=True, read_only=True)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    location_code = serializers.CharField(source="location.code", read_only=True)

    class Meta:
        model = Purchase
        fields = [
            "id", "reference_no", "supplier", "supplier_name", "location", "location_code",
            "purchase_date", "total_amount", "note", "lines", "created_at",
        ]
        # Like sales, purchases are never edited: their stock is in the ledger.
        read_only_fields = fields


class PurchaseLineCreateSerializer(serializers.Serializer):
    item = serializers.PrimaryKeyRelatedField(queryset=Item.objects.all())
    quantity = serializers.IntegerField(min_value=1)
    # Falls back to the item's unit_cost in record_purchase().
    unit_cost = serializers.DecimalField(
        max_digits=14, decimal_places=2, min_value=0, required=False, allow_null=True
    )


class PurchaseCreateSerializer(serializers.Serializer):
    """Input for recording a purchase. `record_purchase()` does the work."""

    reference_no = serializers.CharField(max_length=32, required=False, allow_blank=True)
    supplier = serializers.PrimaryKeyRelatedField(queryset=Supplier.objects.all())
    location = serializers.PrimaryKeyRelatedField(queryset=Location.objects.all())
    purchase_date = serializers.DateField()
    note = serializers.CharField(required=False, allow_blank=True)
    lines = PurchaseLineCreateSerializer(many=True)

    def validate_lines(self, value):
        if not value:
            raise serializers.ValidationError("A purchase needs at least one line.")
        return value

    def validate_reference_no(self, value):
        value = (value or "").strip()
        if value and Purchase.objects.filter(reference_no=value).exists():
            raise serializers.ValidationError(f"Purchase {value} already exists.")
        return value
