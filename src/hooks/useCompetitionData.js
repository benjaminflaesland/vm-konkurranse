import { useMemo } from "react";

const PUBLIC_CACHE_KEY = "vm2026_public_cache_v1";

function readPublicCache() {
  try {
    const cached = localStorage.getItem(PUBLIC_CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
}

function writePublicCache(data) {
  try {
    localStorage.setItem(PUBLIC_CACHE_KEY, JSON.stringify(data));
  } catch { /* Nettleseren kan blokkere lokal lagring; serverdata er fortsatt gyldige. */ }
}

async function load({ allowPublicCache = false } = {}) {
  try {
    const response = await fetch("/.netlify/functions/data", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body?.data?.participants) {
      if (allowPublicCache) writePublicCache(body.data);
      return body;
    }
    throw new Error(body.error || `Serveren svarte med ${response.status}`);
  } catch (error) {
    if (allowPublicCache) {
      const cached = readPublicCache();
      if (cached?.participants) return { data: cached, revision: null, cached: true };
    }
    throw error;
  }
}

async function save(data, baseRevision) {
  const response = await fetch("/.netlify/functions/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { ...data, schemaVersion: 5 }, baseRevision }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    const error = new Error(body.error || `Serveren svarte med ${response.status}`);
    error.status = response.status;
    error.revision = body.revision;
    throw error;
  }
  return body;
}

export function useCompetitionData() {
  return useMemo(() => ({ load, save, readPublicCache }), []);
}
