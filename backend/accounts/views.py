from django.contrib.auth.models import Group
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from core.mixins import ActivityLoggedMixin
from core.models import ActivityLog
from core.services import log_activity

from .models import User
from .permissions import RoleBasedPermission
from .serializers import LoginSerializer, UserSerializer, UserWriteSerializer


class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == status.HTTP_200_OK:
            username = request.data.get("username")
            user = User.objects.filter(username=username).first()
            if user:
                log_activity(user, ActivityLog.Action.LOGIN, user)
        return response


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        """Self-service profile fields only -- never roles or is_active."""
        allowed = {"first_name", "last_name", "email", "phone"}
        for field, value in request.data.items():
            if field in allowed:
                setattr(request.user, field, value)
        request.user.save()
        return Response(UserSerializer(request.user).data)


class UserViewSet(ActivityLoggedMixin, viewsets.ModelViewSet):
    queryset = User.objects.all().prefetch_related("groups")
    permission_classes = [RoleBasedPermission]
    domain = "accounts"
    search_fields = ["username", "email", "first_name", "last_name"]
    ordering_fields = ["username", "date_joined"]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return UserWriteSerializer
        return UserSerializer

    @action(detail=False, methods=["get"])
    def roles(self, request):
        return Response(list(Group.objects.values_list("name", flat=True)))
