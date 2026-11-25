-- PHASE 3 / TASK 6: VIEW UPDATABILITY DEMONSTRATIONS
-- Run after SQL/task6.sql has created the two views.
USE ioms_db;

-- TEST A: This update to the simple single-table view is expected to succeed.
-- It is wrapped in a transaction and rolled back to preserve the original product price.
START TRANSACTION;
UPDATE vw_product_catalog
SET UnitPrice = UnitPrice + 0.01
WHERE ProductID = 1;
SELECT ProductID, ProductName, UnitPrice
FROM Product
WHERE ProductID = 1;
ROLLBACK;

-- TEST B: This update is expected to fail because the view includes JOINs,
-- aggregate functions, and GROUP BY. Uncomment and run separately to capture
-- the MySQL error proving that vw_sales_order_summary is not updatable.
-- UPDATE vw_sales_order_summary
-- SET TotalAmount = TotalAmount + 1
-- WHERE OrderID = 1;
