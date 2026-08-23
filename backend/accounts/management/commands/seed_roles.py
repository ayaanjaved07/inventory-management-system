"""Create the four roles and give each the Django permissions it needs."""

from django.contrib.auth.models import Group, Permission
from django.core.management.base import BaseCommand

from accounts.models import Role

# app_label -> actions granted
ROLE_MATRIX = {
    Role.ADMIN: "__all__",
    Role.MANAGER: {
        "catalog": ["add", "change", "view"],
        "stock": ["add", "view"],
        "projects": ["add", "change", "view"],
        "sales": ["add", "change", "view"],
        "core": ["view"],
    },
    Role.STOREKEEPER: {
        "catalog": ["view"],
        "stock": ["add", "view"],
        "projects": ["view"],
        "sales": ["view"],
        "core": ["view"],
    },
    Role.VIEWER: {
        "catalog": ["view"],
        "stock": ["view"],
        "projects": ["view"],
        "sales": ["view"],
        "core": ["view"],
    },
}


class Command(BaseCommand):
    help = "Create the Admin/Manager/Storekeeper/Viewer roles."

    def handle(self, *args, **options):
        for role, matrix in ROLE_MATRIX.items():
            group, created = Group.objects.get_or_create(name=role.value)
            if matrix == "__all__":
                group.permissions.set(Permission.objects.all())
            else:
                perms = []
                for app_label, actions in matrix.items():
                    for action in actions:
                        perms.extend(
                            Permission.objects.filter(
                                content_type__app_label=app_label,
                                codename__startswith=f"{action}_",
                            )
                        )
                group.permissions.set(perms)
            verb = "Created" if created else "Updated"
            self.stdout.write(
                self.style.SUCCESS(f"{verb} role {role.value} ({group.permissions.count()} perms)")
            )
