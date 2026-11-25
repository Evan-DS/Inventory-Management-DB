# Inventory-Management-DB

Database implementation for the Inventory and Order Management System (IOMS), ECE 9014.

The main focus of this repository is **Phase 3**. The `APP` folder is retained for the later Phase 4 web application.

## Repository contents

```text
SQL/       Phase 3 schema, INSERT examples, queries, modifications and views
SRC/       Python script that generates the test data and MySQL dump
DUMP/      Generated database dump
DATA/      Sample records and generated row counts
APP/       Phase 4 Express application
 tests/    Offline checks for the schema, data and application code
```

## Phase 3 files

| Assignment task | File |
|---|---|
| Task 1 – Create tables | `SQL/task3.sql` |
| Task 2 – Three INSERT forms | `SQL/task3.sql` |
| Task 3 – Generate and load data | `SRC/generate_data.py`, `DUMP/ioms_database_dump.sql` |
| Task 4 – Seven SELECT queries | `SQL/task4.sql` |
| Task 5 – INSERT, UPDATE and DELETE | `SQL/task7.sql` |
| Task 6 – Two views and updatability tests | `SQL/task6.sql`, `SQL/task8.sql` |

`SQL/schema.sql` is the clean schema used by the data generator and database dump. `SQL/task3.sql` repeats the CREATE TABLE statements because the Phase 3 submission specifically asks for the schema and the three INSERT examples together in that file.

## Database

The database is named `ioms_db` and contains the eight relations from Phase 2:

- `ProductCategory`
- `Location`
- `Customer`
- `Product`
- `ProductInventory`
- `SalesOrderHeader`
- `SalesOrderDetail`
- `InventoryTransfer`

The schema retains the Phase 2 keys and attributes, including the composite keys in `ProductInventory` and `SalesOrderDetail`, location-specific `ReorderPoint`, and derived order totals.

## Generate or load the data

Python 3.10 or newer is required. The generator uses only the Python standard library.

From the repository root:

```bash
python SRC/generate_data.py
```

This regenerates the sample-record file and `DUMP/ioms_database_dump.sql` using a fixed seed. Import the dump into a **clean MySQL 8.0.16+ database**. It drops and recreates the eight project tables, so do not import it into a database containing data you need to keep.

For a command-line MySQL client:

```bash
mysql -u YOUR_USER -p < DUMP/ioms_database_dump.sql
```

Then run `SQL/verify_schema.sql` to inspect the tables and row counts.

## Run the Phase 3 SQL

Run these files in order after loading the database:

1. `SQL/task4.sql`
2. `SQL/task7.sql`
3. `SQL/task6.sql`
4. `SQL/task8.sql`

Run `SQL/task3.sql` separately on a clean database when capturing Task 1 and Task 2 evidence. It creates the schema and demonstrates three INSERT forms. Do not run it over the populated dataset unless you intend to recreate the schema.

For Task 6, `task8.sql` includes a successful update through the simple view and a separate expected failure for the aggregate view. Run the expected-failure statement separately so it does not stop the rest of the script.

## Check the files locally

```bash
python tests/validate_repository.py
```

These are offline checks using a SQLite compatibility adapter. They are useful for catching data, relationship and query mistakes, but **they do not replace running the SQL in MySQL**. The Phase 3 report still needs genuine MySQL execution evidence and a database export made through MySQL Workbench.

## Phase 4 application

The Express application is in `APP/`. See `APP/README.md` for setup. It uses the same eight-table schema and reads database credentials from `APP/.env`. Do not commit `.env` or `node_modules`.
