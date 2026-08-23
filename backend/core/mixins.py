"""Reusable activity-logging for DRF viewsets.

Every write-capable viewset repeats the same perform_create/update/destroy
pattern, so it lives here once. Diffing on update is the part that makes the
activity page useful -- "updated Item" tells you nothing, "reorder_point
10 -> 20" tells you what happened.
"""

from __future__ import annotations

from core.models import ActivityLog
from core.services import log_activity

# Never record these, either because they are noise or because writing them
# into a readable audit trail would be a security problem.
SENSITIVE_FIELDS = {"password", "last_login", "updated_at", "created_at"}


def diff_instance(instance, validated_data: dict) -> dict:
    """Fields whose value actually changes, as {field: [old, new]}."""
    changes: dict[str, list] = {}
    for field, new_value in validated_data.items():
        if field in SENSITIVE_FIELDS:
            continue
        if not hasattr(instance, field):
            continue
        old_value = getattr(instance, field)
        if old_value == new_value:
            continue
        changes[field] = [_readable(old_value), _readable(new_value)]
    return changes


def _readable(value):
    """JSONField-safe representation (model instances, Decimals, dates)."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


class ActivityLoggedMixin:
    """Mix into a ModelViewSet to record create/update/delete automatically."""

    def perform_create(self, serializer):
        instance = serializer.save(**self._creator_kwargs(serializer))
        log_activity(self.request.user, ActivityLog.Action.CREATE, instance)

    def perform_update(self, serializer):
        changes = diff_instance(serializer.instance, serializer.validated_data)
        instance = serializer.save()
        # A no-op PATCH should not clutter the log.
        if changes:
            log_activity(self.request.user, ActivityLog.Action.UPDATE, instance, changes)

    def perform_destroy(self, instance):
        log_activity(self.request.user, ActivityLog.Action.DELETE, instance)
        instance.delete()

    def _creator_kwargs(self, serializer) -> dict:
        """Stamp created_by only on models that have it."""
        model = serializer.Meta.model
        if any(f.name == "created_by" for f in model._meta.get_fields()):
            return {"created_by": self.request.user}
        return {}
