#!/usr/bin/env python3
"""Offline repository verification using Python's built-in SQLite engine.

This is a portability test for the schema, generated records, Phase 3 query/DML/view
logic. It does not claim to replace an actual MySQL 8 / mysql2 integration run.
"""
from __future__ import annotations

import re
import sqlite3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DUMP = ROOT / "DUMP" / "ioms_database_dump.sql"


def mysql_to_sqlite(script: str) -> str:
    # SQLite is used only as an offline integrity/query cross-check. Remove MySQL
    # connection/session commands, AUTO_INCREMENT, table indexes, and engine suffixes.
    script = re.sub(r"(?im)^\s*CREATE\s+DATABASE\b[^;]*;\s*", "", script)
    script = re.sub(r"(?im)^\s*USE\s+[^;]+;\s*", "", script)
    script = re.sub(r"(?im)^\s*SET\s+FOREIGN_KEY_CHECKS\s*=\s*\d+;\s*", "", script)
    script = re.sub(r"\bAUTO_INCREMENT\b", "", script, flags=re.I)
    script = re.sub(r"\bDROP\s+TEMPORARY\s+TABLE\b", "DROP TABLE", script, flags=re.I)
    script = re.sub(r",\s*INDEX\s+\w+\s*\([^)]*\)", "", script, flags=re.I)
    script = re.sub(r"\)\s*ENGINE\s*=\s*InnoDB\s+DEFAULT\s+CHARSET\s*=\s*utf8mb4\s+COLLATE\s*=\s*utf8mb4_unicode_ci\s*;", ");", script, flags=re.I)
    return script


def run_script(connection: sqlite3.Connection, path: Path, mysql_mode: bool = True) -> None:
    sql = path.read_text(encoding="utf-8")
    if mysql_mode:
        sql = mysql_to_sqlite(sql)
    connection.executescript(sql)


def main() -> int:
    if not DUMP.exists():
        print(f"Missing generated dump: {DUMP}", file=sys.stderr)
        return 1

    connection = sqlite3.connect(":memory:")
    connection.execute("PRAGMA foreign_keys = ON")
    connection.row_factory = sqlite3.Row

    dump_sql = mysql_to_sqlite(DUMP.read_text(encoding="utf-8"))
    connection.executescript(dump_sql)
    print("PASS: generated database dump creates and loads in the offline SQL adapter")

    expected = {
        "ProductCategory": 20,
        "Location": 12,
        "Customer": 1500,
        "Product": 3200,
        "ProductInventory": 38400,
        "SalesOrderHeader": 6000,
        "InventoryTransfer": 750,
    }
    counts = {}
    for table, expected_minimum in expected.items():
        count = connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        counts[table] = count
        assert count == expected_minimum, f"{table}: expected {expected_minimum}, found {count}"
    detail_count = connection.execute("SELECT COUNT(*) FROM SalesOrderDetail").fetchone()[0]
    counts["SalesOrderDetail"] = detail_count
    assert detail_count >= 12000, f"Expected substantial SalesOrderDetail data, got {detail_count}"
    assert counts["Product"] >= 2000 and counts["ProductInventory"] >= 2000
    assert counts["InventoryTransfer"] >= 100
    print("PASS: dataset row-count targets", counts)

    fk_errors = connection.execute("PRAGMA foreign_key_check").fetchall()
    assert not fk_errors, f"Foreign key violations: {fk_errors[:5]}"
    negative = connection.execute(
        "SELECT COUNT(*) FROM ProductInventory WHERE Quantity < 0 OR ReorderPoint < 0"
    ).fetchone()[0]
    assert negative == 0, "Negative inventory quantity or reorder point found"
    duplicate_order_lines = connection.execute(
        "SELECT COUNT(*) FROM (SELECT OrderID, ProductID, COUNT(*) c FROM SalesOrderDetail GROUP BY OrderID, ProductID HAVING c > 1)"
    ).fetchone()[0]
    assert duplicate_order_lines == 0
    low_stock_count = connection.execute(
        "SELECT COUNT(*) FROM ProductInventory WHERE Quantity <= ReorderPoint"
    ).fetchone()[0]
    assert low_stock_count > 0, "Generated dataset should contain low-stock examples"
    print(f"PASS: primary/alternate keys, foreign keys and stock checks; {low_stock_count:,} low-stock rows")

    # The Task 1 CREATE TABLE definitions must match the canonical schema file.
    canonical_sql = (ROOT / "SQL" / "schema.sql").read_text(encoding="utf-8")
    task3_sql_source = (ROOT / "SQL" / "task3.sql").read_text(encoding="utf-8")
    create_pattern = re.compile(
        r"CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\((.*?)\)\s*ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",
        re.IGNORECASE | re.DOTALL,
    )
    normalize_create = lambda source: {
        name: re.sub(r"\s+", " ", body).strip()
        for name, body in create_pattern.findall(source)
    }
    assert normalize_create(canonical_sql) == normalize_create(task3_sql_source), \
        "Task 1 CREATE TABLE definitions differ from the canonical Phase 2 schema."
    print("PASS: Task 1 CREATE TABLE definitions match the canonical schema")

    # Task 1/2 script is tested in its own empty database so CREATE TABLE is
    # actually executed (IF NOT EXISTS would otherwise skip the DDL in the
    # populated dataset connection above).
    schema_demo = sqlite3.connect(":memory:")
    schema_demo.execute("PRAGMA foreign_keys = ON")
    schema_demo.row_factory = sqlite3.Row
    run_script(schema_demo, ROOT / "SQL" / "task3.sql")
    created_tables = {row[0] for row in schema_demo.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()}
    expected_tables = {
        "ProductCategory", "Location", "Customer", "Product",
        "ProductInventory", "SalesOrderHeader", "SalesOrderDetail", "InventoryTransfer"
    }
    assert created_tables == expected_tables, f"Task 1 schema mismatch: {created_tables ^ expected_tables}"
    demo_count = schema_demo.execute(
        "SELECT COUNT(*) FROM ProductCategory WHERE CategoryID BETWEEN 90001 AND 90004"
    ).fetchone()[0]
    assert demo_count == 4, f"Task 2 should insert four demonstration categories, found {demo_count}"
    assert not schema_demo.execute("PRAGMA foreign_key_check").fetchall()
    schema_demo.close()
    print("PASS: task3.sql independently creates all eight Phase 2 tables and demonstrates three INSERT forms")

    # Task 4: all seven SELECT statements must execute successfully.
    task4 = (ROOT / "SQL" / "task4.sql").read_text(encoding="utf-8")
    task4 = re.sub(r"(?im)^\s*USE\s+[^;]+;\s*", "", task4)
    task4 = re.sub(r"(?m)^\s*--.*$", "", task4)
    select_statements = [s.strip() for s in task4.split(";") if s.strip()]
    assert len(select_statements) == 7, f"Expected 7 SELECT statements; found {len(select_statements)}"
    query_counts = []
    for index, statement in enumerate(select_statements, start=1):
        cursor = connection.execute(statement)
        rows = cursor.fetchall()
        query_counts.append(len(rows))
    print("PASS: all seven Task 4 SELECT queries execute", query_counts)

    # Offline equivalents of the new Phase 4 low-stock and best-seller API queries.
    low_stock_api_rows = connection.execute(
        """SELECT p.ProductID, p.ProductName, pc.CategoryID, pc.CategoryName,
                  l.LocationID, l.LocationName, pi.Quantity, pi.ReorderPoint,
                  (pi.ReorderPoint - pi.Quantity) AS UnitsBelowReorderPoint,
                  COALESCE(recent.RecentUnitsSold, 0) AS RecentUnitsSold
             FROM ProductInventory AS pi
             JOIN Product AS p ON p.ProductID = pi.ProductID
             JOIN ProductCategory AS pc ON pc.CategoryID = p.CategoryID
             JOIN Location AS l ON l.LocationID = pi.LocationID
             LEFT JOIN (
                 SELECT so.LocationID, sod.ProductID, SUM(sod.QuantityOrdered) AS RecentUnitsSold
                   FROM SalesOrderDetail AS sod
                   JOIN SalesOrderHeader AS so ON so.OrderID = sod.OrderID
                  WHERE so.OrderStatus = 'Confirmed' AND so.OrderDate >= '2026-10-25'
                  GROUP BY so.LocationID, sod.ProductID
             ) AS recent ON recent.ProductID = pi.ProductID AND recent.LocationID = pi.LocationID
            WHERE pi.Quantity <= pi.ReorderPoint
            ORDER BY UnitsBelowReorderPoint DESC, RecentUnitsSold DESC
            LIMIT 250"""
    ).fetchall()
    assert len(low_stock_api_rows) > 0
    assert all(row['Quantity'] <= row['ReorderPoint'] for row in low_stock_api_rows)
    analytics_api_rows = connection.execute(
        """SELECT p.ProductID, p.ProductName, pc.CategoryName,
                  SUM(sod.QuantityOrdered) AS UnitsSold,
                  ROUND(SUM(sod.QuantityOrdered * sod.UnitPrice), 2) AS SalesRevenue,
                  COALESCE(stock.CurrentInventory, 0) AS CurrentInventory
             FROM SalesOrderDetail AS sod
             JOIN SalesOrderHeader AS so ON so.OrderID = sod.OrderID
             JOIN Product AS p ON p.ProductID = sod.ProductID
             JOIN ProductCategory AS pc ON pc.CategoryID = p.CategoryID
             LEFT JOIN (
                 SELECT ProductID, SUM(Quantity) AS CurrentInventory
                   FROM ProductInventory GROUP BY ProductID
             ) AS stock ON stock.ProductID = p.ProductID
            WHERE so.OrderStatus = 'Confirmed'
              AND so.OrderDate >= '2026-01-01' AND so.OrderDate < '2026-11-25'
            GROUP BY p.ProductID, p.ProductName, pc.CategoryName, stock.CurrentInventory
            ORDER BY UnitsSold DESC, SalesRevenue DESC
            LIMIT 25"""
    ).fetchall()
    assert len(analytics_api_rows) == 25
    assert all(row['UnitsSold'] > 0 and row['CurrentInventory'] >= 0 for row in analytics_api_rows)
    print("PASS: low-stock API query includes category/location and recent sales; analytics returns best sellers and current stock")

    # Task 5: execute the INSERT, UPDATE and DELETE separately so each effect is asserted.
    task7 = (ROOT / "SQL" / "task7.sql").read_text(encoding="utf-8")
    task7 = re.sub(r"(?im)^\s*USE\s+[^;]+;\s*", "", task7)
    task7 = re.sub(r"(?m)^\s*--.*$", "", task7)
    dml_statements = [s.strip() for s in task7.split(";") if s.strip()]
    assert len(dml_statements) == 3, f"Expected 3 Task 5 DML commands, found {len(dml_statements)}"
    first_insert = dml_statements[0].upper()
    assert first_insert.startswith("INSERT INTO INVENTORYTRANSFER"), "Task 5 command 1 must insert into InventoryTransfer"
    assert "FROM PRODUCT AS P" in first_insert, "Task 5 INSERT ... SELECT must use Product as its source"
    assert "FROM INVENTORYTRANSFER" not in first_insert, "MySQL does not allow this INSERT ... SELECT to read its target table in a subquery"
    connection.execute(dml_statements[0])
    demo_transfer_count = connection.execute("SELECT COUNT(*) FROM InventoryTransfer WHERE TransferID BETWEEN 900001 AND 900003 AND TransferStatus='Pending'").fetchone()[0]
    assert demo_transfer_count == 3, f"Task 5 INSERT ... SELECT should create three demonstration transfers, found {demo_transfer_count}"
    before_update = connection.execute(
        "SELECT COUNT(*) FROM ProductInventory WHERE LocationID=1 AND ReorderPoint=25"
    ).fetchone()[0]
    connection.execute(dml_statements[1])
    updated_count = connection.execute(
        "SELECT COUNT(*) FROM ProductInventory WHERE LocationID=1 AND ReorderPoint=25"
    ).fetchone()[0]
    assert updated_count > before_update, "Task 5 UPDATE should change multiple inventory thresholds"
    connection.execute(dml_statements[2])
    assert connection.execute("SELECT COUNT(*) FROM InventoryTransfer WHERE TransferID BETWEEN 900001 AND 900003").fetchone()[0] == 0
    print(f"PASS: Task 5 INSERT created then DELETE removed three demo transfers; UPDATE changed Location 1 thresholds (now {updated_count:,} rows at 25)")

    # Task 6: both views can be created and queried.
    run_script(connection, ROOT / "SQL" / "task6.sql")
    catalog_rows = connection.execute("SELECT * FROM vw_product_catalog LIMIT 5").fetchall()
    summary_rows = connection.execute("SELECT * FROM vw_sales_order_summary LIMIT 5").fetchall()
    assert len(catalog_rows) == 5 and len(summary_rows) == 5
    # Basic updatability structure checks: a direct single-table projection versus GROUP BY aggregate.
    view_sql = connection.execute(
        "SELECT name, sql FROM sqlite_master WHERE type='view' ORDER BY name"
    ).fetchall()
    view_map = {row['name']: row['sql'] for row in view_sql}
    assert 'FROM Product' in view_map['vw_product_catalog']
    assert 'GROUP BY' in view_map['vw_sales_order_summary'] and 'SUM(' in view_map['vw_sales_order_summary']
    task8 = (ROOT / "SQL" / "task8.sql").read_text(encoding="utf-8")
    assert 'UPDATE vw_product_catalog' in task8
    assert '-- UPDATE vw_sales_order_summary' in task8
    print("PASS: both views create/query; updatability tests are documented (MySQL run required)")

    # Emulate the core order/transfer transaction statements against this offline dataset.
    # This validates stock accounting and order-status transitions, not the MySQL driver.
    product_id, location_id, customer_id, order_id = 1, 1, 1, 990001
    original_stock = connection.execute(
        "SELECT Quantity FROM ProductInventory WHERE ProductID=? AND LocationID=?",
        (product_id, location_id)
    ).fetchone()[0]
    product_price = connection.execute("SELECT UnitPrice FROM Product WHERE ProductID=?", (product_id,)).fetchone()[0]
    assert original_stock >= 2
    connection.execute("BEGIN")
    connection.execute(
        "INSERT INTO SalesOrderHeader (OrderID, OrderDate, OrderStatus, CustomerID, LocationID) VALUES (?, CURRENT_TIMESTAMP, 'Pending', ?, ?)",
        (order_id, customer_id, location_id)
    )
    connection.execute(
        "INSERT INTO SalesOrderDetail (OrderID, ProductID, QuantityOrdered, UnitPrice) VALUES (?, ?, 2, ?)",
        (order_id, product_id, product_price)
    )
    connection.execute("UPDATE ProductInventory SET Quantity=Quantity-2 WHERE ProductID=? AND LocationID=? AND Quantity>=2", (product_id, location_id))
    connection.execute("UPDATE SalesOrderHeader SET OrderStatus='Confirmed' WHERE OrderID=? AND OrderStatus='Pending'", (order_id,))
    connection.commit()
    after_confirm = connection.execute("SELECT Quantity FROM ProductInventory WHERE ProductID=? AND LocationID=?", (product_id, location_id)).fetchone()[0]
    assert after_confirm == original_stock - 2
    connection.execute("BEGIN")
    connection.execute("UPDATE ProductInventory SET Quantity=Quantity+2 WHERE ProductID=? AND LocationID=?", (product_id, location_id))
    connection.execute("UPDATE SalesOrderHeader SET OrderStatus='Cancelled' WHERE OrderID=? AND OrderStatus='Confirmed'", (order_id,))
    connection.commit()
    after_cancel = connection.execute("SELECT Quantity FROM ProductInventory WHERE ProductID=? AND LocationID=?", (product_id, location_id)).fetchone()[0]
    order_status = connection.execute("SELECT OrderStatus FROM SalesOrderHeader WHERE OrderID=?", (order_id,)).fetchone()[0]
    assert after_cancel == original_stock and order_status == 'Cancelled'

    source_before = connection.execute("SELECT Quantity FROM ProductInventory WHERE ProductID=1 AND LocationID=1").fetchone()[0]
    dest_before = connection.execute("SELECT Quantity FROM ProductInventory WHERE ProductID=1 AND LocationID=2").fetchone()[0]
    connection.execute("BEGIN")
    connection.execute("UPDATE ProductInventory SET Quantity=Quantity-3 WHERE ProductID=1 AND LocationID=1 AND Quantity>=3")
    connection.execute("UPDATE ProductInventory SET Quantity=Quantity+3 WHERE ProductID=1 AND LocationID=2")
    connection.execute("INSERT INTO InventoryTransfer (TransferID, Quantity, TransferDate, TransferStatus, ProductID, SourceLocationID, DestinationLocationID) VALUES (990001, 3, CURRENT_TIMESTAMP, 'Completed', 1, 1, 2)")
    connection.commit()
    source_after = connection.execute("SELECT Quantity FROM ProductInventory WHERE ProductID=1 AND LocationID=1").fetchone()[0]
    dest_after = connection.execute("SELECT Quantity FROM ProductInventory WHERE ProductID=1 AND LocationID=2").fetchone()[0]
    assert source_after == source_before - 3 and dest_after == dest_before + 3
    print("PASS: transactional order confirmation/cancellation restores stock; transfer moves stock between locations")

    # JavaScript parser checks (no npm install/server required for syntax validation).
    node = subprocess.run(
        ["node", "--check", str(ROOT / "APP" / "server.js")],
        text=True, capture_output=True
    )
    assert node.returncode == 0, node.stderr
    node = subprocess.run(
        ["node", "--check", str(ROOT / "APP" / "public" / "app.js")],
        text=True, capture_output=True
    )
    assert node.returncode == 0, node.stderr

    # Check that every static ID selected by the browser script exists in HTML.
    html = (ROOT / "APP" / "public" / "index.html").read_text(encoding="utf-8")
    browser_js = (ROOT / "APP" / "public" / "app.js").read_text(encoding="utf-8")
    html_ids = set(re.findall(r'\bid="([A-Za-z][A-Za-z0-9_-]*)"', html))
    selected_ids = set(re.findall(r"\$\('#([A-Za-z][A-Za-z0-9_-]*)'\)", browser_js))
    product_entry = re.search(r'<input\s+id="orderProductId"[^>]*>', html)
    assert product_entry, "The sales-order Product ID input is missing"
    assert not re.search(r'\brequired\b', product_entry.group(0)), "Product ID entry must not be HTML-required after it is added to the order lines"
    assert "Number($('#orderProductId').value)" in browser_js, "The Add Product handler must validate Product ID itself"
    # These two buttons are created dynamically when an order is rendered.
    dynamic_ids = {"confirmOrderButton", "cancelOrderButton"}
    missing_ids = selected_ids - html_ids - dynamic_ids
    assert not missing_ids, f"Browser JavaScript selects missing HTML IDs: {sorted(missing_ids)}"
    assert all(token in browser_js for token in ["confirmOrderButton", "cancelOrderButton"])
    print("PASS: Node.js syntax and browser-to-HTML selector consistency")

    connection.close()
    print("\nALL OFFLINE CHECKS PASSED.")
    print("Note: run the same SQL in MySQL 8 / Workbench and test the Node app against MySQL before final submission.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
