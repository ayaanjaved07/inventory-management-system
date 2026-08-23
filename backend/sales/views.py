from django.db.models import Count
from rest_framework import status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from accounts.permissions import RoleBasedPermission
from core.mixins import ActivityLoggedMixin
from core.models import ActivityLog
from core.services import log_activity
from stock.services import InsufficientStock

from .models import Customer, Sale
from .serializers import CustomerSerializer, SaleCreateSerializer, SaleSerializer
from .services import RateUnavailable, next_invoice_no, record_sale


class CustomerViewSet(ActivityLoggedMixin, viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    permission_classes = [RoleBasedPermission]
    domain = "sales"
    search_fields = ["name", "email", "phone"]
    ordering_fields = ["name", "created_at"]

    def get_queryset(self):
        return Customer.objects.annotate(sale_count=Count("sales")).order_by("name")


class SaleViewSet(viewsets.ReadOnlyModelViewSet):
    """Read + create only.

    Every sale has matching rows in the append-only ledger, so editing or
    deleting one would leave StockMovements pointing at an invoice that no
    longer says what it did. Corrections are a RETURN movement, in the same
    spirit as an ADJUSTMENT correcting the ledger.
    """

    serializer_class = SaleSerializer
    permission_classes = [RoleBasedPermission]
    domain = "sales"
    filterset_fields = ["customer", "location", "currency"]
    search_fields = ["invoice_no", "customer__name", "note"]
    ordering_fields = ["sale_date", "total_amount", "created_at"]

    def get_queryset(self):
        return (
            Sale.objects.select_related("customer", "location")
            .prefetch_related("lines__item")
            .order_by("-sale_date", "-id")
        )

    def create(self, request, *args, **kwargs):
        serializer = SaleCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            sale = record_sale(
                invoice_no=data.get("invoice_no") or next_invoice_no(),
                customer=data.get("customer"),
                location=data["location"],
                sale_date=data["sale_date"],
                currency=data.get("currency") or None,
                note=data.get("note", ""),
                lines=[
                    {
                        "item": line["item"],
                        "quantity": line["quantity"],
                        "unit_price": line.get("unit_price"),
                    }
                    for line in data["lines"]
                ],
                user=request.user,
            )
        except InsufficientStock as exc:
            # Overselling is a bad request, and the whole sale rolled back --
            # there is no partial invoice to clean up.
            raise ValidationError({"lines": str(exc)}) from exc
        except RateUnavailable as exc:
            raise ValidationError({"currency": str(exc)}) from exc
        except ValueError as exc:
            raise ValidationError({"lines": str(exc)}) from exc

        log_activity(request.user, ActivityLog.Action.CREATE, sale)
        return Response(
            SaleSerializer(sale, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )
