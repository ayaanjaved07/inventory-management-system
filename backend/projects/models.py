from django.db import models
from django.utils.translation import gettext_lazy as _

from core.models import TimeStampedModel


class Project(TimeStampedModel):
    class Status(models.TextChoices):
        PLANNING = "PLANNING", _("Planning")
        ACTIVE = "ACTIVE", _("Active")
        ON_HOLD = "ON_HOLD", _("On hold")
        COMPLETED = "COMPLETED", _("Completed")
        CANCELLED = "CANCELLED", _("Cancelled")

    name = models.CharField(_("name"), max_length=200)
    code = models.CharField(_("code"), max_length=32, unique=True)
    description = models.TextField(_("description"), blank=True)
    status = models.CharField(
        _("status"), max_length=16, choices=Status.choices, default=Status.PLANNING
    )
    start_date = models.DateField(_("start date"), null=True, blank=True)
    end_date = models.DateField(_("end date"), null=True, blank=True)
    manager = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="managed_projects",
        verbose_name=_("manager"),
    )

    class Meta:
        verbose_name = _("project")
        verbose_name_plural = _("projects")
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.code} - {self.name}"


class ProjectMember(TimeStampedModel):
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="members",
        verbose_name=_("project"),
    )
    user = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="project_memberships",
        verbose_name=_("user"),
    )
    role_in_project = models.CharField(_("role"), max_length=64, blank=True)

    class Meta:
        verbose_name = _("project member")
        verbose_name_plural = _("project members")
        unique_together = [("project", "user")]

    def __str__(self) -> str:
        return f"{self.user} on {self.project.code}"


class Allocation(TimeStampedModel):
    """Parts earmarked for a project and assigned to a person.

    Allocated stock is RESERVED, not removed: on-hand is unchanged until the
    parts are actually issued. Conflating the two is the classic bug -- it lets
    the same unit be promised to two projects at once.
    """

    class Status(models.TextChoices):
        RESERVED = "RESERVED", _("Reserved")
        PARTIAL = "PARTIAL", _("Partially issued")
        ISSUED = "ISSUED", _("Issued")
        RETURNED = "RETURNED", _("Returned")
        CANCELLED = "CANCELLED", _("Cancelled")

    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="allocations",
        verbose_name=_("project"),
    )
    item = models.ForeignKey(
        "catalog.Item",
        on_delete=models.PROTECT,
        related_name="allocations",
        verbose_name=_("item"),
    )
    location = models.ForeignKey(
        "stock.Location",
        on_delete=models.PROTECT,
        related_name="allocations",
        verbose_name=_("location"),
    )
    assigned_to = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="allocations",
        verbose_name=_("assigned to"),
    )
    quantity_allocated = models.PositiveIntegerField(_("quantity allocated"))
    quantity_issued = models.PositiveIntegerField(_("quantity issued"), default=0)
    quantity_returned = models.PositiveIntegerField(_("quantity returned"), default=0)
    status = models.CharField(
        _("status"), max_length=16, choices=Status.choices, default=Status.RESERVED
    )
    note = models.TextField(_("note"), blank=True)

    class Meta:
        verbose_name = _("allocation")
        verbose_name_plural = _("allocations")
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["project", "item"])]

    def __str__(self) -> str:
        return f"{self.quantity_allocated} x {self.item.sku} for {self.project.code}"

    @property
    def outstanding_reservation(self) -> int:
        """Still reserved but not yet issued -- this is what blocks other demand."""
        if self.status in (self.Status.CANCELLED, self.Status.RETURNED):
            return 0
        return max(self.quantity_allocated - self.quantity_issued, 0)

    @property
    def quantity_outstanding(self) -> int:
        """Issued but not yet returned -- what the assignee still holds."""
        return max(self.quantity_issued - self.quantity_returned, 0)
