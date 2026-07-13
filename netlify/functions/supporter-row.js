import { connectLambda, getStore } from "@netlify/blobs";

const STORE_NAME = "vm2026";
const COUNT_KEY = "supporter-count-v2";
const LEGACY_ROW_PREFIX = "supporter-rows/";

const HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const response = (statusCode, body) => ({
  statusCode,
  headers: HEADERS,
  body: body === undefined ? "" : JSON.stringify(body),
});

async function legacyRowCount(store) {
  const pages = await store.list({ prefix: LEGACY_ROW_PREFIX, paginate: true });
  if (typeof pages?.[Symbol.asyncIterator] === "function") {
    let count = 0;
    for await (const page of pages) count += page.blobs.length;
    return count;
  }
  return pages?.blobs?.length || 0;
}

async function readCounter(store) {
  const current = await store.get(COUNT_KEY, { type: "json" });
  if (Number.isInteger(current?.count) && current.count >= 0) return current;
  const count = await legacyRowCount(store);
  const migrated = { count, migratedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await store.setJSON(COUNT_KEY, migrated);
  return migrated;
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return response(204);
  if (!["GET", "POST"].includes(event.httpMethod)) return response(405, { error: "Metoden støttes ikke" });

  try {
    connectLambda(event);
    const store = getStore(STORE_NAME);
    const current = await readCounter(store);
    if (event.httpMethod === "GET") return response(200, { count: current.count });

    let request = {};
    try { request = JSON.parse(event.body || "{}"); } catch { return response(400, { error: "Ugyldig JSON" }); }
    if (!request || typeof request !== "object" || Array.isArray(request)) {
      return response(400, { error: "Ugyldig forespørsel" });
    }
    const delta = request.delta === undefined ? 1 : Number(request.delta);
    if (!Number.isInteger(delta) || delta < 1 || delta > 10) {
      return response(422, { error: "delta må være et heltall mellom 1 og 10" });
    }

    const next = {
      ...current,
      count: current.count + delta,
      updatedAt: new Date().toISOString(),
    };
    await store.setJSON(COUNT_KEY, next);
    return response(200, { count: next.count });
  } catch (error) {
    console.error("Kunne ikke oppdatere supporter-telleren:", error.message);
    return response(503, { error: "Kunne ikke telle åretak" });
  }
};

export const config = {
  rateLimit: {
    windowLimit: 30,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};
