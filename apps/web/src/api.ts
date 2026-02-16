export async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "REQUEST_FAILED");
  }
  return res.json().catch(() => ({} as T));
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "REQUEST_FAILED");
  }
  return res.json();
}
