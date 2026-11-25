# Phase 4 Web Application

This is the IOMS web application built with Node.js, Express, MySQL and a plain HTML/CSS/JavaScript frontend.

## Requirements

- Node.js 20 or newer
- MySQL 8.0.16 or newer
- The `ioms_db` database loaded from `../DUMP/ioms_database_dump.sql`

## Setup (Windows PowerShell)

Open a terminal in this `APP` folder and run:

```powershell
npm install
Copy-Item .env.example .env
```

Edit `.env` and enter the credentials for your MySQL server. The application expects the database name `ioms_db` by default.

Example `.env` values:

```dotenv
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=ioms_app
DB_PASSWORD=your_mysql_password
DB_NAME=ioms_db
PORT=3000
NODE_ENV=development
```

A separate MySQL account is preferable to using `root`. A MySQL administrator can create one with:

```sql
CREATE USER 'ioms_app'@'localhost' IDENTIFIED BY 'choose_a_strong_password';
GRANT SELECT, INSERT, UPDATE, DELETE ON ioms_db.* TO 'ioms_app'@'localhost';
FLUSH PRIVILEGES;
```

Use the same username and password in `.env`. If MySQL is on another computer, adjust the MySQL account host and `DB_HOST` accordingly.

## Start the application

```powershell
npm start
```

Open <http://localhost:3000>. The connection indicator in the top-right corner reports whether the backend can reach MySQL.

To check JavaScript syntax without starting the server:

```powershell
npm run check
```

## What the application does

1. **Inventory lookup:** search products and filter by location or category. The results show stock and reorder points for each product/location pair.
2. **Low-stock alerts:** find inventory at or below its reorder point. The query joins product, category, location, inventory and recent confirmed sales.
3. **Sales orders:** create a pending order for a customer and location, inspect its lines and total, then confirm or cancel it. Confirmation deducts stock; cancelling a confirmed order restores it. These changes run in transactions.
4. **Inventory transfers:** move a quantity from one location to another. The source and destination stock changes and transfer record are committed together.
5. **Sales analytics:** rank products by confirmed units sold and revenue for a date range, optionally filtered by category, and show current stock across locations.

The application has read and write operations. The low-stock report and sales analytics are multi-table aggregate queries. Each write operation returns a confirmation or updated record in the interface.

## Important behaviour

- A new sales order is `Pending`; it does not reserve or deduct inventory until confirmed.
- Confirmation checks available inventory and rejects the entire order if any line cannot be fulfilled.
- A confirmed order can be cancelled once; its original quantities are restored once. A pending order can be cancelled without changing stock.
- Each product can appear only once in a sales order because `SalesOrderDetail` uses `(OrderID, ProductID)` as its primary key. Combine quantities for repeated products.
- A transfer rejects identical source/destination locations and insufficient source stock. If the destination has no inventory row for the product, the app creates it with the source location's reorder point.
- All SQL values supplied by users are passed as parameters. The frontend also checks required fields and positive whole-number quantities; the backend repeats validation.
- The application is designed for the course project, not production use. It does not include user authentication or role-based access control.

## Manual test checklist

For a short walkthrough order and the remaining demo/submission tasks, see [`DEMO_CHECKLIST.md`](DEMO_CHECKLIST.md).


Use the populated database. Test each item through the browser, not by calling the API alone.

- [ ] Search inventory by product name, location and category.
- [ ] Run low-stock alerts for a location and date window; verify recent sales are shown.
- [ ] Create a pending order and look it up by its displayed order ID.
- [ ] Confirm the order and verify that the relevant inventory quantity decreases.
- [ ] Cancel that confirmed order and verify that the inventory quantity is restored.
- [ ] Attempt to confirm an order with insufficient stock and verify that no line is deducted.
- [ ] Transfer stock between two different locations and verify both quantities change.
- [ ] Attempt a transfer with insufficient source stock and verify that it is rejected.
- [ ] Run sales analytics for a date range and verify the ranked products and totals.

The offline repository tests check schema/data consistency and JavaScript syntax. They do not replace this live MySQL and browser testing. Capture your own screenshots and use the actual final database state for the Phase 4 demo and dump. Do not submit `.env` or `node_modules`.
