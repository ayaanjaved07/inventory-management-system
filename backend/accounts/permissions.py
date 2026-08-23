"""Role-based permissions.

The backend is the authority. The React app hides buttons for convenience, but
every check that matters happens here -- a hidden button is not a permission.
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import Role

# Who may change what. Read access is granted to any authenticated user;
# these sets govern writes.
WRITE_ROLES = {
    "catalog": {Role.ADMIN, Role.MANAGER},
    "stock": {Role.ADMIN, Role.MANAGER, Role.STOREKEEPER},
    "projects": {Role.ADMIN, Role.MANAGER},
    "sales": {Role.ADMIN, Role.MANAGER},
    "accounts": {Role.ADMIN},
}


class RoleBasedPermission(BasePermission):
    """Allow reads to any authenticated user; gate writes behind `write_roles`.

    Set `write_roles` on the viewset, or `domain` to pull from WRITE_ROLES.
    """

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        if user.is_superuser:
            return True

        roles = getattr(view, "write_roles", None)
        if roles is None:
            domain = getattr(view, "domain", None)
            roles = WRITE_ROLES.get(domain, {Role.ADMIN})
        return user.has_role(*[str(r) for r in roles])


class IsAdmin(BasePermission):
    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.has_role(Role.ADMIN))
