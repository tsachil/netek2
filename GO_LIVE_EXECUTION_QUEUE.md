# BT-CTS Go-Live Execution Queue

Date: February 8, 2026

## Execution Objective
Complete the remaining implementation work to satisfy P3/P4 acceptance criteria and produce release sign-off evidence.

## Wave 1: Close Remaining Product Gaps
1. Remove fallback day-state override endpoint and enforce only guarded transitions.
2. Finish Branch Manager operational UX specifics (branch monitoring + teller activity details).
3. Add deeper teller reconciliation tooling and workflows for close-day handoff.
4. Complete final Hebrew copy pass for all user-facing error states.

Exit criteria:
- No critical flow depends on temporary endpoints.
- Branch Manager/Teller operational workflows are fully covered in UI/API tests.

## Wave 2: Compliance and Hardening Completion
1. Complete full accessibility audit (keyboard order, focus traps, contrast).
2. Add automated checks for accessibility and security baseline in CI gate.
3. Finalize retention storage architecture for 7-year policy.
4. Add/verify external alerting integration ownership (pager/slack/webhook channels).

Exit criteria:
- Accessibility baseline signed off.
- Security/compliance checklist has no unresolved P1/P2 issues.

## Wave 3: Operational Readiness and Release Control
1. Run backup/restore rehearsal and capture RPO/RTO evidence.
2. Validate `/health/ready` in deployment environment under failure simulation.
3. Execute full UAT set and fill sign-off template.
4. Freeze release candidate and run final regression suite.

Exit criteria:
- UAT sign-off approved with no P1 blockers.
- Recovery and readiness evidence attached.

## Tracking Artifacts
1. Plan baseline: `/Users/tsachil/Projects/myapps/netek2/IMPLEMENTATION_PLAN.md`
2. UAT scenarios: `/Users/tsachil/Projects/myapps/netek2/UAT_SCENARIOS.md`
3. UAT sign-off form: `/Users/tsachil/Projects/myapps/netek2/UAT_SIGNOFF_TEMPLATE.md`
4. Ops runbook: `/Users/tsachil/Projects/myapps/netek2/OPS_RUNBOOK.md`
5. Backup runbook: `/Users/tsachil/Projects/myapps/netek2/BACKUP_RECOVERY_RUNBOOK.md`

## Release Gate (Go/No-Go)
Go-live is allowed only if all are true:
1. Test suite green in CI (API + web).
2. UAT sign-off marked APPROVED.
3. Recovery drill target met or accepted with documented exception.
4. No open blocker severity defects.
