"""Tests for the assistant.

Two things matter here and neither needs a Gemini key:

1. **The app runs without one.** The assistant is the single feature allowed to
   be unavailable, and every other screen has to keep working.
2. **The tools return the truth**, including the reserved-vs-available
   distinction, and cannot write anything.
"""

from datetime import date
from decimal import Decimal

import pytest

from accounts.models import Role
from agent import tools as agent_tools
from agent.services import tool_catalogue
from catalog.models import Category, Item
from core.models import Currency
from projects.services import allocate
from sales.services import record_sale
from stock.models import MovementType, StockMovement
from stock.services import record_movement


@pytest.fixture
def stocked(db, item, location, user):
    record_movement(item=item, location=location, quantity=20,
                    movement_type=MovementType.RECEIPT, user=user)
    return item


# --------------------------------------------------------------------------
# Degrading gracefully
# --------------------------------------------------------------------------
def test_app_runs_with_no_key_configured(client_for, settings):
    settings.GEMINI_API_KEY = ""
    client = client_for(Role.VIEWER.value)

    assert client.get("/api/agent/chat/").data["available"] is False
    assert client.post("/api/agent/chat/", {"message": "hi"}, format="json").status_code == 503


def test_catalogue_is_listed_even_without_a_key(client_for, settings):
    """The UI can show what the assistant would be able to do."""
    settings.GEMINI_API_KEY = ""

    data = client_for(Role.VIEWER.value).get("/api/agent/chat/").data

    assert {t["name"] for t in data["tools"]} == set(agent_tools.TOOLS)
    assert all(t["description"] for t in tool_catalogue())


def test_chat_requires_authentication(db, settings):
    from rest_framework.test import APIClient

    settings.GEMINI_API_KEY = "x"
    assert APIClient().post("/api/agent/chat/", {"message": "hi"}).status_code == 401


def test_blank_message_is_rejected(client_for, settings):
    settings.GEMINI_API_KEY = "x"
    resp = client_for(Role.VIEWER.value).post(
        "/api/agent/chat/", {"message": "   "}, format="json"
    )
    assert resp.status_code == 400


def test_upstream_failure_does_not_500(client_for, settings, monkeypatch):
    """A Gemini outage or a bad key must not take the endpoint down."""
    settings.GEMINI_API_KEY = "not-a-real-key"

    import agent.services

    def boom(*args, **kwargs):
        raise RuntimeError("upstream exploded")

    monkeypatch.setattr(agent.services, "chat", boom)

    resp = client_for(Role.VIEWER.value).post(
        "/api/agent/chat/", {"message": "how much stock?"}, format="json"
    )

    assert resp.status_code == 200
    assert "unavailable" in resp.data["reply"].lower()


def test_history_is_capped(client_for, settings):
    """History is replayed to Gemini, so an unbounded list is a token-burn vector."""
    from agent.serializers import ChatRequestSerializer

    serializer = ChatRequestSerializer(
        data={
            "message": "hi",
            "history": [{"role": "user", "text": f"turn {n}"} for n in range(50)],
        }
    )
    assert serializer.is_valid(), serializer.errors
    assert len(serializer.validated_data["history"]) == 20


# --------------------------------------------------------------------------
# The tools tell the truth
# --------------------------------------------------------------------------
def test_search_items_finds_by_sku_and_name(stocked, user, db):
    Item.objects.create(sku="OTHER-1", name="Unrelated")

    assert agent_tools.search_items(user, query="TEST-001")["count"] == 1
    assert agent_tools.search_items(user, query="Widget")["count"] == 1
    assert agent_tools.search_items(user, query="")["count"] == 2


def test_search_items_by_category(stocked, user, db):
    category = Category.objects.create(name="Electronics")
    Item.objects.create(sku="CAT-1", name="Boxed", category=category)

    result = agent_tools.search_items(user, query="Electronics")

    assert [i["sku"] for i in result["items"]] == ["CAT-1"]


def test_get_stock_level_separates_reserved_from_available(
    stocked, location, user, project
):
    """The whole point of the tool: on_hand is not what may be promised."""
    allocate(project=project, item=stocked, location=location, quantity=8, user=user)

    result = agent_tools.get_stock_level(user, sku=stocked.sku, location_code=location.code)

    assert result["on_hand"] == 20
    assert result["reserved_for_projects"] == 8
    assert result["available_to_promise"] == 12


