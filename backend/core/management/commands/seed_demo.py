"""Seed a small but realistic dataset so every screen has something to show."""

import random
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import Role, User
from catalog.models import Category, Item
from core.models import Currency
from projects.models import Project
from projects.services import allocate, issue
from sales.models import Customer, Sale
from sales.services import record_sale
from stock.models import Location, MovementType
from stock.services import record_movement

CURRENCIES = [
    ("INR", "Indian Rupee", "Rs", True),
    ("USD", "US Dollar", "$", False),
    ("EUR", "Euro", "EUR", False),
]

USERS = [
    ("admin", Role.ADMIN, "Aarav", "Sharma"),
    ("manager", Role.MANAGER, "Priya", "Nair"),
    ("store", Role.STOREKEEPER, "Rohan", "Gupta"),
    ("viewer", Role.VIEWER, "Meera", "Iyer"),
]

CATEGORIES = [
    "Electronics",
    "Fasteners",
    "Cables",
    "Tools",
    "Safety Gear",
]

ITEMS = [
    ("ELEC-001", "Arduino Uno R3", "Electronics", "pc", 850, 10),
    ("ELEC-002", "Raspberry Pi 5 (8GB)", "Electronics", "pc", 7800, 5),
    ("ELEC-003", "ESP32 DevKit", "Electronics", "pc", 450, 15),
    ("FAST-001", "M3 Hex Bolt 12mm", "Fasteners", "pc", 3, 500),
    ("FAST-002", "M4 Nylock Nut", "Fasteners", "pc", 4, 400),
    ("CABL-001", "USB-C Cable 1m", "Cables", "pc", 220, 25),
    ("CABL-002", "Jumper Wire Set (120)", "Cables", "set", 180, 20),
    ("TOOL-001", "Digital Multimeter", "Tools", "pc", 1250, 4),
    ("TOOL-002", "Soldering Station 60W", "Tools", "pc", 2400, 3),
    ("SAFE-001", "Anti-static Wrist Strap", "Safety Gear", "pc", 150, 20),
]

LOCATIONS = [
    ("MAIN", "Main Warehouse", "Block C, Campus Road"),
    ("LAB", "Electronics Lab", "Engineering Building, Room 204"),
]


