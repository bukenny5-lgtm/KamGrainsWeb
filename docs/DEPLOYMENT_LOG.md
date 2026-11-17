# Deployment Log

## Phase 62/63 Production Deployment — 2026-11-17

| Deployment ID | Date | Environment | Git Commit | Frontend Build | Backend Build | Database Migration | Services Restarted | Deployment Paths | Smoke Test | Rollback Plan | Result |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P62-63-PROD | 2026-11-17 | Production `kam_grains_db` | Not recorded in supplied evidence | Existing deployed artifact | Existing deployed artifact | Phase 62, 62B–62E, 63, and 63B rollout | `KamGrainsAPI` was stopped during the database migration window; service details below | Backend `C:\BusinessSystems\KamGrainsWeb\backend`; frontend `C:\BusinessSystems\KamGrainsDeploy\frontend\dist` | POS `POS-20261117-000081`: PASS; normal sales after ACL hardening: PASS | Restore the verified pre-rollout custom-format backup and prior deployed artifacts through the approved operational rollback procedure | COMPLETE |

See [PHASE_62_63_PRODUCTION_DEPLOYMENT.md](PHASE_62_63_PRODUCTION_DEPLOYMENT.md) for the full evidence record. The pre-rollout backup was `C:\BusinessSystems\KamGrainsBackups\kam_grains_db-pre-phase62-63-20261114-073942.backup`; PostgreSQL custom-format and `pg_restore` list verification succeeded.

## Deployment Record Fields
Each deployment record should include:
- Deployment ID
- Date
- Environment
- Git Commit
- Frontend Build
- Backend Build
- Database Migration
- Services Restarted
- Deployment Paths
- Smoke Test
- Rollback Plan
- Result
- Notes

## Phase 0 Deployment Record

| Deployment ID | Date | Environment | Git Commit | Frontend Build | Backend Build | Database Migration | Services Restarted | Deployment Paths | Smoke Test | Rollback Plan | Result |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P0-NONE | 2026-09-17 | None | Pending review | NOT RUN | NOT RUN | None | No | None | NOT RUN | Retain current stable release; no deployment performed | NOT DEPLOYED |

## Current Known Deployment Structure

- **Development root:** `C:\BusinessSystems\KamGrainsWeb`
- **Production root:** `C:\BusinessSystems\KamGrainsDeploy`
- **Frontend build output:** `C:\BusinessSystems\KamGrainsWeb\frontend\dist`
- **Production frontend path:** `C:\BusinessSystems\KamGrainsDeploy\frontend\dist`
- **Frontend service:** `KamGrainsFrontend`
- **Backend service:** `KamGrainsAPI`

## Deployment Rules
- Do not deploy without an approved commit.
- Confirm frontend/backend build results before deployment.
- Record exact Git commit and artifact versions.
- Record whether migrations were applied.
- Never edit an already-applied production migration.
- Record all restarted services.
- Perform and record smoke tests after deployment.
- Maintain a tested rollback plan.
- Keep credentials/secrets out of logs.

## Backup Requirements
Before deployment:
1. Create a database backup.
2. Verify the backup exists and is readable.
3. Record timestamp and checksum without exposing sensitive data.
4. Confirm restore procedure.
5. Confirm previous production commit and artifact.
6. Assign rollback ownership.
7. Record rollback criteria.

## Phase 0 Git Checkpoint

- **Date:** 2026-09-17
- **Commit:** `c103fff`
- **Commit Message:** `phase-00: establish platform transformation baseline`
- **Deployment:** None
- **Database Migration:** None
- **Services Restarted:** None
- **Result:** Phase 0 baseline checkpoint created successfully.
