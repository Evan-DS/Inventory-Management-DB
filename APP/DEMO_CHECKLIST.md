# Phase 4 demo checklist

## Before the demo

- [ ] Load the final `ioms_db` dump into MySQL.
- [ ] Install the app packages with `npm install`.
- [ ] Copy `.env.example` to `.env` and enter working MySQL credentials.
- [ ] Start the app with `npm start` and open `http://localhost:3000`.
- [ ] Confirm the header says **Database connected**.
- [ ] Test each workflow below with the live database. Use records that you can safely change or restore.

## Suggested demo order

1. **Inventory lookup:** search by product name and filter by location/category.
2. **Low-stock alerts:** run the report and point out the recent confirmed-sales total. This is a multi-table aggregate query.
3. **Create an order:** select a customer, location and product; create the order and show its Pending status and calculated total.
4. **Confirm and cancel:** confirm the order, show the inventory decrease in Inventory Lookup, then cancel it and show the stock restored.
5. **Transfer inventory:** move a few units between locations and show the source and destination quantities changed.
6. **Sales analytics:** choose a date range and show the ranked products, revenue and current inventory. This is another multi-table aggregate query.

## What still needs to be added by the team

- Capture your own screenshots or screen recording from the live MySQL-backed application. Do not use mock or generated results as evidence.
- Use the final database state after testing to create the new MySQL Workbench dump required by the assignment.
- In the developer-reflection slide, name the AI tools actually used, paste 3–5 prompts the team actually sent, and describe what needed debugging and how the team verified the fixes. Do not present suggested prompts as historical prompts if they were not used.
