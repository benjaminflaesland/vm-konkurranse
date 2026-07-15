import { useEffect, useState } from "react";

const STADIUM_TIME_ZONES = {
  Eastern: "America/New_York",
  Central: "America/Chicago",
  Western: "America/Los_Angeles",
};

const LIVE_GAMES_CACHE_KEY = "vm2026_live_games_v2";
const LIVE_GAMES_TTL_MS = 5 * 60 * 1000;
let liveGamesRequest = null;
let liveGamesValue = null;
let liveGamesLoadedAt = 0;

export const BUILTIN_LIVE_GAMES = [
  { id: "18", home_team_name_en: "Iraq", away_team_name_en: "Norway", home_score: "1", away_score: "4", finished: "TRUE", kickoffAt: "2026-06-16T22:00:00.000Z", type: "group" },
  { id: "42", home_team_name_en: "Norway", away_team_name_en: "Senegal", home_score: "3", away_score: "2", finished: "TRUE", kickoffAt: "2026-06-23T00:00:00.000Z", type: "group" },
  { id: "62", home_team_name_en: "Norway", away_team_name_en: "France", home_score: "1", away_score: "4", finished: "TRUE", kickoffAt: "2026-06-26T19:00:00.000Z", type: "group" },
  { id: "78", home_team_name_en: "Ivory Coast", away_team_name_en: "Norway", home_score: "1", away_score: "2", finished: "TRUE", kickoffAt: "2026-06-30T16:00:00.000Z", type: "r32" },
  { id: "91", home_team_name_en: "Brazil", away_team_name_en: "Norway", home_score: "1", away_score: "2", finished: "TRUE", kickoffAt: "2026-07-05T20:00:00.000Z", type: "r16" },
  { id: "99", home_team_name_en: "Norway", away_team_name_en: "England", home_score: "1", away_score: "2", finished: "TRUE", kickoffAt: "2026-07-11T21:00:00.000Z", type: "qf" },
];

const DEV_SAMPLE_GAMES = import.meta.env.DEV ? BUILTIN_LIVE_GAMES : null;

function dateFromVenueTime(year, month, day, hour, minute, timeZone) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(utcGuess));
  const values = Object.fromEntries(parts
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, Number(part.value)]));
  const offset = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute) - utcGuess;
  return new Date(utcGuess - offset);
}

export function parseGameDate(game) {
  if (game.kickoffAt) {
    const scheduled = new Date(game.kickoffAt);
    if (!Number.isNaN(scheduled.getTime())) return scheduled;
  }

  const local = String(game.local_date || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (local) {
    const [, month, day, year, hour, minute] = local;
    const values = [Number(year), Number(month), Number(day), Number(hour), Number(minute)];
    return game.timeZone
      ? dateFromVenueTime(...values, game.timeZone)
      : new Date(values[0], values[1] - 1, values[2], values[3], values[4]);
  }

  const candidates = [game.date_time, game.datetime, game.date_utc, game.utc_date, game.date, game.start, game.kickoff, game.time];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) return date;
  }
  if (game.date && game.time) {
    const date = new Date(`${game.date} ${game.time}`);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

export function formatCountdown(date) {
  const milliseconds = date.getTime() - Date.now();
  if (milliseconds <= 0) return "pågår nå";
  const days = Math.floor(milliseconds / 86400000);
  const hours = Math.floor((milliseconds % 86400000) / 3600000);
  if (days >= 1) return `om ${days} ${days === 1 ? "dag" : "dager"}`;
  if (hours >= 1) return `om ${hours} ${hours === 1 ? "time" : "timer"}`;
  return "om under en time";
}

function readCachedLiveGames() {
  try {
    const cached = JSON.parse(localStorage.getItem(LIVE_GAMES_CACHE_KEY) || "null");
    if (!Array.isArray(cached?.games)) return null;
    return { games: cached.games, cachedAt: Number(cached.cachedAt) || 0 };
  } catch {
    return null;
  }
}

export function initialLiveGames() {
  return readCachedLiveGames()?.games || DEV_SAMPLE_GAMES || BUILTIN_LIVE_GAMES;
}

export function loadLiveGames() {
  const now = Date.now();
  if (liveGamesValue && now - liveGamesLoadedAt < LIVE_GAMES_TTL_MS) {
    return Promise.resolve(liveGamesValue);
  }

  const cached = readCachedLiveGames();
  if (cached && now - cached.cachedAt < LIVE_GAMES_TTL_MS) {
    liveGamesValue = cached.games;
    liveGamesLoadedAt = cached.cachedAt;
    return Promise.resolve(cached.games);
  }

  if (!liveGamesRequest) {
    const gamesRequest = fetch("/.netlify/functions/wc?endpoint=games")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)));
    const stadiumsRequest = fetch("/.netlify/functions/wc?endpoint=stadiums")
      .then((response) => response.ok ? response.json() : { stadiums: [] })
      .catch(() => ({ stadiums: [] }));

    liveGamesRequest = Promise.all([gamesRequest, stadiumsRequest])
      .then(([gamesData, stadiumsData]) => {
        const timeZoneByStadium = Object.fromEntries((stadiumsData?.stadiums || []).map((stadium) => [
          String(stadium.id), STADIUM_TIME_ZONES[stadium.region],
        ]));
        const games = (gamesData?.games || []).map((game) => {
          const timeZone = timeZoneByStadium[String(game.stadium_id)];
          const kickoffAt = parseGameDate({ ...game, timeZone })?.toISOString();
          return { ...game, timeZone, kickoffAt };
        });
        liveGamesValue = games;
        liveGamesLoadedAt = Date.now();
        try {
          localStorage.setItem(LIVE_GAMES_CACHE_KEY, JSON.stringify({ games, cachedAt: liveGamesLoadedAt }));
        } catch { /* Livekampene fungerer uten persistent nettlesercache. */ }
        return games;
      })
      .finally(() => {
        liveGamesRequest = null;
      });
  }
  return liveGamesRequest;
}

export function useLiveGames() {
  const [games, setGames] = useState(initialLiveGames);

  useEffect(() => {
    let active = true;
    loadLiveGames()
      .then((nextGames) => { if (active) setGames(nextGames); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  return games;
}

export function pickNextNorwayGame(list) {
  const now = Date.now();
  const upcoming = (list || [])
    .filter((game) => game.finished !== "TRUE" && (game.home_team_name_en === "Norway" || game.away_team_name_en === "Norway"))
    .map((game) => ({ g: game, date: parseGameDate(game) }))
    .filter((entry) => entry.date == null || entry.date.getTime() > now - 6 * 3600 * 1000)
    .sort((a, b) => (a.date ? a.date.getTime() : Infinity) - (b.date ? b.date.getTime() : Infinity));
  return upcoming[0] || null;
}

export function pickUpcomingGames(list, limit = 3) {
  const now = Date.now();
  return (list || [])
    .filter((game) => game.finished !== "TRUE")
    .map((game) => ({ g: game, date: parseGameDate(game) }))
    .filter((entry) => entry.date == null || entry.date.getTime() > now - 2.5 * 3600 * 1000)
    .sort((a, b) => (a.date ? a.date.getTime() : Infinity) - (b.date ? b.date.getTime() : Infinity))
    .slice(0, limit);
}
