from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.utils import timezone
from rest_framework import generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ActivityLog, Currency
from .serializers import ActivityLogSerializer, CurrencySerializer
from .services import convert


class ActivityLogListView(generics.ListAPIView):
    serializer_class = ActivityLogSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["action", "model_name", "user"]
    search_fields = ["object_repr", "model_name"]

    def get_queryset(self):
        return ActivityLog.objects.select_related("user")


class CurrencyListView(generics.ListCreateAPIView):
    queryset = Currency.objects.all()
    serializer_class = CurrencySerializer
    permission_classes = [IsAuthenticated]


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def convert_view(request):
    amount = Decimal(str(request.data.get("amount", 0)))
    base = request.data.get("from", settings.BASE_CURRENCY)
    target = request.data.get("to", settings.BASE_CURRENCY)
    try:
        result = convert(amount, base, target)
    except Exception as exc:
        return Response({"detail": f"Rate unavailable: {exc}"}, status=503)
    return Response({"amount": amount, "from": base, "to": target, "result": result})


def _revenue(sales) -> Decimal:
    """Sum sales in base currency at the rate each one was booked at.

    Deliberately not `SUM(total_amount)`: sales in different currencies are not
    comparable, and deliberately not a live conversion either -- the rate is
    frozen on the row so last month's revenue reads the same next month.
    """
    return sum(
        (s.total_amount * s.exchange_rate_used for s in sales), start=Decimal("0")
    ).quantize(Decimal("0.01"))


class DashboardStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from catalog.models import Item
        from projects.models import Project
        from sales.models import Sale
        from stock.models import Location
        from stock.services import annotate_on_hand

        items = list(
            annotate_on_hand(Item.objects.filter(is_active=True).select_related("category"))
        )
        stock_value = sum((i.on_hand * i.unit_cost for i in items), start=Decimal("0"))

        # Low stock, worst first: empty items on top, then the biggest shortfall.
        low = [i for i in items if i.on_hand <= i.reorder_point]
        low.sort(key=lambda i: (i.on_hand > 0, i.on_hand - i.reorder_point))
        out_of_stock = [i for i in low if i.on_hand <= 0]

        # Expired or expiring soon, the earliest date first.
        expiring = [i for i in items if i.expiry_status()]
        expiring.sort(key=lambda i: i.expiry_date)

        since = timezone.localdate() - timedelta(days=30)
        recent_sales = list(Sale.objects.filter(sale_date__gte=since))

        return Response(
            {
                "total_items": len(items),
                "total_units": sum(i.on_hand for i in items),
                "stock_value": stock_value,
                "low_stock_count": len(low),
                "out_of_stock_count": len(out_of_stock),
                "low_stock_items": [
                    {"id": i.id, "sku": i.sku, "name": i.name,
                     "category": i.category.name if i.category else None,
                     "on_hand": i.on_hand, "reorder_point": i.reorder_point}
                    for i in low[:20]
                ],
                "expiring_count": len(expiring),
                "expiring_items": [
                    {"id": i.id, "sku": i.sku, "name": i.name, "on_hand": i.on_hand,
                     "expiry_date": i.expiry_date, "expiry_status": i.expiry_status()}
                    for i in expiring[:10]
                ],
                "locations": Location.objects.filter(is_active=True).count(),
                "active_projects": Project.objects.filter(
                    status=Project.Status.ACTIVE
                ).count(),
                "invoice_count": Sale.objects.count(),
                "revenue_30d": _revenue(recent_sales),
                "base_currency": settings.BASE_CURRENCY,
            }
        )


class SalesStatsView(APIView):
    """Revenue over time plus the best-selling items, for the sales screen."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.db.models import F, Sum

        from sales.models import Sale, SaleLine

        try:
            days = max(1, min(int(request.query_params.get("days", 90)), 365))
        except ValueError:
            days = 90
        since = timezone.localdate() - timedelta(days=days)

        sales = list(Sale.objects.filter(sale_date__gte=since))

        # Bucketed in Python rather than SQL: TruncMonth's behaviour differs
        # between SQLite and Postgres, and the row count here is tiny.
        by_month: dict[str, Decimal] = {}
        for sale in sales:
            key = sale.sale_date.strftime("%Y-%m")
            by_month[key] = by_month.get(key, Decimal("0")) + (
                sale.total_amount * sale.exchange_rate_used
            )

        top_items = (
            SaleLine.objects.filter(sale__sale_date__gte=since)
            .values("item__sku", "item__name")
            .annotate(quantity=Sum("quantity"), revenue=Sum(F("line_total")))
            .order_by("-revenue")[:10]
        )

        return Response(
            {
                "days": days,
                "base_currency": settings.BASE_CURRENCY,
                "invoice_count": len(sales),
                "revenue_total": _revenue(sales),
                "revenue_by_month": [
                    {"month": month, "revenue": by_month[month].quantize(Decimal("0.01"))}
                    for month in sorted(by_month)
                ],
                "top_items": [
                    {
                        "sku": row["item__sku"],
                        "name": row["item__name"],
                        "quantity": row["quantity"],
                        "revenue": row["revenue"],
                    }
                    for row in top_items
                ],
            }
        )
