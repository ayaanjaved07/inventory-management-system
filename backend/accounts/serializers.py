from django.contrib.auth.models import Group
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User


class UserSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "phone",
            "is_active",
            "is_superuser",
            "roles",
        ]
        read_only_fields = ["id", "is_superuser"]

    def get_roles(self, obj) -> list[str]:
        return obj.roles


class UserWriteSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, min_length=8)
    roles = serializers.ListField(
        child=serializers.CharField(), write_only=True, required=False
    )

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "phone",
            "is_active",
            "password",
            "roles",
        ]

    def _apply_roles(self, user, role_names):
        groups = Group.objects.filter(name__in=role_names)
        user.groups.set(groups)

    def create(self, validated_data):
        roles = validated_data.pop("roles", [])
        password = validated_data.pop("password", None)
        user = User(**validated_data)
        if password:
            user.set_password(password)
        user.save()
        self._apply_roles(user, roles)
        return user

    def to_representation(self, instance):
        # `roles` is write_only, so echoing this serializer back would omit the
        # roles the caller just set. Return the read serializer instead, so a
        # client can render the new user without an extra round trip.
        return UserSerializer(instance, context=self.context).data

    def update(self, instance, validated_data):
        roles = validated_data.pop("roles", None)
        password = validated_data.pop("password", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if password:
            instance.set_password(password)
        instance.save()
        if roles is not None:
            self._apply_roles(instance, roles)
        return instance


class LoginSerializer(TokenObtainPairSerializer):
    """Adds the user payload to the token response.

    Saves the SPA an extra round trip on login, and lets it render
    role-appropriate navigation immediately.
    """

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data
