# BT-CTS UAT Execution Log

Date: February 8, 2026  
Environment: Local integration workspace (`/Users/tsachil/Projects/myapps/netek2`)

## Automated Coverage Mapping
1. UAT-01 Login and role routing: Covered by web route/auth tests.
2. UAT-02 BCP upload success: Covered by API day/BCP integration tests.
3. UAT-03 BCP upload validation failure: Covered by BCP validator and integration tests.
4. UAT-04 Day lifecycle transitions: Covered by day API integration flow.
5. UAT-05 Branch manager branch override search: Covered by branch manager scope integration tests + web search tests.
6. UAT-06 Teller branch lock behavior: Covered by account search web tests.
7. UAT-07 Deposit success: Covered by transactions integration tests.
8. UAT-08 Withdrawal blocked by restrictions/liens: Covered by transactions integration tests.
9. UAT-09 Insufficient funds: Covered by transactions integration tests.
10. UAT-10 Optimistic locking conflict: Covered by transaction conflict integration tests.
11. UAT-11 Same-day void flow: Covered by transactions integration tests.
12. UAT-12 Ledger download: Covered by ledger/day integration tests.

## Execution Evidence
1. Full workspace regression: `npm test` passed.
2. CI gate command: `npm run check:ci` prepared (run in CI runner for final authoritative result).
3. Readiness failure simulation: health integration suite includes DB/session failure scenarios.

## Manual Staging Items Remaining
1. Visual walkthrough and screenshot evidence for each UAT scenario in staging.
2. Stakeholder sign-off signatures (Product/Engineering/Ops).
