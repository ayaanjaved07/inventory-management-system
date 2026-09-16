from django.contrib.auth.models import Group
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import Role, User


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


class RegisterSerializer(serializers.ModelSerializer):
    """The sign-up form on the login page.

    Anyone can post to this, so it deliberately has no `roles`, `is_active` or
    `is_staff` field. Someone who sends those gets them ignored: the only
    account this can make is a Viewer.
    """

    # The model allows a blank email, but a sign-up form should ask for one.
    email = serializers.EmailField(required=True)
    password = serializers.CharField(write_only=True, min_length=8)
    password2 = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "password", "password2"]

    def validate(self, attrs):
        if attrs["password"] != attrs["password2"]:
            raise serializers.ValidationError(
                {"password2": "The two passwords do not match."}
            )
        return attrs

    def create(self, validated_data):
        validated_data.pop("password2")
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        # get_or_create, not get: on a database that has never run seed_roles
        # this would otherwise make an account with no role at all.
        viewer, _ = Group.objects.get_or_create(name=Role.VIEWER.value)
        user.groups.set([viewer])
        return user

    def to_representation(self, instance):
        # `password` and `password2` are write_only, so echo back the normal
        # user payload instead -- it includes the roles just assigned.
        return UserSerializer(instance, context=self.context).data


class LoginSerializer(TokenObtainPairSerializer):
    """Adds the user payload to the token response.

    Saves the SPA an extra round trip on login, and lets it render
    role-appropriate navigation immediately.
    """

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data
