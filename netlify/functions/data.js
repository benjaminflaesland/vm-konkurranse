import { randomUUID } from "node:crypto";
import { connectLambda, getStore } from "@netlify/blobs";
import { readAdminSession } from "./lib/auth-session.js";
import {
  editableCompetitionData,
  migrateCompetitionData,
  validateCompetitionData,
} from "./lib/competition-data.js";

const BLOB_KEY = "competition-data";
const BACKUP_PREFIX = "competition-backups/";
const BACKUP_LIMIT = 20;

const HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const response = (statusCode, body) => ({
  statusCode,
  headers: HEADERS,
  body: body === undefined ? "" : JSON.stringify(body),
});

function publicData(data) {
  const ceremony = data.settings?.ceremony || {};
  const participants = data.participants || [];
  const eligible = participants.filter((participant) => !participant.excluded);
  const bonusOrder = ceremony.phase === "bonus"
    ? (ceremony.bonusOrder || [...eligible]
        .sort((a, b) => (a.bonus || 0) - (b.bonus || 0) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
        .map((participant) => participant.id))
        .filter((id) => eligible.some((participant) => participant.id === id))
    : [];
  const revealCount = ceremony.phase === "winner"
    ? eligible.length
    : Math.max(0, Math.min(ceremony.bonusRevealed || 0, eligible.length));
  const revealedBonusIds = bonusOrder.slice(0, revealCount);
  const revealed = new Set(revealedBonusIds);
  const revealEverything = ceremony.phase === "winner";

  return {
    schemaVersion: data.schemaVersion,
    participants: participants.map((participant) => {
      const { bonus, picks, ...safeParticipant } = participant;
      return {
        ...safeParticipant,
        ...(revealEverything || revealed.has(participant.id) ? { bonus } : {}),
        ...(picks ? {
          picks: revealEverything ? picks : { ...picks, quiz: [] },
        } : {}),
      };
    }),
    fasit: data.fasit
      ? { ...data.fasit, quiz: revealEverything ? data.fasit.quiz : Array((data.fasit.quiz || []).length).fill("") }
      : data.fasit,
    settings: {
      ...data.settings,
      ceremony: {
        phase: ceremony.phase,
        step: ceremony.step,
        bonusRevealed: revealCount,
        revealedBonusIds,
      },
    },
    liveUpdate: data.liveUpdate,
  };
}

async function readStoredData(store) {
  const raw = await store.get(BLOB_KEY, { type: "json" });
  if (!raw) return null;
  const migrated = migrateCompetitionData(raw);
  const validation = validateCompetitionData(migrated);
  if (!validation.ok) throw new Error(`Ugyldig lagret datasett: ${validation.error}`);
  return migrated;
}

async function backupCurrentData(store, current) {
  if (!current?.participants) return;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  await store.setJSON(`${BACKUP_PREFIX}${timestamp}-${current.revision || randomUUID()}`, current);
  try {
    const result = await store.list({ prefix: BACKUP_PREFIX });
    const stale = (result.blobs || [])
      .map((entry) => entry.key)
      .sort()
      .reverse()
      .slice(BACKUP_LIMIT);
    await Promise.all(stale.map((key) => store.delete(key)));
  } catch (error) {
    console.warn("Kunne ikke rydde gamle konkurransebackuper:", error.message);
  }
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return response(204);
  connectLambda(event);
  const store = getStore("vm2026");
  const isAdmin = Boolean(readAdminSession(event));

  if (event.httpMethod === "GET") {
    try {
      const current = await readStoredData(store);
      if (!current) return response(404, { error: "Ingen konkurransedata er lagret" });
      return response(200, {
        data: isAdmin ? editableCompetitionData(current) : publicData(current),
        revision: current.revision || null,
        updatedAt: current.updatedAt || null,
      });
    } catch (error) {
      console.error("Kunne ikke lese konkurransedata:", error.message);
      return response(503, { error: "Konkurransedata er midlertidig utilgjengelig" });
    }
  }

  if (event.httpMethod !== "POST") return response(405, { error: "Metoden støttes ikke" });
  if (!isAdmin) return response(401, { error: "Uautorisert" });

  let request;
  try {
    request = JSON.parse(event.body || "{}");
  } catch {
    return response(400, { error: "Ugyldig JSON" });
  }

  const requestedData = migrateCompetitionData(request.data);
  const validation = validateCompetitionData(requestedData);
  if (!validation.ok) return response(422, { error: validation.error });

  try {
    const current = await readStoredData(store);
    const currentRevision = current?.revision || null;
    if (request.baseRevision !== currentRevision) {
      return response(409, {
        error: "Konkurransedata ble endret et annet sted",
        revision: currentRevision,
        updatedAt: current?.updatedAt || null,
      });
    }

    await backupCurrentData(store, current);
    const revision = randomUUID();
    const updatedAt = new Date().toISOString();
    const next = {
      ...(current || {}),
      ...editableCompetitionData(requestedData),
      schemaVersion: 3,
      revision,
      updatedAt,
    };
    await store.setJSON(BLOB_KEY, next);
    return response(200, { ok: true, revision, updatedAt });
  } catch (error) {
    console.error("Kunne ikke lagre konkurransedata:", error.message);
    return response(503, { error: "Konkurransedata kunne ikke lagres" });
  }
};
