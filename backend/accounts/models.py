from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils.translation import gettext_lazy as _


class Role(models.TextChoices):
    """Role names mirror the Django Groups seeded by `seed_roles`."""

    ADMIN = "Admin", _("Admin")
    MANAGER = "Manager", _("Manager")
    STOREKEEPER = "Storekeeper", _("Storekeeper")
    VIEWER = "Viewer", _("Viewer")


class User(AbstractUser):
    phone = models.CharField(_("phone"), max_length=20, blank=True)

    class Meta:
        verbose_name = _("user")
        verbose_name_plural = _("users")
        ordering = ["username"]

    @property
    def roles(self) -> list[str]:
        return list(self.groups.values_list("name", flat=True))

    def has_role(self, *names: str) -> bool:
        if self.is_superuser:
            return True
        return bool(set(names) & set(self.roles))
