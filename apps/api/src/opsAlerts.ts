export type OpsAlertPayload = {
  eventType: string;
  severity: "INFO" | "WARN" | "ERROR" | "CRITICAL";
  message: string;
  source: string;
  details?: Record<string, unknown>;
};

type OpsAlertConfig = {
  webhookUrl: string | null;
  webhookToken: string | null;
};

function loadOpsAlertConfigFromEnv(): OpsAlertConfig {
  return {
    webhookUrl: process.env.OPS_ALERT_WEBHOOK_URL?.trim() || null,
    webhookToken: process.env.OPS_ALERT_WEBHOOK_TOKEN?.trim() || null
  };
}

export async function sendOpsAlert(payload: OpsAlertPayload): Promise<boolean> {
  const config = loadOpsAlertConfigFromEnv();
  if (!config.webhookUrl) {
    return false;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (config.webhookToken) {
    headers.Authorization = `Bearer ${config.webhookToken}`;
  }

  try {
    const res = await fetch(config.webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...payload,
        timestamp: new Date().toISOString()
      })
    });
    return res.ok;
  } catch {
    return false;
  }
}
