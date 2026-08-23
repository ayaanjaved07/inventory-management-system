from django.db import models
from django.utils.translation import gettext_lazy as _

from core.models import TimeStampedModel


class Location(TimeStampedModel):
    name = models.CharField(_("name"), max_length=120)
    code = models.CharField(_("code"), max_length=32, unique=True)
    address = models.TextField(_("address"), blank=True)
    is_active = models.BooleanField(_("active"), default=True)

    class Meta:
        verbose_name = _("location")
        verbose_name_plural = _("locations")
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.code} - {self.name}"


class MovementType(models.TextChoices):
    RECEIPT = "RECEIPT", _("Receipt")
    ISSUE = "ISSUE", _("Issue")
    ADJUSTMENT = "ADJUSTMENT", _("Adjustment")
    TRANSFER_IN = "TRANSFER_IN", _("Transfer in")
    TRANSFER_OUT = "TRANSFER_OUT", _("Transfer out")
    SALE = "SALE", _("Sale")
    RETURN = "RETURN", _("Return")
    PROJECT_ISSUE = "PROJECT_ISSUE", _("Issued to project")
    PROJECT_RETURN = "PROJECT_RETURN", _("Returned from project")


class StockMovement(models.Model):
    """Append-only ledger. On-hand stock is DERIVED from these rows.

    Nothing in this codebase may UPDATE or DELETE a movement -- corrections are
    made by recording a compensating ADJUSTMENT. That is what makes the history
    trustworthy and reconciliation possible.
    """

    item = models.ForeignKey(
        "catalog.Item", on_delete=models.PROTECT, related_name="movements",
        verbose_name=_("item"),
    )
    location = models.ForeignKey(
        Location, on_delete=models.PROTECT, related_name="movements",
        verbose_name=_("location"),
    )
    movement_type = models.CharField(
        _("type"), max_length=20, choices=MovementType.choices
    )
    # Signed: positive adds to stock, negative removes it.
    quantity = models.IntegerField(_("quantity"))
    reference_type = models.CharField(_("reference type"), max_length=32, blank=True)
    reference_id = models.CharField(_("reference id"), max_length=64, blank=True)
    unit_cost = models.DecimalField(
        _("unit cost"), max_digits=14, decimal_places=2, null=True, blank=True
    )
    note = models.TextField(_("note"), blank=True)
    created_by = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="movements", verbose_name=_("created by"),
    )
    created_at = models.DateTimeField(_("created at"), auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = _("stock movement")
        verbose_name_plural = _("stock movements")
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["item", "location"]),
            models.Index(fields=["-created_at"]),
            models.Index(fields=["movement_type"]),
        ]

    def __str__(self) -> str:
        return f"{self.movement_type} {self.quantity:+d} {self.item.sku} @ {self.location.code}"
