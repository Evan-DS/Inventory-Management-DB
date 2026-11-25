'use strict';

require('dotenv').config();
const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'ioms_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true,
  dateStrings: true,
  enableKeepAlive: true
});

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function positiveInt(value, fieldName) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new HttpError(400, `${fieldName} must be a positive whole number.`);
  }
  return number;
}

function optionalPositiveInt(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  return positiveInt(value, fieldName);
}

function validateDate(value, fieldName) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, `${fieldName} must use YYYY-MM-DD format.`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, `${fieldName} is not a valid calendar date.`);
  }
  return value;
}

async function withTransaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try { await connection.rollback(); } catch (_) { /* retain original error */ }
    throw error;
  } finally {
    connection.release();
  }
}

async function fetchOrder(orderId, executor = pool) {
  const [headers] = await executor.execute(
    `SELECT so.OrderID, so.OrderDate, so.OrderStatus, so.CustomerID,
            c.CustomerName, so.LocationID, l.LocationName
       FROM SalesOrderHeader AS so
       JOIN Customer AS c ON c.CustomerID = so.CustomerID
       JOIN Location AS l ON l.LocationID = so.LocationID
      WHERE so.OrderID = ?`, [orderId]
  );
  if (headers.length === 0) return null;
  const [items] = await executor.execute(
    `SELECT sod.ProductID, p.ProductName, sod.QuantityOrdered, sod.UnitPrice,
            (sod.QuantityOrdered * sod.UnitPrice) AS LineTotal
       FROM SalesOrderDetail AS sod
       JOIN Product AS p ON p.ProductID = sod.ProductID
      WHERE sod.OrderID = ?
      ORDER BY sod.ProductID`, [orderId]
  );
  const total = items.reduce((sum, item) => sum + Number(item.LineTotal), 0);
  return { ...headers[0], items, TotalAmount: Number(total.toFixed(2)) };
}

app.get('/api/health', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT 1 AS databaseConnected');
    res.json({ ok: true, databaseConnected: rows[0].databaseConnected === 1 });
  } catch (error) { next(error); }
});

app.get('/api/locations', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT LocationID, LocationName FROM Location ORDER BY LocationName'
    );
    res.json(rows);
  } catch (error) { next(error); }
});

app.get('/api/categories', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT CategoryID, CategoryName FROM ProductCategory ORDER BY CategoryName'
    );
    res.json(rows);
  } catch (error) { next(error); }
});

app.get('/api/customers', async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 2000);
    const [rows] = await pool.execute(
      `SELECT CustomerID, CustomerName
         FROM Customer
        WHERE (? = '' OR CustomerName LIKE CONCAT('%', ?, '%'))
        ORDER BY CustomerName
        LIMIT ?`, [search, search, limit]
    );
    res.json(rows);
  } catch (error) { next(error); }
});

app.get('/api/inventory', async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const locationId = optionalPositiveInt(req.query.locationId, 'locationId');
    const categoryId = optionalPositiveInt(req.query.categoryId, 'categoryId');
    const lowOnly = req.query.lowOnly === 'true';
    const [rows] = await pool.execute(
      `SELECT p.ProductID, p.ProductName, pc.CategoryName,
              l.LocationID, l.LocationName, pi.Quantity, pi.ReorderPoint,
              pi.LastUpdated,
              CASE WHEN pi.Quantity <= pi.ReorderPoint THEN 'LOW' ELSE 'OK' END AS StockStatus
         FROM ProductInventory AS pi
         JOIN Product AS p ON p.ProductID = pi.ProductID
         JOIN ProductCategory AS pc ON pc.CategoryID = p.CategoryID
         JOIN Location AS l ON l.LocationID = pi.LocationID
        WHERE (? = '' OR p.ProductName LIKE CONCAT('%', ?, '%'))
          AND (? IS NULL OR l.LocationID = ?)
          AND (? IS NULL OR pc.CategoryID = ?)
          AND (? = 0 OR pi.Quantity <= pi.ReorderPoint)
        ORDER BY l.LocationName, p.ProductName
        LIMIT 250`, [search, search, locationId, locationId, categoryId, categoryId, lowOnly ? 1 : 0]
    );
    res.json(rows);
  } catch (error) { next(error); }
});

