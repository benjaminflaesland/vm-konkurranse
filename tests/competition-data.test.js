import { describe, expect, it } from "vitest";
import {
  migrateCompetitionData,
  serializePublicCompetition,
  validateCompetitionData,
} from "../netlify/functions/lib/competition-data.js";

function data(phase = "rounds") {
  return {
    schemaVersion: 2,
    participants: [
      {
        id: "a",
        name: "Ada Lovelace",
        color: "#123456",
        scores: { gruppe: 2 },
        bonus: 4,
        internalNote: "skal aldri ut",
        picks: { groups: {}, thirds: [], matches: {}, matchups: {}, sfLosers: {}, bronse: "", finale: "Norge", quiz: ["hemmelig"] },
      },
      { id: "b", name: "Benjamin Test", color: "#654321", scores: {}, bonus: 1, internalNote: "privat" },
    ],
    fasit: { groups: {}, quiz: ["fasit"], internalNote: "skal aldri ut" },
    settings: {
      ceremonyUnlocked: true,
      internalControl: "privat",
      ceremony: { phase, step: 0, bonusRevealed: 1 },
    },
    liveUpdate: { internalSignature: "privat" },
  };
}

describe("competition data schema", () => {
  it("migrerer Benjamin én gang til eksplisitt excluded og fryser bonusrekkefølgen", () => {
    const migrated = migrateCompetitionData(data("bonus"));
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.participants.map((participant) => participant.excluded)).toEqual([false, true]);
    expect(migrated.settings.ceremony.bonusOrder).toEqual(["a"]);
    expect(migrateCompetitionData(migrated)).toEqual(migrated);
    expect(validateCompetitionData(migrated)).toEqual({ ok: true });
  });

  it("avviser deltakere uten eksplisitt excluded", () => {
    expect(validateCompetitionData(data())).toEqual({ ok: false, error: "Alle deltakere må ha excluded=true/false" });
  });

  it("viser bare avslørt bonusprefiks og ingen interne metadata", () => {
    const migrated = migrateCompetitionData(data("bonus"));
    const publicData = serializePublicCompetition(migrated);
    expect(publicData.settings.ceremony.revealedBonusIds).toEqual(["a"]);
    expect(publicData.settings.ceremony).not.toHaveProperty("bonusOrder");
    expect(publicData.settings).not.toHaveProperty("internalControl");
    expect(publicData).not.toHaveProperty("liveUpdate");
    expect(publicData.participants[0]).not.toHaveProperty("internalNote");
    expect(publicData.fasit).not.toHaveProperty("internalNote");
    expect(publicData.participants[0].bonus).toBe(4);
    expect(publicData.participants[0].picks.quiz).toEqual([]);
    expect(publicData.participants[1]).not.toHaveProperty("bonus");
  });

  it("viser bonus og quiz i winner-fasen uten å lekke metadata", () => {
    const migrated = migrateCompetitionData(data("winner"));
    const publicData = serializePublicCompetition(migrated);
    expect(publicData.participants[0].picks.quiz).toEqual(["hemmelig"]);
    expect(publicData.fasit.quiz).toEqual(["fasit"]);
    expect(publicData.participants.every((participant) => Object.hasOwn(participant, "bonus"))).toBe(true);
    expect(publicData.participants[0]).not.toHaveProperty("internalNote");
  });
});
