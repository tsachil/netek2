type RecoverySloInput = {
  backupCompletedAt: string;
  restorePointAt: string;
  restoreCompletedAt: string;
  targetRpoMinutes: number;
  targetRtoMinutes: number;
};

function toDate(value: string, field: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`INVALID_DATE_${field.toUpperCase()}`);
  }
  return parsed;
}

export function evaluateRecoverySlo(input: RecoverySloInput) {
  const backupCompletedAt = toDate(input.backupCompletedAt, "backupCompletedAt");
  const restorePointAt = toDate(input.restorePointAt, "restorePointAt");
  const restoreCompletedAt = toDate(input.restoreCompletedAt, "restoreCompletedAt");

  const rpoMinutes = Number(
    ((backupCompletedAt.getTime() - restorePointAt.getTime()) / 60_000).toFixed(2)
  );
  const rtoMinutes = Number(
    ((restoreCompletedAt.getTime() - backupCompletedAt.getTime()) / 60_000).toFixed(2)
  );

  if (rpoMinutes < 0) {
    throw new Error("INVALID_SEQUENCE_RPO_NEGATIVE");
  }
  if (rtoMinutes < 0) {
    throw new Error("INVALID_SEQUENCE_RTO_NEGATIVE");
  }

  return {
    measured: {
      rpoMinutes,
      rtoMinutes
    },
    target: {
      rpoMinutes: input.targetRpoMinutes,
      rtoMinutes: input.targetRtoMinutes
    },
    pass: {
      rpo: rpoMinutes <= input.targetRpoMinutes,
      rto: rtoMinutes <= input.targetRtoMinutes
    },
    overallPass: rpoMinutes <= input.targetRpoMinutes && rtoMinutes <= input.targetRtoMinutes
  };
}
