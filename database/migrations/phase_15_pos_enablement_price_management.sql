-- PHASE 4: POS is implemented and configurable. Barcode remains future.
UPDATE app.feature
SET feature_group = 'CURRENT',
    description = 'Online point-of-sale and quick sale workflow.',
    is_active = true
WHERE feature_code = 'pos';

UPDATE app.feature
SET feature_group = 'FUTURE',
    description = 'Future barcode capability; deferred to Phase 6.',
    is_active = true
WHERE feature_code = 'barcode';

-- Do not change app.company_feature here. KAM remains disabled by default.