app.get('/api/low-stock', async (req, res, next) => {
  try {
    const locationId = optionalPositiveInt(req.query.locationId, 'locationId');
    const categoryId = optionalPositiveInt(req.query.categoryId, 'categoryId');
    const days = positiveInt(req.query.days || 30, 'days');
    if (days > 365) throw new HttpError(400, 'days must be between 1 and 365.');
    const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const [rows] = await pool.execute(
      `SELECT p.ProductID, p.ProductName, pc.CategoryID, pc.CategoryName,
              l.LocationID, l.LocationName, pi.Quantity, pi.ReorderPoint,
              (pi.ReorderPoint - pi.Quantity) AS UnitsBelowReorderPoint,
              COALESCE(recent.RecentUnitsSold, 0) AS RecentUnitsSold
         FROM ProductInventory AS pi
         JOIN Product AS p ON p.ProductID = pi.ProductID
         JOIN ProductCategory AS pc ON pc.CategoryID = p.CategoryID
         JOIN Location AS l ON l.LocationID = pi.LocationID
         LEFT JOIN (
             SELECT so.LocationID, sod.ProductID,
                    SUM(sod.QuantityOrdered) AS RecentUnitsSold
               FROM SalesOrderDetail AS sod
               JOIN SalesOrderHeader AS so ON so.OrderID = sod.OrderID
              WHERE so.OrderStatus = 'Confirmed'
                AND so.OrderDate >= ?
              GROUP BY so.LocationID, sod.ProductID
         ) AS recent
           ON recent.ProductID = pi.ProductID
          AND recent.LocationID = pi.LocationID
        WHERE pi.Quantity <= pi.ReorderPoint
          AND (? IS NULL OR l.LocationID = ?)
          AND (? IS NULL OR pc.CategoryID = ?)
        ORDER BY UnitsBelowReorderPoint DESC, RecentUnitsSold DESC,
                 l.LocationName, p.ProductName
        LIMIT 250`, [fromDate, locationId, locationId, categoryId, categoryId]
    );
    res.json(rows);
  } catch (error) { next(error); }
});

app.get('/api/orders/:orderId', async (req, res, next) => {
  try {
    const orderId = positiveInt(req.params.orderId, 'orderId');
    const order = await fetchOrder(orderId);
    if (!order) throw new HttpError(404, 'Order was not found.');
    res.json(order);
  } catch (error) { next(error); }
});

app.post('/api/orders', async (req, res, next) => {
  try {
    const customerId = positiveInt(req.body.customerId, 'customerId');
    const locationId = positiveInt(req.body.locationId, 'locationId');
    if (!Array.isArray(req.body.items) || req.body.items.length < 1 || req.body.items.length > 20) {
      throw new HttpError(400, 'An order must contain between 1 and 20 distinct product lines.');
    }
    const items = req.body.items.map((item) => ({
      productId: positiveInt(item.productId, 'productId'),
      quantity: positiveInt(item.quantity, 'quantity')
    }));
    const productIds = items.map((item) => item.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new HttpError(400, 'A product can appear only once per order. Combine quantities for duplicate products.');
    }

    const orderId = await withTransaction(async (connection) => {
      const [[customer]] = await connection.execute(
        'SELECT CustomerID FROM Customer WHERE CustomerID = ?', [customerId]
      );
      if (!customer) throw new HttpError(404, 'Customer was not found.');
      const [[location]] = await connection.execute(
        'SELECT LocationID FROM Location WHERE LocationID = ?', [locationId]
      );
      if (!location) throw new HttpError(404, 'Location was not found.');

      const pricedItems = [];
      for (const item of items) {
        const [[product]] = await connection.execute(
          'SELECT ProductID, UnitPrice FROM Product WHERE ProductID = ?', [item.productId]
        );
        if (!product) throw new HttpError(404, `Product ${item.productId} was not found.`);
        const [[inventory]] = await connection.execute(
          'SELECT Quantity FROM ProductInventory WHERE ProductID = ? AND LocationID = ?',
          [item.productId, locationId]
        );
        if (!inventory) {
          throw new HttpError(409, `Product ${item.productId} is not registered in the selected location's inventory.`);
        }
        pricedItems.push({ ...item, unitPrice: product.UnitPrice });
      }

      const [insertHeader] = await connection.execute(
        `INSERT INTO SalesOrderHeader (OrderDate, OrderStatus, CustomerID, LocationID)
         VALUES (CURRENT_TIMESTAMP, 'Pending', ?, ?)`, [customerId, locationId]
      );
      for (const item of pricedItems) {
        await connection.execute(
          `INSERT INTO SalesOrderDetail (OrderID, ProductID, QuantityOrdered, UnitPrice)
           VALUES (?, ?, ?, ?)`, [insertHeader.insertId, item.productId, item.quantity, item.unitPrice]
        );
      }
      return insertHeader.insertId;
    });
    const order = await fetchOrder(orderId);
    res.status(201).json({ message: 'Order created with Pending status. Confirm it to deduct inventory.', order });
  } catch (error) { next(error); }
});

