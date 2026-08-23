"""The Gemini chat loop.

Manual function calling, not the SDK's automatic mode: the runner has to inject
the requesting user into every tool call, and automatic mode would invoke the
Python functions itself with no chance to do that. See `agent/tools.py` for why
that matters.

The whole module is import-safe and callable with no API key -- `chat()` reports
`available: False` rather than raising, because the app has to run without the
assistant.
"""

from __future__ import annotations

import logging

from django.conf import settings

from .tools import TOOLS, call_tool

logger = logging.getLogger(__name__)

# Each round is one model call plus its tool calls. A cap because a model that
# keeps asking for tools would otherwise burn the free tier in a single request.
MAX_TOOL_ROUNDS = 4

# Free-tier friendly: only the last few turns are replayed.
MAX_HISTORY_TURNS = 10

SYSTEM_INSTRUCTION = """\
You are the assistant inside an inventory management system. Answer questions \
about stock, items, projects and sales by calling the tools provided. Never \
guess at a number -- if a tool can answer it, call the tool.

Two distinctions matter and you must not blur them:

- ON HAND is what is physically on the shelf. AVAILABLE is what may still be \
promised to someone new: on hand minus the units already reserved for projects. \
When someone asks whether they can take or commit stock, answer with AVAILABLE \
and say so.
- Allocating stock to a project RESERVES it; the stock only leaves when it is \
ISSUED.

You are read-only. You cannot record movements, create sales, edit items or \
change anything at all. If asked to, say so plainly and tell the user which \
screen does it.

Be brief. Use the item's SKU when naming it. Report currency amounts with the \
currency the tool returned, and never convert historical sales yourself -- the \
rate is frozen at sale time.\
"""


def is_available() -> bool:
    return bool(settings.GEMINI_API_KEY)


def _declarations(types):
    """Tool schemas in the shape google-genai expects."""
    return [
        types.FunctionDeclaration(
            name=name,
            description=(func.__doc__ or "").strip().split("\n")[0],
            parameters_json_schema=schema,
        )
        for name, (func, schema) in TOOLS.items()
    ]


def _history_to_contents(types, history: list[dict], message: str):
    """Prior turns plus the new message, as Gemini Content objects."""
    contents = []
    for turn in history[-MAX_HISTORY_TURNS:]:
        text = (turn.get("text") or "").strip()
        if not text:
            continue
        role = "model" if turn.get("role") == "assistant" else "user"
        contents.append(types.Content(role=role, parts=[types.Part(text=text)]))
    contents.append(types.Content(role="user", parts=[types.Part(text=message)]))
    return contents


def chat(message: str, user, history: list[dict] | None = None) -> dict:
    """Answer one message, calling tools as `user` where needed.

    Returns `{available, reply, tool_calls}`. `tool_calls` is surfaced so the UI
    can show what the answer was actually based on -- an assistant over live
    business data should not be a black box.
    """
    if not is_available():
        return {
            "available": False,
            "reply": "The assistant is not configured on this server.",
            "tool_calls": [],
        }

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    contents = _history_to_contents(types, history or [], message)
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_INSTRUCTION,
        tools=[types.Tool(function_declarations=_declarations(types))],
        temperature=0.2,
    )

    used: list[dict] = []

    for _round in range(MAX_TOOL_ROUNDS):
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL, contents=contents, config=config
        )

        calls = list(getattr(response, "function_calls", None) or [])
        if not calls:
            return {
                "available": True,
                "reply": (getattr(response, "text", None) or "").strip()
                or "I could not find an answer to that.",
                "tool_calls": used,
            }

        # Echo the model's turn back, then answer each call. Both halves are
        # required: dropping the model turn loses the link to the responses.
        contents.append(
            types.Content(
                role="model",
                parts=[types.Part(function_call=c) for c in calls],
            )
        )

        parts = []
        for call in calls:
            args = dict(call.args or {})
            result = call_tool(call.name, args, user)
            used.append({"name": call.name, "args": args})
            parts.append(
                types.Part(
                    function_response=types.FunctionResponse(
                        name=call.name,
                        # The SDK wants a dict; a bare list would be rejected.
                        response=result if isinstance(result, dict) else {"result": result},
                    )
                )
            )
        contents.append(types.Content(role="user", parts=parts))

    return {
        "available": True,
        "reply": "I needed too many lookups to answer that. Try asking something narrower.",
        "tool_calls": used,
    }


def safe_chat(message: str, user, history: list[dict] | None = None) -> dict:
    """`chat()` with upstream failures turned into a readable answer.

    A Gemini outage, a bad key or a rate limit must not 500 the app -- the
    assistant is the one feature allowed to be unavailable.
    """
    try:
        return chat(message, user, history)
    except Exception as exc:  # noqa: BLE001 - any upstream failure is the same to us
        logger.warning("Assistant call failed: %s", exc, exc_info=True)
        return {
            "available": True,
            "reply": "The assistant is temporarily unavailable. Please try again.",
            "tool_calls": [],
            "error": str(exc)[:200] if settings.DEBUG else None,
        }


def tool_catalogue() -> list[dict]:
    """What the assistant can do, for the UI to show up front."""
    return [
        {"name": name, "description": (func.__doc__ or "").strip().split("\n")[0]}
        for name, (func, _schema) in TOOLS.items()
    ]


__all__ = ["chat", "safe_chat", "is_available", "tool_catalogue"]
