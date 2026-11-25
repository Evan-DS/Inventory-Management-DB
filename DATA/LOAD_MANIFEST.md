# Data Load Manifest

Generator seed: `9014`

| Relation | Generated records |
|---|---:|
| `ProductCategory` | 20 |
| `Location` | 12 |
| `Customer` | 1,500 |
| `Product` | 3,200 |
| `ProductInventory` | 38,400 |
| `SalesOrderHeader` | 6,000 |
| `SalesOrderDetail` | 17,944 |
| `InventoryTransfer` | 750 |

The generated dataset includes thousands of records in Product, ProductInventory, SalesOrderHeader and SalesOrderDetail, and hundreds of records in InventoryTransfer. All IDs and foreign-key references are generated consistently. Completed transfers and confirmed orders are reflected in the generated ProductInventory quantities.