app.post('/api/orders/:orderId/confirm', async (req, res, next) => {
  try {
    const orderId = positiveInt(req.params.orderId, 'orderId');
    await withTransaction(async (connection) => {
      const [headers] = await connection.execute(
        'SELECT OrderID, OrderStatus, LocationID FROM SalesOrderHeader WHERE OrderID = ? FOR UPDATE',
        [orderId]
      );
      if (headers.length === 0) throw new HttpError(404, 'Order was not found.');
      if (headers[0].OrderStatus !== 'Pending') {
        throw new HttpError(409, `Only Pending orders can be confirmed. Current status: ${headers[0].OrderStatus}.`);
      }
      const [items] = await connection.execute(
        'SELECT ProductID, QuantityOrdered FROM SalesOrderDetail WHERE OrderID = ? ORDER BY ProductID',
        [orderId]
      );
      if (items.length === 0) throw new HttpError(409, 'The order has no detail lines.');

      for (const item of items) {
        const [inventoryRows] = await connection.execute(
          `SELECT Quantity FROM ProductInventory
            WHERE ProductID = ? AND LocationID = ? FOR UPDATE`,
          [item.ProductID, headers[0].LocationID]
        );
        if (inventoryRows.length === 0 || inventoryRows[0].Quantity < item.QuantityOrdered) {
          throw new HttpError(409, `Insufficient inventory for ProductID ${item.ProductID}; no stock was deducted.`);
        }
        const [updateResult] = await connection.execute(
          `UPDATE ProductInventory
              SET Quantity = Quantity - ?, LastUpdated = CURRENT_TIMESTAMP
            WHERE ProductID = ? AND LocationID = ? AND Quantity >= ?`,
          [item.QuantityOrdered, item.ProductID, headers[0].LocationID, item.QuantityOrdered]
        );
        if (updateResult.affectedRows !== 1) {
          throw new HttpError(409, `Inventory changed while confirming ProductID ${item.ProductID}; the order was rolled back.`);
        }
      }
      const [statusUpdate] = await connection.execute(
        `UPDATE SalesOrderHeader SET OrderStatus = 'Confirmed'
          WHERE OrderID = ? AND OrderStatus = 'Pending'`, [orderId]
      );
      if (statusUpdate.affectedRows !== 1) throw new HttpError(409, 'Order status changed before confirmation completed.');
    });
    res.json({ message: 'Order confirmed and inventory deducted atomically.', order: await fetchOrder(orderId) });
  } catch (error) { next(error); }
});

