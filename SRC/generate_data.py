#!/usr/bin/env python3
"""Generate deterministic, relationally consistent IOMS sample data and a MySQL dump.

Run from the repository root:
    python SRC/generate_data.py

The generated database contains 3,200 products, 38,400 product-location inventory
records, 6,000 sales orders, approximately 18,000 order lines, and 750 transfers.
"""
from __future__ import annotations

import argparse
import random
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Iterable, Sequence

ROOT = Path(__file__).resolve().parents[1]
DDL_PATH = ROOT / "SQL" / "schema.sql"
DUMP_PATH = ROOT / "DUMP" / "ioms_database_dump.sql"
SAMPLE_PATH = ROOT / "DATA" / "SAMPLE_RECORDS.md"
MANIFEST_PATH = ROOT / "DATA" / "LOAD_MANIFEST.md"

SEED = 9014
CATEGORY_NAMES = [
    "Cycling", "Running", "Camping", "Fitness", "Safety", "Electronics",
    "Outdoor Clothing", "Footwear", "Hydration", "Winter Sports", "Team Sports",
    "Home Fitness", "Travel", "Lighting", "Tools", "Accessories", "Nutrition",
    "Water Sports", "Climbing", "Recovery",
]
ITEM_TYPES = [
    "Helmet", "Road Bike", "Trail Bike", "Repair Kit", "Water Bottle",
    "Running Shoe", "Training Shirt", "Camping Tent", "Sleeping Bag", "Headlamp",
    "Resistance Band", "Yoga Mat", "Bike Pump", "Cycling Gloves", "Safety Light",
    "Hiking Pack", "Thermal Jacket", "Fitness Tracker", "Trekking Pole", "Foam Roller",
]
FIRST_NAMES = ["Alex", "Jordan", "Taylor", "Morgan", "Riley", "Cameron", "Avery", "Jamie", "Drew", "Quinn", "Casey", "Reese", "Parker", "Rowan", "Skyler"]
LAST_NAMES = ["Smith", "Patel", "Chen", "Singh", "Brown", "Wilson", "Martin", "Lee", "Clark", "Wong", "Thompson", "Khan", "Campbell", "Young", "Scott"]
LOCATIONS = [
    ("Windsor Main Warehouse", "1000 Walker Road", "Windsor", "N8Y 2N9", "Primary distribution warehouse"),
    ("London Distribution Centre", "2500 Oxford Street E", "London", "N5V 4A8", "Regional distribution centre"),
    ("Toronto North Warehouse", "80 Steeles Avenue W", "Toronto", "M2H 3S8", "Northern Toronto storage facility"),
    ("Toronto West Warehouse", "1450 Kipling Avenue", "Toronto", "M9W 4J9", "Western Toronto storage facility"),
    ("Ottawa Fulfillment Hub", "500 Industrial Avenue", "Ottawa", "K1G 0Z1", "Eastern Ontario fulfillment hub"),
    ("Hamilton Warehouse", "900 Burlington Street E", "Hamilton", "L8L 4H4", "Hamilton regional warehouse"),
    ("Kitchener Warehouse", "65 Shirley Avenue", "Kitchener", "N2B 2E1", "Tri-Cities warehouse"),
    ("Kingston Warehouse", "1200 Gardiners Road", "Kingston", "K7P 3J6", "Eastern regional warehouse"),
    ("Barrie Warehouse", "300 Bayview Drive", "Barrie", "L4N 8Y2", "Northern regional warehouse"),
    ("Guelph Warehouse", "55 Massey Road", "Guelph", "N1K 1B2", "Guelph storage facility"),
    ("Sarnia Warehouse", "1800 London Line", "Sarnia", "N7T 7H2", "Southwestern Ontario warehouse"),
    ("North Bay Warehouse", "400 Lakeshore Drive", "North Bay", "P1A 2E8", "Northern Ontario warehouse"),
]


def money(value: Decimal | float | int) -> str:
    return f"{Decimal(str(value)).quantize(Decimal('0.01')):.2f}"


def sql_value(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float, Decimal)):
        return money(value) if isinstance(value, Decimal) else str(value)
    text = str(value).replace("\\", "\\\\").replace("'", "''")
    return "'" + text + "'"


