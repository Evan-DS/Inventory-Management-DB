-- PHASE 3 / TASK 5: THREE INTERESTING DATA MODIFICATION COMMANDS
USE ioms_db;

-- 1) INSERT ... SELECT: add three proposed transfers for existing products.
-- The fixed demonstration ID range keeps these examples easy to identify and clean up.
INSERT INTO InventoryTransfer
    (TransferID, Quantity, TransferDate, TransferStatus, ProductID, SourceLocationID, DestinationLocationID)
SELECT
    900000 + p.ProductID,
    5,
    CURRENT_TIMESTAMP,
    'Pending',
    p.ProductID,
    1,
    2
FROM Product AS p
WHERE p.ProductID BETWEEN 1 AND 3
  AND NOT EXISTS (
      SELECT 1
      FROM InventoryTransfer AS existing_transfer
      WHERE existing_transfer.TransferID = 900000 + p.ProductID
  );

-- 2) UPDATE multiple inventory records using a grouped subquery over sales details.
-- Set the reorder threshold to 25 for products with at least 5 confirmed units sold from Location 1.
UPDATE ProductInventory
SET ReorderPoint = 25,
    LastUpdated = CURRENT_TIMESTAMP
WHERE LocationID = 1
  AND ProductID IN (
      SELECT sold.ProductID
      FROM (
          SELECT sod.ProductID
          FROM SalesOrderDetail AS sod
          JOIN SalesOrderHeader AS so ON so.OrderID = sod.OrderID
          WHERE so.OrderStatus = 'Confirmed'
            AND so.LocationID = 1
          GROUP BY sod.ProductID
          HAVING SUM(sod.QuantityOrdered) >= 5
      ) AS sold
  );

-- 3) DELETE the three demonstration transfers only; do not delete operational history.
DELETE FROM InventoryTransfer
WHERE TransferID BETWEEN 900001 AND 900003
  AND TransferStatus = 'Pending'
  AND DestinationLocationID = 2;
