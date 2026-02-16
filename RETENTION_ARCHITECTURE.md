# BT-CTS Audit Retention Architecture (7-Year Policy)

Last updated: February 8, 2026

## Objective
Provide a durable, auditable, low-risk retention design for `AuditLog` that meets a 7-year policy while preserving query performance for recent operations.

## Data Lifecycle
1. Hot tier (0-90 days):
   - Primary PostgreSQL `AuditLog` table.
   - Indexed for operational queries and admin UI filters.
2. Warm tier (90 days - 24 months):
   - Monthly partitions in PostgreSQL archive schema.
   - Read-only access for compliance and investigation.
3. Cold tier (24 months - 7 years):
   - Compressed immutable archive files (JSONL/CSV) in object storage.
   - Metadata catalog kept in PostgreSQL for lookup by date/action/entity.
4. Expiry:
   - Data older than 7 years is eligible for purge after legal hold checks.

## Partitioning and Archival Strategy
1. Partition key: `createdAt` (monthly partitions).
2. Archive unit: one file per partition and action-date window.
3. Integrity:
   - SHA-256 checksum per archive file.
   - Archive manifest with row count and hash.
4. Immutability:
   - Object storage bucket with write-once retention lock where available.

## Operational Flow
1. Scheduled retention job computes cutoff by policy.
2. Dry-run mode reports matched rows before deletion.
3. Execute mode:
   - Export rows to archive file (if configured).
   - Verify checksum and manifest write.
   - Delete only after successful archive confirmation.
4. Write `AUDIT_RETENTION_RUN` and error events to `AuditLog`.

## Recovery and Verification
1. Archive restore test quarterly:
   - Rehydrate selected archive slice into staging.
   - Run integrity check against manifest hash.
2. Compliance evidence:
   - Keep retention job history + archive manifest logs for 7 years.

## Ownership
1. Platform team owns scheduler and alerting.
2. DBA team owns partition maintenance and storage lifecycle.
3. Security/compliance owner approves retention policy changes.

## Current Implementation Mapping
Implemented now:
1. Scheduler + policy controls.
2. Dry-run/execute API workflow.
3. Optional archive file output.
4. Status/history APIs and alerting hooks.

Next hardening steps:
1. Introduce native table partitioning migration for `AuditLog`.
2. Add archive manifest table and checksum persistence.
3. Add legal-hold allowlist before delete.
