# BT-CTS Go-Live Wave Status

Date: February 8, 2026

## Wave 1
1. Remove fallback day-state override endpoint and enforce guarded transitions: Done.
2. Branch Manager operational UX specifics: Done.
3. Teller reconciliation tooling for close-day handoff: Done.
4. Final Hebrew copy pass for user-facing error states: Done.

## Wave 2
1. Accessibility audit baseline (tests + review): Done (automated baseline and key flow checks in CI).
2. Automated accessibility/security baseline in CI gate: Done (`check:ci` includes regression suites).
3. Retention storage architecture for 7-year policy: Done (`RETENTION_ARCHITECTURE.md`).
4. External alerting integration ownership and channel verification: Done (`OPS_RUNBOOK.md` ownership matrix).

## Wave 3
1. Backup/restore rehearsal evidence capture: In progress (runbook and evidence template prepared; staging drill required).
2. `/health/ready` validation under failure simulation: Done (integration tests for DB/session failure and session readback failure).
3. UAT execution and sign-off package: In progress (scenario mapping completed; manual staging runs required).
4. Release candidate freeze and full regression: Done for code/test gate in workspace (`npm run check:ci`).

