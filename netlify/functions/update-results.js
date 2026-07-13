import { randomUUID } from "node:crypto";
import { connectLambda, getStore } from "@netlify/blobs";
import {
  buildLiveFasitFromFeeds,
  emptyFasit,
  finishedGamesSignature,
  isFinishedGame,
  liveResultsSignature,
  mergeLiveResults,
  recalculateParticipantScores,
} from "./lib/competition.js";
import { migrateCompetitionData } from "./lib/competition-data.js";

const BLOB_KEY = "competition-data";
const STORE_NAME = "vm2026";
const UPSTREAM_TIMEOUT_MS = 20_000;

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

const response = (statusCode, body) => ({
  statusCode,
  headers: HEADERS,
  body: JSON.stringify(body),
});

async function fetchWorldCupEndpoint(endpoint) {
  const timeout = typeof AbortSignal !== "undefined" && AbortSignal.timeout
    ? { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) }
    : {};
  const upstream = await fetch(`https://worldcup26.ir/get/${endpoint}`, {
    headers: { "User-Agent": "vm-konkurranse/1.0" },
    ...timeout,
  });
  if (!upstream.ok) throw new Error(`${endpoint} svarte med ${upstream.status}`);
  const text = await upstream.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${endpoint} returnerte ikke gyldig JSON`);
  }
}

function worldCupComplete(gamesData) {
  return (gamesData?.games || []).some((game) => String(game.id) === "104" && isFinishedGame(game));
}

function hasR32Matchups(fasit) {
  const matchups = fasit?.matchups || {};
  return Array.from({ length: 16 }, (_, i) => String(73 + i)).every((id) =>
    Array.isArray(matchups[id]) && matchups[id].some(Boolean)
  );
}

async function readCompetitionData(store) {
  const data = await store.get(BLOB_KEY, { type: "json" }).catch(() => null) || {};
  return migrateCompetitionData(data) || {};
}

async function updateFromFinishedMatches(store, startedAt) {
  const current = await readCompetitionData(store);
  if (!Array.isArray(current.participants) && !current.fasit) {
    return { ok: true, skipped: "no-competition-data" };
  }
  if (current.liveUpdate?.worldCupComplete) {
    return { ok: true, skipped: "world-cup-complete" };
  }

  const gamesData = await fetchWorldCupEndpoint("games");
  const finishedSignature = finishedGamesSignature(gamesData);
  if (!finishedSignature) {
    return { ok: true, skipped: "no-finished-matches", checkedAt: startedAt };
  }
  if (current.liveUpdate?.finishedGamesSignature === finishedSignature && hasR32Matchups(current.fasit)) {
    return { ok: true, skipped: "no-new-finished-matches", checkedAt: startedAt };
  }

  const [teamsData, groupsData] = await Promise.all([
    fetchWorldCupEndpoint("teams"),
    fetchWorldCupEndpoint("groups"),
  ]);

  // Re-read before writing so a manual admin save made during the live fetch is
  // preserved and scored against the latest results.
  const latest = await readCompetitionData(store);
  if (latest.liveUpdate?.finishedGamesSignature === finishedSignature && hasR32Matchups(latest.fasit)) {
    return { ok: true, skipped: "already-updated", checkedAt: startedAt };
  }

  const currentFasit = { ...emptyFasit(), ...(latest.fasit || {}) };
  const liveResults = buildLiveFasitFromFeeds({ teamsData, groupsData, gamesData });
  const mergedFasit = mergeLiveResults(currentFasit, liveResults);
  const resultsChanged = liveResultsSignature(mergedFasit) !== liveResultsSignature(currentFasit);
  const nextParticipants = recalculateParticipantScores(latest.participants || [], mergedFasit);
  const complete = worldCupComplete(gamesData);
  const revision = randomUUID();

  await store.setJSON(BLOB_KEY, {
    ...latest,
    participants: nextParticipants,
    fasit: mergedFasit,
    liveUpdate: {
      ...(latest.liveUpdate || {}),
      source: "worldcup26.ir",
      checkedAt: startedAt,
      updatedAt: resultsChanged ? startedAt : latest.liveUpdate?.updatedAt || null,
      finishedGamesSignature: finishedSignature,
      worldCupComplete: complete,
    },
    schemaVersion: 3,
    revision,
    updatedAt: startedAt,
  });

  return {
    ok: true,
    updated: true,
    resultsChanged,
    worldCupComplete: complete,
    checkedAt: startedAt,
  };
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };

  try {
    connectLambda(event);
    const store = getStore(STORE_NAME);
    const startedAt = new Date().toISOString();
    return response(200, await updateFromFinishedMatches(store, startedAt));
  } catch (error) {
    console.error("Scheduled result update failed:", error);
    return response(500, { ok: false, error: error.message || String(error) });
  }
};
