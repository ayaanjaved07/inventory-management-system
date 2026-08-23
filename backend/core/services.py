"""Helpers shared across apps: activity logging and currency conversion."""

from __future__ import annotations

from decimal import Decimal

import requests
from django.conf import settings
from django.core.cache import cache

from .models import ActivityLog, ExchangeRate

_RATE_CACHE_TTL = 60 * 60 * 24  # 24h -- free-tier friendly


def log_activity(user, action: str, instance, changes: dict | None = None) -> ActivityLog:
    """Record a non-stock change. Stock changes belong in StockMovement."""
    return ActivityLog.objects.create(
        user=user if (user and user.is_authenticated) else None,
        action=action,
        model_name=instance.__class__.__name__,
        object_id=str(getattr(instance, "pk", "") or ""),
        object_repr=str(instance)[:255],
        changes=changes or {},
    )


def get_rate(base: str, target: str) -> Decimal:
    """Current rate, cached for a day. Falls back to the last stored rate."""
    base, target = base.upper(), target.upper()
    if base == target:
        return Decimal("1")

    key = f"fx:{base}:{target}"
    if (cached := cache.get(key)) is not None:
        return Decimal(str(cached))

    try:
        resp = requests.get(
            f"{settings.EXCHANGE_RATE_API}/latest",
            params={"from": base, "to": target},
            timeout=8,
        )
        resp.raise_for_status()
        rate = Decimal(str(resp.json()["rates"][target]))
    except Exception:
        # Offline or API down: fall back to the most recent stored rate so the
        # app keeps working. Never silently invent a rate of 1.
        last = ExchangeRate.objects.filter(base=base, target=target).first()
        if last is None:
            raise
        return last.rate

    ExchangeRate.objects.create(base=base, target=target, rate=rate)
    cache.set(key, str(rate), _RATE_CACHE_TTL)
    return rate


def convert(amount: Decimal, base: str, target: str) -> Decimal:
    return (Decimal(amount) * get_rate(base, target)).quantize(Decimal("0.01"))
