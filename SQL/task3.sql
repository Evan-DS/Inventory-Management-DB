-- PHASE 3 / TASK 1: CREATE THE DATABASE SCHEMA
-- Run this script in a fresh MySQL 8.0+ database session.
-- It creates the 8 relations from the Phase 2 relational schema.

-- Inventory and Order Management System (IOMS)
-- MySQL 8.0+ / InnoDB
-- Source of truth: Phase 2 relational schema (8 relations).

CREATE DATABASE IF NOT EXISTS ioms_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE ioms_db;

CREATE TABLE IF NOT EXISTS ProductCategory (
    CategoryID INT NOT NULL AUTO_INCREMENT,
    CategoryName VARCHAR(100) NOT NULL,
    Description VARCHAR(500) NOT NULL,
    CONSTRAINT pk_product_category PRIMARY KEY (CategoryID),
    CONSTRAINT uq_product_category_name UNIQUE (CategoryName)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS Location (
    LocationID INT NOT NULL AUTO_INCREMENT,
    LocationName VARCHAR(120) NOT NULL,
    Street VARCHAR(150) NOT NULL,
    City VARCHAR(100) NOT NULL,
    PostalCode VARCHAR(16) NOT NULL,
    Description VARCHAR(500) NOT NULL,
    CONSTRAINT pk_location PRIMARY KEY (LocationID),
    CONSTRAINT uq_location_name UNIQUE (LocationName)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS Customer (
    CustomerID INT NOT NULL AUTO_INCREMENT,
    CustomerName VARCHAR(160) NOT NULL,
    CONSTRAINT pk_customer PRIMARY KEY (CustomerID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS Product (
    ProductID INT NOT NULL AUTO_INCREMENT,
    ProductName VARCHAR(160) NOT NULL,
    UnitPrice DECIMAL(10,2) NOT NULL,
    UnitCost DECIMAL(10,2) NOT NULL,
    Description VARCHAR(500) NOT NULL,
    CategoryID INT NOT NULL,
    CONSTRAINT pk_product PRIMARY KEY (ProductID),
    CONSTRAINT uq_product_name UNIQUE (ProductName),
    CONSTRAINT chk_product_unit_price CHECK (UnitPrice >= 0),
    CONSTRAINT chk_product_unit_cost CHECK (UnitCost >= 0),
    CONSTRAINT fk_product_category FOREIGN KEY (CategoryID)
        REFERENCES ProductCategory (CategoryID)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    INDEX idx_product_category (CategoryID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ProductInventory (
    ProductID INT NOT NULL,
    LocationID INT NOT NULL,
    Quantity INT NOT NULL DEFAULT 0,
    ReorderPoint INT NOT NULL DEFAULT 0,
    LastUpdated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_product_inventory PRIMARY KEY (ProductID, LocationID),
    CONSTRAINT chk_inventory_quantity CHECK (Quantity >= 0),
    CONSTRAINT chk_inventory_reorder_point CHECK (ReorderPoint >= 0),
    CONSTRAINT fk_inventory_product FOREIGN KEY (ProductID)
        REFERENCES Product (ProductID)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_inventory_location FOREIGN KEY (LocationID)
        REFERENCES Location (LocationID)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    INDEX idx_inventory_location_product (LocationID, ProductID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS SalesOrderHeader (
    OrderID INT NOT NULL AUTO_INCREMENT,
    OrderDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    OrderStatus VARCHAR(20) NOT NULL DEFAULT 'Pending',
    CustomerID INT NOT NULL,
    LocationID INT NOT NULL,
    CONSTRAINT pk_sales_order_header PRIMARY KEY (OrderID),
    CONSTRAINT chk_sales_order_status CHECK (OrderStatus IN ('Pending', 'Confirmed', 'Cancelled')),
    CONSTRAINT fk_sales_order_customer FOREIGN KEY (CustomerID)
        REFERENCES Customer (CustomerID)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_sales_order_location FOREIGN KEY (LocationID)
        REFERENCES Location (LocationID)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    INDEX idx_sales_order_date_status (OrderDate, OrderStatus),
    INDEX idx_sales_order_customer_date (CustomerID, OrderDate),
    INDEX idx_sales_order_location_date (LocationID, OrderDate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS SalesOrderDetail (
    OrderID INT NOT NULL,
    ProductID INT NOT NULL,
    QuantityOrdered INT NOT NULL,
    UnitPrice DECIMAL(10,2) NOT NULL,
    CONSTRAINT pk_sales_order_detail PRIMARY KEY (OrderID, ProductID),
    CONSTRAINT chk_order_detail_quantity CHECK (QuantityOrdered > 0),
    CONSTRAINT chk_order_detail_unit_price CHECK (UnitPrice >= 0),
    CONSTRAINT fk_order_detail_header FOREIGN KEY (OrderID)
        REFERENCES SalesOrderHeader (OrderID)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_order_detail_product FOREIGN KEY (ProductID)
        REFERENCES Product (ProductID)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    INDEX idx_order_detail_product (ProductID, OrderID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS InventoryTransfer (
    TransferID INT NOT NULL AUTO_INCREMENT,
    Quantity INT NOT NULL,
    TransferDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    TransferStatus VARCHAR(20) NOT NULL DEFAULT 'Pending',
    ProductID INT NOT NULL,
    SourceLocationID INT NOT NULL,
    DestinationLocationID INT NOT NULL,
    CONSTRAINT pk_inventory_transfer PRIMARY KEY (TransferID),
    CONSTRAINT chk_transfer_quantity CHECK (Quantity > 0),
    CONSTRAINT chk_transfer_status CHECK (TransferStatus IN ('Pending', 'Completed', 'Cancelled')),
    CONSTRAINT chk_transfer_distinct_locations CHECK (SourceLocationID <> DestinationLocationID),
    CONSTRAINT fk_transfer_product FOREIGN KEY (ProductID)
        REFERENCES Product (ProductID)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_transfer_source_location FOREIGN KEY (SourceLocationID)
        REFERENCES Location (LocationID)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_transfer_destination_location FOREIGN KEY (DestinationLocationID)
        REFERENCES Location (LocationID)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    INDEX idx_transfer_product_date (ProductID, TransferDate),
    INDEX idx_transfer_source_date (SourceLocationID, TransferDate),
    INDEX idx_transfer_destination_date (DestinationLocationID, TransferDate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- PHASE 3 / TASK 2: THREE INSERT FORMS INTO ProductCategory
-- 1) Single-row INSERT ... VALUES without a column list (table column order).
INSERT INTO ProductCategory
VALUES (90001, 'Demo Outdoor', 'Task 2 demonstration category: outdoor products');

-- 2) Multi-row INSERT ... VALUES.
INSERT INTO ProductCategory (CategoryID, CategoryName, Description)
VALUES
    (90002, 'Demo Office', 'Task 2 demonstration category: office products'),
    (90003, 'Demo Home', 'Task 2 demonstration category: home products');

-- 3) INSERT ... SELECT: create a new category using a row already in ProductCategory
-- as the source relation. Run this demonstration once in the clean schema above.
-- MySQL supports this direct INSERT ... SELECT from the target table; avoid a
-- nested target-table subquery here because MySQL prohibits that pattern.
INSERT INTO ProductCategory (CategoryID, CategoryName, Description)
SELECT
    90004,
    CONCAT(source_category.CategoryName, ' Seasonal'),
    CONCAT('Seasonal extension of: ', source_category.Description)
FROM ProductCategory AS source_category
WHERE source_category.CategoryID = 90001;

-- Show the resulting relation / Task 2 evidence query (SELECT *).
SELECT *
FROM ProductCategory
ORDER BY CategoryID;

-- NOTE: For Task 3 bulk data, load DUMP/ioms_database_dump.sql into a clean ioms_db.
-- That dump rebuilds the schema and contains the generated substantial dataset.
