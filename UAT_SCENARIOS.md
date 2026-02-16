# BT-CTS UAT Scenarios

Last updated: February 7, 2026

## Scope
This UAT set validates the main business flows and error handling required for pre-release sign-off:
- Day lifecycle (open/close/reconcile/confirm)
- BCP upload (valid + invalid)
- Account search and detail
- Transaction create/void
- Restriction/insufficient funds/version conflict handling

## Preconditions
1. API and Web apps are running.
2. At least one `ADMIN`, one `BRANCH_MANAGER`, and one `TELLER` test user exist and are `ACTIVE`.
3. Branch master data is loaded and includes at least two active branches.
4. Test BCP files are available:
   - one valid file per branch
   - one invalid file (schema/content error)

## Test Data Baseline
Use accounts covering all key conditions:
1. Normal account (no restrictions, no liens)
2. Restricted account (`operation_restrictions` present)
3. Low-balance account (withdrawal should fail)
4. Account used for two concurrent transaction attempts

## UAT Scenarios

### UAT-01 Login and role routing
1. Login as `ADMIN`.
2. Verify redirect to account search screen.
3. Repeat for `BRANCH_MANAGER` and `TELLER`.
Expected:
- All roles land on account search by default.
- Navigation menu is visible for authenticated users.

### UAT-02 BCP upload success path
1. Login as `ADMIN`.
2. Open BCP screen and upload valid BCP file.
3. Verify summary appears and day metadata updates.
Expected:
- Upload succeeds.
- No validation errors.
- Summary shows branch code, row count, and total balance.

### UAT-03 BCP upload validation failure
1. Upload invalid BCP file.
Expected:
- Upload fails with clear error.
- Line-level errors are displayed.
- No partial account load is persisted.

### UAT-04 Day lifecycle transitions
1. From `LOADING`, trigger open day.
2. Trigger initiate close.
3. Trigger reconcile.
4. Trigger confirm close.
Expected:
- Only valid next action is enabled at each state.
- State changes follow:
  `LOADING -> OPEN -> CLOSING -> RECONCILING -> CLOSED`.

### UAT-05 Branch manager branch override search
1. Login as `BRANCH_MANAGER` assigned to branch A.
2. In account search, verify branch dropdown defaults to branch A.
3. Change to branch B and run search.
4. Open an account from branch B.
Expected:
- Branch manager can change branch selection.
- Account detail loads for selected branch without `ACCOUNT_NOT_FOUND`.

### UAT-06 Teller branch lock behavior
1. Login as `TELLER`.
2. Verify branch selector is fixed to assigned branch and cannot be changed.
3. Search and open account.
Expected:
- Branch is locked and always applied.
- Account detail loads correctly for teller branch.

### UAT-07 Deposit success
1. Open normal account.
2. Submit deposit.
Expected:
- Transaction created with `COMPLETED` status.
- Account balance increases.
- Transaction appears in history.

### UAT-08 Withdrawal blocked by restrictions/liens
1. Open restricted account.
2. Attempt withdrawal.
Expected:
- Operation is rejected.
- Error indicates withdrawal is blocked.
- No balance change.

### UAT-09 Insufficient funds
1. Open low-balance account.
2. Attempt withdrawal greater than current balance.
Expected:
- Operation is rejected with insufficient funds error.
- No balance change.

### UAT-10 Optimistic locking conflict
1. Open same account in two sessions.
2. Submit transaction in session A.
3. Submit transaction in session B with stale version.
Expected:
- Session B fails with version conflict.
- User sees actionable error and can reload/resubmit.

### UAT-11 Same-day void flow
1. Create a transaction.
2. Void it from an authorized user in scope.
Expected:
- Original transaction marked `VOIDED`.
- Reversal transaction is created.
- History reflects both records.

### UAT-12 Ledger download
1. As `ADMIN`, download single-branch ledger.
2. Download all ledgers ZIP.
Expected:
- Files are generated and downloadable.
- Naming convention is correct.
- Summary row exists.

### UAT-13 Branch manager XLSX import (Admin only)
1. Login as `ADMIN`.
2. Open user management screen and choose a valid `.xlsx` file for branch managers.
3. Click import button.
4. Verify summary counts (`totalRows`, `created`, `updated`) are displayed.
5. Verify imported users exist with:
   - `role=BRANCH_MANAGER`
   - `status=ACTIVE`
   - mapped `username` email and `branchCode`.
Expected:
- Import succeeds for valid file and shows summary counts.
- Invalid file returns structured validation errors.
- Non-admin users cannot access this action.

## Error Handling Matrix

| Code | Trigger | Expected UI behavior |
|---|---|---|
| `INVALID_INPUT` | malformed payload | show validation message and keep form state |
| `INVALID_BRANCH` | unknown branch code | show branch-specific error; no state mutation |
| `MISSING_QUERY` | empty account search query | prevent/deny search with clear prompt |
| `ACCOUNT_NOT_FOUND` | wrong account/branch scope | show not-found error and keep user on search/detail |
| `WITHDRAWAL_BLOCKED` | restrictions/liens present | block withdrawal, show reason |
| `INSUFFICIENT_FUNDS` | withdrawal > available | block withdrawal, show reason |
| `VERSION_CONFLICT` | stale account version | show conflict guidance and require reload |
| `DAY_NOT_OPEN` | transaction when day not `OPEN` | block action with day-state message |
| `VOID_ONLY_SAME_DAY` | void prior-day transaction | reject and explain policy |
| `FORBIDDEN` | role/scope violation | show access denied state and avoid silent failure |

## UAT Exit Criteria
1. All UAT scenarios pass on staging with evidence (screenshots or logs).
2. No open blocker severity issues in:
   - day lifecycle
   - transaction correctness
   - branch scoping
   - audit visibility
3. Error matrix has no unresolved P1/P2 behavior gaps.
4. Stakeholder sign-off is recorded.