class Command(BaseCommand):
    help = "Seed demo data (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--password", default="demo12345", help="Password for all demo users."
        )

    @transaction.atomic
    def handle(self, *args, **options):
        random.seed(42)  # reproducible demos
        password = options["password"]

        for code, name, symbol, is_base in CURRENCIES:
            Currency.objects.update_or_create(
                code=code, defaults={"name": name, "symbol": symbol, "is_base": is_base}
            )
        inr = Currency.objects.get(code="INR")
        self.stdout.write(f"Currencies: {Currency.objects.count()}")

        users = {}
        for username, role, first, last in USERS:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    "email": f"{username}@example.com",
                    "first_name": first,
                    "last_name": last,
                    "is_staff": role == Role.ADMIN,
                    "is_superuser": role == Role.ADMIN,
                },
            )
            if created:
                user.set_password(password)
                user.save()
            group = Group.objects.filter(name=role.value).first()
            if group:
                user.groups.set([group])
            users[role] = user
        self.stdout.write(f"Users: {', '.join(u for u, _, _, _ in USERS)} (password: {password})")

        locations = {}
        for code, name, address in LOCATIONS:
            locations[code], _ = Location.objects.get_or_create(
                code=code, defaults={"name": name, "address": address}
            )

        categories = {}
        for name in CATEGORIES:
            categories[name], _ = Category.objects.get_or_create(name=name)

        items = {}
        for sku, name, cat, unit, cost, reorder in ITEMS:
            items[sku], _ = Item.objects.get_or_create(
                sku=sku,
                defaults={
                    "name": name,
                    "category": categories[cat],
                    "unit": unit,
                    "unit_cost": Decimal(cost),
                    "currency": inr,
                    "reorder_point": reorder,
                    "created_by": users[Role.ADMIN],
                },
            )
        self.stdout.write(f"Items: {Item.objects.count()}")

        # --- Ledger history. Deliberately leaves a couple of items below their
        # reorder point so the low-stock alerts have something to show. ---
        if not items["ELEC-001"].movements.exists():
            main, lab = locations["MAIN"], locations["LAB"]
            keeper = users[Role.STOREKEEPER]

            opening = {
                "ELEC-001": 40, "ELEC-002": 12, "ELEC-003": 60, "FAST-001": 2000,
                "FAST-002": 1500, "CABL-001": 80, "CABL-002": 45,
                "TOOL-001": 6, "TOOL-002": 4, "SAFE-001": 30,
            }
            for sku, qty in opening.items():
                record_movement(
                    item=items[sku], location=main, movement_type=MovementType.RECEIPT,
                    quantity=qty, user=keeper, unit_cost=items[sku].unit_cost,
                    note="Opening stock",
                )

            # Some stock moved to the lab, and some consumed.
            for sku, qty in [("ELEC-001", 10), ("ELEC-003", 20), ("CABL-002", 15)]:
                record_movement(
                    item=items[sku], location=main,
                    movement_type=MovementType.TRANSFER_OUT, quantity=qty,
                    user=keeper, note="Transfer to Electronics Lab",
                )
                record_movement(
                    item=items[sku], location=lab,
                    movement_type=MovementType.TRANSFER_IN, quantity=qty,
                    user=keeper, note="Received from Main Warehouse",
                )

            # Drive two items under their reorder point on purpose.
            record_movement(
                item=items["TOOL-002"], location=main, movement_type=MovementType.ISSUE,
                quantity=2, user=keeper, note="Issued to maintenance",
            )
            record_movement(
                item=items["ELEC-002"], location=main, movement_type=MovementType.ISSUE,
                quantity=8, user=keeper, note="Issued for prototype build",
            )
            # A correction, showing ADJUSTMENT is how the ledger is fixed.
            record_movement(
                item=items["FAST-001"], location=main,
                movement_type=MovementType.ADJUSTMENT, quantity=-35, user=keeper,
                note="Stock take variance",
            )
            self.stdout.write("Stock movements recorded")

        # --- Projects and allocations ---
        project, created = Project.objects.get_or_create(
            code="PRJ-2026-01",
            defaults={
                "name": "Autonomous Rover Build",
                "description": "Final-year capstone rover.",
                "status": Project.Status.ACTIVE,
                "start_date": date.today() - timedelta(days=20),
                "manager": users[Role.MANAGER],
                "created_by": users[Role.ADMIN],
            },
        )
        if created:
            alloc = allocate(
                project=project, item=items["ELEC-003"], location=locations["LAB"],
                quantity=8, assigned_to=users[Role.STOREKEEPER],
                user=users[Role.MANAGER], note="Motor controllers",
            )
            issue(alloc, 5, user=users[Role.STOREKEEPER])
            allocate(
                project=project, item=items["CABL-002"], location=locations["LAB"],
                quantity=5, assigned_to=users[Role.VIEWER],
                user=users[Role.MANAGER], note="Wiring harness",
            )
            self.stdout.write("Project + allocations created")

        # --- Sales ---
        if not Sale.objects.exists():
            customer, _ = Customer.objects.get_or_create(
                name="Sunrise Robotics Pvt Ltd",
                defaults={"email": "orders@sunriserobotics.example", "phone": "+91 98200 11223"},
            )
            for n in range(1, 6):
                # Through the service, not by hand: it is what freezes the rate
                # and writes the SALE movements, and having a second code path
                # here is how those two steps got forgotten in the first place.
                record_sale(
                    invoice_no=f"INV-{date.today().year}-{n:04d}",
                    customer=customer,
                    location=locations["MAIN"],
                    sale_date=date.today() - timedelta(days=n * 4),
                    currency="INR",
                    user=users[Role.MANAGER],
                    lines=[
                        {
                            "item": items[sku],
                            "quantity": random.randint(2, 6),
                            "unit_price": items[sku].unit_cost,
                        }
                        for sku in random.sample(["CABL-001", "FAST-002", "SAFE-001"], 2)
                    ],
                )
            self.stdout.write(f"Sales: {Sale.objects.count()}")

        self.stdout.write(self.style.SUCCESS("Demo data ready."))
