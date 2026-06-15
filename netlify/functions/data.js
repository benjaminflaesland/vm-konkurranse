import { getStore } from "@netlify/blobs";

const BLOB_KEY = "competition-data";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };

  const store = getStore("vm2026");

  if (event.httpMethod === "GET") {
    try {
      const data = await store.get(BLOB_KEY, { type: "json" });
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify(data || {}) };
    } catch {
      return { statusCode: 200, headers: HEADERS, body: "{}" };
    }
  }

  if (event.httpMethod === "POST") {
    const auth = (event.headers.authorization || event.headers.Authorization) || "";
    const password = auth.replace("Bearer ", "");
    if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
      return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: "Uautorisert" }) };
    }
    try {
      const body = JSON.parse(event.body || "{}");
      await store.setJSON(BLOB_KEY, body);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
    } catch (e) {
      return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 405, headers: HEADERS, body: "" };
};
