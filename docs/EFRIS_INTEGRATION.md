# Uganda EFRIS Integration Foundation

## Boundary and current state

EFRIS is a Uganda-specific compliance adapter layered on the generic ERP and tax engine. The ERP remains usable when EFRIS is disabled. Phase 7 does not implement URA transport, endpoints, credentials, encryption, VPN, certificates, commodity codes, UOM codes, tax-category codes, or production submission.

Migration 40 adds the independent `efris` feature flag, `app.efris_configuration`, branch/place-of-business mappings, product commodity mappings, UOM mappings, tax-category mappings, and durable fiscal records. Existing ERP products, tax snapshots, POS posting, AR posting, inventory, payments, and returns remain authoritative.

## Configuration and readiness

Configuration stores only TIN and non-secret onboarding metadata: environment, registration status, system-to-system enablement, place/device identifiers, offline policy, credential reference/status, technical-spec version, transport readiness, and health timestamps. Secrets must be supplied through an approved external secret mechanism later.

`GET /api/efris/precheck` returns actionable blockers for TIN, Uganda country, registration, system-to-system mode, environment, credentials metadata, transport, saleable product mappings, UOM mappings, branch mappings, and tax mappings. Enabling EFRIS through the configuration API is blocked until the precheck passes. Production is never enabled automatically.

## Fiscal lifecycle and queue

When EFRIS is enabled, a posted POS sale queues one `app.efris_document` from persisted POS tax/product snapshots. The document has a stable `ERP-{sale_no}` internal reference and a unique source-document constraint, so retries or duplicate clicks cannot create another fiscal document. POS cash, credit, mobile money, card, and bank transfer remain payment-independent. A POS credit sale is the fiscal authority; its generated AR invoice is not fiscalised again.

Posted returns against an accepted fiscalised source queue one linked `CREDIT_NOTE` using the original EFRIS document and the return’s original tax snapshots. No negative sale is created. Debit-note schema support exists through `document_kind`; no debit-note UX or unsupported rules were invented. Delivery remains logistics-only.

Statuses are `DRAFT`, `QUEUED`, `SUBMITTING`, `PENDING`, `ACCEPTED`, `REJECTED`, `RETRY_PENDING`, `OFFLINE_PENDING`, `CANCELLED`, and `CREDITED`. Events and submission attempts are durable. Retry updates status and preserves errors; database persistence survives backend restart. Accepted records retain FDN/verification/QR fields only when a verified adapter response supplies them.

The current adapter is `NOT_CONFIGURED`. The adapter contract is documented in code for configuration validation, payload building, invoice/receipt/credit/debit submission, status query, and response verification. The internal mock route is explicitly labelled `INTERNAL MOCK — NOT URA` and exists only for deterministic architecture tests; its identifiers are not official URA identifiers.

## UI and reconciliation

The EFRIS Compliance page exposes settings, readiness blockers, product/UOM/tax/branch mappings, and fiscal-document monitoring. It never displays or accepts secrets. Pending documents show `EFRIS Pending`; official FDN, verification code, and QR values are not fabricated. Reconciliation is an internal ERP-vs-EFRIS document/status/tax-snapshot capability, not an official URA return.

## Exact URA onboarding prerequisites

Before any real adapter can be activated, obtain: approved EFRIS registration; system-to-system approval; official technical specification; official endpoint/environment details; authentication and signing requirements; VPN/network requirements; certificates/keys/credentials; official commodity classifications; UOM mappings; tax-category mappings; branch/place-of-business identifiers; sandbox credentials; certification/UAT requirements; production go-live approval; and URA support/escalation contacts. None of these values are guessed in the repository.

Historical ERP transactions are not automatically fiscalised. Till sessions, multi-company tenancy, EFRIS purchase APIs, and deployment remain out of scope.
