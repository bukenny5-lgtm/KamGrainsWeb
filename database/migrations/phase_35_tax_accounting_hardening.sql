-- PHASE 6B: tax account mappings and activation precheck.
-- Forward-only. Does not enable VAT or rewrite posted history.

INSERT INTO fin.gl_account(account_id, account_code, account_name, account_type, is_control, is_active)
VALUES (gen_random_uuid(), '1300', 'Input VAT Recoverable', 'ASSET', true, true)
ON CONFLICT (account_code) DO UPDATE SET account_name=EXCLUDED.account_name, is_active=true;

INSERT INTO fin.gl_account(account_id, account_code, account_name, account_type, is_control, is_active)
VALUES (gen_random_uuid(), '2200', 'Output VAT Payable', 'LIABILITY', true, true)
ON CONFLICT (account_code) DO UPDATE SET account_name=EXCLUDED.account_name, is_active=true;

INSERT INTO fin.posting_setup(setup_key, account_id)
SELECT 'INPUT_VAT', account_id FROM fin.gl_account WHERE account_code='1300'
ON CONFLICT (setup_key) DO UPDATE SET account_id=EXCLUDED.account_id;
INSERT INTO fin.posting_setup(setup_key, account_id)
SELECT 'OUTPUT_VAT', account_id FROM fin.gl_account WHERE account_code='2200'
ON CONFLICT (setup_key) DO UPDATE SET account_id=EXCLUDED.account_id;

UPDATE app.company_profile cp
SET input_vat_account_id = COALESCE(cp.input_vat_account_id, (SELECT account_id FROM fin.posting_setup WHERE setup_key='INPUT_VAT')),
    output_vat_account_id = COALESCE(cp.output_vat_account_id, (SELECT account_id FROM fin.posting_setup WHERE setup_key='OUTPUT_VAT'))
WHERE cp.is_active;

CREATE OR REPLACE FUNCTION app.tax_activation_precheck(p_company_id uuid)
RETURNS TABLE(check_code text, is_valid boolean, message text)
LANGUAGE sql
AS $function$
  SELECT 'TAX_CODES'::text,
         EXISTS (SELECT 1 FROM app.tax_code WHERE company_id=p_company_id AND is_active),
         CASE WHEN EXISTS (SELECT 1 FROM app.tax_code WHERE company_id=p_company_id AND is_active)
              THEN 'At least one active tax code is configured.' ELSE 'Configure at least one active tax code.' END
  UNION ALL
  SELECT 'DEFAULT_TAX_CODE',
         EXISTS (SELECT 1 FROM app.company_profile cp JOIN app.tax_code tc ON tc.tax_code_id=cp.default_tax_code_id
                 WHERE cp.company_id=p_company_id AND tc.company_id=p_company_id AND tc.is_active),
         CASE WHEN EXISTS (SELECT 1 FROM app.company_profile cp JOIN app.tax_code tc ON tc.tax_code_id=cp.default_tax_code_id
                           WHERE cp.company_id=p_company_id AND tc.company_id=p_company_id AND tc.is_active)
              THEN 'Default tax code is active.' ELSE 'Select an active default tax code.' END
  UNION ALL
  SELECT 'OUTPUT_VAT_ACCOUNT',
         EXISTS (SELECT 1 FROM app.company_profile cp JOIN fin.gl_account a ON a.account_id=cp.output_vat_account_id
                 WHERE cp.company_id=p_company_id AND a.is_active),
         CASE WHEN EXISTS (SELECT 1 FROM app.company_profile cp JOIN fin.gl_account a ON a.account_id=cp.output_vat_account_id
                           WHERE cp.company_id=p_company_id AND a.is_active)
              THEN 'Output VAT account is configured.' ELSE 'Configure an active Output VAT Payable account.' END
  UNION ALL
  SELECT 'INPUT_VAT_ACCOUNT',
         EXISTS (SELECT 1 FROM app.company_profile cp JOIN fin.gl_account a ON a.account_id=cp.input_vat_account_id
                 WHERE cp.company_id=p_company_id AND a.is_active),
         CASE WHEN EXISTS (SELECT 1 FROM app.company_profile cp JOIN fin.gl_account a ON a.account_id=cp.input_vat_account_id
                           WHERE cp.company_id=p_company_id AND a.is_active)
              THEN 'Input VAT account is configured.' ELSE 'Configure an active Input VAT Recoverable account.' END
  UNION ALL
  SELECT 'PRODUCT_CLASSIFICATION',
         NOT EXISTS (SELECT 1 FROM inv.product WHERE is_active AND (is_saleable OR is_purchasable) AND tax_code_id IS NULL),
         CASE WHEN NOT EXISTS (SELECT 1 FROM inv.product WHERE is_active AND (is_saleable OR is_purchasable) AND tax_code_id IS NULL)
              THEN 'All active saleable/purchasable products are classified.' ELSE 'Classify every active saleable/purchasable product before activation.' END
  UNION ALL
  SELECT 'PRICING_MODE', true, 'Tax pricing mode is structurally constrained to TAX_INCLUSIVE or TAX_EXCLUSIVE.';
$function$;

COMMENT ON FUNCTION app.tax_activation_precheck(uuid) IS 'Actionable, non-mutating checks required before enabling the tax engine.';
