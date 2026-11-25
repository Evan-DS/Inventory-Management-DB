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
