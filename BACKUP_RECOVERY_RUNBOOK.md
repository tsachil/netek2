# BT-CTS Backup and Recovery Runbook

## Objectives
- Target RPO: less than 1 hour
- Target RTO: less than 30 minutes
- Cover database + critical runtime config restoration

## Backup Policy
1. Full PostgreSQL backup once daily (off-peak).
2. Incremental/WAL or differential capture every hour.
3. Keep at least:
   - 35 daily restore points
   - 12 monthly restore points
4. Store backups in an isolated location with access controls and encryption at rest.

## Required Artifacts
1. PostgreSQL dump or physical backup set.
2. WAL/incremental logs for point-in-time recovery.
3. App environment templates:
   - `/Users/tsachil/Projects/myapps/netek2/apps/api/.env.example`
4. Migration history and schema:
   - `/Users/tsachil/Projects/myapps/netek2/apps/api/prisma/migrations/`
   - `/Users/tsachil/Projects/myapps/netek2/apps/api/prisma/schema.prisma`

## Restore Procedure (Staging Rehearsal)
1. Provision a clean PostgreSQL instance.
2. Restore latest full backup.
3. Apply WAL/incremental logs to target timestamp if needed.
4. Apply Prisma migrations if schema drift is detected:
   - `npm --workspace apps/api exec prisma migrate deploy`
5. Start API and verify:
   - `GET /health`
   - `GET /health/ready`
6. Run smoke checks:
   - login as admin
   - account search
   - day state read (`/api/day/current`)
7. Record measured recovery time and data-loss window.
8. (Optional) Validate calculated SLO outcome via API:
   - `POST /api/admin/ops/recovery-evaluate`
   - payload fields: `backupCompletedAt`, `restorePointAt`, `restoreCompletedAt`, `targetRpoMinutes`, `targetRtoMinutes`

## Failure Escalation
Escalate immediately if:
1. `/health/ready` remains `503` after DB restore.
2. Migration deploy fails.
3. Auth/session writes fail after restore.
4. Data integrity checks fail on critical tables (`User`, `Account`, `Transaction`, `AuditLog`).

## Quarterly Recovery Drill
1. Execute full restore in non-production environment.
2. Validate RPO/RTO against targets.
3. Capture deviations and remediation actions.
4. Update this runbook with any tooling/path changes.
