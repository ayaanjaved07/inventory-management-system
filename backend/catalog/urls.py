from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CategoryViewSet, ItemImageViewSet, ItemViewSet

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")
router.register("items", ItemViewSet, basename="item")
router.register("item-images", ItemImageViewSet, basename="itemimage")

urlpatterns = [path("", include(router.urls))]
