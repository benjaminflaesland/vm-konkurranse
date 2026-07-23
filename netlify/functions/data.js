import { randomUUID } from "node:crypto";
import { connectLambda, getStore } from "@netlify/blobs";
import { readAdminSession } from "./lib/auth-session.js";
import { backupCompetitionData } from "./lib/competition-backups.js";
import {
  SCHEMA_VERSION,
  editableCompetitionData,
  migrateCompetitionData,
  serializePublicCompetition,
  validateCompetitionData,
} from "./lib/competition-data.js";

const BLOB_KEY = "competition-data";

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
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return response(400, { error: "Ugyldig forespørsel" });
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

    await backupCompetitionData(store, current);
    const revision = randomUUID();
    const updatedAt = new Date().toISOString();
    const next = {
      ...(current || {}),
      ...editableCompetitionData(requestedData),
      schemaVersion: SCHEMA_VERSION,
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
