import { connectLambda, getStore } from "@netlify/blobs";

const BLOB_KEY = "competition-data";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

function publicData(data) {
  if (!data) return {};
  const ceremony = data.settings?.ceremony || {};
  if (ceremony.phase === "winner") return data;

  const participants = data.participants || [];
  const bonusOrder = ceremony.phase === "bonus"
    ? [...participants].sort((a, b) => (a.bonus || 0) - (b.bonus || 0)).map((p) => p.id)
    : undefined;
  const revealedIds = new Set((bonusOrder || []).slice(0, Math.max(0, ceremony.bonusRevealed || 0)));

  return {
    ...data,
    participants: participants.map((participant) => {
      const { bonus, picks, ...publicParticipant } = participant;
      return {
        ...publicParticipant,
        ...(ceremony.phase === "bonus" && revealedIds.has(participant.id) ? { bonus } : {}),
        ...(picks ? { picks: { ...picks, quiz: [] } } : {}),
      };
    }),
    fasit: data.fasit ? { ...data.fasit, quiz: Array((data.fasit.quiz || []).length).fill("") } : data.fasit,
    settings: {
      ...data.settings,
      ceremony: { ...ceremony, bonusOrder },
    },
  };
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };

  // Lambda-compatible functions must wire up Blobs credentials from the event
  // before getStore(); without this Netlify Blobs throws MissingBlobsEnvironmentError.
  connectLambda(event);
  const store = getStore("vm2026");
  const auth = (event.headers.authorization || event.headers.Authorization) || "";
  const password = auth.replace("Bearer ", "");
  const isAdmin = !!process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD;

  if (event.httpMethod === "GET") {
    try {
      const data = await store.get(BLOB_KEY, { type: "json" });
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify(isAdmin ? data || {} : publicData(data)) };
    } catch {
      return { statusCode: 200, headers: HEADERS, body: "{}" };
    }
  }

  if (event.httpMethod === "POST") {
    if (!isAdmin) {
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
