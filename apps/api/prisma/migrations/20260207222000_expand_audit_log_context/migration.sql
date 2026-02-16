ALTER TABLE "AuditLog"
  ADD COLUMN "beforeState" JSONB,
  ADD COLUMN "afterState" JSONB,
  ADD COLUMN "ipAddress" TEXT,
  ADD COLUMN "sessionId" TEXT;

CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