app.post('/api/orders/:orderId/cancel', async (req, res, next) => {
  try {
    const orderId = positiveInt(req.params.orderId, 'orderId');
    let restored = false;
    await withTransaction(async (connection) => {
      const [headers] = await connection.execute(
        'SELECT OrderID, OrderStatus, LocationID FROM SalesOrderHeader WHERE OrderID = ? FOR UPDATE',
        [orderId]
      );
      if (headers.length === 0) throw new HttpError(404, 'Order was not found.');
      const currentStatus = headers[0].OrderStatus;
      if (!['Pending', 'Confirmed'].includes(currentStatus)) {
        throw new HttpError(409, `Only Pending or Confirmed orders can be cancelled. Current status: ${currentStatus}.`);
      }

      if (currentStatus === 'Confirmed') {
        const [items] = await connection.execute(
          'SELECT ProductID, QuantityOrdered FROM SalesOrderDetail WHERE OrderID = ? ORDER BY ProductID',
          [orderId]
        );
        if (items.length === 0) throw new HttpError(409, 'The confirmed order has no detail lines.');
        for (const item of items) {
          const [inventoryRows] = await connection.execute(
            `SELECT Quantity FROM ProductInventory
              WHERE ProductID = ? AND LocationID = ? FOR UPDATE`,
            [item.ProductID, headers[0].LocationID]
          );
          if (inventoryRows.length === 0) {
            throw new HttpError(409, `Inventory record missing for ProductID ${item.ProductID}; cancellation was rolled back.`);
          }
          await connection.execute(
            `UPDATE ProductInventory
                SET Quantity = Quantity + ?, LastUpdated = CURRENT_TIMESTAMP
              WHERE ProductID = ? AND LocationID = ?`,
            [item.QuantityOrdered, item.ProductID, headers[0].LocationID]
          );
        }
        restored = true;
      }

      const [statusUpdate] = await connection.execute(
        `UPDATE SalesOrderHeader SET OrderStatus = 'Cancelled'
          WHERE OrderID = ? AND OrderStatus = ?`, [orderId, currentStatus]
      );
      if (statusUpdate.affectedRows !== 1) throw new HttpError(409, 'Order status changed before cancellation completed.');
    });
    res.json({
      message: restored ? 'Confirmed order cancelled; its inventory quantities were restored atomically.' : 'Pending order cancelled; inventory was not changed.',
      order: await fetchOrder(orderId)
    });
  } catch (error) { next(error); }
});

app.post('/api/transfers', async (req, res, next) => {
  try {
    const productId = positiveInt(req.body.productId, 'productId');
    const sourceLocationId = positiveInt(req.body.sourceLocationId, 'sourceLocationId');
    const destinationLocationId = positiveInt(req.body.destinationLocationId, 'destinationLocationId');
    const quantity = positiveInt(req.body.quantity, 'quantity');
    if (sourceLocationId === destinationLocationId) {
      throw new HttpError(400, 'Source and destination locations must be different.');
    }

    const transferId = await withTransaction(async (connection) => {
      const [[product]] = await connection.execute(
        'SELECT ProductID FROM Product WHERE ProductID = ? FOR UPDATE', [productId]
      );
      if (!product) throw new HttpError(404, 'Product was not found.');

      const [[source]] = await connection.execute(
        `SELECT Quantity, ReorderPoint FROM ProductInventory
          WHERE ProductID = ? AND LocationID = ? FOR UPDATE`,
        [productId, sourceLocationId]
      );
      if (!source) throw new HttpError(404, 'The product has no inventory record at the source location.');
      const [[destinationLocation]] = await connection.execute(
        'SELECT LocationID FROM Location WHERE LocationID = ?', [destinationLocationId]
      );
      if (!destinationLocation) throw new HttpError(404, 'Destination location was not found.');

      let [destinationRows] = await connection.execute(
        `SELECT Quantity FROM ProductInventory
          WHERE ProductID = ? AND LocationID = ? FOR UPDATE`,
        [productId, destinationLocationId]
      );
      if (destinationRows.length === 0) {
        await connection.execute(
          `INSERT INTO ProductInventory (ProductID, LocationID, Quantity, ReorderPoint, LastUpdated)
           VALUES (?, ?, 0, ?, CURRENT_TIMESTAMP)`,
          [productId, destinationLocationId, source.ReorderPoint]
        );
        [destinationRows] = await connection.execute(
          `SELECT Quantity FROM ProductInventory
            WHERE ProductID = ? AND LocationID = ? FOR UPDATE`,
          [productId, destinationLocationId]
        );
      }
      if (source.Quantity < quantity) throw new HttpError(409, 'Insufficient source inventory for this transfer.');

      const [sourceUpdate] = await connection.execute(
        `UPDATE ProductInventory
            SET Quantity = Quantity - ?, LastUpdated = CURRENT_TIMESTAMP
          WHERE ProductID = ? AND LocationID = ? AND Quantity >= ?`,
        [quantity, productId, sourceLocationId, quantity]
      );
      if (sourceUpdate.affectedRows !== 1) throw new HttpError(409, 'Source inventory changed; transfer was rolled back.');
      await connection.execute(
        `UPDATE ProductInventory
            SET Quantity = Quantity + ?, LastUpdated = CURRENT_TIMESTAMP
          WHERE ProductID = ? AND LocationID = ?`,
        [quantity, productId, destinationLocationId]
      );
      const [insertTransfer] = await connection.execute(
        `INSERT INTO InventoryTransfer
          (Quantity, TransferDate, TransferStatus, ProductID, SourceLocationID, DestinationLocationID)
         VALUES (?, CURRENT_TIMESTAMP, 'Completed', ?, ?, ?)`,
        [quantity, productId, sourceLocationId, destinationLocationId]
      );
      return insertTransfer.insertId;
    });

    const [[transfer]] = await pool.execute(
      `SELECT it.TransferID, it.Quantity, it.TransferDate, it.TransferStatus,
              p.ProductName, src.LocationName AS SourceLocation,
              dst.LocationName AS DestinationLocation
         FROM InventoryTransfer AS it
         JOIN Product AS p ON p.ProductID = it.ProductID
         JOIN Location AS src ON src.LocationID = it.SourceLocationID
         JOIN Location AS dst ON dst.LocationID = it.DestinationLocationID
        WHERE it.TransferID = ?`, [transferId]
    );
    res.status(201).json({ message: 'Transfer completed; both inventory records were updated in one transaction.', transfer });
  } catch (error) { next(error); }
});

