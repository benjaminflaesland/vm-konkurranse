// netlify/functions/data.js
import { getStore } from "@netlify/blobs";

const BLOB_KEY = "competition-data";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();

  const store = getStore("vm2026");

  if (req.method === "GET") {
    try {
      const data = await store.get(BLOB_KEY, { type: "json" });
      return res.json(data || {});
    } catch {
      return res.json({});
    }
  }

  if (req.method === "POST") {
    const auth = req.headers.authorization || "";
    const password = auth.replace("Bearer ", "");
    if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Uautorisert" });
    }
    try {
      await store.setJSON(BLOB_KEY, req.body);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).end();
}
