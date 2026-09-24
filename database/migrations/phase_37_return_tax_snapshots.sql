-- PHASE 6B: preserve original tax facts on customer-return lines.
ALTER TABLE sal.customer_return_line
  ADD COLUMN IF NOT EXISTS tax_code_id uuid NULL REFERENCES app.tax_code(tax_code_id),
  ADD COLUMN IF NOT EXISTS tax_code text,
  ADD COLUMN IF NOT EXISTS tax_treatment text,
  ADD COLUMN IF NOT EXISTS tax_rate numeric(9,4),
  ADD COLUMN IF NOT EXISTS original_taxable_amount numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS original_tax_amount numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS original_gross_amount numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS returned_taxable_amount numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS returned_tax_amount numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS returned_gross_amount numeric(18,2) NOT NULL DEFAULT 0;
