// netlify/functions/wc.js — proxy for worldcup26.ir (unngår CORS)
import { connectLambda, getStore } from "@netlify/blobs";

const ALLOWED = ["groups", "games", "teams", "stadiums"];
const CACHE_STORE = "vm2026";
const CACHE_PREFIX = "world-cup-feed/";
const CACHE_TTL_MS = {
  games: 5 * 60 * 1000,
  groups: 5 * 60 * 1000,
  teams: 24 * 60 * 60 * 1000,
  stadiums: 24 * 60 * 60 * 1000,
};
const UPSTREAM_TIMEOUT_MS = 20_000;

const response = (statusCode, headers, body) => ({
  statusCode,
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

function cacheIsFresh(entry, endpoint) {
  return Number.isFinite(entry?.cachedAt) && Date.now() - entry.cachedAt < CACHE_TTL_MS[endpoint];
}

export const handler = async (event) => {
  const headers = {
    "Cache-Control": "s-maxage=60, stale-while-revalidate=30",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };
  if (event.httpMethod !== "GET") return response(405, headers, { error: "Metoden støttes ikke" });

  const endpoint = event.queryStringParameters?.endpoint;
  if (!ALLOWED.includes(endpoint)) {
    return response(400, headers, { error: "Ugyldig endpoint" });
  }

  // This function uses Lambda-compatible syntax, so Blobs must be initialized
  // from the event before getStore(). A cache failure must never block fixtures.
  let store = null;
  let cached = null;
  try {
    connectLambda(event);
    store = getStore(CACHE_STORE);
    cached = await store.get(`${CACHE_PREFIX}${endpoint}`, { type: "json" });
  } catch (error) {
    console.warn("Live fixture cache unavailable:", error.message);
  }

  if (cacheIsFresh(cached, endpoint)) {
    return response(200, { ...headers, "X-WC-Cache": "blob" }, cached.data);
  }

  try {
    const upstream = await fetch(`https://worldcup26.ir/get/${endpoint}`, {
      headers: { "User-Agent": "vm-konkurranse/1.0" },
      // The games feed can legitimately take 10–12 seconds. Let the homepage
      // retain its visual fallback while this first request primes Blob cache.
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!upstream.ok) {
      throw new Error(`Upstream svarte med ${upstream.status}`);
    }

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Upstream returnerte ikke gyldig JSON");
    }

    if (store) {
      try {
        await store.setJSON(`${CACHE_PREFIX}${endpoint}`, { cachedAt: Date.now(), data });
      } catch (error) {
        console.warn("Kunne ikke oppdatere live fixture-cache:", error.message);
      }
    }
    return response(200, { ...headers, "X-WC-Cache": "upstream" }, data);
  } catch (e) {
    // Never leave a new visitor with an empty page if the provider is slow or
    // temporarily unavailable: the last shared payload is still useful.
    if (cached?.data) {
      return response(200, { ...headers, "X-WC-Cache": "stale-blob" }, cached.data);
    }
    return response(502, headers, { error: e.message || "Live-kilden er utilgjengelig" });
  }
};

export const config = {
  rateLimit: {
    windowLimit: 60,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};
