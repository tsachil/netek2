# BT-CTS Implementation Plan

**Based on:** BT-CTS_PRD_v1.1 (Branch Teller Cash Transaction System)  
**Purpose:** Phased implementation plan with dependencies, risks, and deliverables.

---

## 0. Open Decisions (Resolve Before P1)

1. **Retention & audit storage:** 7-year policy, partitioning approach, archive location.

---

## 0.1 Resolved Decisions (Feb 6, 2026)

- **BCP schema source:** `BCP_REPORT_SNIF0726.csv` confirmed as the canonical sample.
- **Restrictions & liens:** Hard-block withdrawals when restrictions/liens are present.
- **Available balance:** Use `current_balance` only.
- **Ledger rules:** Summary row confirmed; voids appear as original + reversal.
- **Auth strategy:** Local credentials only (no SSO/LDAP).

---

## 0.2 BCP Schema (From `BCP_REPORT_SNIF0726.csv`)

The sample file has 20 columns, with the final column empty across rows. We will treat this as a trailing delimiter and ignore the last blank column, yielding **19 effective fields**.

1. `account_key` (חן קלע) — string/number, required
2. `full_account_number` (חן אופק) — string, 12 digits
3. `account_name` (שם חשבון) — string
4. `operation_restrictions` (חסימות קודי פעולה) — string, empty allowed
5. `current_balance` (יתרת עו"ש נוכחית) — decimal(15,2)
6. `held_balance` (יתרת עו"ש מעוכבת) — decimal(15,2)
7. `fx_supplementary_accounts` (יתרת חשבונות נספחים עו"ש מט"ח) — decimal(15,2)
8. `loans` (הלוואות) — decimal(15,2)
9. `deposits` (פקדונות) — decimal(15,2)
10. `savings_plans` (תוכניות חסכון) — decimal(15,2)
11. `securities` (ניירות ערך) — decimal(15,2)
12. `guarantees` (ערבויות) — decimal(15,2)
13. `liens` (עיקולים) — decimal(15,2)
14. `pledges` (שיעבודים) — decimal(15,2)
15. `annual_debit_turnover` (מחזור חובה שנתי) — decimal(15,2)
16. `total_credit_lines` (סך קווי אשראי) — decimal(15,2)
17. `next_visa_charge` (חיוב ויזה קרוב) — decimal(15,2)
18. `visa_debt` (חוב ויזה) — decimal(15,2)
19. `markers` (סמנים) — string, empty allowed

Notes:
- All decimals parsed with `.`; empty values treated as `0`.
- Enforce UTF-8 BOM on input.

---

## 1. High-Level Phases Overview

| Phase | Focus | Duration (est.) | Outcome |
|-------|--------|------------------|---------|
| **P0** | Foundation & infra | 2–3 weeks | Auth, RBAC, data model, day cycle state machine |
| **P1** | Admin & data pipeline | 2–3 weeks | Branch config, BCP upload/validation, day open/close, ledger export |
| **P2** | Teller & Branch Manager UX | 2–3 weeks | Customer search, account detail, transaction entry, dashboards |
| **P3** | Hardening & compliance | 1–2 weeks | Audit trail, security hardening, RTL/i18n, accessibility |
| **P4** | NFRs & go-live | 1–2 weeks | Performance, backup, monitoring, UAT |

Total rough estimate: **8–13 weeks** for a single full-time team (backend + frontend).

---

## 1.1 Definition of Done (Applies to Every Phase)

- Acceptance criteria met and documented.
- Feature-flagged or role-gated where relevant.
- Unit tests added for all new services and validators.
- Integration tests added for API flows in scope.
- No P1+ security issues unresolved.

---

## 2. Phase 0: Foundation (Weeks 1–3)

**Goal:** Running app with auth, roles, branch/day model, and no business logic yet.

### 2.1 Stack & project setup
- **Backend:** Choose stack (e.g. Node/Express, .NET, Spring Boot) with:
  - DB with strong transactional support (PostgreSQL recommended for decimal/JSON/constraints).
  - Migrations for schema (e.g. Flyway, Liquibase, or framework migrations).
- **Frontend:** SPA (e.g. React/Vue) with RTL-ready setup (e.g. `dir="rtl"`, CSS logical properties).
- **Repo:** Monorepo or separate repos; ensure CI (lint, tests, build).

**Deliverables:** Repo structure, DB, basic “hello world” API + minimal UI, dev/run scripts.

### 2.2 Data model (Core entities only)
Implement and migrate:

- **Branch** — `branch_code` (PK), `branch_name`, `status`, timestamps.
- **User** — all PRD §7.1 fields (including `role`, `branch_code`, `status`, `failed_login_count`, `locked_until`).
- **DayCycle** — `business_date` (PK), `state`, `opened_at/closed_at`, `opened_by/closed_by`, `branches_loaded`, `total_accounts_loaded`, `ledger_record_count`.

Defer: **Account**, **Transaction**, **AuditLog** until P1/P2.

**Deliverables:** Migrations, seed script for one branch + one admin user, basic CRUD APIs (internal use only).

### 2.3 Authentication & RBAC
- **Auth:**
  - Registration API (creates user with `role=NONE`, `status=PENDING_APPROVAL`).
  - Login: verify credentials, check `status` and `locked_until`, increment/reset `failed_login_count`, issue session.
  - Password rules: min 8 chars, upper/lower/digit/special; store bcrypt (cost ≥ 12).
- **Session:** Server-side sessions, HTTP-only secure cookies, 15-min inactivity timeout.
- **RBAC middleware:** On every request, resolve user → role + branch; reject if no role (except “pending approval” path). Enforce:
  - Admin: no branch scope.
  - Branch Manager / Teller: scope all data by `branch_code`.

**Deliverables:** Register, login, logout, session middleware, role/branch resolution, “pending approval” redirect.

### 2.4 Screens 1–3 (Login, Registration, Pending Approval)
- **Screen 1 – Login:** Form (username, password), “Register” link, system status banner (day OPEN/CLOSED — can be mock in P0).
- **Screen 2 – Registration:** Full name, employee ID, username, password, confirm password, requested branch (dropdown from Branch list). Submit → “pending approval” message.
- **Screen 3 – Pending Approval:** Message + read-only registration details, Logout only.

**Deliverables:** All three screens wired to APIs; no navigation beyond login/register/pending.

### 2.5 Day state machine (logic only)
- Implement **DayCycle** state transitions as per PRD §4.1: `CLOSED → LOADING → OPEN → CLOSING → RECONCILING → CLOSED`.
- Expose a single internal API (e.g. `GET /api/day/current`) returning `business_date`, `state`, and any metadata.
- No CSV or ledger yet; transitions can be triggered by simple Admin actions (e.g. “Open Day” / “Close Day” buttons that only change state for testing).

**Deliverables:** Day state machine, one API for current day state, guarded so only Admin can trigger transitions.

### 2.6 Acceptance Criteria (P0)
- Admin can register, login, and access a dashboard shell.
- RBAC enforced for Admin vs. non-Admin routes.
- Day state can be viewed and toggled by Admin only.
- All screens 1–3 are fully wired and error-handling works.

---

## 3. Phase 1: Admin & Data Pipeline (Weeks 4–6)

**Goal:** Admin can manage branches, load BCP files, open/close day, and download ledger CSVs.

### 3.1 Branch Configuration (Screen 6)
- **BRANCH_MASTER.csv** upload: parse, validate (`branch_code`, `branch_name`, `branch_status`), upsert Branch rows.
- UI: file upload (drag-and-drop), validation errors, table of branches (code, name, status, assigned user count).
- Toggle branch status (ACTIVE/INACTIVE); rule: no status change that would drop to zero admins.

**Deliverables:** Branch CRUD + CSV import API, Screen 6 implemented.

### 3.2 BCP CSV parser & validator
- **Parser:** UTF-8 BOM, comma delimiter, 19 columns per §0.2.
- **Validation:**
  - Filename: `BCP_REPORT_SNIF{branch_code}.csv`; `branch_code` must exist in Branch table.
  - Required fields, types (integer, decimal 15,2, string lengths), no invalid decimals.
  - Referential: branch from filename.
- On failure: return structured error report (file name, line numbers, messages). Do **not** partially load.
- On success: return row count and a short summary (e.g. total accounts, sum of current balance).

**Deliverables:** BCP parser service, validation rules, error report format; unit tests with sample CSVs (valid + invalid).

### 3.3 Account model & day-scoped load
- **Account** entity: all BCP-mapped fields per §0.2 (including `branch_code`, `opening_balance`, `version`, `loaded_date`).
- **Load semantics:** One BCP file = one branch for one business day. When loading:
  - Day must be in `CLOSED`; transition to `LOADING` during processing.
  - Insert/update Account rows for that `(branch_code, loaded_date)`; use `account_key` (and branch/date) as natural key (last occurrence wins per PRD).
  - Recompute `total_accounts_loaded` for the day; then transition to `OPEN` (or back to `CLOSED` if load failed).
- **Constraint:** No BCP upload when day is already `OPEN`.

**Deliverables:** Account migration, load service, integration with day state machine.

### 3.4 Day Management UI (Screen 7)
- **Start-of-day panel:**
  - Multi-file upload for `BCP_REPORT_SNIF*.csv`.
  - Per-file validation result (pass/fail + error details).
  - Summary table: branches loaded, record counts, total opening balance per branch.
  - “Open Business Day” (enabled when at least one file passed), with confirmation.
- **End-of-day panel:**
  - Transaction summary (placeholder until P2: 0 transactions).
  - “Initiate Day Close” → check in-flight transactions (none in P1) → transition to CLOSING.
  - Ledger generation (see 3.5) → “Download” per branch + “Download All” (ZIP).
  - “Confirm Day Close” → transition to CLOSED.

**Deliverables:** Screen 7 fully wired; day open/close flow working with real BCP files.

### 3.5 Ledger generation & export
- **Ledger format:** Per PRD §4.5.2: `BT_LEDGER_SNIF{branch_code}_{YYYYMMDD}.csv`, UTF-8 BOM, 15 columns.
- **Content:** All transactions for that branch for the business day (in P1 this is empty; structure still implemented).
- **Summary row:** Last row `transaction_id='SUMMARY'` with totals (deposits, withdrawals, net, count).
- **Void handling:** Original tx with status VOIDED; reversal tx with `void_reference`; both in ledger.
- **API:** Generate on day close (or on-demand in RECONCILING). Support download single file and “all branches” ZIP.

**Deliverables:** Ledger CSV generator (with SUMMARY row), download APIs, integration with Day Management.

### 3.6 User Management (Screen 5)
- List users: filters (role, branch, status), search (name, employee ID, username).
- Pending registrations highlighted; “Approve” → modal to set role (Branch Manager / Teller) and branch → set `ACTIVE`.
- Change role / change branch (with confirmation); rule: cannot demote last Admin.
- Deactivate / reactivate; reset password (temp password, force change on next login); unlock account.

**Deliverables:** User Management API and Screen 5.

### 3.7 Acceptance Criteria (P1)
- Branch master import validates and upserts correctly with error reporting.
- BCP upload rejects invalid files with clear line-level errors.
- Day opens only after successful BCP load; day close generates ledger files.
- Ledger export matches naming + schema requirements with SUMMARY row.
- Admin can approve a pending user and assign role + branch.

---

## 4. Phase 2: Teller & Branch Manager UX (Weeks 7–9)

**Goal:** Tellers and Branch Managers can search customers, view accounts, and process/void transactions.

### 4.1 Transaction model & integrity
- **Transaction** entity per PRD §7.1; **AuditLog** entity (minimal fields first).
- **Transaction service:**
  - Atomic: update Account `current_balance` + `version`, insert Transaction (+ optional AuditLog).
  - Optimistic locking: check `Account.version` before update; on conflict return “Balance changed, please resubmit.”
  - Transaction ID: `TXN-{branch}-{YYYYMMDD}-{seq}` (sequence per branch per day).
  - Rules: no overdraft (withdrawal ≤ available balance); block if account has `operation_restrictions`; liens block withdrawals.

**Deliverables:** Transaction and AuditLog migrations, transaction service with balance and restriction checks, idempotency consideration for retries.

### 4.2 Customer Search (Screen 8)
- **API:** Search by account name, account key, or full account number. Scope by user’s branch (Teller/Branch Manager) or unfiltered (Admin).
- **Response:** Account key, name, current balance, restriction indicator, markers; optionally lien/guarantee/pledge flags.
- **UI:** Type-ahead, results table with red lock (restricted), red triangle (liens). Click row → Account Detail.

**Deliverables:** Search API with strict branch scoping, Screen 8.

### 4.3 Account Detail & Transaction Entry (Screen 9)
- **Layout:** Header (name, keys, branch, markers); restriction/lien banners; left: balances (current, held, available, opening, net change) + read-only financial profile; right: today’s transaction history; bottom (Teller only): transaction entry.
- **Transaction entry:** Type (Deposit/Withdrawal), amount, reference note; running balance preview; withdrawal blocked if amount > available balance.
- **Confirmation dialog** then submit; success → update balance and history; optional receipt (printable HTML/PDF).
- **Void:** Teller voids own same-day tx; Branch Manager/Admin can void in scope. Create reversal tx and mark original VOIDED.

**Deliverables:** Account detail API (full BCP-derived view + today’s transactions), transaction submit/void APIs, Screen 9 with receipt stub.

### 4.4 Dashboards (Screen 4)
- **Admin:** Day Management card, User Management card (pending count), branch overview (tellers online, tx count, deposit/withdrawal volume), system alerts placeholder.
- **Branch Manager:** Branch summary (today’s tx count, deposits, withdrawals, net); teller status list; quick search.
- **Teller:** Quick search prominent; “My recent transactions” (last 10); shift summary (counts and totals).

**Deliverables:** Role-adaptive dashboard with real data; “tellers online” can be session-based or heartbeat.

### 4.5 Acceptance Criteria (P2)
- Teller can search account, view detail, submit deposit/withdrawal.
- Withdrawal fails on insufficient funds or restrictions.
- Optimistic lock failure returns actionable error and no balance drift.
- Void creates reversal and updates ledger status correctly.
- Branch Manager can view branch dashboard and teller status.

---

## 5. Phase 3: Hardening & Compliance (Weeks 10–11)

**Goal:** Audit trail, security hardening, RTL/Hebrew, accessibility.

### 5.1 Audit trail
- **AuditLog:** Every state change: login, transaction, void, role/branch change, day open/close, CSV upload/download.
- Fields: timestamp (UTC), action_type, actor_user_id, target_type, target_id, before_state, after_state, ip_address, session_id.
- Immutable: no update/delete; write-only.
- **Retention:** Design for 7-year retention (e.g. partitioning or archive policy).

**Deliverables:** Audit logging on all critical actions, retention strategy documented.

### 5.2 Security
- HTTPS only; TLS 1.2+.
- CSRF on state-changing requests.
- Input validation/sanitization (client + server).
- Account lockout: 5 failed attempts → lock 15 minutes, notify Admin (in-app or email).
- No sensitive data in logs (no passwords, no full account numbers in debug logs).

**Deliverables:** Security checklist implemented and reviewed.

### 5.3 RTL & locale
- Full RTL layout for Hebrew; `dir="rtl"` and CSS logical properties.
- Number formatting: Hebrew locale (e.g. thousands separator).
- UTF-8 end-to-end; BOM for CSV exports per PRD.

**Deliverables:** UI fully RTL-correct; CSV encoding verified.

### 5.4 Accessibility (WCAG 2.1 AA)
- Keyboard navigation for main flows (login, search, transaction, confirm).
- Screen reader–friendly labels and live regions for success/error.
- Focus management in modals and after submit.

**Deliverables:** Accessibility pass and fix list; critical paths keyboard + screen reader tested.

### 5.5 Acceptance Criteria (P3)
- Audit logs cover all critical actions with immutable storage.
- Security checks pass for CSRF, lockout, TLS, and logging hygiene.
- RTL layout and Hebrew locale verified for all primary screens.
- Accessibility baseline met for login, search, transaction, and modals.

---

## 6. Phase 4: NFRs & Go-Live (Weeks 12–13)

**Goal:** Performance, backup, monitoring, UAT.

### 6.1 Performance & scale
- Target: 500+ concurrent teller sessions; < 500 ms transaction latency; 100 tx/s system-wide.
- BCP: 100k rows per branch, 500k total, process within 5 minutes (chunked/batch insert, background job if needed).
- DB: indexes on (branch_code, loaded_date), (branch_code, account_key), (business_date, branch_code, timestamp); connection pooling.

**Deliverables:** Load test report; tuning (DB, app) to meet targets.

### 6.2 Backup & recovery
- Hourly DB backups during business hours; point-in-time recovery.
- RPO < 1 hour, RTO < 30 minutes; restore runbook.

**Deliverables:** Backup automation and runbook.

### 6.3 Monitoring & ops
- Health endpoint (DB, session store).
- Alerts: day state, failed logins, high error rate, long-running BCP processing.
- Logging: structured logs; no PII in default logs.

**Deliverables:** Health checks, alerting rules, log standards.

### 6.4 UAT & sign-off
- Test scenarios from PRD: day cycle, BCP valid/invalid, transactions, voids, restrictions, overdraft, concurrent conflict, day close with in-flight.
- Error-handling matrix (PRD §9) covered by automated or manual tests.

**Deliverables:** UAT scenarios, bug fix round, stakeholder sign-off.

### 6.5 Acceptance Criteria (P4)
- Load test meets concurrency and latency targets.
- Backup/restore verified with documented RPO/RTO.
- Monitoring alerts tested for critical flows.
- UAT sign-off recorded with no P1 blockers.

---

## 7. Dependency Summary

```
P0 (Foundation)
  ├── Auth + RBAC
  ├── User, Branch, DayCycle
  ├── Screens 1–3
  └── Day state machine

P1 (Admin & data)
  ├── Branch config + BRANCH_MASTER
  ├── BCP parser/validator → Account load
  ├── Day Management UI + open/close
  ├── Ledger generation + download
  └── User Management (Screen 5)

P2 (Teller/BM)
  ├── Transaction + AuditLog (minimal)
  ├── Transaction service (atomic, optimistic lock)
  ├── Customer Search (Screen 8)
  ├── Account Detail + Transaction Entry (Screen 9)
  └── Dashboards (Screen 4)

P3 (Hardening)
  ├── Full audit trail
  ├── Security + RTL + a11y

P4 (Go-live)
  ├── Performance + backup + monitoring
  └── UAT
```

---

## 8. Test Strategy

- **Unit tests:** CSV parsers, validators, day state transitions, transaction rules.
- **Integration tests:** Auth/RBAC, BCP upload, day open/close, ledger export, transaction commit/void.
- **Golden-file tests:** Validate ledger CSV structure and SUMMARY row totals.
- **Concurrency tests:** Two tellers on same account to validate optimistic locking.
- **Security tests:** Session timeout, lockout, CSRF, and role boundary checks.
- **RTL/a11y checks:** Snapshot and manual verification for primary workflows.

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| BCP format drift from core banking | Lock spec to PRD; add validation tests with bank sample files early (P1). |
| Concurrency bugs on same account | Optimistic locking + integration tests simulating two tellers on same account. |
| RTL/locale bugs | Use RTL from P0; Hebrew and number formatting in P3 with dedicated QA. |
| Scope creep (e.g. maker-checker) | Keep PRD §10 “Out of Scope” explicit; change control for new features. |

---

## 10. Suggested Next Steps

1. **Confirm stack** (backend, frontend, DB, hosting) and set up repo/CI (P0.1).
2. **Implement P0** end-to-end: one Admin can register, log in, see “day state” (mock), and log out.
3. **Obtain sample BCP and BRANCH_MASTER files** (anonymized) and add them to test fixtures for P1.
4. **Finalize open decisions** listed in section 0.

---

## 11. Current Status & Immediate Plan (Updated Feb 6, 2026)

### 11.1 Current implementation status

Completed (in repo):
- Monorepo with API + Web apps and CI workflow.
- Prisma schema and initial migration for `Branch`, `User`, `DayCycle`.
- `Account` model and migration for day-scoped BCP data persistence.
- Auth APIs: register, login, logout, session-backed auth, lockout behavior.
- RBAC middleware and Admin-only routes.
- P0 screens: login, registration, pending, dashboard shell.
- Admin screens: pending approvals, branch CSV import, BCP validator.
- BCP validator service with row extraction for persistence and unit tests.
- Admin day APIs for guarded transition checks plus explicit `open`/`close`/`reconcile`/`close-confirm` actions.
- Integration-style API test scaffold for day flow and BCP load guards.
- Ledger export APIs for single branch CSV and all-branches ZIP based on loaded day branches.
- Dashboard wiring for day-state actions and ledger downloads.
- User Management API expanded for filtering, role/status/branch updates, and account unlock.
- Admin approvals screen expanded with user management controls.
- Transaction model and core transaction APIs added (search, account detail, create, void) with role/branch/day guards.
- P2 backend foundation tests added for transaction rules (insufficient funds, restrictions, successful deposit).
- AuditLog model added with API audit writes for day transitions and transaction create/void flows.
- Admin audit trail query API and web screen added with filtering by action/entity/user/branch/date.
- Audit CSV export endpoint and admin UI action added.
- Retention workflow hook added via admin-run endpoint (dry-run/execute with cutoff reporting).
- Retention policy endpoint and in-process scheduler added (env-driven cadence, default window, dry-run mode).
- Optional archive-file output added for retention execution when archive directory is configured.
- Retention monitoring/status endpoints added (`status` + recent `history`) and surfaced in admin audit UI.
- Scheduler now records explicit `AUDIT_RETENTION_ERROR` entries when scheduled runs fail.
- AuditLog schema expanded with `before_state`, `after_state`, `ip_address`, and `session_id` context fields.
- Auth/day/transaction/admin critical state changes now persist richer audit context and state snapshots.
- Web shell now defaults to RTL (`lang=he`, `dir=rtl`) with accessibility baseline improvements (skip-link, focus-visible, live regions).
- Key auth/admin pages hardened for a11y messaging (assertive alerts, polite status updates, safer form semantics).
- Remaining teller/admin data screens hardened with table semantics, aria-busy states, and error live regions.
- Webhook-based operational alert channel added for scheduled retention failures.
- Ops runbook created with alert ownership, triage, escalation, and recovery checklist.
- Date/time rendering standardized to `he-IL` locale formatting across dashboards/audit/admin views.
- Accessibility regression suite added in web tests to guard labels, ARIA table roles, and key live-region semantics.
- UAT scenario pack and error-handling matrix documented for pre-release validation.
- API integration coverage expanded for Branch Manager branch-override behavior (branch list, cross-branch search, account detail).
- Dashboard summary API added with role-scoped daily totals/recent transactions, and web dashboard updated to render role-adaptive activity panels.
- Branch Manager dashboard expanded with branch teller-activity summary (`txCount` + last activity) and API/UI test coverage.
- Teller reconciliation workflow added for close-day handoff (teller declared net submission + branch manager/admin discrepancy review) with API/UI test coverage.
- Operational readiness endpoint (`/health/ready`) added with DB + session-store probes and automated integration tests.
- Backup/recovery runbook documented with restore rehearsal and quarterly drill checklist.
- Admin ops endpoint added for recovery drill SLO evaluation (`RPO/RTO` pass-fail), with API/unit test coverage.
- Temporary day-state override endpoint removed; day transitions now occur only through guarded business endpoints.

Partially complete:
- Branch management supports import/list, but not richer operational constraints.

Not started yet:
- True day open/close orchestration, ledger generation/export.
- Audit trail review/reporting endpoints and retention workflow.
- External alerting integration and runbook (pager/slack/webhook) for retention failures.
- Full RTL/Hebrew copy pass and screen-by-screen accessibility audit (keyboard order, contrast, ARIA tables/forms).

### 11.2 Next execution slice (Sprint A: finish P1 core backend)

1. **Account ingestion path**
   - Add `Account` model + migration.
   - Persist validated BCP rows into day-scoped account data.
   - Enforce idempotent load semantics per `(branch_code, business_date, account_key)`.
2. **Day state machine enforcement**
   - Replace free-form set-state endpoint with guarded transitions:
   `CLOSED -> LOADING -> OPEN -> CLOSING -> RECONCILING -> CLOSED`.
   - Prevent BCP upload when state is not valid for load.
3. **Admin day management APIs**
   - Add open-day and close-day intent endpoints.
   - Track `branches_loaded`, `total_accounts_loaded`, `ledger_record_count`.
4. **P1 integration tests**
   - Valid/invalid BCP upload.
   - Transition guard tests.
   - Account load side-effects and rollback-on-failure.

Exit criteria for Sprint A:
- At least one branch BCP can be uploaded and persisted for today.
- Day can be opened only after successful load.
- Invalid uploads cannot mutate persisted account data.

### 11.3 Following slice (Sprint B: P1 completion)

1. Implement ledger CSV generator and download APIs (single branch + all-branches bundle).
2. Wire dashboard/admin screens to real open/close flow and load summaries.
3. Expand user management actions beyond approve (role/branch/status maintenance).
4. Add golden-file tests for ledger schema and SUMMARY row behavior.

Exit criteria for Sprint B:
- End-of-day close produces downloadable ledger files with required naming/columns.
- Admin can complete open-day to close-day flow without manual DB edits.

### 11.4 Open decisions still blocking later phases

- 7-year retention implementation detail (partitioning/archive target).
- Final hosting/ops baseline for backups, monitoring, and alerting.

---

## 12. Planning Completion (Updated Feb 8, 2026)

Planning is considered complete and execution-ready. The following artifacts now define the remaining path to release:

1. Planning closeout summary:
   - `/Users/tsachil/Projects/myapps/netek2/PLANNING_CLOSEOUT.md`
2. Go-live execution queue:
   - `/Users/tsachil/Projects/myapps/netek2/GO_LIVE_EXECUTION_QUEUE.md`
3. UAT scenarios and error matrix:
   - `/Users/tsachil/Projects/myapps/netek2/UAT_SCENARIOS.md`
4. UAT sign-off form:
   - `/Users/tsachil/Projects/myapps/netek2/UAT_SIGNOFF_TEMPLATE.md`
5. Ops response runbook:
   - `/Users/tsachil/Projects/myapps/netek2/OPS_RUNBOOK.md`
6. Backup and recovery runbook:
   - `/Users/tsachil/Projects/myapps/netek2/BACKUP_RECOVERY_RUNBOOK.md`

Execution should now follow the go-live queue and release gate, without creating additional top-level planning documents unless scope changes.
