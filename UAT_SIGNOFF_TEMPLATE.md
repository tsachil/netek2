# BT-CTS UAT Sign-off Template

Release Candidate: ____________________
Environment: ____________________
Date: ____________________
Prepared by: ____________________

## 1. Scope
Referenced scenario set:
- `/Users/tsachil/Projects/myapps/netek2/UAT_SCENARIOS.md`

Executed scenario IDs:
- [ ] UAT-01 Login and role routing
- [ ] UAT-02 BCP upload success
- [ ] UAT-03 BCP upload validation failure
- [ ] UAT-04 Day lifecycle transitions
- [ ] UAT-05 Branch manager branch override search
- [ ] UAT-06 Teller branch lock behavior
- [ ] UAT-07 Deposit success
- [ ] UAT-08 Withdrawal blocked by restrictions/liens
- [ ] UAT-09 Insufficient funds
- [ ] UAT-10 Optimistic locking conflict
- [ ] UAT-11 Same-day void flow
- [ ] UAT-12 Ledger download

## 2. Defect Summary
Blockers (P1 severity): ______
High (P2 severity): ______
Medium/Low: ______

Open blocker references:
1. ____________________
2. ____________________

## 3. Operational Validation
- [ ] `/health` returns 200
- [ ] `/health/ready` returns 200
- [ ] Backup restore rehearsal completed
- [ ] Recovery SLO evaluated with `/api/admin/ops/recovery-evaluate`

Measured recovery values:
- RPO (minutes): ______
- RTO (minutes): ______
- Target met: [ ] Yes [ ] No

## 4. Security and Access Checks
- [ ] RBAC boundaries validated (Admin / Branch Manager / Teller)
- [ ] Session timeout and lockout behavior validated
- [ ] Sensitive data exposure check completed

## 5. Sign-off Decision
Decision:
- [ ] APPROVED FOR RELEASE
- [ ] CONDITIONAL APPROVAL
- [ ] REJECTED

Conditions / comments:
____________________________________________________________
____________________________________________________________

## 6. Approvers
Product Owner: ____________________  Date: __________
Engineering Lead: ____________________  Date: __________
Operations Lead: ____________________  Date: __________
