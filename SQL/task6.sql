-- PHASE 3 / TASK 6: CREATE, QUERY, AND TEST TWO VIEWS
USE ioms_db;

DROP VIEW IF EXISTS vw_product_catalog;
DROP VIEW IF EXISTS vw_sales_order_summary;

-- View 1: one base table, direct columns only. This view is updatable.
CREATE VIEW vw_product_catalog AS
SELECT ProductID, ProductName, UnitPrice, UnitCost, Description, CategoryID
FROM Product;

-- View 2: joins, aggregation, and GROUP BY. This view is not updatable in MySQL.
CREATE VIEW vw_sales_order_summary AS
SELECT
    so.OrderID,
    so.OrderDate,
    so.OrderStatus,
    so.CustomerID,
    c.CustomerName,
    so.LocationID,
    l.LocationName,
    COUNT(sod.ProductID) AS DistinctProducts,
    SUM(sod.QuantityOrdered) AS TotalUnits,
    SUM(sod.QuantityOrdered * sod.UnitPrice) AS TotalAmount
FROM SalesOrderHeader AS so
JOIN Customer AS c ON c.CustomerID = so.CustomerID
JOIN Location AS l ON l.LocationID = so.LocationID
JOIN SalesOrderDetail AS sod ON sod.OrderID = so.OrderID
GROUP BY
    so.OrderID, so.OrderDate, so.OrderStatus,
    so.CustomerID, c.CustomerName, so.LocationID, l.LocationName;

-- Query each view (limit output for the report).
SELECT * FROM vw_product_catalog ORDER BY ProductID LIMIT 20;
SELECT * FROM vw_sales_order_summary ORDER BY OrderDate DESC LIMIT 20;
