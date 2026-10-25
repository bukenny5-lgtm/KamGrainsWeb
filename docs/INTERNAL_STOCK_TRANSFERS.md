# Internal stock transfer dispatch — Phase 9D

The internal transfer lifecycle is:

`Request → Approval → Preparation/Reservation → Dispatch → In Transit → Receipt → Completion`

Phase 9D implements source dispatch only. Dispatch creates an immutable `TEX-YYYYMMDD-######` execution header and lines, posts one GL-neutral `TRANSFER` movement from the authorized source location to that source branch's system TRANSIT location, and creates destination-scoped Incoming Receipt work. Destination receipt remains a separate Phase 9D-deferred action.

`DRAFT` transfer lines reserve on-hand stock. Partial dispatch changes the transfer to `PARTIALLY_DISPATCHED`; the un-dispatched remainder stays Reserved, while dispatched quantity is In Transit. Full dispatch changes the transfer to `IN_TRANSIT`. Inventory derives On Hand, Reserved, Available, and In Transit from movement and transfer execution state; no competing mutable quantity is maintained.

Dispatch execution is idempotent by a retry key scoped to the prepared transfer and protected by transfer/line locks and transactional source-stock revalidation. Movement lines preserve product, lot, and unit cost. Dispatch audit is recorded in the same transaction using the existing audit action contract with `business_event=TRANSFER_DISPATCHED`.

Incoming Receipt tasks are derived from dispatch executions, destination branch/location authorization, and outstanding receipt quantity. They support execution-number search and are visible automatically to authorized destination users. No destination saleable stock, receipt movement, receipt variance, supplier document, or GL posting is created by dispatch.

Known local acceptance references: `ISR-20261025-000019`, `TRF-20261025-000013`, `TRF-20261025-000014`, `TEX-20261026-000002`, `TEX-20261026-000004`, and `TEX-20261026-000005` in `kam_grains_db`. These are development evidence only.
