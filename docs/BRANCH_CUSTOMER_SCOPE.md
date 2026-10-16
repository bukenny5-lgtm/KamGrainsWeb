# Branch Customer Scope

Customer identity remains company-wide in `app.party`. Phase 55 adds `sal.customer_branch` as the reusable visibility association, so the same customer can be served by multiple branches without duplicating identity.

The association is backfilled only from reliable sales-order, POS, delivery, and delivery-linked AR history. Walk-in identity is associated with active branches. Ordinary users receive only active customers associated with their operating branch; Admin and Head Office may view all company customers and manage associations. Customer UUIDs supplied to POS, Sales Orders, and Delivery creation are checked server-side against the same association.
