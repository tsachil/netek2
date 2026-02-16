# BT-CTS Recovery and Readiness Evidence

Date: February 8, 2026

## Readiness Validation
1. `GET /health` expected 200.
2. `GET /health/ready` tested for:
   - healthy DB + session store
   - DB failure path
   - session write failure path
   - session readback failure path
3. Evidence source:
   - `/Users/tsachil/Projects/myapps/netek2/apps/api/test/health.integration.test.ts`

## Recovery SLO Validation
1. Recovery evaluator logic covered by tests:
   - `/Users/tsachil/Projects/myapps/netek2/apps/api/test/recoverySlo.test.ts`
2. Admin ops endpoint coverage:
   - `/Users/tsachil/Projects/myapps/netek2/apps/api/test/adminApi.integration.test.ts`

## Backup/Restore Drill
1. Procedure and checklist documented in:
   - `/Users/tsachil/Projects/myapps/netek2/BACKUP_RECOVERY_RUNBOOK.md`
2. Staging restore drill status:
   - Pending execution by Operations/DBA in deployment environment.

