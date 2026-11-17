# Normal delivery database evidence capture

This package is evidence preparation only. It does not determine whether normal delivery posting is safe and does not modify the database.

## Why this is needed

The repository route calls `sal.post_delivery_by_no($1)`, but the authoritative definitions of `sal.post_delivery_by_no`, `sal.post_delivery`, and `sal.v_delivery_line_lot_options` are not present in repository SQL. Their deployed definitions are required to determine reservation handling, lot deduction, movement creation, locking, and function ACL exposure.

## Safe manual execution

Run the script only against a database the user explicitly approves for inspection: an isolated staging database, approved development clone, or explicitly approved production read-only catalog inspection.

Do not use repository `.env` values automatically, and do not paste credentials into this task.

From the repository root, use placeholders and substitute them manually:

```text
psql -h <host> -U <user> -d <database> -f database/diagnostics/normal_delivery_evidence_capture.sql > normal_delivery_database_evidence.txt 2>&1
```

The script contains catalog reads and harmless environment metadata only. It does not call any delivery-posting function, run migrations, read business rows, or alter database state.

## Evidence to return

Return the complete text file, including:

- environment identity;
- every `sal.post_delivery_by_no` and `sal.post_delivery` overload;
- complete function definitions;
- function owners, security mode, configuration, ACLs, and execute privileges;
- the complete `sal.v_delivery_line_lot_options` definition and privileges;
- delivery, sales-order, and inventory-movement column metadata;
- reservation-related object definitions;
- direct dependencies;
- schema ownership and `PUBLIC CREATE`/function privilege evidence.

Do not include passwords, connection strings, or unrelated business data.

## What the next review will determine

With the returned evidence, the next review can classify normal delivery as:

- no reservation defect;
- a narrow route-level reservation defect;
- a database-function defect requiring a migration;
- or both route and database-function defects.

Until then, status remains: **DELIVERY SAFETY CANNOT BE DETERMINED — AUTHORITATIVE POSTING SOURCE MISSING**.
