-- PHASE 3 / TASK 4: SEVEN DIVERSE SELECT QUERIES
USE ioms_db;

-- Query 1 (JOIN + filtering): inventory at a selected location.
SELECT
    l.LocationName,
    p.ProductID,
    p.ProductName,
    pc.CategoryName,
    pi.Quantity,
    pi.ReorderPoint,
    CASE WHEN pi.Quantity <= pi.ReorderPoint THEN 'LOW' ELSE 'OK' END AS StockStatus
FROM ProductInventory AS pi
JOIN Product AS p ON p.ProductID = pi.ProductID
JOIN ProductCategory AS pc ON pc.CategoryID = p.CategoryID
JOIN Location AS l ON l.LocationID = pi.LocationID
WHERE l.LocationID = 1
  AND (p.ProductName LIKE '%Helmet%' OR pc.CategoryName = 'Cycling')
ORDER BY p.ProductName;

-- Query 2 (multi-table JOIN + conditional filtering): all low-stock inventory.
SELECT
    l.LocationName,
    p.ProductID,
    p.ProductName,
    pc.CategoryName,
    pi.Quantity,
    pi.ReorderPoint,
    (pi.ReorderPoint - pi.Quantity) AS UnitsBelowReorderPoint
FROM ProductInventory AS pi
JOIN Product AS p ON p.ProductID = pi.ProductID
JOIN ProductCategory AS pc ON pc.CategoryID = p.CategoryID
JOIN Location AS l ON l.LocationID = pi.LocationID
WHERE pi.Quantity <= pi.ReorderPoint
ORDER BY UnitsBelowReorderPoint DESC, l.LocationName, p.ProductName
LIMIT 50;

-- Query 3 (JOIN + GROUP BY): daily sales revenue and order count.
SELECT
    DATE(so.OrderDate) AS SalesDay,
    COUNT(DISTINCT so.OrderID) AS OrderCount,
    SUM(sod.QuantityOrdered) AS UnitsSold,
    SUM(sod.QuantityOrdered * sod.UnitPrice) AS Revenue
FROM SalesOrderHeader AS so
JOIN SalesOrderDetail AS sod ON sod.OrderID = so.OrderID
WHERE so.OrderStatus = 'Confirmed'
  AND so.OrderDate >= '2026-01-01'
  AND so.OrderDate < '2027-01-01'
GROUP BY DATE(so.OrderDate)
ORDER BY SalesDay;

-- Query 4 (JOIN + GROUP BY + aggregate ordering): top-selling products.
SELECT
    p.ProductID,
    p.ProductName,
    pc.CategoryName,
    SUM(sod.QuantityOrdered) AS UnitsSold,
    SUM(sod.QuantityOrdered * sod.UnitPrice) AS SalesRevenue
FROM Product AS p
JOIN ProductCategory AS pc ON pc.CategoryID = p.CategoryID
JOIN SalesOrderDetail AS sod ON sod.ProductID = p.ProductID
JOIN SalesOrderHeader AS so ON so.OrderID = sod.OrderID
WHERE so.OrderStatus = 'Confirmed'
GROUP BY p.ProductID, p.ProductName, pc.CategoryName
ORDER BY UnitsSold DESC, SalesRevenue DESC
LIMIT 10;

-- Query 5 (correlated NOT EXISTS): customers with no confirmed sales orders.
SELECT c.CustomerID, c.CustomerName
FROM Customer AS c
WHERE NOT EXISTS (
    SELECT 1
    FROM SalesOrderHeader AS so
    WHERE so.CustomerID = c.CustomerID
      AND so.OrderStatus = 'Confirmed'
)
ORDER BY c.CustomerID
LIMIT 50;

-- Query 6 (UNION ALL + aggregation): outbound and inbound transfer activity by location.
SELECT
    transfer_activity.LocationID,
    l.LocationName,
    SUM(transfer_activity.OutboundUnits) AS OutboundUnits,
    SUM(transfer_activity.InboundUnits) AS InboundUnits
FROM (
    SELECT SourceLocationID AS LocationID, Quantity AS OutboundUnits, 0 AS InboundUnits
    FROM InventoryTransfer
    WHERE TransferStatus = 'Completed'
    UNION ALL
    SELECT DestinationLocationID AS LocationID, 0 AS OutboundUnits, Quantity AS InboundUnits
    FROM InventoryTransfer
    WHERE TransferStatus = 'Completed'
) AS transfer_activity
JOIN Location AS l ON l.LocationID = transfer_activity.LocationID
GROUP BY transfer_activity.LocationID, l.LocationName
ORDER BY l.LocationName;

-- Query 7 (JOIN + date/status filters): order-level details for a selected date window.
SELECT
    so.OrderID,
    so.OrderDate,
    so.OrderStatus,
    c.CustomerName,
    l.LocationName,
    COUNT(sod.ProductID) AS DistinctProducts,
    SUM(sod.QuantityOrdered) AS TotalUnits,
    SUM(sod.QuantityOrdered * sod.UnitPrice) AS OrderValue
FROM SalesOrderHeader AS so
JOIN Customer AS c ON c.CustomerID = so.CustomerID
JOIN Location AS l ON l.LocationID = so.LocationID
JOIN SalesOrderDetail AS sod ON sod.OrderID = so.OrderID
WHERE so.OrderDate >= '2026-01-01'
  AND so.OrderDate < '2027-01-01'
GROUP BY so.OrderID, so.OrderDate, so.OrderStatus, c.CustomerName, l.LocationName
ORDER BY so.OrderDate DESC, so.OrderID DESC
LIMIT 100;
