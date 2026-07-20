import { describe, expect, it } from "vitest";
import {
  buildLiveFasitFromFeeds,
  canonicalTeam,
  classifyRound,
  computeScores,
  emptyFasit,
  mergeLiveResults,
  rankByScore,
  teamMatch,
} from "../shared/competition.js";

function emptyPicks() {
  return {
    groups: {},
    thirds: [],
    matches: {},
    matchups: {},
    sfLosers: {},
    bronse: "",
    finale: "",
    quiz: [],
  };
}

describe("competition domain", () => {
  it.each([
    ["türkiye", "Tyrkia"],
    ["Côte d'Ivoire", "Elfenbenskysten"],
    ["Bosnia & Herzegovina", "Bosnia og Herzegovina"],
    ["DR Congo", "Kongo"],
    ["South Korea", "Sør Korea"],
  ])("normaliserer %s", (input, expected) => {
    expect(canonicalTeam(input)).toBe(expected);
    expect(teamMatch(input, expected)).toBe(true);
  });

  it("skiller fulltreff, riktig lag på feil plass og bom", () => {
    expect(classifyRound(
      ["Brasil", "Norge", "Spania"],
      ["Norge", "Brasil", "Frankrike"],
    )).toEqual(["bonus", "bonus", "miss"]);
  });

  it("gir samme plassering ved poenglikhet og hopper over neste plass", () => {
    expect(rankByScore([
      { id: "d", name: "Dina", total: 8 },
      { id: "b", name: "Bea", total: 10 },
      { id: "a", name: "Ada", total: 10 },
      { id: "c", name: "Cecilie", total: 9 },
    ]).map(({ name, rank }) => [name, rank])).toEqual([
      ["Ada", 1],
      ["Bea", 1],
      ["Cecilie", 3],
      ["Dina", 4],
    ]);
  });

  it("teller tredjeplasser bare én gang og dekker alle poengtyper", () => {
    const fasit = emptyFasit();
    fasit.groups.A = { first: "Mexico", second: "Sør Afrika" };
    fasit.thirds = ["Norge", "Belgia", "Iran", "Marokko", "Japan", "Australia", "Uruguay", "Ghana"];
    fasit.matches = {
      73: "Norge", 74: "Brasil", 89: "Spania", 97: "Frankrike", 101: "Norge", 102: "Brasil",
    };
    fasit.sfLosers = { 101: "Spania", 102: "Frankrike" };
    fasit.bronse = "Spania";
    fasit.finale = "Norge";
    fasit.quiz = ["3", "Kylian Mbappé", "", "140", "Ja", "", "", "", "", ""];

    const picks = emptyPicks();
    picks.groups.A = { first: "Mexico", second: "South Africa" };
    picks.thirds = ["Norway", "Norge"];
    picks.matches = {
      73: "Brasil", 74: "Norge", 89: "Spania", 97: "Frankrike", 101: "Brasil", 102: "Norge",
    };
    picks.sfLosers = { 101: "Spania", 102: "Frankrike" };
    picks.bronse = "Spania";
    picks.finale = "Norge";
    picks.quiz = ["3", "mbappe", "", "145", "Ja", "", "", "", "", ""];

    expect(computeScores(picks, fasit)).toEqual({
      gruppe: 6,
      r16: 2,
      r8: 3,
      kvart: 4,
      semi: 14,
      bronse_finale: 15,
      bonus: 4,
    });
  });

  it("fletter kun bekreftede liveverdier", () => {
    const current = emptyFasit();
    current.groups.A.first = "Mexico";
    current.matches[73] = "Norge";
    const merged = mergeLiveResults(current, {
      groups: { A: { first: "", second: "Sør Afrika" } },
      matches: { 73: "", 74: "Brasil" },
    });
    expect(merged.groups.A).toEqual({ first: "Mexico", second: "Sør Afrika" });
    expect(merged.matches).toMatchObject({ 73: "Norge", 74: "Brasil" });
  });

  it("bruker straffesparkkonkurransen når en sluttspillkamp ender uavgjort", () => {
    const result = buildLiveFasitFromFeeds({
      teamsData: { teams: [] },
      groupsData: { groups: [] },
      gamesData: {
        games: [{
          id: "101",
          home_team_name_en: "Norway",
          away_team_name_en: "Brazil",
          home_score: "1",
          away_score: "1",
          home_penalty_score: "5",
          away_penalty_score: "4",
          finished: "TRUE",
        }],
      },
    });
    expect(result.matches[101]).toBe("Norge");
    expect(result.sfLosers[101]).toBe("Brasil");
  });
});
