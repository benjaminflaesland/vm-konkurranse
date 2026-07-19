import { describe, expect, it } from "vitest";
import {
  DEFAULT_QUIZ_RESULTS,
  migrateCompetitionData,
  serializePublicCompetition,
  validateCompetitionData,
} from "../netlify/functions/lib/competition-data.js";

function data(phase = "rounds", ceremonyUnlocked = false) {
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
      ceremonyUnlocked,
      ceremonyReleaseId: ceremonyUnlocked ? "release-1" : null,
      internalControl: "privat",
      ceremony: { phase, step: 0, bonusRevealed: 1 },
    },
    liveUpdate: { internalSignature: "privat" },
  };
}

describe("competition data schema", () => {
  it("tar Benjamin tilbake i konkurransen og fryser bonusrekkefølgen", () => {
    const migrated = migrateCompetitionData(data("bonus"));
    expect(migrated.schemaVersion).toBe(5);
    expect(migrated.participants.map((participant) => participant.excluded)).toEqual([false, false]);
    expect(migrated.settings.ceremony.bonusOrder).toEqual(["b", "a"]);
    expect(migrated.fasit.quiz).toEqual(["fasit", ...DEFAULT_QUIZ_RESULTS.slice(1)]);
    expect(migrateCompetitionData(migrated)).toEqual(migrated);
    expect(validateCompetitionData(migrated)).toEqual({ ok: true });
  });

  it("forhåndsfyller bare tomme quizsvar i eldre data", () => {
    const previous = data();
    previous.schemaVersion = 4;
    previous.fasit.quiz = ["", "Mbappé", null, "  ", "Ja"];

    expect(migrateCompetitionData(previous).fasit.quiz).toEqual([
      "5",
      "Mbappé",
      "10",
      "308",
      "Ja",
      ...DEFAULT_QUIZ_RESULTS.slice(5),
    ]);
  });

  it("gjeninnlemmer Benjamin én gang uten å overstyre senere adminvalg", () => {
    const previous = data("bonus");
    previous.schemaVersion = 3;
    previous.participants = previous.participants.map((participant) => ({
      ...participant,
      excluded: participant.name.startsWith("Benjamin"),
    }));
    previous.settings.ceremony.bonusOrder = ["a"];

    const migrated = migrateCompetitionData(previous);
    expect(migrated.participants.find((participant) => participant.id === "b")?.excluded).toBe(false);
    expect(migrated.settings.ceremony.bonusOrder).toEqual(["a", "b"]);

    const manuallyExcluded = {
      ...migrated,
      participants: migrated.participants.map((participant) =>
        participant.id === "b" ? { ...participant, excluded: true } : participant
      ),
    };
    expect(migrateCompetitionData(manuallyExcluded).participants.find((participant) => participant.id === "b")?.excluded).toBe(true);
  });

  it("avviser deltakere uten eksplisitt excluded", () => {
    expect(validateCompetitionData(data())).toEqual({ ok: false, error: "Alle deltakere må ha excluded=true/false" });
  });

  it("viser bare avslørt bonusprefiks og ingen interne metadata", () => {
    const migrated = migrateCompetitionData(data("bonus"));
    const publicData = serializePublicCompetition(migrated);
    expect(publicData.settings.ceremony.revealedBonusIds).toEqual(["b"]);
    expect(publicData.settings.ceremony).not.toHaveProperty("bonusOrder");
    expect(publicData.settings).not.toHaveProperty("internalControl");
    expect(publicData).not.toHaveProperty("liveUpdate");
    expect(publicData.participants[0]).not.toHaveProperty("internalNote");
    expect(publicData.fasit).not.toHaveProperty("internalNote");
    expect(publicData.participants[1].bonus).toBe(1);
    expect(publicData.participants[0].picks.quiz).toEqual([]);
    expect(publicData.participants[0]).not.toHaveProperty("bonus");
  });

  it("viser bonus og quiz i winner-fasen uten å lekke metadata", () => {
    const migrated = migrateCompetitionData(data("winner"));
    const publicData = serializePublicCompetition(migrated);
    expect(publicData.participants[0].picks.quiz).toEqual(["hemmelig"]);
    expect(publicData.fasit.quiz).toEqual(["fasit", ...DEFAULT_QUIZ_RESULTS.slice(1)]);
    expect(publicData.participants.every((participant) => Object.hasOwn(participant, "bonus"))).toBe(true);
    expect(publicData.participants[0]).not.toHaveProperty("internalNote");
  });

  it("frigir bonus og quiz når admin publiserer den selvstyrte kåringen", () => {
    const migrated = migrateCompetitionData(data("rounds", true));
    const publicData = serializePublicCompetition(migrated);
    expect(publicData.settings.ceremonyUnlocked).toBe(true);
    expect(publicData.settings.ceremonyReleaseId).toBe("release-1");
    expect(publicData.participants[0].picks.quiz).toEqual(["hemmelig"]);
    expect(publicData.fasit.quiz).toEqual(["fasit", ...DEFAULT_QUIZ_RESULTS.slice(1)]);
    expect(publicData.participants.every((participant) => Object.hasOwn(participant, "bonus"))).toBe(true);
  });
});