app.get('/api/analytics/sales', async (req, res, next) => {
  try {
    const from = validateDate(req.query.from || '2026-01-01', 'from');
    const to = validateDate(req.query.to || '2026-11-24', 'to');
    const categoryId = optionalPositiveInt(req.query.categoryId, 'categoryId');
    if (from > to) throw new HttpError(400, 'The from date must be on or before the to date.');
    const [rows] = await pool.execute(
      `SELECT p.ProductID, p.ProductName, pc.CategoryName,
              SUM(sod.QuantityOrdered) AS UnitsSold,
              ROUND(SUM(sod.QuantityOrdered * sod.UnitPrice), 2) AS SalesRevenue,
              COALESCE(stock.CurrentInventory, 0) AS CurrentInventory
         FROM SalesOrderDetail AS sod
         JOIN SalesOrderHeader AS so ON so.OrderID = sod.OrderID
         JOIN Product AS p ON p.ProductID = sod.ProductID
         JOIN ProductCategory AS pc ON pc.CategoryID = p.CategoryID
         LEFT JOIN (
             SELECT ProductID, SUM(Quantity) AS CurrentInventory
               FROM ProductInventory
              GROUP BY ProductID
         ) AS stock ON stock.ProductID = p.ProductID
        WHERE so.OrderStatus = 'Confirmed'
          AND so.OrderDate >= ?
          AND so.OrderDate < DATE_ADD(?, INTERVAL 1 DAY)
          AND (? IS NULL OR pc.CategoryID = ?)
        GROUP BY p.ProductID, p.ProductName, pc.CategoryName, stock.CurrentInventory
        ORDER BY UnitsSold DESC, SalesRevenue DESC, p.ProductName
        LIMIT 25`, [from, to, categoryId, categoryId]
    );
    res.json(rows);
  } catch (error) { next(error); }
});

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'API endpoint not found.')));
app.use((error, _req, res, _next) => {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error(error);
  return res.status(500).json({ error: 'An unexpected server error occurred. Check the server log.' });
});

const server = app.listen(PORT, () => {
  console.log(`IOMS web application listening on http://localhost:${PORT}`);
});

async function shutdown(signal) {
  console.log(`${signal} received; closing application connections.`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