def batches(rows: Sequence[Sequence], batch_size: int = 300) -> Iterable[Sequence[Sequence]]:
    for start in range(0, len(rows), batch_size):
        yield rows[start:start + batch_size]


def insert_sql(table: str, columns: Sequence[str], rows: Sequence[Sequence]) -> Iterable[str]:
    cols = ", ".join(columns)
    for batch in batches(rows):
        values = ",\n".join("(" + ", ".join(sql_value(v) for v in row) + ")" for row in batch)
        yield f"INSERT INTO {table} ({cols}) VALUES\n{values};\n"


def generate(seed: int = SEED):
    rng = random.Random(seed)
    now = datetime(2026, 11, 24, 12, 0, 0)

    categories = [
        (i + 1, name, f"Products classified under the {name.lower()} category.")
        for i, name in enumerate(CATEGORY_NAMES)
    ]
    locations = [
        (i + 1, name, street, city, postal, description)
        for i, (name, street, city, postal, description) in enumerate(LOCATIONS)
    ]

    customers = []
    for customer_id in range(1, 1501):
        first = FIRST_NAMES[(customer_id - 1) % len(FIRST_NAMES)]
        last = LAST_NAMES[(customer_id * 7) % len(LAST_NAMES)]
        customers.append((customer_id, f"{first} {last} {customer_id:04d}"))

    products = []
    product_prices: dict[int, Decimal] = {}
    for product_id in range(1, 3201):
        item = ITEM_TYPES[(product_id * 7) % len(ITEM_TYPES)]
        category_id = ((product_id * 11) % len(CATEGORY_NAMES)) + 1
        cost = Decimal(str(round(rng.uniform(4.0, 180.0), 2)))
        margin = Decimal(str(round(rng.uniform(1.20, 1.85), 2)))
        price = (cost * margin).quantize(Decimal("0.01"))
        name = f"{item} Model {product_id:04d}"
        description = f"{item} product record {product_id:04d}; category {category_id}."
        products.append((product_id, name, price, cost, description, category_id))
        product_prices[product_id] = price

    # Every product is stocked at each location. Current stock begins as a positive amount.
    inventory: dict[tuple[int, int], list] = {}
    for product_id in range(1, 3201):
        for location_id in range(1, 13):
            inventory[(product_id, location_id)] = [
                rng.randint(10, 160), rng.randint(20, 50), now - timedelta(days=rng.randint(0, 120))
            ]

    # Sales orders and details. The composite key (OrderID, ProductID) is unique because
    # products are sampled without replacement within each order.
    orders = []
    details = []
    start_date = datetime(2025, 1, 1)
    date_span_days = (now.date() - start_date.date()).days
    for order_id in range(1, 6001):
        customer_id = rng.randint(1, 1500)
        location_id = rng.randint(1, 12)
        order_date = start_date + timedelta(
            days=rng.randint(0, date_span_days),
            hours=rng.randint(8, 19),
            minutes=rng.choice([0, 15, 30, 45]),
        )
        status_roll = rng.random()
        status = "Confirmed" if status_roll < 0.86 else ("Pending" if status_roll < 0.94 else "Cancelled")
        item_count = rng.randint(2, 4)
        product_ids = rng.sample(range(1, 3201), item_count)
        order_items = []
        for product_id in product_ids:
            quantity = rng.randint(1, 5)
            base_price = product_prices[product_id]
            paid_price = (base_price * Decimal(str(rng.uniform(0.90, 1.00)))).quantize(Decimal("0.01"))
            order_items.append((order_id, product_id, quantity, paid_price))
        # A confirmed order is only applied if all its product/location rows have enough stock.
        # Otherwise it remains Pending; no partial stock deduction is recorded.
        if status == "Confirmed" and any(
            inventory[(item[1], location_id)][0] < item[2] for item in order_items
        ):
            status = "Pending"
        orders.append((order_id, order_date.strftime("%Y-%m-%d %H:%M:%S"), status, customer_id, location_id))
        for item in order_items:
            details.append(item)
            if status == "Confirmed":
                product_id, quantity = item[1], item[2]
                key = (product_id, location_id)
                inventory[key][0] -= quantity
                if inventory[key][0] < 0:
                    raise AssertionError(f"Generated sales made inventory negative for {key}")
                inventory[key][2] = order_date

    # Completed transfers change the generated current inventory snapshot. Pending and
    # cancelled transfers remain in the transfer history but do not alter stock.
    transfers = []
    for transfer_id in range(1, 751):
        product_id = rng.randint(1, 3200)
        source = rng.randint(1, 12)
        destination = rng.randint(1, 11)
        if destination >= source:
            destination += 1
        source_key = (product_id, source)
        dest_key = (product_id, destination)
        quantity = rng.randint(1, 10)
        status_roll = rng.random()
        status = "Completed" if status_roll < 0.78 else ("Pending" if status_roll < 0.92 else "Cancelled")
        if status == "Completed" and inventory[source_key][0] < quantity:
            status = "Pending"
        if status == "Completed":
            inventory[source_key][0] -= quantity
            inventory[dest_key][0] += quantity
            inventory[source_key][2] = now - timedelta(days=rng.randint(0, 30))
            inventory[dest_key][2] = inventory[source_key][2]
        transfers.append((
            transfer_id, quantity,
            (now - timedelta(days=rng.randint(0, 300))).strftime("%Y-%m-%d %H:%M:%S"),
            status, product_id, source, destination
        ))

    inventory_rows = [
        (product_id, location_id, values[0], values[1], values[2].strftime("%Y-%m-%d %H:%M:%S"))
        for (product_id, location_id), values in sorted(inventory.items())
    ]

    data = {
        "ProductCategory": categories,
        "Location": locations,
        "Customer": customers,
        "Product": products,
        "ProductInventory": inventory_rows,
        "SalesOrderHeader": orders,
        "SalesOrderDetail": details,
        "InventoryTransfer": transfers,
    }

    counts = {name: len(rows) for name, rows in data.items()}
    assert counts["Product"] >= 2000 and counts["SalesOrderHeader"] >= 2000
    assert counts["InventoryTransfer"] >= 100
    assert len({r[1] for r in products}) == len(products)
    assert len({r[1] for r in categories}) == len(categories)
    assert len({r[1] for r in locations}) == len(locations)
    assert len({(r[0], r[1]) for r in inventory_rows}) == len(inventory_rows)
    assert len({(r[0], r[1]) for r in details}) == len(details)

    # Referential integrity checks before generating SQL.
    category_ids = {r[0] for r in categories}
    location_ids = {r[0] for r in locations}
    customer_ids = {r[0] for r in customers}
    product_ids = {r[0] for r in products}
    order_ids = {r[0] for r in orders}
    assert all(r[5] in category_ids for r in products)
    assert all(r[0] in product_ids and r[1] in location_ids for r in inventory_rows)
    assert all(r[3] in customer_ids and r[4] in location_ids for r in orders)
    assert all(r[0] in order_ids and r[1] in product_ids for r in details)
    assert all(r[4] in product_ids and r[5] in location_ids and r[6] in location_ids and r[5] != r[6] for r in transfers)
    return data, counts


