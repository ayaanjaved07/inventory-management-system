from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CustomerViewSet, PurchaseViewSet, SaleViewSet, SupplierViewSet

router = DefaultRouter()
router.register("customers", CustomerViewSet, basename="customer")
router.register("sales", SaleViewSet, basename="sale")
router.register("suppliers", SupplierViewSet, basename="supplier")
router.register("purchases", PurchaseViewSet, basename="purchase")

urlpatterns = [path("", include(router.urls))]
