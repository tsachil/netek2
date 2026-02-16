# BT-CTS Ops Runbook

## Scope
This runbook covers operational alerts emitted by the API for scheduled audit-retention failures.

## Alert Source
- Event type: `AUDIT_RETENTION_ERROR`
- Emitter: `/Users/tsachil/Projects/myapps/netek2/apps/api/src/auditRetention.ts`
- Delivery: webhook via `OPS_ALERT_WEBHOOK_URL`

## Configuration
Set in API environment:
- `OPS_ALERT_WEBHOOK_URL` (required for delivery)
- `OPS_ALERT_WEBHOOK_TOKEN` (optional bearer token)

Related retention controls:
- `AUDIT_RETENTION_ENABLED`
- `AUDIT_RETENTION_INTERVAL_HOURS`
- `AUDIT_RETENTION_OLDER_THAN_DAYS`
- `AUDIT_RETENTION_DRY_RUN`
- `AUDIT_RETENTION_ARCHIVE_DIR`

## Alerting Ownership Matrix
1. Primary owner: Platform On-Call (`#platform-oncall` / Pager escalation policy `BT-CTS-PLATFORM-P1`).
2. Secondary owner: DBA On-Call (`#db-oncall`).
3. Product escalation: Operations Lead during business hours.
4. Escalation SLA:
   - Acknowledge within 10 minutes.
   - Triage within 20 minutes.
   - Escalate to DBA if unresolved after 30 minutes.

## External Channel Verification
Run monthly and after secret rotation:
1. Trigger a synthetic alert payload to `OPS_ALERT_WEBHOOK_URL`.
2. Verify delivery in the external channel (Pager/Slack/Webhook consumer logs).
3. Confirm token authorization (`OPS_ALERT_WEBHOOK_TOKEN`) succeeds.
4. Record evidence link in release notes / ops journal.

## On-Call Checklist
1. Acknowledge the alert in your paging/incident tool.
2. Verify latest status from API:
   - `GET /api/admin/audit-logs/retention/status`
   - `GET /api/admin/audit-logs/retention/history?limit=20`
3. Inspect latest `AUDIT_RETENTION_ERROR` audit entry details (error payload).
4. Check DB and filesystem availability (archive dir permissions and free space).
5. Run a manual dry-run to validate query path:
   - `POST /api/admin/audit-logs/retention/run` with `{ "olderThanDays": <value>, "dryRun": true }`
6. If dry-run succeeds, run execute mode if policy allows:
   - same endpoint with `"dryRun": false`.
7. Confirm `AUDIT_RETENTION_RUN` entry appears and no new error alerts fire.
8. Close incident with root cause + mitigation note.

## Escalation
Escalate to platform/DB owner when:
- Retention errors persist for >2 scheduled intervals.
- Archive writes fail due to permissions/storage.
- DB operations fail or return partial/inconsistent results.

## Post-Incident Follow-up
- Add a regression test if failure mode was code-related.
- Update env defaults or deployment docs if misconfiguration-related.
- Attach incident summary to change log for the release.
