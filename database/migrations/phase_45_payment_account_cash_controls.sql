-- Phase 8E: reusable Till Cash and Main Cash Safe control accounts.
-- This is forward-only and intentionally does not touch historical account 1000.
-- The current model is one payment-account-control row per GL account, so the
-- operational labels are provider_name values and the stable GL codes remain
-- the account identity.

INSERT INTO fin.gl_account(account_code, account_name, account_type, is_control, is_active)
SELECT '1110', 'Cash in Tills', 'ASSET', true, true
WHERE NOT EXISTS (SELECT 1 FROM fin.gl_account WHERE account_code='1110');

INSERT INTO fin.gl_account(account_code, account_name, account_type, is_control, is_active)
SELECT '1120', 'Main Cash Safe', 'ASSET', true, true
WHERE NOT EXISTS (SELECT 1 FROM fin.gl_account WHERE account_code='1120');

INSERT INTO fin.payment_account_control(
  account_id, channel_type, provider_name, is_payment_account,
  allow_negative, overdraft_limit, is_active, notes
)
SELECT ga.account_id, 'CASH', 'TILL-CASH', true, false, 0, true,
       'Shared operational cash-control account for physical tills.'
FROM fin.gl_account ga
WHERE ga.account_code='1110'
  AND ga.is_active
  AND NOT EXISTS (
    SELECT 1 FROM fin.payment_account_control pac
    WHERE pac.account_id=ga.account_id
  );

INSERT INTO fin.payment_account_control(
  account_id, channel_type, provider_name, is_payment_account,
  allow_negative, overdraft_limit, is_active, notes
)
SELECT ga.account_id, 'CASH', 'MAIN-SAFE', true, false, 0, true,
       'Main Cash Safe operational cash-control account.'
FROM fin.gl_account ga
WHERE ga.account_code='1120'
  AND ga.is_active
  AND NOT EXISTS (
    SELECT 1 FROM fin.payment_account_control pac
    WHERE pac.account_id=ga.account_id
  );
