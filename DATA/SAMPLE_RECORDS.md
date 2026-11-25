# Sample Records for Phase 3

The following are five representative records from each relation in the generated dataset.

## ProductCategory (20 records)

| CategoryID | CategoryName | Description |
| --- | --- | --- |
| 1 | Cycling | Products classified under the cycling category. |
| 2 | Running | Products classified under the running category. |
| 3 | Camping | Products classified under the camping category. |
| 4 | Fitness | Products classified under the fitness category. |
| 5 | Safety | Products classified under the safety category. |

## Location (12 records)

| LocationID | LocationName | Street | City | PostalCode | Description |
| --- | --- | --- | --- | --- | --- |
| 1 | Windsor Main Warehouse | 1000 Walker Road | Windsor | N8Y 2N9 | Primary distribution warehouse |
| 2 | London Distribution Centre | 2500 Oxford Street E | London | N5V 4A8 | Regional distribution centre |
| 3 | Toronto North Warehouse | 80 Steeles Avenue W | Toronto | M2H 3S8 | Northern Toronto storage facility |
| 4 | Toronto West Warehouse | 1450 Kipling Avenue | Toronto | M9W 4J9 | Western Toronto storage facility |
| 5 | Ottawa Fulfillment Hub | 500 Industrial Avenue | Ottawa | K1G 0Z1 | Eastern Ontario fulfillment hub |

## Customer (1,500 records)

| CustomerID | CustomerName |
| --- | --- |
| 1 | Alex Lee 0001 |
| 2 | Jordan Scott 0002 |
| 3 | Taylor Martin 0003 |
| 4 | Morgan Young 0004 |
| 5 | Riley Wilson 0005 |

## Product (3,200 records)

| ProductID | ProductName | UnitPrice | UnitCost | Description | CategoryID |
| --- | --- | --- | --- | --- | --- |
| 1 | Camping Tent Model 0001 | 91.81 | 60.40 | Camping Tent product record 0001; category 12. | 12 |
| 2 | Safety Light Model 0002 | 189.76 | 143.76 | Safety Light product record 0002; category 3. | 3 |
| 3 | Road Bike Model 0003 | 152.62 | 111.40 | Road Bike product record 0003; category 14. | 14 |
| 4 | Sleeping Bag Model 0004 | 236.15 | 155.36 | Sleeping Bag product record 0004; category 5. | 5 |
| 5 | Hiking Pack Model 0005 | 270.61 | 162.04 | Hiking Pack product record 0005; category 16. | 16 |

## ProductInventory (38,400 records)

| ProductID | LocationID | Quantity | ReorderPoint | LastUpdated |
| --- | --- | --- | --- | --- |
| 1 | 1 | 134 | 28 | 2025-01-15 09:15:00 |
| 1 | 2 | 67 | 20 | 2026-08-24 12:00:00 |
| 1 | 3 | 108 | 44 | 2026-10-11 12:00:00 |
| 1 | 4 | 104 | 38 | 2026-08-06 12:00:00 |
| 1 | 5 | 131 | 37 | 2026-08-11 12:00:00 |

## SalesOrderHeader (6,000 records)

| OrderID | OrderDate | OrderStatus | CustomerID | LocationID |
| --- | --- | --- | --- | --- |
| 1 | 2025-03-08 14:45:00 | Confirmed | 676 | 1 |
| 2 | 2025-01-11 11:30:00 | Pending | 559 | 2 |
| 3 | 2026-02-20 15:45:00 | Confirmed | 1182 | 6 |
| 4 | 2025-10-25 18:45:00 | Confirmed | 736 | 10 |
| 5 | 2025-04-26 17:45:00 | Confirmed | 1360 | 3 |

## SalesOrderDetail (17,944 records)

| OrderID | ProductID | QuantityOrdered | UnitPrice |
| --- | --- | --- | --- |
| 1 | 1427 | 1 | 143.65 |
| 1 | 3158 | 5 | 232.29 |
| 2 | 2476 | 1 | 137.62 |
| 2 | 3101 | 3 | 102.31 |
| 3 | 2429 | 2 | 27.50 |

## InventoryTransfer (750 records)

| TransferID | Quantity | TransferDate | TransferStatus | ProductID | SourceLocationID | DestinationLocationID |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 5 | 2026-04-04 12:00:00 | Completed | 1281 | 9 | 12 |
| 2 | 7 | 2026-07-03 12:00:00 | Completed | 3195 | 6 | 11 |
| 3 | 2 | 2026-09-25 12:00:00 | Completed | 2160 | 8 | 12 |
| 4 | 5 | 2026-03-06 12:00:00 | Completed | 2496 | 1 | 3 |
| 5 | 3 | 2026-06-28 12:00:00 | Pending | 1545 | 7 | 8 |
