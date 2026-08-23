from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import LocationViewSet, StockLevelViewSet, StockMovementViewSet

router = DefaultRouter()
router.register("locations", LocationViewSet, basename="location")
router.register("stock/movements", StockMovementViewSet, basename="stockmovement")
router.register("stock/levels", StockLevelViewSet, basename="stocklevel")

urlpatterns = [path("", include(router.urls))]
