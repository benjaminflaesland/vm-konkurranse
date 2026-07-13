import { afterEach, describe, expect, it, vi } from "vitest";

describe("live game cache", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("bruker nettlesercachen i fem minutter", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T12:00:00Z"));
    const games = [{ id: "91", home_team_name_en: "Brazil", away_team_name_en: "Norway" }];
    localStorage.setItem("vm2026_live_games_v2", JSON.stringify({ games, cachedAt: Date.now() - 4 * 60 * 1000 }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { loadLiveGames } = await import("../src/features/live-games.js");
    await expect(loadLiveGames()).resolves.toEqual(games);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("oppdaterer utløpt cache og beregner arenaens tidssone", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T12:00:00Z"));
    localStorage.setItem("vm2026_live_games_v2", JSON.stringify({ games: [], cachedAt: Date.now() - 6 * 60 * 1000 }));
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ games: [{ id: "1", stadium_id: 5, local_date: "07/13/2026 20:00" }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ stadiums: [{ id: 5, region: "Eastern" }] }) }));
    const { loadLiveGames } = await import("../src/features/live-games.js");
    const games = await loadLiveGames();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(games[0].timeZone).toBe("America/New_York");
    expect(games[0].kickoffAt).toBe("2026-07-14T00:00:00.000Z");
  });
});