def write_dump(data: dict[str, list], output: Path) -> None:
    ddl = DDL_PATH.read_text(encoding="utf-8")
    drop_tables = """-- Rebuild the IOMS tables in the selected database.
DROP VIEW IF EXISTS vw_sales_order_summary;
DROP VIEW IF EXISTS vw_product_catalog;
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS InventoryTransfer;
DROP TABLE IF EXISTS SalesOrderDetail;
DROP TABLE IF EXISTS SalesOrderHeader;
DROP TABLE IF EXISTS ProductInventory;
DROP TABLE IF EXISTS Product;
DROP TABLE IF EXISTS Customer;
DROP TABLE IF EXISTS Location;
DROP TABLE IF EXISTS ProductCategory;
SET FOREIGN_KEY_CHECKS = 1;

"""
    cols = {
        "ProductCategory": ["CategoryID", "CategoryName", "Description"],
        "Location": ["LocationID", "LocationName", "Street", "City", "PostalCode", "Description"],
        "Customer": ["CustomerID", "CustomerName"],
        "Product": ["ProductID", "ProductName", "UnitPrice", "UnitCost", "Description", "CategoryID"],
        "ProductInventory": ["ProductID", "LocationID", "Quantity", "ReorderPoint", "LastUpdated"],
        "SalesOrderHeader": ["OrderID", "OrderDate", "OrderStatus", "CustomerID", "LocationID"],
        "SalesOrderDetail": ["OrderID", "ProductID", "QuantityOrdered", "UnitPrice"],
        "InventoryTransfer": ["TransferID", "Quantity", "TransferDate", "TransferStatus", "ProductID", "SourceLocationID", "DestinationLocationID"],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8", newline="\n") as f:
        f.write("-- IOMS database dump generated by SRC/generate_data.py\n")
        f.write("-- Import into MySQL 8.0+; this script drops and recreates the 8 IOMS tables.\n")
        f.write("-- Do not import into a database containing data you need to preserve.\n\n")
        f.write("CREATE DATABASE IF NOT EXISTS ioms_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\nUSE ioms_db;\n\n")
        f.write(drop_tables)
        f.write(ddl.split("CREATE DATABASE IF NOT EXISTS ioms_db", 1)[1].split("USE ioms_db;", 1)[1].lstrip())
        f.write("\n-- Generated records. All foreign keys and unique keys are pre-validated.\n")
        for table, rows in data.items():
            f.write(f"\n-- {table}: {len(rows):,} rows\n")
            for statement in insert_sql(table, cols[table], rows):
                f.write(statement)
        f.write("\n-- End of generated IOMS data dump.\n")


def write_samples(data: dict[str, list], counts: dict[str, int]) -> None:
    sample_path = SAMPLE_PATH
    sample_path.parent.mkdir(parents=True, exist_ok=True)
    with sample_path.open("w", encoding="utf-8") as f:
        f.write("# Sample Records for Phase 3\n\n")
        f.write("The following are five representative records from each relation in the generated dataset.\n")
        columns = {
            "ProductCategory": ["CategoryID", "CategoryName", "Description"],
            "Location": ["LocationID", "LocationName", "Street", "City", "PostalCode", "Description"],
            "Customer": ["CustomerID", "CustomerName"],
            "Product": ["ProductID", "ProductName", "UnitPrice", "UnitCost", "Description", "CategoryID"],
            "ProductInventory": ["ProductID", "LocationID", "Quantity", "ReorderPoint", "LastUpdated"],
            "SalesOrderHeader": ["OrderID", "OrderDate", "OrderStatus", "CustomerID", "LocationID"],
            "SalesOrderDetail": ["OrderID", "ProductID", "QuantityOrdered", "UnitPrice"],
            "InventoryTransfer": ["TransferID", "Quantity", "TransferDate", "TransferStatus", "ProductID", "SourceLocationID", "DestinationLocationID"],
        }
        for table, rows in data.items():
            f.write(f"\n## {table} ({counts[table]:,} records)\n\n")
            f.write("| " + " | ".join(columns[table]) + " |\n")
            f.write("| " + " | ".join(["---"] * len(columns[table])) + " |\n")
            for row in rows[:5]:
                rendered = []
                for value in row:
                    if isinstance(value, Decimal): value = money(value)
                    rendered.append(str(value).replace("|", "\\|"))
                f.write("| " + " | ".join(rendered) + " |\n")

    with MANIFEST_PATH.open("w", encoding="utf-8") as f:
        f.write("# Data Load Manifest\n\n")
        f.write(f"Generator seed: `{SEED}`\n\n")
        f.write("| Relation | Generated records |\n|---|---:|\n")
        for table, count in counts.items(): f.write(f"| `{table}` | {count:,} |\n")
        f.write("\nThe generated dataset includes thousands of records in Product, ProductInventory, SalesOrderHeader and SalesOrderDetail, and hundreds of records in InventoryTransfer. All IDs and foreign-key references are generated consistently. Completed transfers and confirmed orders are reflected in the generated ProductInventory quantities.\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--dump", type=Path, default=DUMP_PATH)
    args = parser.parse_args()
    data, counts = generate(args.seed)
    write_dump(data, args.dump)
    write_samples(data, counts)
    print("Generated MySQL dump:", args.dump)
    print("Generated sample records:", SAMPLE_PATH)
    for table, count in counts.items(): print(f"{table:20s} {count:>8,}")

if __name__ == "__main__":
    main()
