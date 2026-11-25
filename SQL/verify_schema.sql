-- Run after creating/loading the database. Capture these DESCRIBE outputs for Task 1.
USE ioms_db;
DESCRIBE ProductCategory;
DESCRIBE Location;
DESCRIBE Customer;
DESCRIBE Product;
DESCRIBE ProductInventory;
DESCRIBE SalesOrderHeader;
DESCRIBE SalesOrderDetail;
DESCRIBE InventoryTransfer;

-- Row counts for Task 3 evidence.
SELECT 'ProductCategory' AS RelationName, COUNT(*) AS RowCount FROM ProductCategory
UNION ALL SELECT 'Location', COUNT(*) FROM Location
UNION ALL SELECT 'Customer', COUNT(*) FROM Customer
UNION ALL SELECT 'Product', COUNT(*) FROM Product
UNION ALL SELECT 'ProductInventory', COUNT(*) FROM ProductInventory
UNION ALL SELECT 'SalesOrderHeader', COUNT(*) FROM SalesOrderHeader
UNION ALL SELECT 'SalesOrderDetail', COUNT(*) FROM SalesOrderDetail
UNION ALL SELECT 'InventoryTransfer', COUNT(*) FROM InventoryTransfer;
