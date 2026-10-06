"""Seed a small but realistic dataset so every screen has something to show.

The story: an electronics store and lab that buys from suppliers, sells to
clients and lends parts to projects, over the last four months. It is safe to
run twice: anything that already exists is left alone.
"""

import random
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from accounts.models import Role, User
from catalog.models import Category, Item
from core.models import ActivityLog, Currency
from core.services import log_activity
from projects.models import Project
from projects.services import allocate, issue
from sales.models import Customer, Supplier
from sales.services import next_invoice_no, next_purchase_no, record_purchase, record_sale
from stock.models import Location, MovementType, StockMovement
from stock.services import on_hand, record_movement

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

LOCATIONS = [
    ("MAIN", "Main Warehouse", "Block C, Campus Road"),
    ("LAB", "Electronics Lab", "Engineering Building, Room 204"),
]

CATEGORIES = [
    "Electronics",
    "Fasteners",
    "Cables",
    "Tools",
    "Safety Gear",
    "Batteries",
    "Chemicals",
]

# (sku, name, category, unit, unit cost in INR, reorder point, expires in N days)
# The expiry is counted from the day the seed runs, so the dashboard always has
# something expired and something expiring soon. None means it does not expire.
ITEMS = [
    ("ELEC-001", "Arduino Uno R3", "Electronics", "pc", 850, 10, None),
    ("ELEC-002", "Raspberry Pi 5 (8GB)", "Electronics", "pc", 7800, 5, None),
    ("ELEC-003", "ESP32 DevKit", "Electronics", "pc", 450, 15, None),
    ("ELEC-004", "16x2 LCD Display", "Electronics", "pc", 160, 10, None),
    ("ELEC-005", "SG90 Micro Servo", "Electronics", "pc", 120, 20, None),
    ("FAST-001", "M3 Hex Bolt 12mm", "Fasteners", "pc", 3, 500, None),
    ("FAST-002", "M4 Nylock Nut", "Fasteners", "pc", 4, 400, None),
    ("CABL-001", "USB-C Cable 1m", "Cables", "pc", 220, 25, None),
    ("CABL-002", "Jumper Wire Set (120)", "Cables", "set", 180, 20, None),
    ("CABL-003", "Hook-up Wire 22AWG", "Cables", "m", 8, 200, None),
    ("TOOL-001", "Digital Multimeter", "Tools", "pc", 1250, 4, None),
    ("TOOL-002", "Soldering Station 60W", "Tools", "pc", 2400, 3, None),
    ("TOOL-003", "Wire Stripper", "Tools", "pc", 340, 5, None),
    ("SAFE-001", "Anti-static Wrist Strap", "Safety Gear", "pc", 150, 20, None),
    ("SAFE-002", "Safety Goggles", "Safety Gear", "pc", 210, 10, None),
    ("BATT-001", "CR2032 Coin Cell (pack of 5)", "Batteries", "box", 95, 30, 20),
    ("BATT-002", "AA Alkaline (pack of 4)", "Batteries", "box", 140, 25, 400),
    ("BATT-003", "9V Battery", "Batteries", "pc", 75, 15, -10),
    ("CHEM-001", "Isopropyl Alcohol 99% 500ml", "Chemicals", "l", 260, 10, 12),
    ("CHEM-002", "Solder Flux Paste 50g", "Chemicals", "pc", 180, 8, -25),
    ("CHEM-003", "Thermal Paste 4g", "Chemicals", "pc", 150, 10, 75),
    ("CHEM-004", "Two-part Epoxy 25ml", "Chemicals", "pc", 120, 12, 28),
    ("CHEM-005", "Contact Cleaner Spray 200ml", "Chemicals", "pc", 310, 6, 180),
]