def test_get_stock_level_reports_an_unknown_sku(stocked, user):
    assert "error" in agent_tools.get_stock_level(user, sku="NOPE-999")


def test_get_stock_level_reports_an_unknown_location(stocked, user):
    assert "error" in agent_tools.get_stock_level(user, sku="TEST-001", location_code="ZZZ")


def test_list_low_stock_uses_the_reorder_point(stocked, location, user, db):
    """TEST-001 has 20 on hand against a reorder point of 5, so it is fine."""
    scarce = Item.objects.create(sku="LOW-1", name="Nearly Out", reorder_point=10)
    record_movement(item=scarce, location=location, quantity=3,
                    movement_type=MovementType.RECEIPT, user=user)

    result = agent_tools.list_low_stock(user)

    assert [i["sku"] for i in result["items"]] == ["LOW-1"]


def test_recent_movements_are_newest_first(stocked, location, user):
    record_movement(item=stocked, location=location, quantity=2,
                    movement_type=MovementType.ISSUE, user=user, note="second")

    result = agent_tools.get_recent_movements(user, sku=stocked.sku)

    assert result["count"] == 2
    assert result["movements"][0]["note"] == "second"
    assert result["movements"][0]["quantity"] == -2   # signed: it left the shelf


def test_sales_summary_uses_the_frozen_rate(stocked, location, user, db):
    Currency.objects.create(code="INR", name="Rupee", is_base=True)
    record_sale(
        invoice_no="INV-A1", location=location, sale_date=date.today(), user=user,
        lines=[{"item": stocked, "quantity": 2, "unit_price": Decimal("150")}],
    )

    result = agent_tools.sales_summary(user, days=30)

    assert result["invoice_count"] == 1
    assert result["revenue"] == "300.00"
    assert result["top_items"][0]["sku"] == stocked.sku


def test_project_allocations_report_reserved_and_held(stocked, location, user, project):
    alloc = allocate(project=project, item=stocked, location=location, quantity=6, user=user)
    from projects.services import issue

    issue(alloc, 4, user=user)

    row = agent_tools.project_allocations(user, project_code=project.code)["allocations"][0]

    assert row["allocated"] == 6
    assert row["issued"] == 4
    assert row["still_reserved"] == 2    # not yet issued
    assert row["still_held"] == 4        # issued, not returned


def test_project_allocations_reports_an_unknown_project(stocked, user):
    assert "error" in agent_tools.project_allocations(user, project_code="NOPE")


def test_list_projects(stocked, user, project):
    result = agent_tools.list_projects(user)
    assert result["count"] == 1
    assert result["projects"][0]["code"] == project.code


def test_unknown_tool_is_reported_not_guessed(user, db):
    assert "error" in agent_tools.call_tool("drop_everything", {}, user)


def test_bad_arguments_are_reported(user, db):
    assert "error" in agent_tools.call_tool("get_stock_level", {"nonsense": 1}, user)


# --------------------------------------------------------------------------
# The toolset is read-only
# --------------------------------------------------------------------------
def test_no_tool_can_write(stocked, location, user, project, db):
    """Every tool runs, and the ledger and the catalogue are untouched.

    Reads are open to any authenticated user, so a read-only toolset cannot
    surface anything the caller's own endpoints would refuse. That argument
    stops holding the moment a write tool is added.
    """
    allocate(project=project, item=stocked, location=location, quantity=2, user=user)
    before_movements = StockMovement.objects.count()
    before_items = Item.objects.count()

    for name in agent_tools.TOOLS:
        agent_tools.call_tool(name, {"sku": stocked.sku} if name == "get_stock_level" else {}, user)

    assert StockMovement.objects.count() == before_movements
    assert Item.objects.count() == before_items


def test_no_tool_imports_a_write_service():
    """A structural check: record_movement must not be reachable from tools.py."""
    import pathlib

    source = pathlib.Path(agent_tools.__file__).read_text(encoding="utf-8")
    body = source.split('"""', 2)[-1]   # skip the module docstring, which names them
    for forbidden in ("record_movement", "record_sale", ".save(", ".create(", ".delete("):
        assert forbidden not in body, f"agent/tools.py must not use {forbidden}"


