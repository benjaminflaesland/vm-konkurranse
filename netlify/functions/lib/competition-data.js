export const SCHEMA_VERSION = 3;

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function migrateCompetitionData(value) {
  if (!isObject(value)) return value;
  const participants = Array.isArray(value.participants)
    ? value.participants.map((participant) => {
        if (!isObject(participant)) return participant;
        if (typeof participant.excluded === "boolean") return participant;
        const firstName = String(participant.name || "").trim().split(/\s+/)[0].toLowerCase();
        return { ...participant, excluded: firstName === "benjamin" };
      })
    : value.participants;
  return { ...value, schemaVersion: SCHEMA_VERSION, participants };
}

export function validateCompetitionData(value) {
  if (!isObject(value)) return { ok: false, error: "Data må være et objekt" };
  if (!Array.isArray(value.participants)) return { ok: false, error: "participants må være en liste" };
  if (!isObject(value.fasit)) return { ok: false, error: "fasit må være et objekt" };
  if (!isObject(value.settings)) return { ok: false, error: "settings må være et objekt" };
  for (const participant of value.participants) {
    if (!isObject(participant) || typeof participant.id !== "string" || !participant.id.trim()) {
      return { ok: false, error: "Alle deltakere må ha en id" };
    }
    if (typeof participant.name !== "string" || !participant.name.trim()) {
      return { ok: false, error: "Alle deltakere må ha et navn" };
    }
    if (typeof participant.excluded !== "boolean") {
      return { ok: false, error: "Alle deltakere må ha excluded=true/false" };
    }
  }
  return { ok: true };
}

export function editableCompetitionData(value) {
  return {
    participants: value.participants,
    fasit: value.fasit,
    settings: value.settings,
  };
}

