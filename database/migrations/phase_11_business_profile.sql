-- Phase 1: universal business profile configuration.
-- Idempotent and limited to the existing active KAM GRAINS profile.

ALTER TABLE app.company_profile
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Africa/Kampala';

WITH active_kam_grains AS (
  SELECT company_id
  FROM app.company_profile
  WHERE is_active = true
    AND company_name = 'KAM GRAINS SUPPLIES'
  ORDER BY created_at, company_id
  LIMIT 1
)
UPDATE app.company_profile cp
SET
  company_name = 'KAM GRAINS SUPPLIES',
  business_name = 'KAM GRAINS'
FROM active_kam_grains akg
WHERE cp.company_id = akg.company_id;
