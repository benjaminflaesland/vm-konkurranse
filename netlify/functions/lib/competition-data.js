export const SCHEMA_VERSION = 4;

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function migrateCompetitionData(value) {
  if (!isObject(value)) return value;
  const sourceVersion = Number(value.schemaVersion) || 0;
  const participants = Array.isArray(value.participants)
    ? value.participants.map((participant) => {
        if (!isObject(participant)) return participant;
        const firstName = String(participant.name || "").trim().split(/\s+/)[0].toLowerCase();
        if (sourceVersion < 4 && firstName === "benjamin") {
          return { ...participant, excluded: false };
        }
        if (typeof participant.excluded === "boolean") return participant;
        return { ...participant, excluded: false };
      })
    : value.participants;
  const currentCeremony = value.settings?.ceremony;
  const eligible = Array.isArray(participants) ? participants.filter((participant) => !participant?.excluded) : [];
  const sortedEligibleIds = [...eligible]
    .sort((a, b) => (a.bonus || 0) - (b.bonus || 0) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map((participant) => participant.id);
  const existingBonusOrder = Array.isArray(currentCeremony?.bonusOrder)
    ? currentCeremony.bonusOrder.filter((id) => eligible.some((participant) => participant.id === id))
    : [];
  const missingEligibleIds = sortedEligibleIds.filter((id) => !existingBonusOrder.includes(id));
  const needsFrozenBonusOrder = ["bonus", "winner"].includes(currentCeremony?.phase)
    && (!Array.isArray(currentCeremony?.bonusOrder) || (sourceVersion < 4 && missingEligibleIds.length > 0));
  const settings = needsFrozenBonusOrder
    ? {
        ...value.settings,
        ceremony: {
          ...currentCeremony,
          bonusOrder: Array.isArray(currentCeremony?.bonusOrder)
            ? [...existingBonusOrder, ...missingEligibleIds]
            : sortedEligibleIds,
        },
      }
    : value.settings;
  return { ...value, schemaVersion: SCHEMA_VERSION, participants, settings };
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

export function serializePublicCompetition(data) {
  const ceremony = data.settings?.ceremony || {};
  const ceremonyPublished = Boolean(data.settings?.ceremonyUnlocked);
  const participants = data.participants || [];
  const eligible = participants.filter((participant) => !participant.excluded);
  const bonusOrder = ceremony.phase === "bonus"
    ? (ceremony.bonusOrder || [...eligible]
        .sort((a, b) => (a.bonus || 0) - (b.bonus || 0) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
        .map((participant) => participant.id))
        .filter((id) => eligible.some((participant) => participant.id === id))
    : [];
  const revealEverything = ceremonyPublished || ceremony.phase === "winner";
  const revealCount = revealEverything
    ? eligible.length
    : Math.max(0, Math.min(ceremony.bonusRevealed || 0, eligible.length));
  const revealedBonusIds = bonusOrder.slice(0, revealCount);
  const revealed = new Set(revealedBonusIds);
  const publicPicks = (picks) => picks ? {
    groups: picks.groups,
    thirds: picks.thirds,
    matches: picks.matches,
    matchups: picks.matchups,
    sfLosers: picks.sfLosers,
    bronse: picks.bronse,
    finale: picks.finale,
    quiz: revealEverything ? picks.quiz : [],
  } : undefined;
  const publicFasit = data.fasit ? {
    groups: data.fasit.groups,
    thirds: data.fasit.thirds,
    matches: data.fasit.matches,
    matchups: data.fasit.matchups,
    sfLosers: data.fasit.sfLosers,
    bronse: data.fasit.bronse,
    finale: data.fasit.finale,
    quiz: revealEverything ? data.fasit.quiz : Array((data.fasit.quiz || []).length).fill(""),
  } : data.fasit;

  return {
    schemaVersion: data.schemaVersion,
    participants: participants.map((participant) => {
      return {
        id: participant.id,
        name: participant.name,
        color: participant.color,
        scores: participant.scores,
        excluded: participant.excluded,
        ...(revealEverything || revealed.has(participant.id) ? { bonus: participant.bonus } : {}),
        ...(participant.picks ? { picks: publicPicks(participant.picks) } : {}),
      };
    }),
    fasit: publicFasit,
    settings: {
      ceremonyUnlocked: ceremonyPublished,
      ceremonyReleaseId: typeof data.settings?.ceremonyReleaseId === "string"
        ? data.settings.ceremonyReleaseId
        : null,
      ceremony: {
        phase: ceremony.phase,
        step: ceremony.step,
        bonusRevealed: revealCount,
        revealedBonusIds,
      },
    },
  };
}
