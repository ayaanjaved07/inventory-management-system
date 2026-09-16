"""Tests for self-registration.

Anyone can reach POST /api/auth/register/, so the thing worth proving is that
it can only ever make a Viewer -- the role with no write permissions at all.
"""

import pytest
from rest_framework.test import APIClient

from accounts.models import User

GOOD = {
    "username": "newbie",
    "email": "newbie@example.com",
    "password": "demo12345",
    "password2": "demo12345",
}


@pytest.fixture
def client(db):
    """A signed-out client -- registration must work with no token."""
    return APIClient()


def test_register_creates_an_active_viewer_who_can_sign_in(client):
    resp = client.post("/api/auth/register/", GOOD, format="json")

    assert resp.status_code == 201
    user = User.objects.get(username="newbie")
    assert user.is_active
    assert user.roles == ["Viewer"]

    # The whole point: the new account can now log in.
    login = client.post(
        "/api/auth/token/",
        {"username": "newbie", "password": "demo12345"},
        format="json",
    )
    assert login.status_code == 200


def test_register_rejects_a_duplicate_username(client):
    User.objects.create_user(username="newbie", password="x")

    resp = client.post("/api/auth/register/", GOOD, format="json")

    assert resp.status_code == 400
    assert "username" in resp.data


def test_register_rejects_mismatched_passwords(client):
    payload = GOOD | {"password2": "something-else"}

    resp = client.post("/api/auth/register/", payload, format="json")

    assert resp.status_code == 400
    assert not User.objects.filter(username="newbie").exists()


def test_register_cannot_give_itself_a_role_or_staff_access(client):
    """roles/is_staff/is_superuser are not fields on the serializer, so these
    are ignored rather than obeyed."""
    payload = GOOD | {"roles": ["Admin"], "is_staff": True, "is_superuser": True}

    resp = client.post("/api/auth/register/", payload, format="json")

    assert resp.status_code == 201
    user = User.objects.get(username="newbie")
    assert user.roles == ["Viewer"]
    assert not user.is_staff
    assert not user.is_superuser
