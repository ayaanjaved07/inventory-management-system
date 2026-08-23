from django.db import models
from django.utils.translation import gettext_lazy as _

from core.models import TimeStampedModel


class Customer(TimeStampedModel):
    name = models.CharField(_("name"), max_length=200)
    email = models.EmailField(_("email"), blank=True)
    phone = models.CharField(_("phone"), max_length=20, blank=True)
    address = models.TextField(_("address"), blank=True)

    class Meta:
        verbose_name = _("customer")
        verbose_name_plural = _("customers")
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Sale(TimeStampedModel):
    invoice_no = models.CharField(_("invoice no"), max_length=32, unique=True)
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="sales",
        null=True,
        blank=True,
        verbose_name=_("customer"),
    )
    location = models.ForeignKey(
        "stock.Location",
        on_delete=models.PROTECT,
        related_name="sales",
        verbose_name=_("location"),
    )
    sale_date = models.DateField(_("sale date"))

    currency = models.CharField(_("currency"), max_length=3)
    # The rate AT THE TIME OF SALE. Historical sales must never be recomputed
    # at today's rate, or reported revenue silently changes month to month.
    exchange_rate_used = models.DecimalField(
        _("exchange rate used"), max_digits=18, decimal_places=6, default=1
    )
    total_amount = models.DecimalField(
        _("total amount"), max_digits=16, decimal_places=2, default=0
    )
    note = models.TextField(_("note"), blank=True)

    class Meta:
        verbose_name = _("sale")
        verbose_name_plural = _("sales")
        ordering = ["-sale_date", "-id"]
        indexes = [models.Index(fields=["-sale_date"])]

    def __str__(self) -> str:
        return f"{self.invoice_no} ({self.total_amount} {self.currency})"

    @property
    def total_in_base_currency(self):
        """Frozen at sale time -- deliberately not a live conversion."""
        return (self.total_amount * self.exchange_rate_used).quantize(
            self.total_amount.__class__("0.01")
        )

    def recalculate_total(self, save: bool = True):
        total = sum((line.line_total for line in self.lines.all()), start=0)
        self.total_amount = total
        if save:
            self.save(update_fields=["total_amount", "updated_at"])
        return total


class SaleLine(models.Model):
    sale = models.ForeignKey(
        Sale, on_delete=models.CASCADE, related_name="lines", verbose_name=_("sale")
    )
    item = models.ForeignKey(
        "catalog.Item",
        on_delete=models.PROTECT,
        related_name="sale_lines",
        verbose_name=_("item"),
    )
    quantity = models.PositiveIntegerField(_("quantity"))
    unit_price = models.DecimalField(_("unit price"), max_digits=14, decimal_places=2)
    line_total = models.DecimalField(
        _("line total"), max_digits=16, decimal_places=2, default=0
    )

    class Meta:
        verbose_name = _("sale line")
        verbose_name_plural = _("sale lines")

    def __str__(self) -> str:
        return f"{self.quantity} x {self.item.sku}"

    def save(self, *args, **kwargs):
        self.line_total = self.quantity * self.unit_price
        super().save(*args, **kwargs)
