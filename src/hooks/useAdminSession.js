import { useMemo } from "react";

async function read() {
  const response = await fetch("/.netlify/functions/auth", { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Kunne ikke kontrollere adminsesjonen");
  return body;
}

async function create(password) {
  const response = await fetch("/.netlify/functions/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    const error = new Error(body.error || "Innlogging feilet");
    error.status = response.status;
    throw error;
  }
  return body;
}

async function destroy() {
  await fetch("/.netlify/functions/auth", { method: "DELETE" });
}

export function useAdminSession() {
  return useMemo(() => ({ read, create, destroy }), []);
}
