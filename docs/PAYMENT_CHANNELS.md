# Payment Channels

## Current architecture

The existing `fin.api_payment_channel` table remains the single payment-channel register. It is related to `fin.payment_account_control`/`fin.gl_account` through the existing linked payment and GL account fields. Existing `BANK` channel rows are preserved for compatibility; the target set is `CASH`, `MTN_MOMO`, `AIRTEL_MONEY`, `CARD`, `BANK_TRANSFER`, and `PAYMENT_GATEWAY`.

`app.payment_transaction` is the provider-neutral audit record for a channel payment. `app.payment_transaction_event` records status changes. POS keeps using `sal.post_pos_sale` for inventory and journals; the payment transaction is recorded in the same database transaction and does not replace the authoritative posting function.

## Modes and status

Channels use `MANUAL`, `SANDBOX`, or `LIVE` mode. New and existing channels default to `MANUAL` metadata, but remain `INACTIVE` until explicitly enabled. This phase permits only manual POS acceptance. `LIVE` is not enabled and no provider network calls are implemented.

Payment transaction statuses are `INITIATED`, `PENDING`, `CONFIRMED`, `FAILED`, `CANCELLED`, and `REVERSED`. Manual POS acceptance records `CONFIRMED` only after the cashier supplies an external reference. API integrations may later use the full lifecycle. Invalid transitions are rejected.

## Manual POS flow

For Mobile Money, Card, and Bank Transfer, Quick Sale loads active collection channels scoped to the current branch/location. One eligible channel is auto-selected; multiple channels require a selection. The UI labels the action **Manual Confirmation**, displays a masked merchant/account/terminal identifier, and captures the provider/terminal/transfer reference. No PIN, CVV, or PAN is collected.

The POS request uses the existing sale idempotency key. A successful channel payment creates one `app.payment_transaction` with the POS sale as its document, channel, amount, currency, manual confirmation mode, actor, timestamps, and provider reference. Duplicate provider references on one channel and duplicate idempotency keys are rejected by unique indexes. Cash and Credit retain their existing paths; Credit continues to create AR.

## Configuration and security

Channels support currency, merchant/business identifiers, masked wallet/account values, bank and terminal metadata, branch/location scope, collection/disbursement flags, and credential readiness metadata. `public_key_ref`, `secret_key_ref`, and `api_key_ref` remain references only; secrets must later be supplied by environment/secret-manager infrastructure. No plaintext provider secret is accepted as an operational credential.

Payment accounts and GL accounts remain mapped explicitly; the current POS journal semantics are unchanged. Clearing-account settlement and later reconciliation are represented by the channel/payment transaction references but are not silently introduced into historical posting.

Permissions are separated as `VIEW_PAYMENT_CHANNELS`, `MANAGE_PAYMENT_CHANNELS`, `CONFIRM_MANUAL_PAYMENT`, and `VIEW_PAYMENT_REFERENCES`, with existing role middleware reused. Branch/location authorization is checked both when listing available channels and when completing a POS sale.

## Provider readiness

| Type | Manual now | API now | Missing prerequisites |
|---|---|---|---|
| MTN_MOMO | Ready after active channel configuration | Not connected | Merchant/API credentials, sandbox certification, callback/signature contract |
| AIRTEL_MONEY | Ready after active channel configuration | Not connected | Merchant/API credentials, sandbox certification, callback/signature contract |
| CARD | Ready for standalone terminal approval/reference | Not connected | Acquirer terminal/API documentation and reversal contract |
| BANK_TRANSFER | Ready for externally verified transfer reference | Not connected | Bank collection/reconciliation contract |
| PAYMENT_GATEWAY | Model-ready only | Not connected | Gateway contract, credentials, callback and settlement rules |
| CASH | Existing cash tender/change path | Not applicable | Till/session controls are explicitly out of scope |

Future adapters should implement `initiatePayment`, `getPaymentStatus`, `cancelPayment`, `refundPayment`, and `verifyCallback`. Provider callbacks remain disabled until signature verification, idempotency, redaction, and a provider contract exist.

## Required acceptance

An authorized user must manually enable/configure one development channel for each MTN, Airtel, Card, and Bank Transfer scenario, then run Quick Sale acceptance and inspect the receipt, journal, stock, payment transaction, and event audit. Those browser checks remain required; this phase does not claim provider verification.
