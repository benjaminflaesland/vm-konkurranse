import { randomUUID } from "node:crypto";
import { connectLambda, getStore } from "@netlify/blobs";
import { readAdminSession } from "./lib/auth-session.js";
import {
  editableCompetitionData,
  migrateCompetitionData,
  serializePublicCompetition,
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
        data: isAdmin ? editableCompetitionData(current) : serializePublicCompetition(current),
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
