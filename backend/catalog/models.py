from datetime import timedelta

from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from core.models import TimeStampedModel

# An item counts as "expiring soon" this many days before its expiry date.
EXPIRY_WARNING_DAYS = 30


class Category(TimeStampedModel):
    name = models.CharField(_("name"), max_length=120)
    parent = models.ForeignKey(
        "self", on_delete=models.CASCADE, null=True, blank=True,
        related_name="children", verbose_name=_("parent"),
    )
    description = models.TextField(_("description"), blank=True)

    class Meta:
        verbose_name = _("category")
        verbose_name_plural = _("categories")
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Item(TimeStampedModel):
    class Unit(models.TextChoices):
        PIECE = "pc", _("Piece")
        BOX = "box", _("Box")
        KG = "kg", _("Kilogram")
        LITRE = "l", _("Litre")
        METRE = "m", _("Metre")
        SET = "set", _("Set")

    sku = models.CharField(_("SKU"), max_length=64, unique=True, db_index=True)
    name = models.CharField(_("name"), max_length=200)
    description = models.TextField(_("description"), blank=True)
    category = models.ForeignKey(
        Category, on_delete=models.PROTECT, related_name="items",
        null=True, blank=True, verbose_name=_("category"),
    )
    unit = models.CharField(_("unit"), max_length=8, choices=Unit.choices, default=Unit.PIECE)
    unit_cost = models.DecimalField(_("unit cost"), max_digits=14, decimal_places=2, default=0)
    currency = models.ForeignKey(
        "core.Currency", on_delete=models.PROTECT, null=True, blank=True,
        related_name="items", verbose_name=_("currency"),
    )
    reorder_point = models.PositiveIntegerField(_("reorder point"), default=0)
    # Empty for things that never go off, like tools or cables.
    expiry_date = models.DateField(_("expiry date"), null=True, blank=True)
    is_active = models.BooleanField(_("active"), default=True)
    custom_fields = models.JSONField(_("custom fields"), default=dict, blank=True)

    class Meta:
        verbose_name = _("item")
        verbose_name_plural = _("items")
        ordering = ["name"]
        indexes = [models.Index(fields=["is_active", "name"])]

    def __str__(self) -> str:
        return f"{self.sku} - {self.name}"

    def expiry_status(self) -> str:
        """'expired', 'expiring' (within EXPIRY_WARNING_DAYS) or '' for neither."""
        if self.expiry_date is None:
            return ""
        today = timezone.localdate()
        if self.expiry_date < today:
            return "expired"
        if self.expiry_date <= today + timedelta(days=EXPIRY_WARNING_DAYS):
            return "expiring"
        return ""


class ItemImage(TimeStampedModel):
    item = models.ForeignKey(
        Item, on_delete=models.CASCADE, related_name="images", verbose_name=_("item")
    )
    image = models.ImageField(_("image"), upload_to="items/%Y/%m/")
    is_primary = models.BooleanField(_("primary"), default=False)
    alt_text = models.CharField(_("alt text"), max_length=200, blank=True)

    class Meta:
        verbose_name = _("item image")
        verbose_name_plural = _("item images")
        ordering = ["-is_primary", "created_at"]

    def __str__(self) -> str:
        return f"Image for {self.item.sku}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.is_primary:
            ItemImage.objects.filter(item=self.item).exclude(pk=self.pk).update(is_primary=False)
