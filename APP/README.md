# Phase 4 Web Application

## Requirements

- Node.js 20 or newer
- MySQL 8.0.16 or newer
- The IOMS `ioms_db` database loaded from `DUMP/ioms_database_dump.sql`

## Install and configure

From the `APP` directory:

```bash
npm install
cp .env.example .env
```

Edit `.env` with the MySQL host, port, username, password and database name. Never commit `.env`.

For a dedicated local application account, a MySQL administrator can run:

```sql
CREATE USER 'ioms_app'@'localhost' IDENTIFIED BY 'choose_a_strong_password';
GRANT SELECT, INSERT, UPDATE, DELETE ON ioms_db.* TO 'ioms_app'@'localhost';
FLUSH PRIVILEGES;
```

Set `DB_USER` and `DB_PASSWORD` in `.env` to match the account. If Node runs on a different host, adjust the MySQL account host and `DB_HOST` accordingly.

## Start

```bash
npm start
```

Open <http://localhost:3000>. The header reports whether the API can reach MySQL.

## Functionalities and validation

1. **Inventory lookup** — searches products and shows stock by location. The displayed rows validate the query.
2. **Low-stock alerts** — filters product/location rows where `Quantity <= ReorderPoint` by category, location and recent-sales period; the result includes recent units sold.
3. **Create sales order** — writes a `SalesOrderHeader` and its `SalesOrderDetail` rows in one transaction. The new order appears with its lines and derived total.
4. **Confirm or cancel sales order** — confirmation locks the pending order and inventory rows, checks stock, deducts quantities and changes the status to `Confirmed` in one transaction. Cancelling a confirmed order restores its quantities before changing the status to `Cancelled`; cancelling a pending order does not change stock. Both paths are transactional and cannot be repeated.
5. **Inventory transfer** — checks source stock, updates source and destination inventory, and inserts an `InventoryTransfer` row in one transaction. It rejects transfers to the same location or transfers exceeding source stock.
6. **Sales analytics** — ranks best-selling products over a date range, optionally filtered by category, and shows units sold, revenue and total current stock across locations.

The application uses the current product price when creating an order and stores it in `SalesOrderDetail.UnitPrice`, preserving the transaction price if the current product price changes later. The schema's `(OrderID, ProductID)` key means duplicate product lines are rejected; the UI requires a distinct product line per product.

## Operational notes

- A newly created order is `Pending`; inventory is not deducted until it is confirmed.
- A confirmation can only be performed once. Non-pending orders are rejected. Cancellation is allowed for Pending and Confirmed orders; confirmed orders restore their original quantities exactly once.
- All application database access uses parameterized statements.
- Errors are returned as JSON with a suitable HTTP status; the frontend displays those messages.
- Customer IDs and Product IDs are entered directly in the order/transfer forms. Customer IDs in the generated dataset range from 1 to 1,500; use the inventory table to look up product IDs.
- The application is intended for the course demonstration and is not a production deployment (no authentication/authorization layer is included).
