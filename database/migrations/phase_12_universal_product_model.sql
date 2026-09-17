-- Phase 2: minimal universal product foundation.
-- Additive and idempotent; existing products remain valid.

CREATE TABLE IF NOT EXISTS inv.product_category (
  category_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_code text NOT NULL,
  category_name text NOT NULL,
  description text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_category_code_key UNIQUE (category_code)
);

ALTER TABLE inv.product
  ADD COLUMN IF NOT EXISTS description text NULL,
  ADD COLUMN IF NOT EXISTS is_purchasable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_stock_item boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS category_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_category_id_fkey'
      AND conrelid = 'inv.product'::regclass
  ) THEN
    ALTER TABLE inv.product ADD CONSTRAINT product_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES inv.product_category(category_id);
  END IF;
END $$;
