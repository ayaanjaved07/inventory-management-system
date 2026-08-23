from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AllocationViewSet, ProjectMemberViewSet, ProjectViewSet

router = DefaultRouter()
router.register("projects", ProjectViewSet, basename="project")
router.register("project-members", ProjectMemberViewSet, basename="projectmember")
router.register("allocations", AllocationViewSet, basename="allocation")

urlpatterns = [path("", include(router.urls))]
