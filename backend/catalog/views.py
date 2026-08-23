from django.db.models import Count, F
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from accounts.permissions import RoleBasedPermission
from core.mixins import ActivityLoggedMixin
from core.models import ActivityLog
from core.services import log_activity
from stock.services import annotate_on_hand, levels_by_location

from .models import Category, Item, ItemImage
from .serializers import CategorySerializer, ItemImageSerializer, ItemSerializer
from .services import CsvImportError, export_items_csv, import_items_csv


class CategoryViewSet(ActivityLoggedMixin, viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    permission_classes = [RoleBasedPermission]
    domain = "catalog"
    search_fields = ["name"]
    ordering_fields = ["name"]

    def get_queryset(self):
        return Category.objects.annotate(item_count=Count("items")).order_by("name")


class ItemViewSet(ActivityLoggedMixin, viewsets.ModelViewSet):
    serializer_class = ItemSerializer
    permission_classes = [RoleBasedPermission]
    domain = "catalog"
    filterset_fields = ["category", "is_active", "unit"]
    search_fields = ["sku", "name", "description"]
    ordering_fields = ["name", "sku", "unit_cost", "created_at"]

    def get_queryset(self):
        qs = Item.objects.select_related("category", "currency").prefetch_related("images")
        # on_hand is derived from the ledger in a single subquery, not stored.
        qs = annotate_on_hand(qs)
        if self.request.query_params.get("low_stock") == "true":
            # Must stay a QuerySet: DRF hands this to the filter backends, which
            # read .model off it. A list comprehension here 500s the list view.
            qs = qs.filter(on_hand__lte=F("reorder_point"))
        return qs

    def perform_destroy(self, instance):
        log_activity(self.request.user, ActivityLog.Action.DELETE, instance)
        # Soft delete: an item with ledger history must never vanish, or the
        # movement log loses its subject.
        instance.is_active = False
        instance.save(update_fields=["is_active"])

    @action(detail=True, methods=["get"])
    def stock(self, request, pk=None):
        """Per-location breakdown for this item."""
        item = self.get_object()
        return Response(levels_by_location(item))

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        """Download the current catalog as CSV, honouring the caller's filters.

        Deliberately does NOT paginate: PAGE_SIZE is a global 25, so routing this
        through paginate_queryset would quietly export the first page and call it
        the catalog.

        This is a GET, and RoleBasedPermission grants safe methods to every
        authenticated user -- a Viewer can export. That is the same data the list
        endpoint already gives them, just in one file.
        """
        items = list(self.filter_queryset(self.get_queryset()))
        body = export_items_csv(items)

        # Logged by hand rather than via log_activity(): an export has no
        # subject instance, and the useful fact is how many rows left the system.
        ActivityLog.objects.create(
            user=request.user if request.user.is_authenticated else None,
            action=ActivityLog.Action.EXPORT,
            model_name="Item",
            object_id="",
            object_repr=f"CSV export: {len(items)} items",
            changes={"count": len(items)},
        )

        stamp = timezone.localtime().strftime("%Y%m%d-%H%M")
        response = HttpResponse(body, content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="items-{stamp}.csv"'
        return response

    @action(detail=False, methods=["post"], url_path="import")
    def import_csv(self, request):
        """Upload a CSV of items. Dry run unless ?commit=true.

        Writes, so RoleBasedPermission + domain="catalog" already restricts this
        to Admin and Manager -- no extra check needed here.
        """
        upload = request.FILES.get("file")
        if upload is None:
            raise ValidationError({"file": "No file uploaded."})

        commit = request.query_params.get("commit") == "true"
        try:
            report = import_items_csv(upload, request.user, commit=commit)
        except CsvImportError as exc:
            raise ValidationError({"file": str(exc)}) from None

        # A commit request that found row errors changed nothing; say so with a
        # 400 rather than a 200 the caller might read as success.
        status = 400 if (commit and report.errors) else 200
        return Response(report.as_dict(), status=status)

    @action(detail=True, methods=["get", "post"], url_path="images")
    def images(self, request, pk=None):
        item = self.get_object()
        if request.method == "GET":
            serializer = ItemImageSerializer(
                item.images.all(), many=True, context={"request": request}
            )
            return Response(serializer.data)

        serializer = ItemImageSerializer(
            data={**request.data.dict(), "item": item.pk}, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(created_by=request.user)
        return Response(serializer.data, status=201)


class ItemImageViewSet(viewsets.ModelViewSet):
    queryset = ItemImage.objects.select_related("item")
    serializer_class = ItemImageSerializer
    permission_classes = [RoleBasedPermission]
    domain = "catalog"
