-- Phase 8N acceptance correction: preserve the controlled audit vocabulary while
-- allowing the explicit user/branch/location actions emitted by access management.
-- Forward-only; do not edit phase 51 or any previously applied migration.

ALTER TABLE audit.event DROP CONSTRAINT IF EXISTS event_action_check;
ALTER TABLE audit.event ADD CONSTRAINT event_action_check
  CHECK (
    action IN (
      'I','U','D',
      'USER_CREATED',
      'USER_ROLE_ASSIGNED',
      'USER_BRANCH_GRANTED',
      'USER_BRANCH_REVOKED',
      'USER_DEFAULT_BRANCH_CHANGED',
      'LOCATION_ACCESS_GRANTED',
      'LOCATION_ACCESS_REVOKED',
      'USER_DEFAULT_LOCATION_CHANGED',
      'LOCATION_UPDATED'
    )
    OR (table_name='business.event' AND action ~ '^[A-Z][A-Z0-9_]+$')
  );
