# Test and Regression Log

## Test Rules
- Do not mark a test `PASS` unless actually executed.
- Mark tests not executed as `NOT RUN`.
- Record command, environment, date, result, and evidence.
- Record failures as `BLOCKED` or `FAIL`.
- Regression coverage must protect the stable KAM GRAINS workflow.

## Regression Matrix

| Test ID | Area | Scenario | Status | Evidence / Notes |
|---|---|---|---|---|
| P0-AUTH-001 | Auth | Login, authorization, permissions | NOT RUN | Runtime baseline not executed in Phase 0 documentation correction |
| P0-SALES-001 | Sales | Sales Orders â†’ Deliveries â†’ AR Invoice â†’ Receipt | NOT RUN | Existing workflow must remain supported |
| P0-PUR-001 | Purchasing | Purchase Orders â†’ Goods Receipts â†’ AP | NOT RUN | Runtime baseline not executed |
| P0-INV-001 | Inventory | Stock movements, lots, counts, adjustments | NOT RUN | Runtime baseline not executed |
| P0-AR-001 | AR | Invoices, receipts, receipt history, backdating | NOT RUN | Historical fixes recorded |
| P0-AP-001 | AP | Invoices, payments, partial payments, Apply workflow | NOT RUN | Historical fixes recorded |
| P0-FIN-001 | Finance | Journals, accounts, payment accounts, postings | NOT RUN | Runtime baseline not executed |
| P0-REP-001 | Reporting | Operational and financial reports | NOT RUN | Runtime baseline not executed |
| P0-EXP-001 | Exports | Excel export/header visibility | NOT RUN | Historical fix recorded |
| P0-BACK-001 | Backdating | Backdated transaction/audit behavior | NOT RUN | Historical fix recorded |
| P0-QUERY-001 | Query Refresh | Dependent cache invalidation | NOT RUN | Historical runtime improvement recorded |
| P0-BUILD-TS | Build | Frontend TypeScript | PASS | `npx.cmd tsc -b --pretty false` completed successfully |
| P0-BUILD-FE | Build | Frontend Vite production build | PASS | `npm.cmd run build` completed successfully |
| P0-BUILD-BE | Build | Backend build/check | PASS | `npm.cmd run build` completed successfully |
| P0-DEPLOY-001 | Deployment | Deployment/smoke test | NOT RUN | Deployment outside Phase 0 scope |

## Future Regression Requirements
Before Phase 1 begins, confirm baseline build commands and preserve repeatable coverage for the current stable production workflow.

