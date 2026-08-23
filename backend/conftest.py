"""Fixtures shared by every test module.

These started out local to stock/tests.py. They live here so a second test file
does not have to redefine "an item", "a warehouse" and "a seeded role set" from
scratch -- if those definitions drift apart, tests start disagreeing about what
the system looks like.
"""

import pytest
from django.contrib.auth.models import Group

from accounts.models import User
from catalog.models import Item
from projects.models import Project
from stock.models import Location


@pytest.fixture
def location(db):
    return Location.objects.create(code="T1", name="Test Warehouse")


@pytest.fixture
def item(db):
    return Item.objects.create(sku="TEST-001", name="Test Widget", reorder_point=5)


@pytest.fixture
def user(db):
    return User.objects.create_user(username="tester", password="x")


@pytest.fixture
def project(db, user):
    return Project.objects.create(code="P1", name="Test Project", manager=user)


@pytest.fixture
def roles(db):
    """Create the Admin/Manager/Storekeeper/Viewer groups permissions key off."""
    from django.core.management import call_command

    call_command("seed_roles")


@pytest.fixture
def client_for(roles):
    """Build an authenticated APIClient for a role name.

    Permissions are asserted through the API by status code, never by checking
    that a button is hidden -- the frontend guard is convenience, the API is the
    authority.
    """
    from rest_framework.test import APIClient

    def _build(role_name: str) -> APIClient:
        user = User.objects.create_user(username=f"u_{role_name}", password="x")
        user.groups.set([Group.objects.get(name=role_name)])
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    return _build


@pytest.fixture(autouse=True)
def no_outbound_http(monkeypatch):
    """Fail any real HTTP call made during a test.

    The FX helper reaches for api.frankfurter.app, so without this the suite
    quietly depends on the network: it is slow, it breaks offline, and a test
    asserting on a rate would compare against whatever the market did today.
    Tests that need a rate seed an ExchangeRate row and exercise the fallback.
    """
    import requests

    def blocked(*args, **kwargs):
        raise AssertionError(
            f"Test made a real HTTP request to {args[0] if args else '?'}. "
            "Seed the data it needs instead."
        )

    monkeypatch.setattr(requests, "get", blocked)
    monkeypatch.setattr(requests, "post", blocked)


@pytest.fixture(autouse=True)
def clear_cache():
    """get_rate() caches for 24h; without this it leaks across tests."""
    from django.core.cache import cache

    cache.clear()
    yield
    cache.clear()