# (name, contact person, phone, email, address, categories they sell)
SUPPLIERS = [
    ("Shree Ganesh Electronics", "Mahesh Patil", "+91 98201 44556",
     "sales@shreeganesh.example", "14 Station Road, Grant Road East\nMumbai 400007",
     ["Electronics", "Cables"]),
    ("Bharat Fasteners & Hardware", "Imran Shaikh", "+91 99300 12874",
     "orders@bharatfasteners.example", "Plot 22, MIDC Bhosari\nPune 411026",
     ["Fasteners", "Tools"]),
    ("SafeWorks Industrial Supply", "Neha Kulkarni", "+91 97690 55331",
     "neha@safeworks.example", "B-7, Peenya Industrial Area\nBengaluru 560058",
     ["Safety Gear"]),
    ("PowerCell Distributors", "Arjun Mehta", "+91 98450 77812",
     "arjun@powercell.example", "Shop 3, SP Road\nBengaluru 560002",
     ["Batteries"]),
    ("ChemLab Traders", "Fatima Khan", "+91 90040 66129",
     "info@chemlab.example", "45 Linking Road, Santacruz West\nMumbai 400054",
     ["Chemicals"]),
]

# (name, contact person, phone, email, address)
CLIENTS = [
    ("Sunrise Robotics Pvt Ltd", "Karan Desai", "+91 98200 11223",
     "orders@sunriserobotics.example", "Unit 5, Hiranandani Business Park\nPowai, Mumbai 400076"),
    ("Techno Hobby Store", "Sneha Rao", "+91 99870 34521",
     "sneha@technohobby.example", "21 FC Road\nPune 411004"),
    ("Greenfield Engineering College", "Prof. Vikram Joshi", "+91 20 2567 8800",
     "purchase@greenfield.example", "Greenfield Campus, Hinjewadi\nPune 411057"),
    ("Maker Space Bengaluru", "Ananya Reddy", "+91 98860 99012",
     "hello@makerspaceblr.example", "3rd Floor, 80 Feet Road, Indiranagar\nBengaluru 560038"),
    ("Coastal Repairs & Services", "Joseph D'Souza", "+91 98220 45670",
     "joseph@coastalrepairs.example", "Near Bus Stand, Margao\nGoa 403601"),
    ("Pixel Labs", "Rahul Verma", "+91 97411 23098",
     "rahul@pixellabs.example", "12 MG Road\nBengaluru 560001"),
]

# Opening stock, bought from each item's supplier about four months ago.
OPENING = {
    "ELEC-001": 60, "ELEC-002": 14, "ELEC-003": 80, "ELEC-004": 40, "ELEC-005": 90,
    "FAST-001": 2500, "FAST-002": 2000, "CABL-001": 100, "CABL-002": 50,
    "CABL-003": 600, "TOOL-001": 10, "TOOL-002": 6, "TOOL-003": 15,
    "SAFE-001": 40, "SAFE-002": 25, "BATT-001": 80, "BATT-002": 70,
    "BATT-003": 30, "CHEM-001": 30, "CHEM-002": 20, "CHEM-003": 25,
    "CHEM-004": 30, "CHEM-005": 12,
}

# Items the clients buy most. Sales pick from these.
POPULAR = [
    "ELEC-001", "ELEC-003", "ELEC-004", "ELEC-005", "CABL-001", "CABL-002",
    "FAST-002", "SAFE-001", "SAFE-002", "BATT-001", "BATT-002", "CHEM-001",
    "CHEM-003", "TOOL-003",
]


