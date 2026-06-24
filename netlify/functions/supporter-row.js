import { randomUUID } from "node:crypto";
import { connectLambda, getStore } from "@netlify/blobs";

const STORE_NAME = "vm2026";
const ROW_PREFIX = "supporter-rows/";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

async function rowCount(store) {
  const pages = await store.list({ prefix: ROW_PREFIX, paginate: true });
  if (typeof pages?.[Symbol.asyncIterator] === "function") {
    let count = 0;
    for await (const page of pages) count += page.blobs.length;
    return count;
  }
  return pages?.blobs?.length || 0;
}

const response = (statusCode, body) => ({ statusCode, headers: HEADERS, body: JSON.stringify(body) });

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };
  if (!["GET", "POST"].includes(event.httpMethod)) return { statusCode: 405, headers: HEADERS, body: "" };

  try {
    connectLambda(event);
    const store = getStore(STORE_NAME);

    if (event.httpMethod === "POST") {
      const createdAt = new Date().toISOString();
      await store.setJSON(`${ROW_PREFIX}${Date.now()}-${randomUUID()}`, { createdAt });
    }

    return response(200, { count: await rowCount(store) });
  } catch (error) {
    return response(500, { error: error.message || "Kunne ikke telle åretak" });
  }
};