# --------------------------------------------------------------------------
# The tool-calling loop, with Gemini stubbed out
# --------------------------------------------------------------------------
class _FakeResponse:
    def __init__(self, text=None, function_calls=None):
        self.text = text
        self.function_calls = function_calls or []


class _FakeCall:
    def __init__(self, name, args):
        self.name, self.args = name, args


class _FakeModels:
    """Replays a scripted list of responses and records what it was sent."""

    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = []

    def generate_content(self, *, model, contents, config):
        self.calls.append({"model": model, "contents": contents, "config": config})
        return self._responses.pop(0)


def _stub_gemini(monkeypatch, responses):
    from google import genai

    models = _FakeModels(responses)

    class _FakeClient:
        def __init__(self, **kwargs):
            self.models = models

    monkeypatch.setattr(genai, "Client", _FakeClient)
    return models


def test_a_tool_call_is_executed_and_fed_back(stocked, location, user, settings, monkeypatch):
    settings.GEMINI_API_KEY = "test-key"
    models = _stub_gemini(
        monkeypatch,
        [
            _FakeResponse(function_calls=[_FakeCall("get_stock_level", {"sku": "TEST-001"})]),
            _FakeResponse(text="TEST-001 has 20 on hand."),
        ],
    )

    from agent.services import chat

    result = chat("how many TEST-001?", user)

    assert result["reply"] == "TEST-001 has 20 on hand."
    assert result["tool_calls"] == [{"name": "get_stock_level", "args": {"sku": "TEST-001"}}]
    # Second round must carry the model turn AND the tool response, or the
    # model has no link between its call and the answer.
    second = models.calls[1]["contents"]
    assert second[-2].role == "model" and second[-2].parts[0].function_call is not None
    assert second[-1].parts[0].function_response.response["on_hand"] == 20


def test_a_plain_answer_makes_one_call(stocked, user, settings, monkeypatch):
    settings.GEMINI_API_KEY = "test-key"
    models = _stub_gemini(monkeypatch, [_FakeResponse(text="Hello.")])

    from agent.services import chat

    assert chat("hi", user)["reply"] == "Hello."
    assert len(models.calls) == 1


def test_runaway_tool_calling_is_capped(stocked, user, settings, monkeypatch):
    """A model that only ever asks for tools must not burn the free tier."""
    from agent.services import MAX_TOOL_ROUNDS, chat

    _stub_gemini(
        monkeypatch,
        [
            _FakeResponse(function_calls=[_FakeCall("list_low_stock", {})])
            for _ in range(MAX_TOOL_ROUNDS + 2)
        ],
    )
    settings.GEMINI_API_KEY = "test-key"

    result = chat("loop forever", user)

    assert "narrower" in result["reply"]
    assert len(result["tool_calls"]) == MAX_TOOL_ROUNDS


def test_history_is_replayed_with_the_right_roles(stocked, user, settings, monkeypatch):
    settings.GEMINI_API_KEY = "test-key"
    models = _stub_gemini(monkeypatch, [_FakeResponse(text="ok")])

    from agent.services import chat

    chat(
        "and now?",
        user,
        history=[
            {"role": "user", "text": "first question"},
            {"role": "assistant", "text": "first answer"},
            {"role": "user", "text": "   "},          # blank turns are dropped
        ],
    )

    contents = models.calls[0]["contents"]
    assert [c.role for c in contents] == ["user", "model", "user"]
    assert contents[-1].parts[0].text == "and now?"


def test_the_requesting_user_reaches_the_tool(stocked, user, settings, monkeypatch):
    """The agent must never call a tool as anyone but the asker."""
    settings.GEMINI_API_KEY = "test-key"
    _stub_gemini(
        monkeypatch,
        [
            _FakeResponse(function_calls=[_FakeCall("list_projects", {})]),
            _FakeResponse(text="done"),
        ],
    )
    seen = {}

    def spy(caller, **kwargs):
        seen["user"] = caller
        return {"count": 0, "projects": []}

    monkeypatch.setitem(agent_tools.TOOLS, "list_projects", (spy, {"type": "object"}))

    from agent.services import chat

    chat("list projects", user)

    assert seen["user"] is user
