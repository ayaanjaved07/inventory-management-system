"""Shared building blocks: timestamps, currency, and the activity log."""

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class TimeStampedModel(models.Model):
    """Abstract base giving every record creation/update provenance."""

    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="%(class)s_created",
        verbose_name=_("created by"),
    )

    class Meta:
        abstract = True


class Currency(models.Model):
    code = models.CharField(_("code"), max_length=3, unique=True)  # ISO 4217
    name = models.CharField(_("name"), max_length=64)
    symbol = models.CharField(_("symbol"), max_length=8, blank=True)
    is_base = models.BooleanField(_("is base currency"), default=False)

    class Meta:
        verbose_name = _("currency")
        verbose_name_plural = _("currencies")
        ordering = ["code"]

    def __str__(self) -> str:
        return self.code


class ExchangeRate(models.Model):
    """A fetched rate. Kept as history so past conversions stay reproducible."""

    base = models.CharField(_("base"), max_length=3)
    target = models.CharField(_("target"), max_length=3)
    rate = models.DecimalField(_("rate"), max_digits=18, decimal_places=6)
    fetched_at = models.DateTimeField(_("fetched at"), auto_now_add=True)

    class Meta:
        verbose_name = _("exchange rate")
        verbose_name_plural = _("exchange rates")
        ordering = ["-fetched_at"]
        indexes = [models.Index(fields=["base", "target", "-fetched_at"])]

    def __str__(self) -> str:
        return f"{self.base}->{self.target} @ {self.rate}"


class ActivityLog(models.Model):
    """Who changed what, for the user-facing Activity page.

    Stock changes are already covered by the immutable StockMovement ledger;
    this covers everything else (items edited, roles changed, users created).
    """

    class Action(models.TextChoices):
        CREATE = "CREATE", _("Created")
        UPDATE = "UPDATE", _("Updated")
        DELETE = "DELETE", _("Deleted")
        LOGIN = "LOGIN", _("Logged in")
        IMPORT = "IMPORT", _("Imported")
        EXPORT = "EXPORT", _("Exported")

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="activity", verbose_name=_("user"),
    )
    action = models.CharField(_("action"), max_length=16, choices=Action.choices)
    model_name = models.CharField(_("model"), max_length=64)
    object_id = models.CharField(_("object id"), max_length=64, blank=True)
    object_repr = models.CharField(_("object"), max_length=255, blank=True)
    changes = models.JSONField(_("changes"), default=dict, blank=True)
    timestamp = models.DateTimeField(_("timestamp"), auto_now_add=True)

    class Meta:
        verbose_name = _("activity log entry")
        verbose_name_plural = _("activity log")
        ordering = ["-timestamp"]
        indexes = [models.Index(fields=["-timestamp"]), models.Index(fields=["model_name"])]

    def __str__(self) -> str:
        return f"{self.user} {self.action} {self.model_name}#{self.object_id}"