class Command(BaseCommand):
    help = "Seed demo data (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--password", default="demo12345", help="Password for all demo users."
        )

    @transaction.atomic
    def handle(self, *args, **options):
        random.seed(42)  # the same data every time
        self.today = timezone.localdate()

        self.seed_currencies()
        self.seed_users(options["password"])
        self.seed_catalog()
        self.seed_contacts()

        if StockMovement.objects.exists():
            self.stdout.write("Stock history already exists, skipping it")
        else:
            self.seed_history()

        self.seed_project()
        self.stdout.write(self.style.SUCCESS("Demo data ready."))

    # ------------------------------------------------------------------
    # Reference data
    # ------------------------------------------------------------------
    def seed_currencies(self):
        for code, name, symbol, is_base in CURRENCIES:
            Currency.objects.update_or_create(
                code=code, defaults={"name": name, "symbol": symbol, "is_base": is_base}
            )

    def seed_users(self, password):
        self.users = {}
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
            self.users[role] = user
        names = ", ".join(u for u, _, _, _ in USERS)
        self.stdout.write(f"Users: {names} (password: {password})")

    def seed_catalog(self):
        self.locations = {}
        for code, name, address in LOCATIONS:
            self.locations[code], _ = Location.objects.get_or_create(
                code=code, defaults={"name": name, "address": address}
            )

        categories = {}
        for name in CATEGORIES:
            categories[name], _ = Category.objects.get_or_create(name=name)

        inr = Currency.objects.get(code="INR")
        self.items = {}
        for sku, name, cat, unit, cost, reorder, expires_in in ITEMS:
            expiry = self.today + timedelta(days=expires_in) if expires_in is not None else None
            self.items[sku], _ = Item.objects.get_or_create(
                sku=sku,
                defaults={
                    "name": name,
                    "category": categories[cat],
                    "unit": unit,
                    "unit_cost": Decimal(cost),
                    "currency": inr,
                    "reorder_point": reorder,
                    "expiry_date": expiry,
                    "created_by": self.users[Role.ADMIN],
                },
            )
        self.stdout.write(f"Items: {Item.objects.count()}")

    def seed_contacts(self):
        manager = self.users[Role.MANAGER]
        self.suppliers = {}
        self.supplier_for_category = {}
        for name, person, phone, email, address, cats in SUPPLIERS:
            supplier, created = Supplier.objects.get_or_create(
                name=name,
                defaults={"contact_person": person, "phone": phone, "email": email,
                          "address": address, "created_by": manager},
            )
            if created:
                self.log(manager, supplier, days_ago=125)
            self.suppliers[name] = supplier
            for cat in cats:
                self.supplier_for_category[cat] = supplier

        self.clients = []
        for name, person, phone, email, address in CLIENTS:
            client, created = Customer.objects.get_or_create(
                name=name,
                defaults={"contact_person": person, "phone": phone, "email": email,
                          "address": address, "created_by": manager},
            )
            if created:
                self.log(manager, client, days_ago=random.randint(100, 125))
            self.clients.append(client)
        self.stdout.write(f"Suppliers: {len(self.suppliers)}, clients: {len(self.clients)}")

    # ------------------------------------------------------------------
    # Four months of buying, selling and moving stock
    # ------------------------------------------------------------------
    def seed_history(self):
        main, lab = self.locations["MAIN"], self.locations["LAB"]
        keeper = self.users[Role.STOREKEEPER]

        # 1. Opening stock: one purchase per supplier, ~4 months ago.
        by_supplier = {}
        for sku, qty in OPENING.items():
            supplier = self.supplier_for_category[self.items[sku].category.name]
            by_supplier.setdefault(supplier, []).append((sku, qty))
        for supplier, lines in by_supplier.items():
            self.purchase(supplier, lines, days_ago=120, note="Opening stock")

        # 2. Some stock moved to the lab.
        for sku, qty in [("ELEC-001", 10), ("ELEC-003", 20), ("CABL-002", 15)]:
            record_movement(item=self.items[sku], location=main,
                            movement_type=MovementType.TRANSFER_OUT, quantity=qty,
                            user=keeper, note="Transfer to Electronics Lab")
            record_movement(item=self.items[sku], location=lab,
                            movement_type=MovementType.TRANSFER_IN, quantity=qty,
                            user=keeper, note="Received from Main Warehouse")

        # 3. A sale every four days, with restocking purchases in between.
        restocks = {
            80: ["ELEC-001", "ELEC-005", "CABL-001"],
            50: ["BATT-001", "SAFE-001", "ELEC-004"],
            25: ["ELEC-003", "CABL-002", "CHEM-001"],
        }
        self.sale_count = 0
        for days_ago in range(115, 0, -1):
            if days_ago in restocks:
                self.restock(restocks[days_ago], days_ago)
            if days_ago % 4 == 0:
                self.sale(days_ago)

        # 4. Everyday stock-room work.
        record_movement(item=self.items["ELEC-002"], location=main,
                        movement_type=MovementType.ISSUE, quantity=10, user=keeper,
                        note="Issued for prototype build")
        record_movement(item=self.items["FAST-001"], location=main,
                        movement_type=MovementType.ADJUSTMENT, quantity=-35,
                        user=keeper, note="Stock take variance")
        # Leave 3 goggles, below their reorder point of 10.
        goggles = self.items["SAFE-002"]
        if on_hand(goggles, main) > 3:
            record_movement(item=goggles, location=main, movement_type=MovementType.ISSUE,
                            quantity=on_hand(goggles, main) - 3, user=keeper,
                            note="Issued to the workshop")

        # 5. A college lab bought every soldering station left, so that item
        # shows as out of stock.
        left = on_hand(self.items["TOOL-002"], main)
        if left > 0:
            self.sale(1, lines=[("TOOL-002", left)], client=self.clients[2])

        self.stdout.write(
            f"History: {StockMovement.objects.count()} stock movements, "
            f"{self.sale_count} sales"
        )

    def purchase(self, supplier, lines, days_ago, note=""):
        """Buy `lines` [(sku, qty)] from a supplier into the main warehouse."""
        manager = self.users[Role.MANAGER]
        when = self.today - timedelta(days=days_ago)
        purchase = record_purchase(
            reference_no=next_purchase_no(),
            supplier=supplier,
            location=self.locations["MAIN"],
            purchase_date=when,
            note=note,
            user=manager,
            lines=[{"item": self.items[sku], "quantity": qty} for sku, qty in lines],
        )
        self.log(manager, purchase, days_ago)

    def restock(self, skus, days_ago):
        """Re-order items from their suppliers, one purchase per supplier."""
        by_supplier = {}
        for sku in skus:
            item = self.items[sku]
            supplier = self.supplier_for_category[item.category.name]
            by_supplier.setdefault(supplier, []).append((sku, item.reorder_point * 2))
        for supplier, lines in by_supplier.items():
            self.purchase(supplier, lines, days_ago, note="Restock")

    def sale(self, days_ago, lines=None, client=None):
        """Sell to a client from the main warehouse at a 30% markup.

        Without `lines`, picks two or three popular items. A line is skipped if
        there isn't enough stock, so the seed never oversells.
        """
        main = self.locations["MAIN"]
        manager = self.users[Role.MANAGER]
        when = self.today - timedelta(days=days_ago)

        if lines is None:
            lines = [(sku, random.randint(2, 8)) for sku in random.sample(POPULAR, random.randint(2, 3))]
        sale_lines = []
        for sku, qty in lines:
            item = self.items[sku]
            if on_hand(item, main) >= qty:
                price = (item.unit_cost * Decimal("1.3")).quantize(Decimal("1"))
                sale_lines.append({"item": item, "quantity": qty, "unit_price": price})
        if not sale_lines:
            return

        # Every fifth sale is to a walk-in customer with no client record.
        self.sale_count += 1
        if client is None and self.sale_count % 5 != 0:
            client = random.choice(self.clients)
        sale = record_sale(
            invoice_no=next_invoice_no(),
            customer=client,
            location=main,
            sale_date=when,
            currency="INR",
            user=manager,
            lines=sale_lines,
        )
        self.log(manager, sale, days_ago)

    def log(self, user, instance, days_ago):
        """Write the activity entry the API would have written, dated back to
        when it happened, so the Activity page's date filter has history."""
        entry = log_activity(user, ActivityLog.Action.CREATE, instance)
        when = timezone.now() - timedelta(days=days_ago, hours=random.randint(0, 8))
        ActivityLog.objects.filter(pk=entry.pk).update(timestamp=when)

    # ------------------------------------------------------------------
    # A project with parts reserved and issued
    # ------------------------------------------------------------------
    def seed_project(self):
        project, created = Project.objects.get_or_create(
            code="PRJ-2026-01",
            defaults={
                "name": "Autonomous Rover Build",
                "description": "Final-year capstone rover.",
                "status": Project.Status.ACTIVE,
                "start_date": self.today - timedelta(days=20),
                "manager": self.users[Role.MANAGER],
                "created_by": self.users[Role.ADMIN],
            },
        )
        if not created:
            return
        lab = self.locations["LAB"]
        alloc = allocate(
            project=project, item=self.items["ELEC-003"], location=lab,
            quantity=8, assigned_to=self.users[Role.STOREKEEPER],
            user=self.users[Role.MANAGER], note="Motor controllers",
        )
        issue(alloc, 5, user=self.users[Role.STOREKEEPER])
        allocate(
            project=project, item=self.items["CABL-002"], location=lab,
            quantity=5, assigned_to=self.users[Role.VIEWER],
            user=self.users[Role.MANAGER], note="Wiring harness",
        )
        self.stdout.write("Project + allocations created")
