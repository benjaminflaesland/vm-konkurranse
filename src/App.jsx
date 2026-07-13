import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import "flag-icons/css/flag-icons.min.css";
import {
  GROUPS,
  GROUP_KEYS,
  CELLS,
  POINTS,
  buildLiveFasitFromFeeds,
  canonicalTeam,
  classifyRound,
  computeScores,
  emptyFasit,
  isOfficialTeam,
  liveResultsSignature,
  mergeLiveResults,
  recalculateParticipantScores,
  teamMatch,
  toNorwegian,
} from "../shared/competition.js";
import vmTrophyMark from "./assets/vm-trophy-mark-26-header.png";
import norseKnitBand from "./assets/norse-knit-band.png";
import norseKnitBandLight from "./assets/norse-knit-band-light.png";
import worldCupPrizeSilhouette from "./assets/world-cup-prize-silhouette.png";
import roadVm1998 from "./assets/road-vm-1998.jpg";
import roadVmOpening from "./assets/road-vm-opening.jpg";
import roadVmItaly from "./assets/road-vm-italy.jpg";
import roadVmMoldova from "./assets/road-vm-moldova.jpg";
import roadVmNovember from "./assets/road-vm-november.jpg";
import roadVmMilan from "./assets/road-vm-milan.webp";
import roadVmArrived from "./assets/road-vm-arrived.webp";
import vmMatchIraq from "./assets/vm-match-iraq.jpg";
import vmMatchSenegal from "./assets/vm-match-senegal.jpg";
import vmMatchFrance from "./assets/vm-match-france.jpg";
import vmMatchIvoryCoast from "./assets/vm-match-ivory-coast.jpg";

// Every photo used by "Veien til VM". Preloaded as soon as the bundle loads so the
// cards never flash a blank tile while the image fetches/decodes on refresh.
const VOYAGE_IMAGES = [
  roadVm1998, roadVmOpening, roadVmItaly, roadVmMoldova, roadVmNovember, roadVmMilan, roadVmArrived,
  vmMatchIraq, vmMatchSenegal, vmMatchFrance, vmMatchIvoryCoast,
];
if (typeof document !== "undefined") {
  for (const href of VOYAGE_IMAGES) {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = href;
    document.head.appendChild(link);
  }
}

// ─────────────────────────────────────────────
// TURNERINGSDATA
// ─────────────────────────────────────────────
const ROUNDS = [
  { key: "gruppe", label: "Gruppespill", short: "Gruppe" },
  { key: "r16", label: "16-delsfinaler", short: "16-del" },
  { key: "r8", label: "8-delsfinaler", short: "8-del" },
  { key: "kvart", label: "Kvartfinaler", short: "Kvart" },
  { key: "semi", label: "Semifinaler", short: "Semi" },
  { key: "bronse_finale", label: "Bronse & finale", short: "Finale" },
];

const BONUS_LABEL = "Bonusspørsmål";

const ALL_TEAMS = GROUP_KEYS.flatMap((g) => GROUPS[g]);

// Every winner cell has the two teams immediately to its left: one row above
// and on the same row. Keeping this derived from the winner map means the
// import contract stays aligned with the fixed Excel template.
function matchupCellsForWinner(winnerCell) {
  const match = /^([A-Z])(\d+)$/.exec(winnerCell);
  if (!match) throw new Error(`Ugyldig Excel-celle: ${winnerCell}`);
  const [, winnerColumn, winnerRow] = match;
  const matchupColumn = String.fromCharCode(winnerColumn.charCodeAt(0) - 1);
  const row = Number(winnerRow);
  return [`${matchupColumn}${row - 1}`, `${matchupColumn}${row}`];
}

const WINNER_CELLS_BY_MATCH = {
  ...CELLS.r16,
  ...CELLS.r8,
  ...CELLS.kvart,
  101: CELLS.semi[101].win,
  102: CELLS.semi[102].win,
  103: CELLS.bronse,
  104: CELLS.finale,
};

const MATCHUP_CELLS = Object.fromEntries(
  Object.entries(WINNER_CELLS_BY_MATCH).map(([matchId, winnerCell]) => [matchId, matchupCellsForWinner(winnerCell)])
);

// The World Cup 2026 knockout draw is not a simple numeric bracket. The template
// fixes which group winners / runners-up / third-place teams meet in each
// 16-delsfinale, and how every round feeds the next. We keep that whole
// progression here so desktop and mobile render identical, correct brackets.
// Each round is the list of match numbers shown in that column, outermost first.
const BRACKET_TOPOLOGY = {
  left: {
    r32: [74, 77, 73, 75, 83, 84, 81, 82],
    r16: [89, 90, 93, 94],
    kvart: [97, 98],
    semi: [101],
  },
  right: {
    r32: [76, 78, 79, 80, 86, 88, 85, 87],
    r16: [91, 92, 95, 96],
    kvart: [99, 100],
    semi: [102],
  },
};

// Which two matches feed each later match (winner of A v winner of B), from the
// competition template's "Oppsett" notes.
const MATCH_FEEDERS = {
  89: [74, 77], 90: [73, 75], 91: [76, 78], 92: [79, 80],
  93: [83, 84], 94: [81, 82], 95: [86, 88], 96: [85, 87],
  97: [89, 90], 98: [93, 94], 99: [91, 92], 100: [95, 96],
  101: [97, 98], 102: [99, 100], 104: [101, 102],
};

// The 16-delsfinaler matchups are fixed by the draw: each side is a group winner
// (1X), runner-up (2X) or a best-third-place slot (T0–T7, aligned with
// CELLS.thirdLabels). The two teams are derived from the group/third-place picks
// rather than stored as match winners, so the bracket can show e.g. Tyskland–Skottland.
const R32_MATCHUPS = {
  73: ["2A", "2B"], 74: ["1E", "T0"], 75: ["1F", "2C"], 76: ["1C", "2F"],
  77: ["1I", "T1"], 78: ["2E", "2I"], 79: ["1A", "T2"], 80: ["1L", "T3"],
  81: ["1D", "T4"], 82: ["1G", "T5"], 83: ["2K", "2L"], 84: ["1H", "2J"],
  85: ["1B", "T6"], 86: ["1J", "2H"], 87: ["1K", "T7"], 88: ["2D", "2G"],
};

function resolveBracketTeam(code, groups, thirds) {
  if (!code) return null;
  if (code[0] === "T") return thirds?.[Number(code.slice(1))] || null;
  const g = groups?.[code[1]];
  if (!g) return null;
  return (code[0] === "1" ? g.first : g.second) || null;
}

// For a picks/fasit object, returns the two participants of any knockout match:
// the 16-dels matchups come from the group/third picks, every later round from the
// winners its two feeder matches produced.
function makeMatchGetter(data) {
  const winnerOf = (id) => data?.matches?.[id] ?? null;
  const matchTeams = (id) => {
    // Imported workbooks contain exact first-round pairings in the adjacent
    // column. For later rounds, derive the pair from prior winners so stale
    // formula values cannot drift from the visible bracket path.
    if (!MATCH_FEEDERS[id] && Object.prototype.hasOwnProperty.call(data?.matchups || {}, id)) {
      const [a = null, b = null] = data.matchups[id] || [];
      return [a || null, b || null];
    }
    const draw = R32_MATCHUPS[id];
    if (draw) return [resolveBracketTeam(draw[0], data?.groups, data?.thirds), resolveBracketTeam(draw[1], data?.groups, data?.thirds)];
    const feed = MATCH_FEEDERS[id];
    return feed ? [winnerOf(feed[0]), winnerOf(feed[1])] : [winnerOf(id), null];
  };
  return { winnerOf, matchTeams };
}

const QUIZ_QUESTIONS = [
  "Antall mål i kampen Norge–Frankrike?",
  "Toppscorer i VM?",
  "Antall mål toppscoreren scorer?",
  "Totalt antall mål i VM (±5 godtas)?",
  "Taper England i straffekonkurranse? (Ja/Nei)",
  "Antall røde kort totalt?",
  "Laget med færrest poeng?",
  "Antall straffekonkurranser?",
  "Finaledommerens land?",
  "Blir Ronaldo toppscorer for Portugal? (Ja/Nei)",
];

// ── Poengsystem (fra Excel-malen) ──
const BRACKET_HIT_COLOR = "#16a34a";
const BRACKET_BONUS_COLOR = "#E0A106";

function bracketPointColor(status) {
  return status === "bonus" ? BRACKET_BONUS_COLOR : BRACKET_HIT_COLOR;
}

function bracketPointBg(status) {
  return status === "bonus" ? "rgba(224,161,6,0.15)" : "rgba(34,197,94,0.13)";
}

function BracketPointBadge({ result, compact = false }) {
  if (!result?.points) return null;
  return (
    <span style={{
      fontSize: compact ? 7.5 : 9,
      fontWeight: 900,
      color: bracketPointColor(result.status),
      flexShrink: 0,
      opacity: 0.9,
      lineHeight: 1,
      whiteSpace: "nowrap",
    }}>
      +{result.points}
    </span>
  );
}

// FotMob-inspirert: mettede farger som popper mot helsvart bakgrunn
const PALETTE = [
  "#00DC64", "#3D7EF5", "#E8334A", "#F5A623", "#A855F7",
  "#06B6D4", "#F97316", "#84CC16", "#EC4899", "#14B8A6",
  "#8B5CF6", "#EAB308", "#3B82F6", "#10B981", "#F43F5E",
  "#6366F1", "#0EA5E9", "#D946EF", "#F59E0B", "#22C55E",
];

const PUBLIC_CACHE_KEY = "vm2026_public_cache_v1";
const LEGACY_ADMIN_STORAGE_KEY = "vm2026_ranking_data_v2";
const LAST_PUBLIC_MODE_KEY = "vm2026_last_public_mode";
const SUPPORTER_ROW_ENDPOINT = "/.netlify/functions/supporter-row";
const SUPPORTER_ROW_DEV_KEY = "vm2026_supporter_rows_dev";
const SUPPORTER_COUNT_CACHE_KEY = "vm2026_supporter_count_cache";

// Last total we showed, kept so a refresh or tab switch can paint it immediately
// instead of dropping to a briefly-stale server read and climbing back up.
function readCachedSupporterCount() {
  try {
    const n = Number(localStorage.getItem(SUPPORTER_COUNT_CACHE_KEY));
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}
const PUBLIC_MODES = new Set(["hjem", "stilling", "fasit-view", "vei-vm", "present"]);
const DEFAULT_CEREMONY = { phase: "rounds", step: 0, bonusRevealed: 0 };
const DEFAULT_SETTINGS = { ceremonyUnlocked: false, ceremony: DEFAULT_CEREMONY };

function normalizeCeremony(value) {
  const phase = ["rounds", "bonus", "winner"].includes(value?.phase) ? value.phase : DEFAULT_CEREMONY.phase;
  return {
    phase,
    step: Math.max(0, Math.min(ROUNDS.length - 1, Number(value?.step) || 0)),
    bonusRevealed: Math.max(0, Number(value?.bonusRevealed) || 0),
    bonusOrder: Array.isArray(value?.bonusOrder) ? value.bonusOrder.filter((id) => typeof id === "string") : undefined,
    revealedBonusIds: Array.isArray(value?.revealedBonusIds) ? value.revealedBonusIds.filter((id) => typeof id === "string") : undefined,
  };
}

function normalizeSettings(value) {
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    ceremony: normalizeCeremony(value?.ceremony),
  };
}

const DEMO_DATA = import.meta.env.DEV ? (() => {
  const demoR16Winners = {
    73: "Canada", 74: "Tyskland", 75: "Marokko", 76: "Brasil",
    77: "Frankrike", 78: "Norge", 79: "Mexico", 80: "England",
    81: "USA", 82: "Belgia", 83: "Portugal", 84: "Spania",
    85: "Paraguay", 86: "Argentina", 87: "Colombia", 88: "Australia",
  };
  const demoR8Winners = {
    89: "Frankrike", 90: "Canada", 91: "Brasil", 92: "Mexico",
    93: "Spania", 94: "USA", 95: "Argentina", 96: "Paraguay",
  };
  const demoKvartWinners = {
    97: "Frankrike", 98: "Spania", 99: "Brasil", 100: "Paraguay",
  };

  const mkPicks = (mester, bronse, semifinister, kvart, r8, r16, groups, thirds, quiz) => ({
    groups, thirds, bronse, finale: mester,
    matches: {
      ...Object.fromEntries(Object.keys(CELLS.r16).map((id, i) => [id, r16[i] || ""])),
      ...Object.fromEntries(Object.keys(CELLS.r8).map((id, i) => [id, r8[i] || ""])),
      ...Object.fromEntries(Object.keys(CELLS.kvart).map((id, i) => [id, kvart[i] || ""])),
      101: semifinister[0], 102: semifinister[1],
    },
    sfLosers: { 101: semifinister[2] || "", 102: semifinister[3] || "" },
    quiz,
  });

  const g = (f, s) => ({ first: f, second: s });
  const groups1 = { A: g("Mexico","USA"), B: g("Canada","Sveits"), C: g("Brasil","Marokko"), D: g("USA","Australia"), E: g("Tyskland","Elfenbenskysten"), F: g("Nederland","Japan"), G: g("Belgia","Iran"), H: g("Spania","Uruguay"), I: g("Frankrike","Norge"), J: g("Argentina","Østerrike"), K: g("Portugal","Colombia"), L: g("England","Kroatia") };
  const groups2 = { A: g("USA","Mexico"), B: g("Canada","Sveits"), C: g("Brasil","Marokko"), D: g("Australia","USA"), E: g("Frankrike","Norge"), F: g("Nederland","Japan"), G: g("Spania","Iran"), H: g("Spania","Uruguay"), I: g("Frankrike","Norge"), J: g("Brasil","Østerrike"), K: g("Portugal","Colombia"), L: g("England","Kroatia") };

  const participants = [
    { id: "1", name: "Ola Nordmann", color: "#00DC64", scores: { gruppe: 26, r16: 12, r8: 9, kvart: 8, semi: 10, bronse_finale: 15 }, bonus: 3, picks: mkPicks("Brasil","Frankrike",["Brasil","Argentina","Frankrike","Portugal"],["Brasil","Frankrike","Portugal","Argentina"],["Brasil","USA","Frankrike","Nederland","Portugal","Spania","England","Argentina"],["Brasil","Frankrike","Frankrike","USA","Spania","England","Spania","Colombia","Mexico","Canada","Tyskland","Belgia","Norge","Østerrike","Colombia","Kroatia"],groups1,["Norge","Belgia","Iran","Marokko","Uruguay","Elfenbenskysten","Japan","Australia"],["3","Ronaldo","8","140","Nei","5","Panama","3","Brasil","Nei"]) },
    { id: "2", name: "Kari Hansen", color: "#3D7EF5", scores: { gruppe: 22, r16: 9, r8: 6, kvart: 4, semi: 5, bronse_finale: 10 }, bonus: 2, picks: mkPicks("Frankrike","Brasil",["Frankrike","Argentina","Brasil","Spania"],["Frankrike","Argentina","Brasil","Spania"],["Frankrike","Argentina","Brasil","Spania","Portugal","England","USA","Nederland"],["Brasil","USA","Frankrike","Nederland","Portugal","Spania","England","Argentina","Mexico","Canada","Tyskland","Belgia","Norge","Østerrike","Colombia","Kroatia"],groups2,["Norge","Sveits","Iran","Australia","Uruguay","Elfenbenskysten","Japan","Marokko"],["2","Mbappe","7","135","Ja","4","Kosovo","2","Frankrike","Ja"]) },
    { id: "3", name: "Per Persen", color: "#E8334A", scores: { gruppe: 18, r16: 6, r8: 3, kvart: 0, semi: 0, bronse_finale: 10 }, bonus: 1, picks: mkPicks("Argentina","Portugal",["Argentina","Brasil","Portugal","Spania"],["Argentina","Brasil","Portugal","Spania"],["Argentina","Brasil","Portugal","Spania"],["Brasil","USA","Frankrike","Nederland","Portugal","Spania","England","Argentina","Mexico","Canada","Tyskland","Belgia","Norge","Østerrike","Colombia","Kroatia"],groups1,["Belgia","Norge","Marokko","Iran","Uruguay","Japan","Australia","Kroatia"],["4","Neymar","9","150","Nei","6","Bolivia","4","Brasil","Nei"]) },
    { id: "4", name: "Lise Lie", color: "#F5A623", scores: { gruppe: 30, r16: 15, r8: 12, kvart: 12, semi: 15, bronse_finale: 0 }, bonus: 4, picks: mkPicks("Spania","Nederland",["Spania","Brasil","Argentina","Frankrike"],["Spania","Brasil","Argentina","Frankrike"],["Spania","Brasil","Argentina","Frankrike"],["Brasil","USA","Frankrike","Nederland","Portugal","Spania","England","Argentina","Mexico","Canada","Tyskland","Belgia","Norge","Østerrike","Colombia","Kroatia"],groups1,["Norge","Belgia","Iran","Marokko","Japan","Australia","Uruguay","Elfenbenskysten"],["3","Mbappe","8","140","Nei","5","Panama","3","Brasil","Nei"]) },
    { id: "5", name: "Jonas Berg", color: "#A855F7", scores: { gruppe: 20, r16: 9, r8: 9, kvart: 8, semi: 5, bronse_finale: 10 }, bonus: 2, picks: mkPicks("Brasil","Argentina",["Brasil","Frankrike","Argentina","Portugal"],["Brasil","Frankrike","Argentina","Portugal"],["Brasil","Frankrike","Argentina","Portugal"],["Brasil","USA","Frankrike","Nederland","Portugal","Spania","England","Argentina","Mexico","Canada","Tyskland","Belgia","Norge","Østerrike","Colombia","Kroatia"],groups2,["Norge","Sveits","Marokko","Iran","Japan","Australia","Kroatia","Belgia"],["3","Ronaldo","7","145","Ja","5","Panama","3","Brasil","Nei"]) },
  ];

  const fasit = {
    groups: { A: g("Mexico","USA"), B: g("Canada","Sveits"), C: g("Brasil","Marokko"), D: g("USA","Australia"), E: g("Frankrike","Norge"), F: g("Nederland","Japan"), G: g("Belgia","Iran"), H: g("Spania","Uruguay"), I: g("Frankrike","Norge"), J: g("Argentina","Østerrike"), K: g("Portugal","Colombia"), L: g("England","Kroatia") },
    matches: { ...demoR16Winners, ...demoR8Winners, ...demoKvartWinners, 101: "Frankrike", 102: "Brasil" },
    sfLosers: { 101: "Portugal", 102: "Argentina" },
    bronse: "Argentina", finale: "Brasil",
    quiz: ["3","Ronaldo","8","140","Nei","5","Panama","3","Brasil","Nei"],
  };

  return { participants, fasit };
})() : null;

async function saveData(data, baseRevision) {
  const res = await fetch("/.netlify/functions/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { ...data, schemaVersion: 3 }, baseRevision }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    const error = new Error(body.error || `Serveren svarte med ${res.status}`);
    error.status = res.status;
    error.revision = body.revision;
    throw error;
  }
  return body;
}

async function readAdminSession() {
  const res = await fetch("/.netlify/functions/auth", { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Kunne ikke kontrollere adminsesjonen");
  return body;
}

async function createAdminSession(password) {
  const res = await fetch("/.netlify/functions/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    const error = new Error(body.error || "Innlogging feilet");
    error.status = res.status;
    throw error;
  }
  return body;
}

async function deleteAdminSession() {
  await fetch("/.netlify/functions/auth", { method: "DELETE" });
}

async function supporterRows(method = "GET") {
  if (import.meta.env.DEV) {
    const stored = Number(localStorage.getItem(SUPPORTER_ROW_DEV_KEY));
    const count = Number.isFinite(stored) && stored >= 0 ? stored : 0;
    const next = method === "POST" ? count + 1 : count;
    if (method === "POST") localStorage.setItem(SUPPORTER_ROW_DEV_KEY, String(next));
    return next;
  }

  const res = await fetch(SUPPORTER_ROW_ENDPOINT, { method });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !Number.isFinite(body.count)) throw new Error(body.error || "Kunne ikke hente åretak");
  return body.count;
}

function readPublicCache() {
  try {
    const cached = localStorage.getItem(PUBLIC_CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
}

function writePublicCache(data) {
  try { localStorage.setItem(PUBLIC_CACHE_KEY, JSON.stringify(data)); } catch {}
}

async function loadData({ allowPublicCache = false } = {}) {
  try {
    const res = await fetch("/.netlify/functions/data", { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      if (body?.data?.participants) {
        if (allowPublicCache) writePublicCache(body.data);
        return body;
      }
    }
    throw new Error(body.error || `Serveren svarte med ${res.status}`);
  } catch (error) {
    if (allowPublicCache) {
      const cached = readPublicCache();
      if (cached?.participants) return { data: cached, revision: null, cached: true };
    }
    throw error;
  }
}

const editableSnapshot = (participants, fasit, settings) => ({ participants, fasit, settings });
const snapshotSignature = (snapshot) => JSON.stringify(snapshot);

// ── Hjelpere ──
const norm = (s) =>
  String(s || "").toLowerCase().replace(/[^a-zæøåäöü0-9]/g, "");

const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "";
const norwegianNameList = (names) => {
  if (names.length < 2) return names[0] || "";
  if (names.length === 2) return `${names[0]} og ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} og ${names[names.length - 1]}`;
};

const isExcludedFromCompetition = (participant) => participant?.excluded === true;

function pointResult(status, pts, bonus) {
  const points = status === "hit" ? pts : status === "bonus" ? bonus : 0;
  return points > 0 ? { status, points } : null;
}

function makeBracketPointGetter(picks, fasit) {
  if (!picks || !fasit) return null;
  const byMatch = new Map();
  const add = (matchId, team, status, pts, bonus, role = "winner") => {
    const result = pointResult(status, pts, bonus);
    if (!team || !result) return;
    const key = String(matchId);
    if (!byMatch.has(key)) byMatch.set(key, []);
    byMatch.get(key).push({ team: canonicalTeam(team), role, ...result });
  };

  const addRound = (ids, pts, bonus) => {
    const preds = ids.map((id) => picks.matches?.[id]);
    const actuals = ids.map((id) => fasit.matches?.[id]);
    classifyRound(preds, actuals).forEach((status, i) => {
      add(ids[i], preds[i], status, pts, bonus);
    });
  };

  addRound(Object.keys(CELLS.r16), POINTS.r16, POINTS.koBonus);
  addRound(Object.keys(CELLS.r8), POINTS.r8, POINTS.koBonus);
  addRound(Object.keys(CELLS.kvart), POINTS.kvart, POINTS.koBonus);

  const semiIds = ["101", "102"];
  const semiWinnerStatus = classifyRound(
    semiIds.map((id) => picks.matches?.[id]),
    semiIds.map((id) => fasit.matches?.[id])
  );
  semiWinnerStatus.forEach((status, i) => {
    add(semiIds[i], picks.matches?.[semiIds[i]], status, POINTS.semi, POINTS.koBonusSemi, "winner");
  });

  const semiLoserStatus = classifyRound(
    semiIds.map((id) => picks.sfLosers?.[id]),
    semiIds.map((id) => fasit.sfLosers?.[id])
  );
  semiLoserStatus.forEach((status, i) => {
    add(semiIds[i], picks.sfLosers?.[semiIds[i]], status, POINTS.semi, POINTS.koBonusSemi, "loser");
  });

  if (fasit.bronse && teamMatch(picks.bronse, fasit.bronse)) {
    add("bronse", picks.bronse, "hit", POINTS.bronse, 0);
  }
  if (fasit.finale && teamMatch(picks.finale, fasit.finale)) {
    add("finale", picks.finale, "hit", POINTS.finale, 0);
  }

  return (matchId, team, role = null) => {
    if (!team) return null;
    return (byMatch.get(String(matchId)) || []).find((entry) =>
      (!role || entry.role === role) && teamMatch(team, entry.team)
    ) || null;
  };
}

function useIsMobile(bp = 640) {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.innerWidth < bp);
  useEffect(() => {
    const on = () => setM(window.innerWidth < bp);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [bp]);
  return m;
}

const FLAGS = {
  "Mexico": "🇲🇽", "USA": "🇺🇸", "Canada": "🇨🇦", "Sveits": "🇨🇭", "Brasil": "🇧🇷",
  "Marokko": "🇲🇦", "Australia": "🇦🇺", "Tyskland": "🇩🇪", "Elfenbenskysten": "🇨🇮", "Haiti": "🇭🇹",
  "Nederland": "🇳🇱", "Japan": "🇯🇵", "Belgia": "🇧🇪", "Iran": "🇮🇷", "Spania": "🇪🇸", "Ecuador": "🇪🇨",
  "Uruguay": "🇺🇾", "Frankrike": "🇫🇷", "Norge": "🇳🇴", "Argentina": "🇦🇷", "Paraguay": "🇵🇾",
  "Østerrike": "🇦🇹", "Portugal": "🇵🇹", "Colombia": "🇨🇴", "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "Kroatia": "🇭🇷", "Panama": "🇵🇦", "Bolivia": "🇧🇴", "Kosovo": "🇽🇰", "Senegal": "🇸🇳", "Irak": "🇮🇶",
  "Sør-Korea": "🇰🇷", "Sør Korea": "🇰🇷", "Sør-Afrika": "🇿🇦", "Sør Afrika": "🇿🇦", "Qatar": "🇶🇦", "Tsjekkia": "🇨🇿",
  "New Zealand": "🇳🇿", "Egypt": "🇪🇬", "Kapp Verde": "🇨🇻", "Saudi Arabia": "🇸🇦", "Sverige": "🇸🇪", "Tunisia": "🇹🇳",
  "Bosnia og Herzegovina": "🇧🇦", "Skottland": "🏴", "Tyrkia": "🇹🇷", "Curacao": "🇨🇼", "Curaçao": "🇨🇼",
  "Algerie": "🇩🇿", "Jordan": "🇯🇴", "Kongo": "🇨🇩", "Uzbekistan": "🇺🇿", "Ghana": "🇬🇭",
};
const flagOf = (name) => FLAGS[name] || "";

// Emoji flags are not consistently supported on every operating system. Keep the
// emoji as a tiny fallback, but render a real flag image when one is available.
// The ISO code remains visible until the image is ready (or if the CDN is blocked),
// so a flag never becomes an empty gap on a new device.
const FLAG_CODES = {
  "Mexico": "mx", "USA": "us", "Canada": "ca", "Sveits": "ch", "Brasil": "br",
  "Marokko": "ma", "Australia": "au", "Tyskland": "de", "Elfenbenskysten": "ci", "Haiti": "ht",
  "Nederland": "nl", "Japan": "jp", "Belgia": "be", "Iran": "ir", "Spania": "es", "Ecuador": "ec",
  "Uruguay": "uy", "Frankrike": "fr", "Norge": "no", "Argentina": "ar", "Paraguay": "py",
  "Østerrike": "at", "Portugal": "pt", "Colombia": "co", "England": "gb-eng", "Kroatia": "hr",
  "Panama": "pa", "Bolivia": "bo", "Kosovo": "xk", "Senegal": "sn", "Irak": "iq",
  "Sør-Korea": "kr", "Sør Korea": "kr", "Sør-Afrika": "za", "Sør Afrika": "za", "Qatar": "qa", "Tsjekkia": "cz",
  "New Zealand": "nz", "Egypt": "eg", "Kapp Verde": "cv", "Saudi Arabia": "sa", "Sverige": "se", "Tunisia": "tn",
  "Bosnia og Herzegovina": "ba", "Skottland": "gb-sct", "Tyrkia": "tr", "Curacao": "cw", "Curaçao": "cw",
  "Algerie": "dz", "Jordan": "jo", "Kongo": "cd", "Uzbekistan": "uz", "Ghana": "gh",
};

// Excel answers and the live fixture feed do not always use the same spelling.
// Resolve whitespace, punctuation, Norwegian and English names before looking up
// a local SVG so a valid country never falls back to an empty flag slot.
const FLAG_NAME_ALIASES = {
  ...Object.fromEntries(Object.keys(FLAG_CODES).map((name) => [norm(name), name])),
  morocco: "Marokko",
  scotland: "Skottland",
  southafrica: "Sør Afrika",
  southkorea: "Sør Korea",
  netherlands: "Nederland",
  germany: "Tyskland",
  turkey: "Tyrkia",
  ivorycoast: "Elfenbenskysten",
  capeverde: "Kapp Verde",
  saudiarabia: "Saudi Arabia",
  congodr: "Kongo",
  drcongo: "Kongo",
  democraticrepublicofthecongo: "Kongo",
  democraticrepublicofcongo: "Kongo",
  rdcongo: "Kongo",
};

const canonicalFlagName = (name) => {
  const cleanName = String(name || "").replace(/\u00a0/g, " ").trim();
  const alias = FLAG_NAME_ALIASES[norm(cleanName)];
  if (alias) return alias;
  // Fall back to the canonical team name so Excel spelling variants
  // ("Bosnia and Herzegovina", "Bosnia & Herzegovina", \u2026) still find their flag.
  const canon = canonicalTeam(cleanName);
  if (FLAG_CODES[canon]) return canon;
  return cleanName;
};

// A few flag icons need self-contained image data so they paint consistently
// at the small size used in prediction chips.

function Flag({ name, code, size = 18 }) {
  const countryName = canonicalFlagName(name);
  const countryCode = FLAG_CODES[countryName] || code?.toLowerCase();
  const h = Math.round(size * 0.75);
  const r = Math.max(1, Math.round(size / 10));
  if (!countryCode) {
    return (
      <span role="img" aria-label={countryName ? `${countryName} flagg` : "Flagg"} style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: size, height: h, verticalAlign: "middle", borderRadius: r,
        background: "var(--bg2)", color: "var(--text3)", fontSize: Math.max(7, Math.round(size * 0.42)), fontWeight: 800,
      }}>{flagOf(countryName) || "?"}</span>
    );
  }
  return (
    <span
      role="img"
      aria-label={countryName ? `${countryName} flagg` : "Flagg"}
      className={`fi fi-${countryCode}`}
      style={{ display: "inline-block", width: size, height: h, backgroundSize: "cover", backgroundPosition: "center", verticalAlign: "middle", borderRadius: r, flexShrink: 0 }}
    />
  );
}

// FIFA 3-letter codes keep prediction cards readable at desktop and mobile widths.
const CODES = {
  "Mexico": "MEX", "USA": "USA", "Canada": "CAN", "Sveits": "SUI", "Brasil": "BRA",
  "Marokko": "MAR", "Australia": "AUS", "Tyskland": "GER", "Elfenbenskysten": "CIV", "Haiti": "HAI",
  "Nederland": "NED", "Japan": "JPN", "Belgia": "BEL", "Iran": "IRN", "Spania": "ESP", "Ecuador": "ECU",
  "Uruguay": "URU", "Frankrike": "FRA", "Norge": "NOR", "Argentina": "ARG", "Paraguay": "PAR",
  "Østerrike": "AUT", "Portugal": "POR", "Colombia": "COL", "England": "ENG", "Kroatia": "CRO",
  "Panama": "PAN", "Bolivia": "BOL", "Kosovo": "KOS", "Senegal": "SEN", "Irak": "IRQ",
  "Sør-Korea": "KOR", "Sør Korea": "KOR", "Sør-Afrika": "RSA", "Sør Afrika": "RSA", "Qatar": "QAT", "Tsjekkia": "CZE",
  "New Zealand": "NZL", "Egypt": "EGY", "Kapp Verde": "CPV", "Saudi Arabia": "KSA", "Sverige": "SWE", "Tunisia": "TUN",
  "Bosnia og Herzegovina": "BIH", "Skottland": "SCO", "Tyrkia": "TUR", "Curacao": "CUW", "Curaçao": "CUW",
  "Algerie": "ALG", "Jordan": "JOR", "Kongo": "COD", "Uzbekistan": "UZB", "Ghana": "GHA",
};
const codeOf = (name) => {
  const canonicalName = canonicalTeam(name);
  return CODES[canonicalName] || (canonicalName ? canonicalName.slice(0, 3).toUpperCase() : "");
};

// FotMob-style group "table" row block: qualification bar + position + flag + name.
// Skeleton placeholders for slots that aren't decided yet (nicer than a bare "—").
const SkelDot = ({ s = 11 }) => <span aria-hidden="true" style={{ display: "inline-block", width: s, height: s, borderRadius: "50%", background: "var(--text5)", verticalAlign: "middle" }} />;
const SkelBar = ({ w = 52 }) => <span aria-hidden="true" style={{ display: "inline-block", width: w, maxWidth: "78%", height: 8, borderRadius: 4, background: "var(--text5)", verticalAlign: "middle" }} />;

function GroupTableCard({ g, first, second, compact }) {
  const teams = [first, second];
  return (
    <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: compact ? 9 : 12, overflow: "hidden" }}>
      <div style={{ padding: compact ? "2px 7px" : "10px 14px", fontSize: compact ? 9.5 : 12, fontWeight: 800, color: "var(--text3)",
        textTransform: "uppercase", letterSpacing: compact ? 0.5 : 1, borderBottom: "1px solid var(--border)" }}>{compact ? g : `Gruppe ${g}`}</div>
      {teams.map((team, i) => (
        <div key={i} style={{ display: "flex", alignItems: "stretch",
          borderBottom: i === 0 ? "1px solid var(--bg2)" : "none" }}>
          <div style={{ width: compact ? 3 : 4, background: team ? "#22C55E" : "var(--border)", flexShrink: 0 }} />
          <div style={{ display: "flex", alignItems: "center", gap: compact ? 5 : 11, padding: compact ? "3px 6px" : "11px 14px", flex: 1, minWidth: 0 }}>
            {!compact && <span style={{ width: 16, textAlign: "center", fontSize: 14, fontWeight: 700, color: "var(--text3)", flexShrink: 0 }}>{i + 1}</span>}
            <span style={{ fontSize: compact ? 13 : 18, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: compact ? 11 : 16 }}>{team ? <Flag name={team} size={compact ? 13 : 18} /> : <SkelDot s={compact ? 9 : 12} />}</span>
            {team
              ? <span style={{ fontSize: compact ? 12 : 15, fontWeight: 700, letterSpacing: compact ? 0.3 : 0, color: "var(--text1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{compact ? codeOf(team) : team}</span>
              : <SkelBar w={compact ? 24 : 52} />}
          </div>
        </div>
      ))}
    </div>
  );
}

// Rounded orthogonal connector (FotMob-style) from a child point (x0,y0) to a
// parent point (x1,y1): run horizontally to a vertical bus at the midpoint, with
// rounded corners, then on to the parent. Straight line when the rows align.
function elbowH(x0, y0, x1, y1, r = 9) {
  if (Math.abs(y1 - y0) < 0.5) return `M${x0},${y0} L${x1},${y1}`;
  const xm = (x0 + x1) / 2;
  const dy = y1 > y0 ? 1 : -1;
  const s0 = xm > x0 ? 1 : -1;
  const s1 = x1 > xm ? 1 : -1;
  const rr = Math.min(r, Math.abs(xm - x0), Math.abs(x1 - xm), Math.abs(y1 - y0) / 2);
  return `M${x0},${y0} L${xm - s0 * rr},${y0} Q${xm},${y0} ${xm},${y0 + dy * rr} L${xm},${y1 - dy * rr} Q${xm},${y1} ${xm + s1 * rr},${y1} L${x1},${y1}`;
}

// Same idea for the vertical (mobile) bracket: run vertically to a horizontal bus.
function elbowV(x0, y0, x1, y1, r = 8) {
  if (Math.abs(x1 - x0) < 0.5) return `M${x0},${y0} L${x1},${y1}`;
  const ym = (y0 + y1) / 2;
  const dx = x1 > x0 ? 1 : -1;
  const s0 = ym > y0 ? 1 : -1;
  const s1 = y1 > ym ? 1 : -1;
  const rr = Math.min(r, Math.abs(ym - y0), Math.abs(y1 - ym), Math.abs(x1 - x0) / 2);
  return `M${x0},${y0} L${x0},${ym - s0 * rr} Q${x0},${ym} ${x0 + dx * rr},${ym} L${x1 - dx * rr},${ym} Q${x1},${ym} ${x1},${ym + s1 * rr} L${x1},${y1}`;
}

function TrophyIcon({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "block", margin: "0 auto" }} aria-hidden="true">
      <path d="M6 3.5h12V8a6 6 0 0 1-12 0V3.5Z" fill="var(--accent)" fillOpacity="0.15" />
      <path d="M6 3.5h12V8a6 6 0 0 1-12 0V3.5Z" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M6 5H4a2 2 0 0 0 0 4h2.3M18 5h2a2 2 0 0 1 0 4h-2.3" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 14v3.2M8.5 20.5h7M9 20.5c.2-1.7 1.1-2.7 3-3.3 1.9.6 2.8 1.6 3 3.3" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Flat gold crown (solid body + detached base bar) marking the current leader.
function CrownIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ display: "block" }}>
      <path d="M4 7 L8.6 10.8 L12 4.6 L15.4 10.8 L20 7 L20 15 L4 15 Z"
        fill="#EAB948" stroke="#EAB948" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
      <rect x="5" y="17.3" width="14" height="2.9" rx="1.45" fill="#EAB948" />
    </svg>
  );
}

const BADGE_STYLE = {
  finale: { background: "var(--accent)", color: "var(--accent-fg)" },
  bronse: { background: "#C77B30", color: "#FFFFFF" },
};
const Badge = ({ kind, children }) => (
  <span style={{
    display: "inline-block", padding: "2px 8px", borderRadius: 5,
    fontSize: 9, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase",
    whiteSpace: "nowrap", lineHeight: 1.5, ...BADGE_STYLE[kind],
  }}>{children}</span>
);

function LockIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ display: "block" }}>
      <rect x="4.75" y="10" width="14.5" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 14.25v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ size = 12, open = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{
      display: "block", transform: open ? "rotate(180deg)" : "none", transition: "transform .2s ease",
    }}>
      <path d="M5 8.5 12 15.5 19 8.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// FotMob-style mirrored horizontal bracket (desktop / wide screens). Two halves of
// the draw converge on a center column holding the final, the bronze match and the
// champion. Connectors are rounded SVG paths drawn behind the cards.
function renderBracketHorizontal({ getMatch, getBronse, getFinale, compactNames = false, flagOnly = false, getFasitWinner = null, getFasitFinale = null, getFasitBronse = null, getPointResult = null }) {
  // 1,204px total: fits the standard 1,280px content area without forcing a
  // horizontal scroll, while preserving enough room for full team names.
  // flagOnly mode: 508px total, fits 640px+ screens with just flags (no text).
  const CW = flagOnly ? 44 : 116, ROWH = flagOnly ? 26 : 33, CH = 2 * ROWH + 1, CONN = flagOnly ? 14 : 20, CS = CW + CONN, H = flagOnly ? 500 : 600;
  const centerX = 4 * CS;
  const totalW = 8 * CS + CW;

  const leftCols = [
    { x: 0,        label: "16-DEL", ids: BRACKET_TOPOLOGY.left.r32,   pts: POINTS.r16 },
    { x: CS,       label: "8-DEL",  ids: BRACKET_TOPOLOGY.left.r16,   pts: POINTS.r8 },
    { x: 2 * CS,   label: "KVART",  ids: BRACKET_TOPOLOGY.left.kvart, pts: POINTS.kvart },
    { x: 3 * CS,   label: "SEMI",   ids: BRACKET_TOPOLOGY.left.semi,  pts: POINTS.semi },
  ];
  const rightCols = [
    { x: 5 * CS,   label: "SEMI",   ids: BRACKET_TOPOLOGY.right.semi,  pts: POINTS.semi },
    { x: 6 * CS,   label: "KVART",  ids: BRACKET_TOPOLOGY.right.kvart, pts: POINTS.kvart },
    { x: 7 * CS,   label: "8-DEL",  ids: BRACKET_TOPOLOGY.right.r16,   pts: POINTS.r8 },
    { x: 8 * CS,   label: "16-DEL", ids: BRACKET_TOPOLOGY.right.r32,   pts: POINTS.r16 },
  ];
  const cy = (n, i) => H * (i + 0.5) / n;
  const exactPoint = (name, actual, pts) => name && actual && teamMatch(name, actual) ? { status: "hit", points: pts } : null;
  const rowPoint = (id, name, pts, role = null) =>
    getPointResult ? getPointResult(id, name, role) : exactPoint(name, getFasitWinner?.(id), pts);
  const specialPoint = (id, name, pts, actual) =>
    getPointResult ? getPointResult(id, name) : exactPoint(name, actual, pts);

  const Row = (name, divider, result = null) => (
    <>
      {divider && <div style={{ height: 1, background: "var(--bg2)" }} />}
      <div title={flagOnly ? (name || undefined) : undefined} style={{ display: "flex", alignItems: "center", justifyContent: flagOnly ? "center" : "flex-start", gap: flagOnly ? (result?.points ? 2 : 0) : 8, padding: flagOnly ? "0 2px" : "0 11px", height: ROWH, background: result?.points ? bracketPointBg(result.status) : "transparent" }}>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, width: flagOnly ? undefined : 20, fontSize: 15 }}>{name ? <Flag name={name} size={flagOnly ? 16 : 15} /> : (flagOnly ? <SkelDot s={8} /> : <SkelDot />)}</span>
        {!flagOnly && (name
          ? <span title={name} style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: result?.points ? bracketPointColor(result.status) : "var(--text1)" }}>{compactNames ? codeOf(name) : name}</span>
          : <SkelBar w={58} />)}
        <BracketPointBadge result={result} compact={flagOnly} />
      </div>
    </>
  );
  const Card = (id, x, top, pts = null) => {
    const [a, b] = getMatch(id);
    return (
      <div style={{
        position: "absolute", left: x, top, width: CW, zIndex: 2,
        background: "var(--bg4)", borderRadius: 10, overflow: "hidden",
        border: "1px solid var(--border)", boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
      }}>
        {Row(a, false, rowPoint(id, a, pts))}
        {Row(b, true, rowPoint(id, b, pts))}
      </div>
    );
  };

  const paths = [];
  leftCols.forEach((col, k) => {
    if (k === leftCols.length - 1) return;
    const next = leftCols[k + 1], n = col.ids.length;
    next.ids.forEach((_, j) => {
      const c0 = cy(n, 2 * j), c1 = cy(n, 2 * j + 1), py = cy(next.ids.length, j);
      const childRight = col.x + CW, parentLeft = next.x;
      paths.push(elbowH(childRight, c0, parentLeft, py), elbowH(childRight, c1, parentLeft, py));
    });
  });
  rightCols.forEach((col, k) => {
    if (k === rightCols.length - 1) return;
    const next = rightCols[k + 1], nn = next.ids.length;
    col.ids.forEach((_, j) => {
      const c0 = cy(nn, 2 * j), c1 = cy(nn, 2 * j + 1), py = cy(col.ids.length, j);
      const parentRight = col.x + CW, childLeft = next.x;
      paths.push(elbowH(childLeft, c0, parentRight, py), elbowH(childLeft, c1, parentRight, py));
    });
  });
  paths.push(elbowH(leftCols[leftCols.length - 1].x + CW, H / 2, centerX, H / 2));
  paths.push(elbowH(rightCols[0].x, H / 2, centerX + CW, H / 2));

  const lbl = {
    position: "absolute", width: CW, textAlign: "center", top: -24,
    fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: "var(--text3)", textTransform: "uppercase",
  };
  const [finA, finB] = getMatch(104);
  const finale = getFinale(), bronse = getBronse();
  const fasitFinalWinner = getFasitWinner ? getFasitWinner(104) : null;
  const fasitFinale = getFasitFinale ? getFasitFinale() : null;
  const fasitBronse = getFasitBronse ? getFasitBronse() : null;
  const finaleResult = specialPoint("finale", finale, POINTS.finale, fasitFinale);
  const bronseResult = specialPoint("bronse", bronse, POINTS.bronse, fasitBronse);
  const [semiA = null, semiB = null] = MATCH_FEEDERS[104] || [];
  const finAResult = getPointResult ? rowPoint(semiA, finA, POINTS.semi, "winner") : exactPoint(finA, fasitFinalWinner, POINTS.semi);
  const finBResult = getPointResult ? rowPoint(semiB, finB, POINTS.semi, "winner") : exactPoint(finB, fasitFinalWinner, POINTS.semi);
  const finalTop = H / 2 - CH / 2;

  return (
    <div style={{ overflowX: "auto", paddingBottom: 4 }}>
      <div style={{ position: "relative", width: totalW, minWidth: totalW, height: H, margin: "32px auto 8px" }}>
        {leftCols.map((col, i) => <div key={`ll${i}`} style={{ ...lbl, left: col.x }}>{col.label}</div>)}
        {rightCols.map((col, i) => <div key={`rl${i}`} style={{ ...lbl, left: col.x }}>{col.label}</div>)}

        <svg width={totalW} height={H} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", overflow: "visible" }}>
          <g style={{ stroke: "var(--text5)", strokeWidth: 1.5, fill: "none" }} strokeLinecap="round" strokeLinejoin="round">
            {paths.map((d, i) => <path key={i} d={d} />)}
          </g>
        </svg>

        {leftCols.map((col, k) => col.ids.map((id, i) => (
          <React.Fragment key={`lc${k}-${i}`}>{Card(id, col.x, cy(col.ids.length, i) - CH / 2, col.pts)}</React.Fragment>
        )))}
        {rightCols.map((col, k) => col.ids.map((id, i) => (
          <React.Fragment key={`rc${k}-${i}`}>{Card(id, col.x, cy(col.ids.length, i) - CH / 2, col.pts)}</React.Fragment>
        )))}

        {/* Champion */}
        <div style={{ position: "absolute", left: centerX, top: 6, width: CW, textAlign: "center" }}>
          <div style={{ fontSize: flagOnly ? 7.5 : 9.5, fontWeight: 700, letterSpacing: 1, color: "var(--text3)", textTransform: "uppercase", marginBottom: flagOnly ? 2 : 4 }}>Mester</div>
          <TrophyIcon size={flagOnly ? 22 : 34} />
          {finale
            ? flagOnly
              ? <div title={finale} style={{ marginTop: 3, display: "flex", justifyContent: "center", alignItems: "center", gap: finaleResult ? 2 : 0 }}><Flag name={finale} size={18} /><BracketPointBadge result={finaleResult} compact /></div>
              : <div title={finale} style={{ marginTop: 4, display: "flex", alignItems: "baseline", justifyContent: "center", gap: 4, minWidth: 0, color: finaleResult ? bracketPointColor(finaleResult.status) : "var(--accent)" }}><span style={{ minWidth: 0, fontSize: 16, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{compactNames ? codeOf(finale) : finale}</span><BracketPointBadge result={finaleResult} /></div>
            : <div style={{ marginTop: 8, display: "flex", justifyContent: "center" }}><SkelBar w={flagOnly ? 24 : 64} /></div>}
        </div>

        {/* Final */}
        <div style={{ position: "absolute", left: centerX, top: finalTop, width: CW, zIndex: 3 }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: flagOnly ? -16 : -22, textAlign: "center" }}><Badge kind="finale">Finale</Badge></div>
          <div style={{ background: "var(--bg4)", borderRadius: 10, overflow: "hidden", border: "1.5px solid var(--accent)", boxShadow: "0 2px 10px rgba(0,0,0,0.12)" }}>
            {Row(finA, false, finAResult)}
            {Row(finB, true, finBResult)}
          </div>
        </div>

        {/* Bronze */}
        <div style={{ position: "absolute", left: centerX, top: finalTop + CH + (flagOnly ? 26 : 38), width: CW }}>
          <div style={{ marginBottom: flagOnly ? 4 : 6, textAlign: "center" }}><Badge kind="bronse">Bronse</Badge></div>
          <div style={{ background: "var(--bg4)", borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)", boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
            {flagOnly
              ? Row(bronse || null, false, bronseResult)
              : <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 11px", height: ROWH }}>
                  <span style={{ fontSize: 15, width: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{bronse ? <Flag name={bronse} size={15} /> : <SkelDot />}</span>
                  {bronse
                    ? <span title={bronse} style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: bronseResult ? bracketPointColor(bronseResult.status) : "var(--text1)" }}>{compactNames ? codeOf(bronse) : bronse}</span>
                    : <SkelBar w={58} />}
                  <span style={{ marginLeft: "auto", display: "inline-flex" }}><BracketPointBadge result={bronseResult} /></span>
                </div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// FotMob-style vertical mirrored bracket (mobile / narrow). The top half flows down
// and the bottom half flows up, meeting at a center row that holds the bronze match,
// the final and the champion. Connectors are rounded SVG paths behind the cards.
function renderBracketVertical({ getMatch, getBronse, getFinale, containerW = 330, getFasitWinner = null, getFasitFinale = null, getFasitBronse = null, getPointResult = null }) {
  const RH = 21, CH = 2 * RH + 1, CV = 30;
  // The 16-dels row holds eight matches. Size the canvas to the available phone
  // width so all eight cards remain reachable without a horizontal crop; only
  // exceptionally narrow containers use the 260px safety minimum.
  const HALF_W = Math.min(680, Math.max(Math.floor(containerW), 260));
  const CW = Math.min(120, Math.max(34, Math.floor(HALF_W / 8) - 2));
  const useCode = CW < 96;
  const ultraCompact = CW < 58;
  const teamText = (name) => (name ? (useCode ? codeOf(name) : name) : "—");
  const topRounds = [
    { ids: BRACKET_TOPOLOGY.left.r32,   pts: POINTS.r16 },
    { ids: BRACKET_TOPOLOGY.left.r16,   pts: POINTS.r8 },
    { ids: BRACKET_TOPOLOGY.left.kvart, pts: POINTS.kvart },
    { ids: BRACKET_TOPOLOGY.left.semi,  pts: POINTS.semi },
  ];
  const botRounds = [
    { ids: BRACKET_TOPOLOGY.right.semi,  pts: POINTS.semi },
    { ids: BRACKET_TOPOLOGY.right.kvart, pts: POINTS.kvart },
    { ids: BRACKET_TOPOLOGY.right.r16,   pts: POINTS.r8 },
    { ids: BRACKET_TOPOLOGY.right.r32,   pts: POINTS.r16 },
  ];
  const HALF_H = topRounds.length * CH + (topRounds.length - 1) * CV;
  const exactPoint = (name, actual, pts) => name && actual && teamMatch(name, actual) ? { status: "hit", points: pts } : null;
  const rowPoint = (id, name, pts, role = null) =>
    getPointResult ? getPointResult(id, name, role) : exactPoint(name, getFasitWinner?.(id), pts);
  const specialPoint = (id, name, pts, actual) =>
    getPointResult ? getPointResult(id, name) : exactPoint(name, actual, pts);

  const VRow = (name, divider, result = null) => (
    <>
      {divider && <div style={{ height: 1, background: "var(--bg2)" }} />}
      <div title={ultraCompact ? (name || undefined) : undefined} style={{ display: "flex", alignItems: "center", justifyContent: ultraCompact ? "center" : "flex-start", gap: ultraCompact ? (result?.points ? 2 : 0) : 5, padding: ultraCompact ? "0 1px" : "0 7px", height: RH, background: result?.points ? bracketPointBg(result.status) : "transparent" }}>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, width: ultraCompact ? undefined : 16, fontSize: 12 }}>
          {name ? <Flag name={name} size={12} /> : <SkelDot s={ultraCompact ? 7 : 9} />}
        </span>
        {!ultraCompact && (name
          ? <span style={{ flex: 1, minWidth: 0, fontSize: useCode ? 11 : 11.5, fontWeight: 700, letterSpacing: useCode ? 0.3 : 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: result?.points ? bracketPointColor(result.status) : "var(--text1)" }}>{teamText(name)}</span>
          : <span style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "center" }}><SkelBar w={38} /></span>)}
        <BracketPointBadge result={result} compact={ultraCompact} />
      </div>
    </>
  );
  const cardStyle = (accent) => ({
    width: CW, background: "var(--bg4)", borderRadius: 8, overflow: "hidden",
    border: accent ? "1.5px solid var(--accent)" : "1px solid var(--border)",
    boxShadow: accent ? "0 2px 8px rgba(0,0,0,0.1)" : "0 1px 2px rgba(0,0,0,0.06)",
  });

  const renderHalf = (rounds) => {
    const paths = [];
    rounds.forEach((round, ri) => {
      if (ri === rounds.length - 1) return;
      const cur = round.ids.length, nxt = rounds[ri + 1].ids.length;
      const yCurBot = ri * (CH + CV) + CH;
      const yNxtTop = (ri + 1) * (CH + CV);
      const xc = (j, n) => (j + 0.5) * HALF_W / n;
      if (cur === nxt) {
        for (let j = 0; j < cur; j++) paths.push(elbowV(xc(j, cur), yCurBot, xc(j, nxt), yNxtTop));
      } else if (cur > nxt) {
        for (let j = 0; j < cur; j++) paths.push(elbowV(xc(j, cur), yCurBot, xc(Math.floor(j / 2), nxt), yNxtTop));
      } else {
        for (let j = 0; j < nxt; j++) paths.push(elbowV(xc(j, nxt), yNxtTop, xc(Math.floor(j / 2), cur), yCurBot));
      }
    });
    return (
      <div style={{ position: "relative", width: HALF_W, height: HALF_H }}>
        <svg width={HALF_W} height={HALF_H} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
          <g style={{ stroke: "var(--text5)", strokeWidth: 1.5, fill: "none" }} strokeLinecap="round" strokeLinejoin="round">
            {paths.map((d, i) => <path key={i} d={d} />)}
          </g>
        </svg>
        {rounds.map((round, ri) => {
          const N = round.ids.length, y = ri * (CH + CV);
          return round.ids.map((id, j) => {
            const cx = (j + 0.5) * HALF_W / N;
            const [a, b] = getMatch(id);
            return (
              <div key={`${ri}-${j}`} style={{ position: "absolute", left: cx - CW / 2, top: y, zIndex: 2, ...cardStyle(false) }}>
                {VRow(a, false, rowPoint(id, a, round.pts))}
                {VRow(b, true, rowPoint(id, b, round.pts))}
              </div>
            );
          });
        })}
      </div>
    );
  };

  const [finA, finB] = getMatch(104);
  const finale = getFinale(), bronse = getBronse();
  const vFasitFinalWinner = getFasitWinner ? getFasitWinner(104) : null;
  const vFasitFinale = getFasitFinale ? getFasitFinale() : null;
  const vFasitBronse = getFasitBronse ? getFasitBronse() : null;
  const finaleResult = specialPoint("finale", finale, POINTS.finale, vFasitFinale);
  const bronseResult = specialPoint("bronse", bronse, POINTS.bronse, vFasitBronse);
  const [semiA = null, semiB = null] = MATCH_FEEDERS[104] || [];
  const finAResult = getPointResult ? rowPoint(semiA, finA, POINTS.semi, "winner") : exactPoint(finA, vFasitFinalWinner, POINTS.semi);
  const finBResult = getPointResult ? rowPoint(semiB, finB, POINTS.semi, "winner") : exactPoint(finB, vFasitFinalWinner, POINTS.semi);

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: HALF_W, minWidth: HALF_W, margin: "0 auto", padding: "12px 0 8px" }}>
        {renderHalf(topRounds)}

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 12, padding: "16px 0" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ marginBottom: 5 }}><Badge kind="bronse">Bronse</Badge></div>
            <div style={cardStyle(false)}>{VRow(bronse || null, false, bronseResult)}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ marginBottom: 5 }}><Badge kind="finale">Finale</Badge></div>
            <div style={cardStyle(true)}>
              {VRow(finA, false, finAResult)}
              {VRow(finB, true, finBResult)}
            </div>
          </div>
          <div style={{ textAlign: "center", width: CW }}>
            <TrophyIcon size={26} />
            <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1, color: "var(--text3)", textTransform: "uppercase", marginTop: 2 }}>Mester</div>
            {finale
              ? <div title={finale} style={{ marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: finaleResult ? 2 : 0, minWidth: 0, color: finaleResult ? bracketPointColor(finaleResult.status) : "var(--accent)" }}>
                  {ultraCompact
                    ? <Flag name={finale} size={13} />
                    : <span style={{ minWidth: 0, fontSize: 13, fontWeight: 800, letterSpacing: useCode ? 0.3 : 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{teamText(finale)}</span>}
                  <BracketPointBadge result={finaleResult} compact={ultraCompact} />
                </div>
              : <div style={{ marginTop: 5, display: "flex", justifyContent: "center" }}><SkelBar w={44} /></div>}
          </div>
        </div>

        {renderHalf(botRounds)}
      </div>
    </div>
  );
}

// Measures its own width so the vertical bracket scales to fit any container/phone.
function VerticalBracket(opts) {
  const ref = useRef(null);
  const [w, setW] = useState(() => (typeof window !== "undefined" ? Math.min(330, window.innerWidth - 72) : 320));
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0].contentRect.width;
      if (cw > 0) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <div ref={ref} style={{ width: "100%" }}>{renderBracketVertical({ ...opts, containerW: w })}</div>;
}

function cumulative(p, uptoIdx) {
  let s = 0;
  for (let i = 0; i <= uptoIdx; i++) s += p.scores[ROUNDS[i].key] || 0;
  return s;
}
function rankingAt(participants, roundIdx) {
  return [...participants]
    .map((p) => ({ ...p, total: cumulative(p, roundIdx) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

function movementTotal(p) {
  return cumulative(p, ROUNDS.length - 1);
}

function leaderboardSnapshotRows(participants) {
  return participants
    .filter((p) => !isExcludedFromCompetition(p))
    .map((p) => ({ id: p.id, name: p.name, total: movementTotal(p) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "nb-NO"));
}

function scoreboardMovementSignature(participants) {
  return JSON.stringify(
    participants
      .filter((p) => !isExcludedFromCompetition(p))
      .map((p) => ({ id: p.id, total: movementTotal(p) }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id), "nb-NO"))
  );
}

function createLeaderboardSnapshot(participants, sourceLabel = "Siste oppdatering") {
  const rows = leaderboardSnapshotRows(participants);
  if (!rows.length) return null;
  return {
    sourceLabel,
    takenAt: Date.now(),
    rows: rows.map((p, i) => ({ id: p.id, rank: i + 1, total: p.total })),
  };
}

function leaderboardMovementFromSnapshot(participants, snapshot) {
  if (!snapshot?.rows?.length) return new Map();
  const before = new Map(snapshot.rows.map((p) => [p.id, p]));
  const movement = new Map();
  leaderboardSnapshotRows(participants).forEach((p, i) => {
    const previous = before.get(p.id);
    if (!previous) return;
    const currentRank = i + 1;
    const rankChange = previous.rank - currentRank;
    const pointsGained = p.total - previous.total;
    if (rankChange <= 0 && pointsGained <= 0) return;
    movement.set(p.id, {
      currentRank,
      previousRank: previous.rank,
      rankChange,
      pointsGained,
      sourceLabel: snapshot.sourceLabel || "Siste oppdatering",
    });
  });
  return movement;
}

// ─────────────────────────────────────────────
// TREFF-OVERSIKT: hvilke tips var riktige (per kategori), med poeng
// ─────────────────────────────────────────────
function pickResults(picks, fasit) {
  picks = picks || {};
  const sections = [];
  // Posisjonelt tips (gruppe/bronse/finale/quiz): hit, miss eller ikke avgjort.
  const mk = (label, pick, actual, pts, team = true) => {
    const status = pick && !actual ? "pending" : pick && actual && teamMatch(pick, actual) ? "hit" : "miss";
    return { label, pick: pick || "", actual, status, points: status === "hit" ? pts : 0, max: pts, team };
  };
  // Sluttspillrunde: hit (rett plass), bonus (rett lag feil plass) eller miss.
  const koItems = (ids, pts, bonus, labelFn, getA, getP) => {
    const actuals = ids.map(getA);
    const preds = ids.map(getP);
    const status = classifyRound(preds, actuals);
    return ids
      .map((m, i) => ({
        label: labelFn(i), pick: preds[i] || "", actual: actuals[i] || null,
        status: preds[i] && !actuals[i] ? "pending" : status[i],
        points: status[i] === "hit" ? pts : status[i] === "bonus" ? bonus : 0, max: pts, team: true,
      }))
      .filter((it) => it.pick || it.actual);
  };
  const push = (key, label, items) => {
    if (!items.length) return;
    sections.push({
      key, label, items,
      earned: items.reduce((s, it) => s + it.points, 0),
      hits: items.filter((it) => it.status === "hit").length,
      bonuses: items.filter((it) => it.status === "bonus").length,
    });
  };

  // Gruppespill: 1.- og 2.-plass (posisjonelt) + beste treere (mengde-match)
  const groupItems = [];
  for (const g of GROUP_KEYS) {
    const f = fasit.groups[g] || {};
    const p = picks.groups?.[g] || {};
    if (p.first || f.first) groupItems.push(mk(`Gruppe ${g} · 1.`, p.first, f.first, POINTS.group));
    if (p.second || f.second) groupItems.push(mk(`Gruppe ${g} · 2.`, p.second, f.second, POINTS.group));
  }
  const fThirds = (fasit.thirds || []).filter(Boolean);
  const used = new Set();
  (picks.thirds || []).filter(Boolean).forEach((pt) => {
    if (!fThirds.length) {
      groupItems.push({ label: "Beste 3.-plass", pick: pt, actual: null, status: "pending", points: 0, max: POINTS.third, team: true });
    } else {
      const hit = fThirds.findIndex((ft, i) => !used.has(i) && teamMatch(pt, ft));
      if (hit >= 0) used.add(hit);
      groupItems.push({ label: "Beste 3.-plass", pick: pt, actual: null, status: hit >= 0 ? "hit" : "miss", points: hit >= 0 ? POINTS.third : 0, max: POINTS.third, team: true });
    }
  });
  push("gruppe", "Gruppespill", groupItems);

  // Sluttspill: posisjonspoeng + bonus for rett lag feil plass
  const mm = (m) => fasit.matches?.[m], pm = (m) => picks.matches?.[m];
  push("r16", "16-delsfinaler", koItems(Object.keys(CELLS.r16), POINTS.r16, POINTS.koBonus, (i) => `Kamp ${i + 1}`, mm, pm));
  push("r8", "8-delsfinaler", koItems(Object.keys(CELLS.r8), POINTS.r8, POINTS.koBonus, (i) => `Kamp ${i + 1}`, mm, pm));
  push("kvart", "Kvartfinaler", koItems(Object.keys(CELLS.kvart), POINTS.kvart, POINTS.koBonus, (i) => `Kamp ${i + 1}`, mm, pm));
  push("semi", "Semifinaler", [
    ...koItems(["101", "102"], POINTS.semi, POINTS.koBonusSemi, (i) => `Semi ${i + 1} · vinner`, mm, pm),
    ...koItems(["101", "102"], POINTS.semi, POINTS.koBonusSemi, (i) => `Semi ${i + 1} · taper`, (m) => fasit.sfLosers?.[m], (m) => picks.sfLosers?.[m]),
  ]);

  const bf = [];
  if (picks.bronse || fasit.bronse) bf.push(mk("Bronsefinale", picks.bronse, fasit.bronse, POINTS.bronse));
  if (picks.finale || fasit.finale) bf.push(mk("Finale · mester", picks.finale, fasit.finale, POINTS.finale));
  push("bf", "Bronse & finale", bf);

  // VM-quiz: spm 4 (idx 3) har ±5-toleranse
  const quizItems = [];
  QUIZ_QUESTIONS.forEach((q, i) => {
    const f = fasit.quiz?.[i];
    if (!f) return;
    const p = picks.quiz?.[i];
    let correct;
    if (i === 3) {
      const fn = parseInt(String(f).replace(/\D/g, ""), 10);
      const pn = parseInt(String(p).replace(/\D/g, ""), 10);
      correct = !isNaN(fn) && !isNaN(pn) && Math.abs(fn - pn) <= 5;
    } else {
      correct = !!p && norm(f) === norm(p);
    }
    quizItems.push({ label: `${i + 1}. ${q}`, pick: p || "", actual: f, status: correct ? "hit" : "miss", points: correct ? POINTS.quiz : 0, max: POINTS.quiz, team: false });
  });
  push("quiz", "VM-quiz", quizItems);

  // Vis lagnavn kanonisk (offisielt navn + flagg uansett skrivemåte i Excel).
  for (const sec of sections) {
    for (const it of sec.items) {
      if (!it.team) continue;
      if (it.pick) it.pick = canonicalTeam(it.pick);
      if (it.actual) it.actual = canonicalTeam(it.actual);
    }
  }

  return {
    sections,
    earned: sections.reduce((s, sec) => s + sec.earned, 0),
    hits: sections.reduce((s, sec) => s + sec.hits, 0),
    bonuses: sections.reduce((s, sec) => s + sec.bonuses, 0),
    itemCount: sections.reduce((s, sec) => s + sec.items.length, 0),
  };
}

// ─────────────────────────────────────────────
// EXCEL-PARSING
// ─────────────────────────────────────────────
// A saved workbook can contain a cover or instruction sheet before the answer
// sheet. We identify the fixed VM 2026 answer sheet by its round headings, then
// use filled team picks only to break ties between matching sheets.
const ANSWER_SHEET_SIGNATURE = [
  ["A1", "gruppespill"],
  ["D1", "16-delsfinaler"],
  ["G1", "8-delsfinaler"],
  ["J1", "kvartfinaler"],
  ["M1", "semifinaler"],
  ["Q1", "bronsefinale"],
  ["T1", "finale"],
];

const normalizeExcelLabel = (value) => String(value || "")
  .replace(/\u00a0/g, " ")
  .trim()
  .toLowerCase()
  .replace(/\s+/g, " ");

function isExcelTeamPick(value) {
  return isOfficialTeam(value);
}

function answerSheet(wb) {
  const knockoutAddresses = [
    ...Object.values(CELLS.r16),
    ...Object.values(CELLS.r8),
    ...Object.values(CELLS.kvart),
    CELLS.semi[101].win, CELLS.semi[101].lose,
    CELLS.semi[102].win, CELLS.semi[102].lose,
    CELLS.bronse, CELLS.finale,
  ];
  const groupAddresses = [
    ...GROUP_KEYS.flatMap((g) => [CELLS.groups[g].first, CELLS.groups[g].second]),
    ...CELLS.thirds,
  ];
  let best = null;

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const read = (addr) => {
      const cell = sheet?.[addr];
      return cell?.v === undefined || cell?.v === null ? "" : String(cell.v).trim();
    };
    const isTemplate = ANSWER_SHEET_SIGNATURE.every(([addr, label]) =>
      normalizeExcelLabel(read(addr)).startsWith(label)
    );
    if (!isTemplate) continue;

    // Knockout selections are weighted more heavily: they are the columns
    // most likely to be present in a separate answer sheet.
    const score = knockoutAddresses.filter((addr) => isExcelTeamPick(read(addr))).length * 3
      + groupAddresses.filter((addr) => isExcelTeamPick(read(addr))).length;
    if (!best || score > best.score) best = { sheet, score };
  }

  if (!best) throw new Error("Fant ikke et VM 2026-svarark med riktig Excel-mal.");
  return best.sheet;
}

function parseWorkbook(wb, filename) {
  const ws = answerSheet(wb);
  const val = (addr) => {
    const c = ws[addr];
    if (!c || c.v === undefined || c.v === null) return "";
    const v = String(c.v).trim();
    return v === "0" ? "" : v;
  };
  const team = (addr) => canonicalTeam(val(addr));

  const picks = {
    groups: {}, thirds: [], matches: {}, matchups: {}, sfLosers: {}, bronse: "", finale: "", quiz: [],
  };
  for (const g of GROUP_KEYS) {
    picks.groups[g] = { first: team(CELLS.groups[g].first), second: team(CELLS.groups[g].second) };
  }
  picks.thirds = CELLS.thirds.map(team);
  for (const [m, addr] of Object.entries(CELLS.r16)) picks.matches[m] = team(addr);
  for (const [m, addr] of Object.entries(CELLS.r8)) picks.matches[m] = team(addr);
  for (const [m, addr] of Object.entries(CELLS.kvart)) picks.matches[m] = team(addr);
  picks.matches["101"] = team(CELLS.semi[101].win);
  picks.matches["102"] = team(CELLS.semi[102].win);
  picks.sfLosers["101"] = team(CELLS.semi[101].lose);
  picks.sfLosers["102"] = team(CELLS.semi[102].lose);
  picks.bronse = team(CELLS.bronse);
  picks.finale = team(CELLS.finale);
  for (const [m, addresses] of Object.entries(MATCHUP_CELLS)) picks.matchups[m] = addresses.map(team);
  picks.quiz = CELLS.quiz.map(val);

  // Navn fra filnavn: "Fotball_VM_2026_konkurranse_-_Ola_Nordmann.xlsx"
  let name = filename.replace(/\.(xlsx|xls)$/i, "");
  const dashIdx = name.lastIndexOf("-");
  if (dashIdx >= 0) name = name.slice(dashIdx + 1);
  name = name.replace(/_/g, " ").trim() || "Ukjent";

  return { name, picks };
}

// ─────────────────────────────────────────────
// RESULTATHENTING — worldcup26.ir (gratis, ingen nøkkel)
// Fallback til AI-websøk hvis APIet er nede
// ─────────────────────────────────────────────
async function fetchResultsFromAPI() {
  const BASE = "/.netlify/functions/wc?endpoint=";
  const [teamsRes, groupsRes, gamesRes] = await Promise.all([
    fetch(`${BASE}teams`),
    fetch(`${BASE}groups`),
    fetch(`${BASE}games`).catch(() => null),
  ]);
  if (!teamsRes.ok || !groupsRes.ok) throw new Error("API utilgjengelig");
  return buildLiveFasitFromFeeds({
    teamsData: await teamsRes.json(),
    groupsData: await groupsRes.json(),
    gamesData: gamesRes?.ok ? await gamesRes.json() : { games: [] },
  });
}

// ─────────────────────────────────────────────
// APP
// ─────────────────────────────────────────────
export default function App() {
  const [participants, setParticipants] = useState([]);
  const [fasit, setFasit] = useState(emptyFasit());
  const [movementSnapshot, setMovementSnapshot] = useState(null);
  const [settings, setSettings] = useState(() => normalizeSettings());
  const [adminPreviewCeremony, setAdminPreviewCeremony] = useState(() => normalizeCeremony());
  const [mode, setMode] = useState(() => {
    try {
      const saved = localStorage.getItem(LAST_PUBLIC_MODE_KEY);
      return PUBLIC_MODES.has(saved) ? saved : "hjem";
    } catch {
      return "hjem";
    }
  });
  const [loaded, setLoaded] = useState(false);
  const isMobile = useIsMobile();
  const isCompactHeader = useIsMobile(1080);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionState, setSessionState] = useState("checking");
  const [theme, setTheme] = useState(() => localStorage.getItem("vm_theme") || "dark");
  const [logoClicks, setLogoClicks] = useState(0);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const logoClickTimer = useRef(null);
  const hydratedAdminRef = useRef(false);
  const revisionRef = useRef(null);
  const lastSavedSnapshotRef = useRef("");
  const pendingSaveRef = useRef(null);
  const conflictSnapshotRef = useRef(null);
  const saveTimerRef = useRef(null);
  const saveInFlightRef = useRef(false);
  const saveRetryRef = useRef(0);
  const flushSaveRef = useRef(null);
  const [saveStatus, setSaveStatus] = useState({ state: "idle", message: "" });
  const participantsRef = useRef(participants);
  const fasitRef = useRef(fasit);

  useEffect(() => { participantsRef.current = participants; }, [participants]);
  useEffect(() => { fasitRef.current = fasit; }, [fasit]);

  const recordScoreboardMovement = useCallback((beforeParticipants, afterParticipants, sourceLabel) => {
    const before = beforeParticipants || [];
    const after = afterParticipants || [];
    if (scoreboardMovementSignature(before) === scoreboardMovementSignature(after)) return;
    const snapshot = createLeaderboardSnapshot(before, sourceLabel);
    if (snapshot) setMovementSnapshot(snapshot);
  }, []);

  const applyDataEnvelope = useCallback((envelope, sourceLabel, { adminBaseline = false } = {}) => {
    const data = envelope?.data;
    if (!data?.participants) return false;
    const nextFasit = { ...emptyFasit(), ...(data.fasit || {}) };
    const nextSettings = normalizeSettings(data.settings);
    recordScoreboardMovement(participantsRef.current, data.participants, sourceLabel);
    setParticipants(data.participants);
    setFasit(nextFasit);
    setSettings(nextSettings);
    revisionRef.current = envelope.revision ?? null;
    if (adminBaseline) {
      lastSavedSnapshotRef.current = snapshotSignature(editableSnapshot(data.participants, nextFasit, nextSettings));
    }
    return true;
  }, [recordScoreboardMovement]);

  const flushPendingSave = useCallback(async () => {
    if (saveInFlightRef.current || conflictSnapshotRef.current) return;
    const pending = pendingSaveRef.current;
    if (!pending) return;
    pendingSaveRef.current = null;
    saveInFlightRef.current = true;
    setSaveStatus({ state: "saving", message: "Lagrer endringer i skyen …" });
    let retryScheduled = false;
    try {
      const result = await saveData(pending.snapshot, revisionRef.current);
      revisionRef.current = result.revision;
      lastSavedSnapshotRef.current = pending.signature;
      saveRetryRef.current = 0;
      if (!pendingSaveRef.current) setSaveStatus({ state: "saved", message: "Lagret i skyen" });
    } catch (error) {
      if (error.status === 409) {
        conflictSnapshotRef.current = pending;
        pendingSaveRef.current = null;
        setSaveStatus({
          state: "conflict",
          message: "Nyere data finnes i skyen. Velg lokal eksport eller last inn skyversjonen.",
        });
      } else {
        if (!pendingSaveRef.current) pendingSaveRef.current = pending;
        if (saveRetryRef.current < 3) {
          const retrySeconds = 2 ** saveRetryRef.current;
          saveRetryRef.current += 1;
          retryScheduled = true;
          setSaveStatus({ state: "error", message: `Lagring feilet. Prøver igjen om ${retrySeconds} s …` });
          saveTimerRef.current = window.setTimeout(() => flushSaveRef.current?.(), retrySeconds * 1000);
        } else {
          setSaveStatus({ state: "error", message: `Ikke lagret: ${error.message}` });
        }
      }
    } finally {
      saveInFlightRef.current = false;
      if (!retryScheduled && !conflictSnapshotRef.current && pendingSaveRef.current) {
        saveTimerRef.current = window.setTimeout(() => flushSaveRef.current?.(), 0);
      }
    }
  }, []);
  flushSaveRef.current = flushPendingSave;

  const applyLiveResults = useCallback((liveResults) => {
    const currentFasit = fasitRef.current;
    const merged = mergeLiveResults(currentFasit, liveResults);
    if (liveResultsSignature(merged) === liveResultsSignature(currentFasit)) return false;
    const currentParticipants = participantsRef.current;
    const nextParticipants = recalculateParticipantScores(currentParticipants, merged);
    recordScoreboardMovement(currentParticipants, nextParticipants, "Siste liveoppdatering");
    setFasit(merged);
    setParticipants(nextParticipants);
    return true;
  }, [recordScoreboardMovement]);

  // Mobile browsers reveal the document behind the app while rubber-banding at
  // the bottom. Keep that surface in sync with the selected site theme.
  useEffect(() => {
    const pageBackground = theme === "light" ? "#FAF0EE" : "#000000";
    document.documentElement.style.backgroundColor = pageBackground;
    document.body.style.backgroundColor = pageBackground;
  }, [theme]);

  useEffect(() => {
    // Restore public navigation after refresh, but never reopen an admin-only
    // view for a visitor whose admin session has ended.
    if (!PUBLIC_MODES.has(mode)) return;
    try { localStorage.setItem(LAST_PUBLIC_MODE_KEY, mode); } catch {}
  }, [mode]);

  useEffect(() => {
    let active = true;
    try { localStorage.removeItem(LEGACY_ADMIN_STORAGE_KEY); } catch {}

    if (DEMO_DATA) {
      const demoFasit = { ...emptyFasit(), ...DEMO_DATA.fasit };
      // Derive scores from picks vs resultat (same as «Beregn poeng») so the
      // leaderboard totals match the per-deltaker treff-oversikt.
      setParticipants(DEMO_DATA.participants.map((p) => {
        if (!p.picks) return p;
        const s = computeScores(p.picks, demoFasit);
        return {
          ...p,
          scores: { gruppe: s.gruppe, r16: s.r16, r8: s.r8, kvart: s.kvart, semi: s.semi, bronse_finale: s.bronse_finale },
          bonus: s.bonus,
        };
      }));
      setFasit(demoFasit);
      setSessionState("public");
      setLoaded(true);
      return () => { active = false; };
    }

    const cached = readPublicCache();
    if (cached?.participants) setParticipants(cached.participants);
    if (cached?.fasit) setFasit({ ...emptyFasit(), ...cached.fasit });
    if (cached?.settings) setSettings(normalizeSettings(cached.settings));
    if (cached?.participants) setLoaded(true);

    const hydrate = async () => {
      try {
        const session = await readAdminSession();
        if (!active) return;
        setSessionState(session.authenticated ? "admin-loading" : "public");
        const envelope = await loadData({ allowPublicCache: !session.authenticated });
        if (!active) return;
        if (!applyDataEnvelope(envelope, "Siste skyoppdatering", { adminBaseline: session.authenticated })) {
          throw new Error("Serveren returnerte ikke gyldige konkurransedata");
        }
        hydratedAdminRef.current = session.authenticated;
        setIsAdmin(session.authenticated);
        setSessionState(session.authenticated ? "admin" : "public");
        setLoaded(true);
      } catch (error) {
        if (!active) return;
        hydratedAdminRef.current = false;
        setIsAdmin(false);
        setSessionState("error");
        if (!cached?.participants) setSaveStatus({ state: "error", message: error.message });
      }
    };
    hydrate();
    return () => { active = false; };
  }, [applyDataEnvelope]);

  useEffect(() => {
    if (!loaded || !isAdmin || !hydratedAdminRef.current || DEMO_DATA || conflictSnapshotRef.current) return;
    const snapshot = { participants, fasit, settings };
    const signature = snapshotSignature(snapshot);
    if (signature === lastSavedSnapshotRef.current) return;
    pendingSaveRef.current = { snapshot, signature };
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => flushSaveRef.current?.(), 750);
    return () => window.clearTimeout(saveTimerRef.current);
  }, [participants, fasit, settings, loaded, isAdmin]);

  useEffect(() => {
    const warnIfDirty = (event) => {
      if (!pendingSaveRef.current && !saveInFlightRef.current && !conflictSnapshotRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnIfDirty);
    return () => window.removeEventListener("beforeunload", warnIfDirty);
  }, []);

  // Public viewers follow the admin-controlled ceremony without needing to reload.
  useEffect(() => {
    if (!loaded || sessionState !== "public" || DEMO_DATA) return;
    let active = true;
    const refresh = async () => {
      try {
        const envelope = await loadData({ allowPublicCache: true });
        if (active) applyDataEnvelope(envelope, "Siste skyoppdatering");
      } catch {}
    };
    const interval = window.setInterval(refresh, 30000);
    return () => { active = false; window.clearInterval(interval); };
  }, [loaded, sessionState, applyDataEnvelope]);

  const handleLogoClock = () => {
    clearTimeout(logoClickTimer.current);
    setLogoClicks((prev) => {
      const next = prev + 1;
      if (next >= 5) {
        setShowPasswordModal(true);
        return 0;
      }
      logoClickTimer.current = setTimeout(() => setLogoClicks(0), 2000);
      return next;
    });
  };

  const handlePasswordSubmit = async () => {
    setPasswordError("");
    try {
      await createAdminSession(passwordInput);
      setSessionState("admin-loading");
      const envelope = await loadData();
      if (!applyDataEnvelope(envelope, "Admininnlogging", { adminBaseline: true })) {
        throw new Error("Kunne ikke hente komplett admindata");
      }
      hydratedAdminRef.current = true;
      setIsAdmin(true);
      setSessionState("admin");
      setShowPasswordModal(false);
      setPasswordInput("");
      setMode("deltakere");
    } catch (error) {
      await deleteAdminSession().catch(() => undefined);
      hydratedAdminRef.current = false;
      setIsAdmin(false);
      setSessionState("public");
      setPasswordError(error.message || "Innlogging feilet");
    }
  };

  const handleLogout = async () => {
    await deleteAdminSession().catch(() => undefined);
    hydratedAdminRef.current = false;
    revisionRef.current = null;
    lastSavedSnapshotRef.current = "";
    pendingSaveRef.current = null;
    conflictSnapshotRef.current = null;
    window.clearTimeout(saveTimerRef.current);
    setIsAdmin(false);
    setSessionState("public");
    setSaveStatus({ state: "idle", message: "" });
    setMode("stilling");
    try {
      const envelope = await loadData({ allowPublicCache: true });
      applyDataEnvelope(envelope, "Offentlig visning");
    } catch {}
  };

  const retrySave = () => {
    saveRetryRef.current = 0;
    window.clearTimeout(saveTimerRef.current);
    flushSaveRef.current?.();
  };

  const exportUnsavedData = () => {
    const pending = conflictSnapshotRef.current || pendingSaveRef.current;
    if (!pending?.snapshot) return;
    const blob = new Blob([JSON.stringify(pending.snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vm-konkurranse-ulagret-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const reloadCloudVersion = async () => {
    const envelope = await loadData();
    applyDataEnvelope(envelope, "Skyversjon", { adminBaseline: true });
    pendingSaveRef.current = null;
    conflictSnapshotRef.current = null;
    saveRetryRef.current = 0;
    setSaveStatus({ state: "saved", message: "Skyversjonen er lastet inn" });
  };

  const setCeremony = (nextCeremony) => {
    const ceremony = normalizeCeremony(nextCeremony);
    if (settings.ceremonyUnlocked) {
      setSettings((current) => ({ ...normalizeSettings(current), ceremony }));
    } else {
      setAdminPreviewCeremony(ceremony);
    }
  };

  const togglePublicCeremony = () => {
    if (settings.ceremonyUnlocked) {
      setSettings((current) => ({ ...normalizeSettings(current), ceremonyUnlocked: false }));
      return;
    }
    const ceremony = normalizeCeremony();
    setAdminPreviewCeremony(ceremony);
    setSettings((current) => ({ ...normalizeSettings(current), ceremonyUnlocked: true, ceremony }));
  };

  if (!loaded) {
    return (
      <div style={{ ...S.app, alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "var(--text1)", fontWeight: 700, fontSize: 18 }}>Laster …</div>
      </div>
    );
  }

  const publicTabs = [["hjem", "Hjem"], ["stilling", "Stilling"], ["fasit-view", "Resultat"], ["vei-vm", "Veien til VM"], ["present", "Kåring"]];
  const adminTabs = [["deltakere", "Deltakere"], ["fasit", "Rediger resultat"]];
  const tabs = isAdmin ? [...publicTabs, ...adminTabs] : publicTabs;
  const bonusPublished = settings.ceremony.phase === "winner";
  const activeCeremony = settings.ceremonyUnlocked ? settings.ceremony : adminPreviewCeremony;

  return (
    <div style={S.app} data-theme={theme}>
      <style>{CSS}</style>

      {showPasswordModal && (
        <div style={S.modalOverlay}>
          <div style={S.modal}>
            <div style={S.modalTitle}>Admin-tilgang</div>
            <input
              type="password"
              autoFocus
              value={passwordInput}
              onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
              placeholder="Passord"
              style={{ ...S.input, marginBottom: 8 }}
            />
            {passwordError && <div style={{ color: "#E8334A", fontSize: 13, marginBottom: 8 }}>{passwordError}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handlePasswordSubmit} style={S.calcBtn}>Logg inn</button>
              <button onClick={() => { setShowPasswordModal(false); setPasswordInput(""); setPasswordError(""); }}
                style={{ ...S.addBtn }}>Avbryt</button>
            </div>
          </div>
        </div>
      )}

      <header style={S.header}>
        <div style={{
          ...S.headerInner,
          ...(!isCompactHeader ? { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)" } : {}),
        }}>
          <div onClick={handleLogoClock} style={{ ...S.logo, cursor: "default", userSelect: "none", ...(!isCompactHeader ? { justifySelf: "start" } : {}) }}>
            <img src={vmTrophyMark} alt="" style={S.logoMark} />
            <div>
              <div style={S.title}>VM 2026</div>
              <div style={S.subtitle}>Tippekonkurranse</div>
              <div aria-hidden="true" style={{
                width: 126, height: 4, marginTop: 6, borderRadius: 4,
                backgroundImage: `url(${theme === "light" ? norseKnitBandLight : norseKnitBand})`,
                backgroundSize: "52px 52px", backgroundPosition: "center",
                border: theme === "light" ? "1px solid rgba(162, 76, 66, 0.16)" : "1px solid rgba(75, 123, 182, 0.34)",
              }} />
            </div>
          </div>
          <div className="no-scrollbar" style={{
            ...S.modeToggle,
            marginLeft: isCompactHeader && !isMobile ? "auto" : 0,
            ...(!isCompactHeader ? { justifySelf: "center" } : {}),
            ...(isMobile ? { order: 3, flexBasis: "100%", maxWidth: "100%", overflowX: "auto", justifyContent: "flex-start" } : {}),
          }}>
            {tabs.map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)}
                disabled={m === "present" && (isAdmin || settings.ceremonyUnlocked) && participants.filter((p) => !isExcludedFromCompetition(p)).length < 2}
                style={{ ...S.modeBtn, ...(mode === m ? S.modeBtnActive : {}) }}>
                {m === "present" && !settings.ceremonyUnlocked && <span aria-hidden="true" style={S.tabLock}><LockIcon size={12} /></span>}
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, ...(!isCompactHeader ? { justifySelf: "end", minWidth: 0 } : {}) }}>
            {isAdmin && mode === "present" && (
              <button
                type="button"
                aria-pressed={settings.ceremonyUnlocked}
                onClick={togglePublicCeremony}
                style={{ ...S.ceremonyToggle, ...(settings.ceremonyUnlocked ? S.ceremonyToggleOpen : {}) }}>
                {settings.ceremonyUnlocked ? "Lås offentlig kåring" : "Start offentlig kåring"}
              </button>
            )}
            <button onClick={() => {
              const next = theme === "dark" ? "light" : "dark";
              setTheme(next);
              localStorage.setItem("vm_theme", next);
            }} style={{
              ...S.removeBtn,
              fontSize: 13, padding: "5px 12px", fontWeight: 600,
              color: "var(--text3)", border: "1px solid var(--border)", borderRadius: 20,
            }}>
              {theme === "dark" ? "Lyst" : "Mørkt"}
            </button>
            {import.meta.env.DEV && (
              <button onClick={() => {
                if (isAdmin) {
                  setIsAdmin(false); setSessionState("public"); setMode("stilling");
                } else {
                  setIsAdmin(true); setSessionState("admin"); setMode("deltakere");
                }
              }} style={{ ...S.removeBtn, fontSize: 11, padding: "5px 10px", color: isAdmin ? "var(--accent)" : "#F5A623", borderColor: isAdmin ? "var(--accent)" : "#F5A62340" }}>
                {isAdmin ? "ADMIN ON" : "ADMIN OFF"}
              </button>
            )}
            {isAdmin && !import.meta.env.DEV && (
              <button title="Lås siden" onClick={handleLogout}
                style={{ ...S.removeBtn, fontSize: 12, fontWeight: 700, padding: "6px 10px", color: "var(--text3)", border: "1px solid var(--border)", borderRadius: 20 }}>Lås</button>
            )}
          </div>
        </div>
      </header>

      {mode === "hjem" && <Hjem participants={participants} showBonus={bonusPublished} theme={theme} />}
      {mode === "stilling" && <Stilling participants={participants} fasit={fasit} showBonus={bonusPublished} movementSnapshot={movementSnapshot} />}
      {mode === "fasit-view" && <FasitView fasit={fasit} showBonus={bonusPublished} theme={theme} />}
      {mode === "vei-vm" && <NorgesVeiTilVM theme={theme} />}
      {mode === "deltakere" && (
        <Deltakere
          participants={participants}
          setParticipants={setParticipants}
          fasit={fasit}
          saveStatus={saveStatus}
          saveActions={{ retrySave, exportUnsavedData, reloadCloudVersion }}
          recordScoreboardMovement={recordScoreboardMovement}
        />
      )}
      {mode === "fasit" && <Fasit fasit={fasit} setFasit={setFasit} applyLiveResults={applyLiveResults} />}
      {mode === "present" && (isAdmin || settings.ceremonyUnlocked
        ? <Present
            participants={participants}
            ceremony={activeCeremony}
            setCeremony={setCeremony}
            isAdmin={isAdmin}
            isLive={settings.ceremonyUnlocked}
            onExit={() => setMode("stilling")} />
        : <LockedCeremony />
      )}
      {mode !== "present" && (
        <footer className="site-foot" />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// DELTAKERE — import + manuell redigering
// ─────────────────────────────────────────────
function Deltakere({ participants, setParticipants, fasit, saveStatus, saveActions, recordScoreboardMovement }) {
  const narrowBracket = useIsMobile(1180);
  const [newName, setNewName] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const confirmTimer = useRef(null);
  const fileRef = useRef(null);

  const askDelete = (id) => {
    clearTimeout(confirmTimer.current);
    setConfirmDeleteId(id);
    confirmTimer.current = setTimeout(() => setConfirmDeleteId(null), 2500);
  };

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    if (participants.some((p) => p.name.toLowerCase() === name.toLowerCase())) { setNewName(""); return; }
    setParticipants([...participants, {
      id: crypto.randomUUID(), name,
      color: PALETTE[participants.length % PALETTE.length],
      scores: {}, bonus: 0, picks: null, excluded: false,
    }]);
    setNewName("");
  };
  const remove = (id) => setParticipants(participants.filter((p) => p.id !== id));
  const upd = (id, key, valRaw) => {
    const num = valRaw === "" ? 0 : Math.max(0, parseInt(valRaw, 10) || 0);
    setParticipants(participants.map((p) =>
      p.id === id
        ? key === "bonus" ? { ...p, bonus: num } : { ...p, scores: { ...p.scores, [key]: num } }
        : p
    ));
  };

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setImportMsg("Åpner Excel-leser …");
    let XLSX;
    try {
      // Keep the heavy spreadsheet parser out of the public first-load bundle.
      // Vite caches this chunk after the first admin import in a session.
      XLSX = await import("xlsx");
    } catch (err) {
      console.error("Kunne ikke laste Excel-leser", err);
      setImportMsg("Kunne ikke laste Excel-leser. Prøv igjen.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    let added = 0, updated = 0;
    const failedFiles = [];
    let next = [...participants];
    for (const file of files) {
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf);
        const { name, picks } = parseWorkbook(wb, file.name);
        const existing = next.findIndex((p) => p.name.toLowerCase() === name.toLowerCase());
        if (existing >= 0) {
          next[existing] = { ...next[existing], picks };
          updated++;
        } else {
          next.push({
            id: crypto.randomUUID(), name,
            color: PALETTE[next.length % PALETTE.length],
            scores: {}, bonus: 0, picks, excluded: false,
          });
          added++;
        }
      } catch (err) {
        console.error("Import feilet for", file.name, err);
        failedFiles.push(file.name);
      }
    }
    if (added || updated) setParticipants(next);
    const failedText = failedFiles.length ? ` Ikke importert: ${failedFiles.join(", ")}.` : "";
    setImportMsg(`Importert: ${added} nye, ${updated} oppdatert.${failedText}`);
    if (fileRef.current) fileRef.current.value = "";
  };

  const calcAll = () => {
    const nextParticipants = recalculateParticipantScores(participants, fasit);
    recordScoreboardMovement?.(participants, nextParticipants, "Manuell poengberegning");
    setParticipants(nextParticipants);
    setImportMsg("Poeng beregnet fra resultat ✓");
  };

  const ranked = rankingAt(participants, ROUNDS.length - 1);
  const anyPicks = participants.some((p) => p.picks);

  return (
    <div style={S.adminWrap}>
      {/* Import */}
      <div style={S.importCard}>
        <div style={S.importTitle}>📥 Importer Excel-svar</div>
        <div style={S.importDesc}>
          Last opp utfylte konkurranseskjemaer (.xlsx). Navn hentes fra filnavnet,
          og alle tips leses automatisk.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={S.fileBtn}>
            Velg filer
            <input ref={fileRef} type="file" accept=".xlsx,.xls" multiple
              onChange={handleFiles} style={{ display: "none" }} />
          </label>
          {anyPicks && (
            <button onClick={calcAll} style={S.calcBtn}>Beregn poeng fra resultat</button>
          )}
          {importMsg && <span style={S.importMsg}>{importMsg}</span>}
          {saveStatus.state !== "idle" && (
            <span
              role="status"
              style={{
                ...S.importMsg,
                color: ["error", "conflict"].includes(saveStatus.state) ? "#E8334A" : saveStatus.state === "saved" ? "var(--accent)" : "var(--text3)",
              }}>
              {saveStatus.state === "saved" ? "✓ " : ""}{saveStatus.message}
            </span>
          )}
          {saveStatus.state === "error" && (
            <button type="button" onClick={saveActions.retrySave} style={S.addBtn}>Prøv igjen</button>
          )}
          {saveStatus.state === "conflict" && (
            <>
              <button type="button" onClick={saveActions.exportUnsavedData} style={S.addBtn}>Last ned lokale endringer</button>
              <button type="button" onClick={saveActions.reloadCloudVersion} style={S.calcBtn}>Last inn skyversjonen</button>
            </>
          )}
        </div>
      </div>

      {/* Manuelt tillegg */}
      <div style={S.addRow}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Legg til deltaker manuelt" style={S.input} />
        <button onClick={add} style={S.addBtn}>Legg til</button>
      </div>

      {participants.length === 0 ? (
        <div style={S.empty}>
          Importer Excel-filer eller legg til deltakere manuelt.
          Poeng kan fylles inn manuelt eller beregnes automatisk fra resultatet.
        </div>
      ) : (
        <div style={S.tableScroll}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={{ ...S.th, textAlign: "left", paddingLeft: 16 }}>Deltaker</th>
                {ROUNDS.map((r) => <th key={r.key} style={S.th}>{r.short}</th>)}
                <th style={{ ...S.th, color: "#F5A623" }}>Bonus</th>
                <th style={{ ...S.th, color: "var(--accent)" }}>Sum</th>
                <th style={S.th}></th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => {
                const base = ROUNDS.reduce((s, r) => s + (p.scores[r.key] || 0), 0);
                const isExpanded = expandedId === p.id;
                const colCount = ROUNDS.length + 4;
                return (
                  <React.Fragment key={p.id}>
                    <tr>
                      <td style={{ ...S.td, textAlign: "left", paddingLeft: 16, fontWeight: 600, whiteSpace: "nowrap" }}>
                        <span style={{ ...S.dot, background: p.color }} />
                        <span style={{ fontSize: 15, fontWeight: 800 }}>{firstName(p.name)}</span>
                        {p.picks && <span title="Excel importert" style={{ marginLeft: 6, fontSize: 12 }}>📄</span>}
                      </td>
                      {ROUNDS.map((r) => (
                        <td key={r.key} style={S.td}>
                          <input type="number" min="0" value={p.scores[r.key] ?? ""}
                            onChange={(e) => upd(p.id, r.key, e.target.value)} style={S.scoreInput} />
                        </td>
                      ))}
                      <td style={S.td}>
                        <input type="number" min="0" value={p.bonus || ""}
                          onChange={(e) => upd(p.id, "bonus", e.target.value)}
                          style={{ ...S.scoreInput, borderColor: "#F5A62355", color: "#F5A623", fontWeight: 700 }} />
                      </td>
                      <td style={{ ...S.td, fontWeight: 800, color: "var(--accent)", fontSize: 16 }}>{base + (p.bonus || 0)}</td>
                      <td style={S.td}>
                        {p.picks && (
                          <button onClick={() => setExpandedId(isExpanded ? null : p.id)}
                            style={{ ...S.removeBtn, color: isExpanded ? "#00DC64" : "var(--text3)", borderColor: "transparent", padding: "8px 10px", minWidth: 36, minHeight: 36 }}
                            title="Se tips">{isExpanded ? "▲" : "▼"}</button>
                        )}
                        {confirmDeleteId === p.id
                          ? <button onClick={() => { remove(p.id); setConfirmDeleteId(null); }}
                              style={{ ...S.removeBtn, color: "#E8334A", borderColor: "#E8334A55", fontWeight: 700, fontSize: 11, padding: "8px 10px", whiteSpace: "nowrap", minWidth: 36, minHeight: 36 }}>Slett?</button>
                          : <button onClick={() => askDelete(p.id)} style={{ ...S.removeBtn, padding: "8px 10px", minWidth: 36, minHeight: 36 }} title="Fjern">✕</button>
                        }
                      </td>
                    </tr>
                    {isExpanded && p.picks && (() => {
                      return (
                        <tr>
                          <td colSpan={colCount} style={{ padding: "0 0 16px", background: "var(--bg0)" }}>
                            <div style={{ borderRadius: "0 0 14px 14px", background: "var(--bg3)", border: "1px solid var(--border)", borderTop: "none", overflow: "hidden", fontSize: 13 }}>

                              {/* Gruppespill */}
                              <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                                <div style={{ color: "var(--text3)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>Gruppespill</div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 4, marginBottom: p.picks.thirds?.some(Boolean) ? 10 : 0 }}>
                                  {GROUP_KEYS.map((g) => {
                                    const { first, second } = p.picks.groups?.[g] || {};
                                    if (!first && !second) return null;
                                    return (
                                      <div key={g} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 9px", background: "var(--bg4)", borderRadius: 7, overflow: "hidden" }}>
                                        <span style={{ color: "var(--text3)", fontSize: 10, fontWeight: 800, flexShrink: 0, minWidth: 12 }}>{g}</span>
                                        <span style={{ color: "var(--text1)", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{first || "?"}</span>
                                        <span style={{ color: "var(--text4)", fontSize: 9, flexShrink: 0 }}>›</span>
                                        <span style={{ color: "var(--text3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{second || "?"}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                                {p.picks.thirds?.some(Boolean) && (
                                  <>
                                    <div style={{ color: "var(--text3)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 }}>Beste 3ere videre</div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                      {p.picks.thirds.filter(Boolean).map((t, i) => (
                                        <div key={i} style={{ padding: "3px 9px", background: "var(--bg4)", borderRadius: 6, color: "var(--text3)", fontSize: 12, fontWeight: 600 }}>
                                          {t}
                                        </div>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>

                              {/* Bracket */}
                              {(() => {
                                const pointGetter = makeBracketPointGetter(p.picks, fasit);
                                return (
                                  <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                                    <div style={{ color: "var(--text3)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 10 }}>Sluttspill</div>
                                    {narrowBracket
                                      ? <VerticalBracket
                                          getMatch={makeMatchGetter(p.picks).matchTeams}
                                          getBronse={() => p.picks.bronse}
                                          getFinale={() => p.picks.finale}
                                          getFasitWinner={makeMatchGetter(fasit).winnerOf}
                                          getFasitFinale={() => fasit.finale || null}
                                          getFasitBronse={() => fasit.bronse || null}
                                          getPointResult={pointGetter} />
                                      : renderBracketHorizontal({
                                          getMatch: makeMatchGetter(p.picks).matchTeams,
                                          getBronse: () => p.picks.bronse,
                                          getFinale: () => p.picks.finale,
                                          getFasitWinner: makeMatchGetter(fasit).winnerOf,
                                          getFasitFinale: () => fasit.finale || null,
                                          getFasitBronse: () => fasit.bronse || null,
                                          getPointResult: pointGetter,
                                        })}
                                  </div>
                                );
                              })()}

                              {/* Quiz */}
                              {p.picks.quiz?.some(Boolean) && (
                                <div style={{ padding: "14px 16px" }}>
                                  <div style={{ color: "var(--text3)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>Quiz</div>
                                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px,1fr))", gap: 3 }}>
                                    {QUIZ_QUESTIONS.map((q, i) => p.picks.quiz[i] ? (
                                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", background: "var(--bg4)", borderRadius: 7 }}>
                                        <span style={{ color: "var(--text3)", fontSize: 10, fontWeight: 700, flexShrink: 0, minWidth: 14 }}>{i+1}</span>
                                        <span style={{ color: "var(--text3)", flex: 1, fontSize: 12 }}>{q}</span>
                                        <span style={{ color: "var(--accent)", fontWeight: 700, whiteSpace: "nowrap", fontSize: 12 }}>{p.picks.quiz[i]}</span>
                                      </div>
                                    ) : null)}
                                  </div>
                                </div>
                              )}

                            </div>
                          </td>
                        </tr>
                      );
                    })()}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {participants.length >= 2 && (
        <div style={S.previewBox}>
          <div style={S.previewTitle}>Foreløpig stilling (uten bonus)</div>
          <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {ranked.map((p, i) => (
              <li key={p.id} style={S.previewItem}>
                <span style={S.previewRank}>{i + 1}</span>
                <span style={{ ...S.dot, background: p.color }} />
                <span style={{ flex: 1 }}>{firstName(p.name)}</span>
                <span style={{ fontWeight: 800, color: "var(--accent)" }}>{p.total} p</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// STILLING — public leaderboard
// ─────────────────────────────────────────────
const STATUS_COLOR = { hit: "var(--accent)", bonus: "#E0A106", miss: "var(--text5)", pending: "var(--text4)" };
const KNOCKOUT_SECTION_KEYS = new Set(["r16", "r8", "kvart", "semi", "bf"]);

function PredictionBracket({ picks, fasit }) {
  const narrow = useIsMobile(1180);
  const hasPredictions = Object.values(picks?.matchups || {}).some((pair) => pair?.some(Boolean))
    || Object.values(picks?.matches || {}).some(Boolean)
    || picks?.bronse
    || picks?.finale;
  if (!hasPredictions) return null;

  const getMatch = makeMatchGetter(picks).matchTeams;
  const getBronse = () => picks.bronse || null;
  const getFinale = () => picks.finale || null;
  const getFasitWinner = fasit ? makeMatchGetter(fasit).winnerOf : null;
  const getFasitFinale = fasit ? () => fasit.finale || null : null;
  const getFasitBronse = fasit ? () => fasit.bronse || null : null;
  const getPointResult = makeBracketPointGetter(picks, fasit);

  return (
    <section style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
      <div style={{ padding: "0 2px", marginBottom: 2 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--text3)" }}>Sluttspill · deltakerens tips</div>
        <div style={{ marginTop: 3, color: "var(--text4)", fontSize: 11.5 }}>Tips hele veien til finalen</div>
      </div>
      {narrow
        ? <VerticalBracket getMatch={getMatch} getBronse={getBronse} getFinale={getFinale} getFasitWinner={getFasitWinner} getFasitFinale={getFasitFinale} getFasitBronse={getFasitBronse} getPointResult={getPointResult} />
        : renderBracketHorizontal({ getMatch, getBronse, getFinale, compactNames: true, getFasitWinner, getFasitFinale, getFasitBronse, getPointResult })}
    </section>
  );
}

function StillingBreakdown({ picks, fasit, showBonus }) {
  if (!picks) return <div style={{ padding: "0 20px 18px", color: "var(--text3)", fontSize: 13 }}>Ingen tips registrert.</div>;
  const results = pickResults(picks, fasit);
  const sections = showBonus ? results.sections : results.sections.filter((sec) => sec.key !== "quiz");
  const earned = sections.reduce((sum, sec) => sum + sec.earned, 0);
  const hits = sections.reduce((sum, sec) => sum + sec.hits, 0);
  const bonuses = sections.reduce((sum, sec) => sum + sec.bonuses, 0);
  const decidedCount = sections.reduce((sum, sec) => sum + sec.items.filter((it) => it.status !== "pending").length, 0);
  const pendingCount = sections.reduce((sum, sec) => sum + sec.items.filter((it) => it.status === "pending").length, 0);
  const nonKnockoutSections = sections.filter((sec) => !KNOCKOUT_SECTION_KEYS.has(sec.key));
  if (!sections.length) return <div style={{ padding: "0 20px 18px", color: "var(--text3)", fontSize: 13 }}>Ingen resultater lagt inn ennå.</div>;

  const Dot = ({ c }) => <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: c, marginRight: 5, verticalAlign: "middle" }} />;

  const Chip = ({ it }) => {
    const pickLabel = it.team ? codeOf(it.pick) : it.pick;
    const actualLabel = it.team ? codeOf(it.actual) : it.actual;
    return (
      <div style={{
      display: "flex", flexDirection: "column", gap: 2, padding: "6px 9px", borderRadius: 8,
      background: "var(--bg4)", borderLeft: `3px solid ${STATUS_COLOR[it.status]}`,
    }}>
      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
        color: "var(--text3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.label}</span>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          color: it.status === "miss" ? "var(--text3)" : "var(--text1)", display: "inline-flex", alignItems: "center", gap: 4 }} title={it.pick || undefined}>
          {it.team && <Flag name={it.pick} size={13} />}{pickLabel || "—"}
        </span>
        {it.status === "hit"
          ? <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--accent)", flexShrink: 0 }}>+{it.points}</span>
          : it.status === "bonus"
          ? <span style={{ fontSize: 11.5, fontWeight: 800, color: STATUS_COLOR.bonus, flexShrink: 0 }}>+{it.points}</span>
          : it.status === "pending"
            ? <span style={{ fontSize: 10.5, color: "var(--text4)", flexShrink: 0, whiteSpace: "nowrap" }}>venter</span>
            : (it.actual ? <span title={it.actual} style={{ fontSize: 10.5, color: "var(--text4)", flexShrink: 0, whiteSpace: "nowrap" }}>→ {actualLabel}</span> : null)}
      </div>
      </div>
    );
  };

  return (
    <div style={{ padding: "0 20px 20px" }}>
      <div style={{ fontSize: 12.5, color: "var(--text3)", marginBottom: 6 }}>
        {decidedCount > 0
          ? <><b style={{ color: "var(--text1)" }}>{hits}/{decidedCount}</b> rett{bonuses > 0 ? <> · <b style={{ color: STATUS_COLOR.bonus }}>{bonuses}</b> nesten</> : null} · <b style={{ color: "var(--accent)" }}>{earned} poeng</b></>
          : <b style={{ color: "var(--text3)" }}>Ingen kamper avgjort ennå</b>}
        {pendingCount > 0 && <> · {pendingCount} tips venter</>}
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 10.5, color: "var(--text3)" }}>
        <span><Dot c={STATUS_COLOR.hit} />rett lag, rett plass</span>
        <span><Dot c={STATUS_COLOR.bonus} />rett lag, feil plass</span>
        <span><Dot c={STATUS_COLOR.miss} />bom</span>
        <span><Dot c={STATUS_COLOR.pending} />ikke avgjort</span>
      </div>
      {nonKnockoutSections.map((sec) => (
        <div key={sec.key} style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--text3)" }}>{sec.label}</span>
            <span style={{ fontSize: 11.5, color: "var(--text3)", whiteSpace: "nowrap" }}>
              {(() => {
                const decided = sec.items.filter((it) => it.status !== "pending").length;
                const pending = sec.items.length - decided;
                return decided > 0
                  ? <><b style={{ color: "var(--text1)" }}>{sec.hits}/{decided}</b>{sec.bonuses > 0 ? <> · <b style={{ color: STATUS_COLOR.bonus }}>{sec.bonuses}</b> nesten</> : null} · <b style={{ color: "var(--accent)" }}>{sec.earned} p</b></>
                  : <b>Venter</b>;
              })()}{sec.items.filter((it) => it.status === "pending").length > 0 ? ` · ${sec.items.filter((it) => it.status === "pending").length} venter` : null}
            </span>
          </div>
          {sec.key === "quiz" ? (
            <div>
              {sec.items.map((it, j) => (
                <div key={j} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "5px 0",
                  borderBottom: j < sec.items.length - 1 ? "1px solid var(--bg2)" : "none" }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--text3)", lineHeight: 1.4 }}>{it.label}</span>
                  <span style={{ fontWeight: 700, fontSize: 12.5, whiteSpace: "nowrap", flexShrink: 0,
                    color: it.status === "hit" ? "var(--accent)" : "var(--text2)" }}>{it.pick || "—"}</span>
                  {it.status === "hit"
                    ? <span style={{ color: "var(--accent)", fontWeight: 800, fontSize: 11.5, flexShrink: 0 }}>+{it.points}</span>
                    : <span style={{ color: "var(--text4)", fontSize: 11, flexShrink: 0, whiteSpace: "nowrap" }}>→ {it.actual}</span>}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: 6 }}>
              {sec.items.map((it, j) => <Chip key={j} it={it} />)}
            </div>
          )}
        </div>
      ))}
      <PredictionBracket picks={picks} fasit={fasit} />
    </div>
  );
}

function leaderboardGridColumns(isMobile, roundColumnWidth) {
  return isMobile
    ? "28px 22px minmax(0, 1fr) 74px"
    : `28px 22px minmax(96px, 1fr) repeat(${ROUNDS.length}, ${roundColumnWidth}) 90px`;
}

const LEADERBOARD_RANK_LOOK = {
  1: { accent: "#D8B15A", bg: "rgba(216,177,90,0.15)", fg: "#16110A", label: "Leder" },
  2: { accent: "#AEB8C8", bg: "rgba(174,184,200,0.12)", fg: "var(--text1)", label: "Jager" },
  3: { accent: "#B98256", bg: "rgba(185,130,86,0.12)", fg: "var(--text1)", label: "Podium" },
};

function leaderboardRankLook(rank) {
  return LEADERBOARD_RANK_LOOK[rank] || null;
}

function MovementPill({ movement, compact = false }) {
  if (!movement) return null;
  const movedUp = movement.rankChange > 0;
  const color = movedUp ? "var(--accent)" : "#D8B15A";
  const arrow = movedUp ? "▲" : "";
  const rankText = Math.abs(movement.rankChange);
  const pointText = `${movement.pointsGained > 0 ? "+" : ""}${movement.pointsGained}`;
  const title = `${movement.sourceLabel || "Siste oppdatering"}: ${pointText} poeng.${
    movedUp ? ` Opp ${rankText} ${rankText === 1 ? "plass" : "plasser"}.` : ""
  }`;

  return (
    <span title={title} style={{
      display: "inline-flex", alignItems: "center", gap: compact ? 4 : 5, flexShrink: 0,
      padding: compact ? "2px 5px" : "3px 7px", borderRadius: 999,
      border: `1px solid color-mix(in srgb, ${color} 44%, transparent)`,
      background: `color-mix(in srgb, ${color} 11%, transparent)`,
      color, fontSize: compact ? 10.5 : 11, fontWeight: 900, letterSpacing: 0.2,
      lineHeight: 1, whiteSpace: "nowrap",
    }}>
      {movedUp && <span aria-hidden="true">{arrow}</span>}
      {movedUp && rankText > 0 && <span>{rankText}</span>}
      <span>{pointText}{compact ? "" : " p"}</span>
    </span>
  );
}

function LeaderboardEntry({ participant, rank, movement, isMobile, roundColumnWidth, open, onToggle, fasit, showBonus, excluded = false, divider = false }) {
  const rankLook = !excluded ? leaderboardRankLook(rank) : null;
  const isChampion = rank === 1 && !excluded;
  const isMedal = Boolean(rankLook) && !isChampion;
  const railColor = excluded ? "var(--text5)" : participant.color || rankLook?.accent || "var(--accent)";
  const rowClass = [
    "leaderboard-row",
    open ? "leaderboard-row-open" : "",
    isChampion ? "leaderboard-row-champion" : "",
    isMedal ? "leaderboard-row-medal" : "",
  ].filter(Boolean).join(" ");
  const rowBackground = excluded
    ? "color-mix(in srgb, var(--bg2) 66%, transparent)"
    : open
      ? `linear-gradient(90deg, color-mix(in srgb, ${railColor} 13%, var(--bg2)), var(--bg2))`
      : rankLook
        ? `linear-gradient(90deg, color-mix(in srgb, ${rankLook.accent} ${isChampion ? 13 : 7}%, transparent), transparent 48%), var(--bg3)`
        : "var(--bg3)";
  const totalColor = excluded ? "var(--text3)" : isChampion ? rankLook.accent : "var(--accent)";
  const totalBg = excluded
    ? "color-mix(in srgb, var(--bg2) 72%, transparent)"
    : isChampion
      ? "color-mix(in srgb, #D8B15A 14%, var(--bg2))"
      : "color-mix(in srgb, var(--accent) 10%, var(--bg2))";

  return (
    <div style={{ borderBottom: divider ? "1px solid var(--border)" : "none" }}>
      <div className={rowClass} onClick={onToggle} style={{
        position: "relative", display: "grid", gridTemplateColumns: leaderboardGridColumns(isMobile, roundColumnWidth), columnGap: isMobile ? 10 : "clamp(6px, 1.3vw, 12px)",
        alignItems: "center", padding: isMobile ? "15px 14px 15px 17px" : "16px clamp(12px, 2.4vw, 20px)", cursor: "pointer",
        background: rowBackground,
        transition: "background .16s ease, box-shadow .16s ease",
      }}>
        <span aria-hidden="true" style={{
          position: "absolute", left: 0, top: 10, bottom: 10, width: 3, borderRadius: "0 8px 8px 0",
          background: railColor, opacity: excluded ? 0.32 : 0.88,
          boxShadow: !excluded && rankLook ? `0 0 18px color-mix(in srgb, ${rankLook.accent} 38%, transparent)` : "none",
        }} />
        <span style={{
          width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center",
          borderRadius: 9, fontWeight: 900, fontSize: 14,
          color: excluded ? "var(--text4)" : rankLook ? rankLook.fg : "var(--text3)",
          background: excluded ? "transparent" : rankLook ? rankLook.bg : "transparent",
          border: rankLook ? `1px solid color-mix(in srgb, ${rankLook.accent} 58%, transparent)` : "1px solid transparent",
          boxShadow: isChampion ? "inset 0 1px 0 rgba(255,255,255,0.22), 0 0 18px rgba(216,177,90,0.16)" : "none",
        }}>
          {excluded ? "–" : rank}
        </span>
        {!excluded && rank === 1
          ? <span style={{
              display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, marginLeft: -4,
              borderRadius: "50%", background: "rgba(216,177,90,0.12)", boxShadow: "0 0 16px rgba(216,177,90,0.18)",
            }}><CrownIcon size={16} /></span>
          : <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, marginLeft: -3,
              borderRadius: "50%", border: rankLook ? `1px solid color-mix(in srgb, ${rankLook.accent} 58%, transparent)` : "1px solid transparent",
              background: rankLook ? `color-mix(in srgb, ${rankLook.accent} 10%, transparent)` : "transparent",
              opacity: excluded ? 0.65 : 1,
            }}>
              <span style={{ width: rankLook ? 8 : 12, height: rankLook ? 8 : 12, borderRadius: "50%", background: participant.color, display: "inline-block" }} />
            </span>}
        <span style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 700, fontSize: 16, color: excluded ? "var(--text2)" : "var(--text1)" }}>{firstName(participant.name)}</span>
          {isChampion && !isMobile && (
            <span style={{
              flexShrink: 0, padding: "3px 7px", borderRadius: 999,
              background: "rgba(216,177,90,0.12)", border: "1px solid rgba(216,177,90,0.28)",
              color: "#D8B15A", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.7,
            }}>{rankLook.label}</span>
          )}
          {!excluded && <MovementPill movement={movement} compact={isMobile} />}
        </span>
        {!isMobile && ROUNDS.map((r) => (
          <span key={r.key} style={{ display: "flex", alignItems: "baseline", justifyContent: "center", minWidth: 0 }}>
            <span style={{ color: excluded ? "var(--text3)" : "var(--text1)", fontWeight: 700, fontSize: 13 }}>{participant.scores[r.key] || 0}</span>
          </span>
        ))}
        <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: isMobile ? 6 : 10 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            minWidth: isMobile ? 44 : 58, height: isMobile ? 30 : 34, padding: isMobile ? "0 6px" : "0 11px",
            borderRadius: 10, border: `1px solid color-mix(in srgb, ${totalColor} 34%, transparent)`,
            background: totalBg, color: totalColor, fontWeight: 950, fontSize: isMobile ? 18 : 20, textAlign: "center",
            boxShadow: !excluded ? `inset 0 1px 0 rgba(255,255,255,0.06), 0 0 18px color-mix(in srgb, ${totalColor} 10%, transparent)` : "none",
          }}>
            {participant.total}
          </span>
          <span style={{
            flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: isMobile ? 22 : 24, height: isMobile ? 22 : 24, borderRadius: "50%",
            color: "var(--text3)", background: "var(--bg4)", border: "1px solid var(--border)",
          }}>
            <ChevronIcon size={12} open={open} />
          </span>
        </span>
      </div>
      {open && <StillingBreakdown picks={participant.picks} fasit={fasit} showBonus={showBonus} />}
    </div>
  );
}

function Stilling({ participants, fasit, showBonus, movementSnapshot }) {
  // Round columns shrink fluidly (via clamp) as the window narrows, so they stay
  // visible on tablets/small laptops. Only collapse to the compact rank/player/total
  // layout once there's genuinely no room left for them.
  const isMobile = useIsMobile(760);
  const [openId, setOpenId] = useState(null);
  const roundColumnWidth = "clamp(46px, 5.8vw, 68px)";
  const toTotal = (p) => ({ ...p, total: cumulative(p, ROUNDS.length - 1) + (showBonus ? p.bonus || 0 : 0) });
  const ranked = participants.filter((p) => !isExcludedFromCompetition(p)).map(toTotal)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "nb-NO"));
  const excluded = participants.filter(isExcludedFromCompetition).map(toTotal)
    .sort((a, b) => a.name.localeCompare(b.name, "nb-NO"));
  const movementById = leaderboardMovementFromSnapshot(participants, movementSnapshot);

  if (participants.length === 0) {
    return (
      <div style={S.adminWrap}>
        <div style={S.empty}>Konkurransen er ikke startet ennå.</div>
      </div>
    );
  }

  return (
    <div style={S.adminWrap}>
      <div style={{ ...S.importCard, padding: "15px 18px", marginBottom: 14 }}>
        <div style={S.importTitle}>Hvem blir Innkjøps fremste fotballekspert?</div>
        <div style={{ ...S.importDesc, marginBottom: 0 }}>Følg stillingen mens kunnskap, magefølelse og litt flaks settes på prøve.</div>
        {!showBonus && (
          <div style={S.bonusWithheld}>
            <LockIcon size={14} /> Bonusspørsmål avsløres under kåringen. Stillingen er foreløpig.
          </div>
        )}
      </div>
      <div className="leaderboard-shell" style={{
        position: "relative", background: "linear-gradient(180deg, color-mix(in srgb, var(--bg4) 18%, var(--bg3)), var(--bg3))",
        border: "1px solid color-mix(in srgb, var(--accent) 18%, var(--border))",
        borderRadius: 18, overflow: "hidden",
        boxShadow: "0 20px 44px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}>
        {!isMobile && <div className="leaderboard-header" style={{
          display: "grid", gridTemplateColumns: leaderboardGridColumns(false, roundColumnWidth), columnGap: "clamp(6px, 1.3vw, 12px)",
          alignItems: "center", padding: "14px clamp(12px, 2.4vw, 20px) 12px",
          borderBottom: "1px solid color-mix(in srgb, var(--accent) 14%, var(--border))", color: "var(--text3)", fontSize: 10.5,
          fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase",
        }}>
          <span />
          <span />
          <span>Spiller</span>
          {ROUNDS.map((r) => <span key={r.key} style={{ textAlign: "center", whiteSpace: "nowrap" }}>{r.short}</span>)}
          <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
            <span style={{ minWidth: 58, textAlign: "center", color: "var(--text3)" }}>Totalt</span>
            <span style={{ flexShrink: 0, width: 24 }} />
          </span>
        </div>}
        {ranked.map((p, i) => (
          <LeaderboardEntry key={p.id} participant={p} rank={i + 1} movement={movementById.get(p.id)} isMobile={isMobile} roundColumnWidth={roundColumnWidth}
            open={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)} fasit={fasit} showBonus={showBonus}
            divider={i < ranked.length - 1} />
        ))}
        {excluded.length > 0 && (
          <div style={{ borderTop: ranked.length > 0 ? "1px solid var(--border)" : "none" }}>
            {excluded.map((p, i) => (
              <LeaderboardEntry key={p.id} participant={p} rank={null} movement={null} isMobile={isMobile} roundColumnWidth={roundColumnWidth}
                open={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)} fasit={fasit} showBonus={showBonus}
                excluded divider={i < excluded.length - 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// HJEM — landingsside med info, folkets stats og neste Norge-kamp
// ─────────────────────────────────────────────
const HJ = {
  card: { background: "var(--bg3)", borderRadius: 16, padding: 18 },
  badge: { display: "inline-block", padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 800,
    letterSpacing: 1, textTransform: "uppercase", background: "var(--accent)", color: "var(--accent-fg)" },
  chip: { display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 50,
    background: "var(--bg4)", fontSize: 13, fontWeight: 700, color: "var(--text1)" },
  countdownPill: { display: "inline-block", padding: "4px 12px", borderRadius: 50, background: "var(--bg4)",
    color: "var(--accent)", fontWeight: 800, fontSize: 13 },
  statLine: { display: "flex", alignItems: "baseline", gap: 11 },
  bigNum: { fontSize: 32, fontWeight: 900, color: "var(--accent)", lineHeight: 1, flexShrink: 0 },
  statText: { fontSize: 14.5, color: "var(--text2)", fontWeight: 600, lineHeight: 1.4 },
  factLine: { fontSize: 14, color: "var(--text2)", lineHeight: 1.5 },
  liveGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 14, alignItems: "stretch", marginBottom: 14 },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 14, alignItems: "stretch" },
};

function computeHomeStats(participants, showBonus) {
  const total = participants.length;
  const champ = {};
  const finalistPairs = {};
  participants.forEach((p) => { const f = p.picks?.finale; if (f) champ[f] = (champ[f] || 0) + 1; });
  participants.forEach((p) => {
    const firstFinalist = p.picks?.matches?.[101];
    const secondFinalist = p.picks?.matches?.[102];
    if (!firstFinalist || !secondFinalist || teamMatch(firstFinalist, secondFinalist)) return;
    const teams = [firstFinalist, secondFinalist].sort((a, b) => a.localeCompare(b, "nb-NO"));
    const key = teams.join("\u0000");
    finalistPairs[key] = finalistPairs[key]
      ? { ...finalistPairs[key], count: finalistPairs[key].count + 1 }
      : { teams, count: 1 };
  });
  const championRanking = Object.entries(champ)
    .map(([name, count]) => ({ name, count, pct: Math.round((count / Math.max(1, total)) * 100) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const finalistRanking = Object.values(finalistPairs)
    .map((pair) => ({ ...pair, pct: Math.round((pair.count / Math.max(1, total)) * 100) }))
    .sort((a, b) => b.count - a.count || a.teams.join(" ").localeCompare(b.teams.join(" "), "nb-NO"));

  const NORGE = "Norge";
  const DEPTH_LABEL = { 1: "16-delsfinalen", 2: "8-delsfinalen", 3: "kvartfinalen", 4: "semifinalen", 5: "finalen", 6: "VM-gull" };
  const depthOf = (p) => {
    const picks = p.picks || {};
    if (picks.finale === NORGE) return 6;
    const m = picks.matches || {};
    const inRange = (lo, hi) => Object.entries(m).some(([id, v]) => v === NORGE && +id >= lo && +id <= hi);
    if (inRange(101, 102)) return 5;
    if (inRange(97, 100)) return 4;
    if (inRange(89, 96)) return 3;
    if (inRange(73, 88)) return 2;
    const inGroup = Object.values(picks.groups || {}).some((g) => g.first === NORGE || g.second === NORGE);
    if (inGroup || picks.bronse === NORGE) return 1;
    return 0;
  };
  const depths = participants.map((p) => ({ name: firstName(p.name), depth: depthOf(p) }));
  const advance = depths.filter((d) => d.depth >= 1).length;
  const champions = depths.filter((d) => d.depth >= 6).length;
  const deepestDepth = Math.max(0, ...depths.map((d) => d.depth));
  const deepestShown = deepestDepth >= 1
    ? {
        names: depths.filter((d) => d.depth === deepestDepth)
          .map((d) => d.name)
          .sort((a, b) => a.localeCompare(b, "nb-NO")),
        label: DEPTH_LABEL[deepestDepth],
      }
    : null;
  const leaderboard = participants
    .map((p) => ({
      name: firstName(p.name),
      total: ROUNDS.reduce((sum, r) => sum + (p.scores[r.key] || 0), 0) + (showBonus ? p.bonus || 0 : 0),
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "nb-NO"));
  return { total, championRanking, finalistRanking, leaderboard, norway: { advance, champions, deepest: deepestShown } };
}

const STADIUM_TIME_ZONES = {
  Eastern: "America/New_York",
  Central: "America/Chicago",
  Western: "America/Los_Angeles",
};

function dateFromVenueTime(year, month, day, hour, minute, timeZone) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(utcGuess));
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  const offset = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute) - utcGuess;
  return new Date(utcGuess - offset);
}

function parseGameDate(g) {
  if (g.kickoffAt) {
    const scheduled = new Date(g.kickoffAt);
    if (!isNaN(scheduled.getTime())) return scheduled;
  }
  // The live World Cup feed uses US-formatted local_date values such as
  // "06/22/2026 20:00". Parse them explicitly instead of relying on the
  // browser's non-standard Date string parsing.
  const local = String(g.local_date || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (local) {
    const [, month, day, year, hour, minute] = local;
    const values = [Number(year), Number(month), Number(day), Number(hour), Number(minute)];
    return g.timeZone
      ? dateFromVenueTime(...values, g.timeZone)
      : new Date(values[0], values[1] - 1, values[2], values[3], values[4]);
  }
  const cands = [g.date_time, g.datetime, g.date_utc, g.utc_date, g.date, g.start, g.kickoff, g.time];
  for (const c of cands) { if (!c) continue; const d = new Date(c); if (!isNaN(d.getTime())) return d; }
  if (g.date && g.time) { const d = new Date(`${g.date} ${g.time}`); if (!isNaN(d.getTime())) return d; }
  return null;
}

function formatCountdown(date) {
  const ms = date.getTime() - Date.now();
  if (ms <= 0) return "pågår nå";
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days >= 1) return `om ${days} ${days === 1 ? "dag" : "dager"}`;
  if (hours >= 1) return `om ${hours} ${hours === 1 ? "time" : "timer"}`;
  return "om under en time";
}

const LIVE_GAMES_CACHE_KEY = "vm2026_live_games_v2";
let liveGamesRequest = null;

// A small built-in schedule keeps the first visit useful while the live provider
// warms up. It is immediately replaced by the live response, and the normal
// local cache takes precedence on subsequent visits.
const BUILTIN_LIVE_GAMES = [
  { id: "18", home_team_name_en: "Iraq", away_team_name_en: "Norway", home_score: "1", away_score: "4", finished: "TRUE", kickoffAt: "2026-06-16T22:00:00.000Z", type: "group" },
  { id: "42", home_team_name_en: "Norway", away_team_name_en: "Senegal", home_score: "3", away_score: "2", finished: "TRUE", kickoffAt: "2026-06-23T00:00:00.000Z", type: "group" },
  { id: "62", home_team_name_en: "Norway", away_team_name_en: "France", home_score: "1", away_score: "4", finished: "TRUE", kickoffAt: "2026-06-26T19:00:00.000Z", type: "group" },
  { id: "78", home_team_name_en: "Ivory Coast", away_team_name_en: "Norway", home_score: "1", away_score: "2", finished: "TRUE", kickoffAt: "2026-06-30T16:00:00.000Z", type: "r32" },
  { id: "91", home_team_name_en: "Brazil", away_team_name_en: "Norway", finished: "FALSE", kickoffAt: "2026-07-05T20:00:00.000Z", type: "r16" },
];

function readCachedLiveGames() {
  try {
    const cached = JSON.parse(localStorage.getItem(LIVE_GAMES_CACHE_KEY) || "null");
    return Array.isArray(cached?.games) ? cached.games : null;
  } catch {
    return null;
  }
}

function initialLiveGames() {
  return readCachedLiveGames() || DEV_SAMPLE_GAMES || BUILTIN_LIVE_GAMES;
}

function loadLiveGames() {
  if (!liveGamesRequest) {
    const gamesRequest = fetch("/.netlify/functions/wc?endpoint=games")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))));
    const stadiumsRequest = fetch("/.netlify/functions/wc?endpoint=stadiums")
      .then((res) => (res.ok ? res.json() : { stadiums: [] }))
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
        try { localStorage.setItem(LIVE_GAMES_CACHE_KEY, JSON.stringify({ games, cachedAt: Date.now() })); } catch {}
        return games;
      })
      .catch((error) => {
        liveGamesRequest = null;
        throw error;
      });
  }
  return liveGamesRequest;
}

function pickNextNorwayGame(list) {
  const now = Date.now();
  const upcoming = (list || [])
    .filter((g) => g.finished !== "TRUE" && (g.home_team_name_en === "Norway" || g.away_team_name_en === "Norway"))
    .map((g) => ({ g, date: parseGameDate(g) }))
    .filter((x) => x.date == null || x.date.getTime() > now - 6 * 3600 * 1000)
    .sort((a, b) => (a.date ? a.date.getTime() : Infinity) - (b.date ? b.date.getTime() : Infinity));
  return upcoming[0] || null;
}

function pickUpcomingGames(list, limit = 3) {
  const now = Date.now();
  return (list || [])
    .filter((game) => game.finished !== "TRUE")
    .map((game) => ({ g: game, date: parseGameDate(game) }))
    .filter((entry) => entry.date == null || entry.date.getTime() > now - 2.5 * 3600 * 1000)
    .sort((a, b) => (a.date ? a.date.getTime() : Infinity) - (b.date ? b.date.getTime() : Infinity))
    .slice(0, limit);
}

// Shows an instant bundled fixture, then replaces it with data from the live
// provider. This avoids an empty homepage on a new computer or a cold cache.
function NorwayNextGame({ theme }) {
  const [game, setGame] = useState(() => pickNextNorwayGame(initialLiveGames()));
  useEffect(() => {
    let alive = true;
    loadLiveGames()
      .then((games) => { if (alive) setGame(pickNextNorwayGame(games)); })
      .catch(() => { if (alive) setGame(pickNextNorwayGame(initialLiveGames())); });
    return () => { alive = false; };
  }, []);

  if (!game) return null;
  const G = game.g;
  const norgeHome = G.home_team_name_en === "Norway";
  const opp = toNorwegian((norgeHome ? G.away_team_name_en : G.home_team_name_en) || "");
  const date = game.date;
  const dateStr = date ? date.toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "long" }) : "Tidspunkt kommer";
  const timeStr = date ? date.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" }) : "";
  const isLight = theme === "light";
  const norsePattern = isLight ? norseKnitBandLight : norseKnitBand;
  const TeamCol = (name) => (
    <div style={{ textAlign: "center", flex: 1, minWidth: 0 }}>
      <div style={{ height: 34, display: "flex", alignItems: "center", justifyContent: "center" }}><Flag name={name} size={34} /></div>
      <div style={{ fontWeight: 800, fontSize: 15, marginTop: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
    </div>
  );

  return (
    <div style={{ ...HJ.card, position: "relative", overflow: "hidden", border: "1.5px solid var(--accent)", height: "100%", boxSizing: "border-box" }}>
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0, pointerEvents: "none", opacity: isLight ? 0.78 : 0.68,
        backgroundImage: `${isLight
          ? "linear-gradient(90deg, rgba(250, 240, 238, 0.16) 0%, var(--bg3) 30%, var(--bg3) 70%, rgba(250, 240, 238, 0.16) 100%)"
          : "linear-gradient(90deg, rgba(7, 28, 66, 0.36) 0%, var(--bg3) 30%, var(--bg3) 70%, rgba(7, 28, 66, 0.36) 100%)"}, url(${norsePattern})`,
        backgroundPosition: "center, center", backgroundRepeat: "no-repeat, repeat", backgroundSize: "auto, 132px 132px",
      }} />
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ ...HJ.badge, alignSelf: "flex-start" }}>Neste Norge-kamp</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, margin: "16px 0 12px" }}>
          {TeamCol("Norge")}
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text3)", flexShrink: 0 }}>VS</div>
          {TeamCol(opp || "?")}
        </div>
        <div style={{ textAlign: "center", color: "var(--text2)", fontSize: 14, textTransform: "capitalize" }}>
          {dateStr}{timeStr ? ` · ${timeStr} norsk tid` : ""}
        </div>
        {date && <div style={{ textAlign: "center", marginTop: 8 }}><span style={HJ.countdownPill}>{formatCountdown(date)}</span></div>}
      </div>
    </div>
  );
}

// Sample-kamper i DEV slik at kortet kan forhåndsvises lokalt (Netlify-funksjonen
// kjører ikke i `npm run dev`). I produksjon brukes ekte data fra proxyen.
const DEV_SAMPLE_GAMES = import.meta.env.DEV
  ? BUILTIN_LIVE_GAMES
  : null;

// Henter kampoppsettet fra wc-proxyen og viser de neste kampene som skal spilles.
// A bundled schedule fills the first paint while the live call is in flight.
function UpcomingGames() {
  const [games, setGames] = useState(() => pickUpcomingGames(initialLiveGames(), 6));
  const [start, setStart] = useState(0);
  useEffect(() => {
    let alive = true;
    loadLiveGames()
      .then((liveGames) => { if (alive) setGames(pickUpcomingGames(liveGames, 6)); })
      .catch(() => { if (alive) setGames(pickUpcomingGames(initialLiveGames(), 6)); });
    return () => { alive = false; };
  }, []);

  if (!games || games.length === 0) return null;

  const Row = ({ x }) => {
    const G = x.g;
    const home = toNorwegian(G.home_team_name_en || "");
    const away = toNorwegian(G.away_team_name_en || "");
    const isNorway = home === "Norge" || away === "Norge";
    const when = x.date
      ? `${x.date.toLocaleDateString("nb-NO", { weekday: "short", day: "numeric", month: "short" })} · ${x.date.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })} norsk tid`
      : "Tidspunkt kommer";
    return (
      <div style={{
        padding: "9px 11px", borderRadius: 10, background: "var(--bg4)",
        borderLeft: `3px solid ${isNorway ? "var(--accent)" : "transparent"}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 10.5, color: "var(--text3)", textTransform: "capitalize", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{when}</span>
          {x.date && <span style={{ fontSize: 10.5, color: "var(--accent)", fontWeight: 700, flexShrink: 0 }}>{formatCountdown(x.date)}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Flag name={home} size={18} />
          <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{home || "?"}</span>
          <span style={{ color: "var(--text4)", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>VS</span>
          <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 13.5, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{away || "?"}</span>
          <Flag name={away} size={18} />
        </div>
      </div>
    );
  };

  const visibleCount = 3;
  const lastStart = Math.max(0, games.length - visibleCount);
  const visibleStart = Math.min(start, lastStart);
  const visible = games.slice(visibleStart, visibleStart + visibleCount);
  const hasMore = games.length > visibleCount;
  const navButton = {
    width: 30, height: 30, display: "grid", placeItems: "center", border: "none", borderRadius: 8,
    background: "var(--bg4)", color: "var(--accent)", fontFamily: "inherit", fontSize: 21,
    fontWeight: 800, lineHeight: 1, cursor: "pointer",
  };
  return (
    <div style={HJ.card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
        <div style={{ ...S.fasitSectionTitle, marginBottom: 0 }}>Kommende kamper</div>
        {hasMore && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }} aria-label="Bla gjennom kommende kamper">
            <button
              type="button"
              onClick={() => setStart((current) => Math.max(0, current - 1))}
              disabled={visibleStart === 0}
              aria-label="Vis forrige kamper"
              style={{ ...navButton, opacity: visibleStart === 0 ? 0.35 : 1, cursor: visibleStart === 0 ? "default" : "pointer" }}
            >
              ‹
            </button>
            <span aria-live="polite" style={{ minWidth: 45, color: "var(--text3)", fontSize: 11, fontWeight: 800, textAlign: "center", whiteSpace: "nowrap" }}>
              {visibleStart + 1}–{Math.min(visibleStart + visibleCount, games.length)} / {games.length}
            </span>
            <button
              type="button"
              onClick={() => setStart((current) => Math.min(current + 1, lastStart))}
              disabled={visibleStart === lastStart}
              aria-label="Vis neste kamper"
              style={{ ...navButton, opacity: visibleStart === lastStart ? 0.35 : 1, cursor: visibleStart === lastStart ? "default" : "pointer" }}
            >
              ›
            </button>
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visible.map((x, i) => <Row key={i} x={x} />)}
      </div>
    </div>
  );
}

function GeometricRower({ stroke }) {
  return (
    <svg className="supporter-rower-geometry" viewBox="0 0 480 300" aria-hidden="true">
      <g className="supporter-rower-geometry-float">
        {/* far oar — behind the boat, blade in the water at the right */}
        <g key={`far-${stroke}`} className="supporter-rower-geometry-faroar" fill="none" stroke="#0b1d4e" strokeLinecap="round" strokeLinejoin="round">
          <path d="M272 158 L420 255" stroke="#734720" strokeWidth="12" />
          <path d="M408 244 L452 261 L431 287 L390 260 Z" fill="#c99752" strokeWidth="5" />
        </g>
        {/* the viking — shirt, horns, blank face, beard, helmet — rocks forward and back as one */}
        <g key={`body-${stroke}`} className="supporter-rower-geometry-body" stroke="#0b1d4e" strokeLinejoin="round">
          <path d="M181 193 L193 124 L260 124 L284 193 Z" fill="#d82732" strokeWidth="7" />
          <path d="M218 125 H239 V193 H218 Z" fill="#fff6e8" stroke="none" />
          <path d="M225 125 H234 V193 H225 Z" fill="#123b85" stroke="none" />
          <path d="M188 150 H271 V171 H188 Z" fill="#fff6e8" stroke="none" />
          <path d="M188 156 H271 V165 H188 Z" fill="#123b85" stroke="none" />
          <path d="M202 66 C181 59 170 46 173 19 C189 30 202 42 215 61 Z" fill="#f3e6c9" strokeWidth="6" />
          <path d="M260 66 C281 59 292 46 289 19 C273 30 260 42 247 61 Z" fill="#f3e6c9" strokeWidth="6" />
          <circle cx="231" cy="84" r="39" fill="#f1bd95" strokeWidth="7" />
          <path d="M193 100 Q231 116 269 100 L270 123 L253 151 L231 164 L209 151 L192 123 Z" fill="#704526" strokeWidth="6" />
          <path d="M192 70 Q194 28 231 28 Q268 28 270 70 Z" fill="#818b95" strokeWidth="7" />
          <path d="M190 65 H272 V78 H190 Z" fill="#56616d" strokeWidth="6" />
        </g>
        {/* hull */}
        <g stroke="#0b1d4e" strokeLinejoin="round">
          <path d="M36 181 L444 181 L403 249 L77 249 Z" fill="#aa6c35" strokeWidth="8" />
          <path d="M36 181 L77 249 L57 240 L23 188 Z" fill="#c28445" strokeWidth="7" />
          <path d="M444 181 L403 249 L423 240 L457 188 Z" fill="#c28445" strokeWidth="7" />
          <path d="M67 200 H413" fill="none" stroke="#d89a59" strokeWidth="7" strokeLinecap="round" />
        </g>
        {/* near oar — in front of the boat, blade in the water at the left */}
        <g key={`near-${stroke}`} className="supporter-rower-geometry-nearoar" fill="none" stroke="#0b1d4e" strokeLinecap="round" strokeLinejoin="round">
          <path d="M268 158 L79 256" stroke="#734720" strokeWidth="12" />
          <path d="M94 243 L51 267 L70 292 L113 266 Z" fill="#c99752" strokeWidth="5" />
        </g>
        {/* arms + hands grip the oars and drive the stroke */}
        <g key={`arms-${stroke}`} className="supporter-rower-geometry-body" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M201 139 L243 163" stroke="#0b1d4e" strokeWidth="25" />
          <path d="M201 139 L243 163" stroke="#d82732" strokeWidth="15" />
          <path d="M255 139 L280 163" stroke="#0b1d4e" strokeWidth="25" />
          <path d="M255 139 L280 163" stroke="#d82732" strokeWidth="15" />
        </g>
        <g key={`hands-${stroke}`} className="supporter-rower-geometry-body" fill="#f1bd95" stroke="#0b1d4e" strokeWidth="6">
          <circle cx="245" cy="163" r="12" />
          <circle cx="282" cy="163" r="12" />
        </g>
      </g>
      {/* waterline — keeps the blades sitting in the water */}
      <path d="M24 271 Q58 261 92 271 T160 271 T228 271 T296 271 T364 271 T432 271 T466 271" fill="none" stroke="#418bca" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

let hornAudioCtx = null;
let hornBuffer = null;
const HORN_DURATION_SECONDS = 2.5;
const HORN_FADE_SECONDS = 0.35;
async function playVikingHorn() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    hornAudioCtx = hornAudioCtx || new AC();
    const ctx = hornAudioCtx;
    if (ctx.state === "suspended") await ctx.resume();
    if (!hornBuffer) {
      const res = await fetch("/assets/horn.mp3");
      const ab = await res.arrayBuffer();
      hornBuffer = await ctx.decodeAudioData(ab);
    }
    const t0 = ctx.currentTime;
    const dur = Math.min(HORN_DURATION_SECONDS, hornBuffer.duration || HORN_DURATION_SECONDS);
    const fadeStart = Math.max(t0, t0 + dur - HORN_FADE_SECONDS);
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = hornBuffer;
    gain.gain.setValueAtTime(1, t0);
    gain.gain.setValueAtTime(1, fadeStart);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(gain).connect(ctx.destination);
    src.start(t0);
    src.stop(t0 + dur);
    return;
  } catch {}
}
// fallback synthesis (never reached if MP3 loads)
function _playVikingHornSynth() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    hornAudioCtx = hornAudioCtx || new AC();
    const ctx = hornAudioCtx;
    if (ctx.state === "suspended") ctx.resume();
    const t0 = ctx.currentTime;
    const dur = HORN_DURATION_SECONDS;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.exponentialRampToValueAtTime(0.6, t0 + 0.07);
    master.gain.setValueAtTime(0.55, t0 + dur - 0.5);
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    master.connect(ctx.destination);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 1.5;
    filter.frequency.setValueAtTime(520, t0);
    filter.frequency.exponentialRampToValueAtTime(1950, t0 + 0.26);
    filter.connect(master);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 7;
    lfo.connect(lfoGain);

    const fundamental = 118;
    const voices = [
      { type: "sawtooth", mult: 1, detune: -8, gain: 0.5 },
      { type: "sawtooth", mult: 1, detune: 9, gain: 0.5 },
      { type: "square", mult: 1, detune: 0, gain: 0.13 },
      { type: "sawtooth", mult: 2, detune: 5, gain: 0.17 },
      { type: "sine", mult: 0.5, detune: 0, gain: 0.26 },
    ];
    for (const v of voices) {
      const osc = ctx.createOscillator();
      osc.type = v.type;
      const base = fundamental * v.mult;
      osc.frequency.setValueAtTime(base * 0.84, t0);
      osc.frequency.exponentialRampToValueAtTime(base, t0 + 0.11);
      osc.frequency.linearRampToValueAtTime(base * 0.965, t0 + dur);
      osc.detune.value = v.detune;
      lfoGain.connect(osc.detune);
      const g = ctx.createGain();
      g.gain.value = v.gain;
      osc.connect(g).connect(filter);
      osc.start(t0);
      osc.stop(t0 + dur);
    }
    lfo.start(t0);
    lfo.stop(t0 + dur);
  } catch {}
}

function VikingHorn() {
  const [blow, setBlow] = useState(0);
  const sound = () => { playVikingHorn(); setBlow((v) => v + 1); };
  return (
    <div className="viking-horn">
      <button type="button" className="viking-horn-button" onClick={sound} aria-label="Blås i vikinghornet">
        <svg key={blow} className={`viking-horn-svg${blow ? " is-blowing" : ""}`} viewBox="0 0 92 58" aria-hidden="true">
          <defs>
            <linearGradient id="vhBrass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#F2D688" />
              <stop offset="0.42" stopColor="#CB9E4B" />
              <stop offset="1" stopColor="#7C5820" />
            </linearGradient>
            <linearGradient id="vhBand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#CFA254" />
              <stop offset="1" stopColor="#6A4818" />
            </linearGradient>
            <clipPath id="vhBody">
              <path d="M28 11 C 52 5, 74 21, 82 46 C 70 39, 46 32, 32 30 C 23 28, 22 15, 28 11 Z" />
            </clipPath>
          </defs>
          {blow > 0 && (
            <g className="viking-horn-waves" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round">
              <path d="M24 16 C 17 21, 17 27, 24 32" />
              <path d="M18 11 C 8 18, 8 30, 18 37" />
              <path d="M12 6 C -1 16, -1 32, 12 42" />
            </g>
          )}
          <g className="viking-horn-body">
            <path d="M28 11 C 52 5, 74 21, 82 46 C 70 39, 46 32, 32 30 C 23 28, 22 15, 28 11 Z"
              fill="url(#vhBrass)" stroke="#5C3D14" strokeWidth="2.1" strokeLinejoin="round" />
            <path d="M32 13 C 52 9, 69 22, 77 40" fill="none" stroke="#FBEBBE" strokeWidth="1.8" strokeOpacity="0.5" strokeLinecap="round" />
            <path d="M44 22 C 55 23, 65 29, 72 38" fill="none" stroke="#5C3D14" strokeWidth="1.1" strokeOpacity="0.35" strokeLinecap="round" />
            {/* ornate collar near the mouth, clipped to the horn outline */}
            <g clipPath="url(#vhBody)">
              <path d="M26 8 L42 11 L40 34 L23 32 Z" fill="url(#vhBand)" />
              <path d="M31 9 L29 33" stroke="#46300F" strokeWidth="2.4" />
              <path d="M38 11 L36 34" stroke="#46300F" strokeWidth="2.4" />
              <g fill="#F0CE82">
                <circle cx="34" cy="15" r="1.05" />
                <circle cx="33.4" cy="20.5" r="1.05" />
                <circle cx="32.8" cy="26" r="1.05" />
                <circle cx="32.2" cy="31" r="1.05" />
              </g>
            </g>
            {/* bright rim around the mouth opening */}
            <ellipse cx="29" cy="20.5" rx="3.3" ry="9.6" transform="rotate(-14 29 20.5)" fill="#EBCC7C" stroke="#5C3D14" strokeWidth="2" />
            {/* finial tip */}
            <path d="M80 44 l3.4 -0.6 2 3.2 -2.4 3 -3.6 -1.4 Z" fill="url(#vhBand)" stroke="#46300F" strokeWidth="1.2" strokeLinejoin="round" />
            <circle cx="86.4" cy="50.4" r="2.7" fill="url(#vhBand)" stroke="#46300F" strokeWidth="1.2" />
          </g>
        </svg>
        <span className="viking-horn-label">Blås i hornet</span>
      </button>
    </div>
  );
}

function RowingSupporter() {
  const [count, setCount] = useState(readCachedSupporterCount);   // seeded from cache so refresh/tab-switch never dips
  const [error, setError] = useState("");
  const [stroke, setStroke] = useState(0);     // drives the rowing animation + chant
  const queueRef = useRef(Promise.resolve());

  // Strokes never un-happen, so the total only ever climbs. Lift towards any count
  // the server reports, but never let an eventually-consistent (briefly stale) read
  // pull the number back below what the supporter already sees.
  const liftTo = (next) => setCount((prev) => Math.max(prev ?? 0, next));

  // Remember the latest total across reloads and tab switches.
  useEffect(() => {
    if (count === null) return;
    try { localStorage.setItem(SUPPORTER_COUNT_CACHE_KEY, String(count)); } catch {}
  }, [count]);

  useEffect(() => {
    let active = true;
    supporterRows()
      .then((total) => { if (active) liftTo(total); })
      .catch(() => { if (active) setError("Kunne ikke hente årets total."); });
    return () => { active = false; };
  }, []);

  const row = () => {
    setCount((prev) => (prev ?? 0) + 1);   // optimistic + immediate; stays put even if the server read lags
    setStroke((value) => value + 1);
    setError("");

    queueRef.current = queueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          liftTo(await supporterRows("POST"));
        } catch {
          setCount((prev) => Math.max(0, (prev ?? 1) - 1));   // the stroke didn't land — take it back
          setError("Åretaket ble ikke telt. Prøv igjen.");
        }
      });
  };

  const formattedCount = count === null ? "…" : new Intl.NumberFormat("nb-NO").format(count);

  return (
    <div className="supporter-rower">
      <button type="button" className="supporter-rower-button" onClick={row} aria-label="Ta et åretak for Norge">
        <GeometricRower stroke={stroke} />
        <span className="supporter-rower-chant" aria-hidden="true" key={stroke}>
          <span>R</span>
          {["o", "O", "o", "o", "O", "o"].map((letter, index) => (
            <span
              key={index}
              className="supporter-rower-letter"
              style={{ "--chant-delay": `${index * 0.09}s` }}
            >
              {letter}
            </span>
          ))}
          <span>!</span>
        </span>
      </button>
      <div className="supporter-rower-count" aria-live="polite" aria-atomic="true">
        <strong>{formattedCount}</strong>
        <span>Åretak for Norge</span>
        {error && <small role="status">{error}</small>}
      </div>
    </div>
  );
}

function Hjem({ participants, showBonus, theme }) {
  const stats = computeHomeStats(participants.filter((p) => !isExcludedFromCompetition(p)), showBonus);
  const N = stats.total;
  const top = stats.championRanking.slice(0, 4);
  const folketsFinale = stats.finalistRanking[0];
  const nw = stats.norway;
  const deepestOptimists = nw.deepest?.names || [];
  const leader = stats.leaderboard[0];
  const runnerUp = stats.leaderboard[1];
  const tiedLeaders = leader ? stats.leaderboard.filter((p) => p.total === leader.total) : [];
  const leadGap = leader && runnerUp && leader.total > 0 ? leader.total - runnerUp.total : null;

  return (
    <div style={S.adminWrap}>
      {/* Hero / om konkurransen */}
      <div className="home-welcome" style={{ ...HJ.card, borderTop: "3px solid var(--accent)", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "var(--text1)", marginBottom: 8 }}>VM 2026 – Tippekonkurranse</div>
          <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: 14.5, margin: "0 0 14px", maxWidth: 640 }}>
            Velkommen til VM 2026-tippekonkurransen! VM-feberen er i gang, og her følger dere stillingen og resultatene etter hver kampdag. Hvem hadde de beste tipsene?
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <span style={HJ.chip}>{N} {N === 1 ? "deltaker" : "deltakere"}</span>
            {leader && N > 0 && <span style={HJ.chip}>Leder: {leader.name}</span>}
          </div>
        </div>
        <RowingSupporter />
      </div>

      {/* Live kampoversikt */}
      <div style={HJ.liveGrid}>
        <NorwayNextGame theme={theme} />
        <UpcomingGames />
      </div>

      {/* Folkets tips og stillingsbilde */}
      <div style={HJ.statsGrid}>
        {top.length > 0 && (
          <div style={HJ.card}>
            <div style={S.fasitSectionTitle}>Folkets VM-vinner</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {top.map((c, i) => (
                <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <span style={{ width: 26, display: "inline-flex", justifyContent: "center", flexShrink: 0 }}><Flag name={c.name} size={20} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5, gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                      <span style={{ fontWeight: 800, fontSize: 13, color: "var(--accent)", flexShrink: 0 }}>
                        {c.pct}% <span style={{ color: "var(--text3)", fontWeight: 600 }}>({c.count}/{N})</span>
                      </span>
                    </div>
                    <div style={{ height: 8, background: "var(--bg2)", borderRadius: 5, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${c.pct}%`, background: i === 0 ? "var(--accent)" : "var(--text4)", borderRadius: 5 }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {folketsFinale && (
          <div style={HJ.card}>
            <div style={S.fasitSectionTitle}>Folkets finale</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, margin: "20px 0 14px" }}>
              {folketsFinale.teams.map((team, i) => (
                <React.Fragment key={team}>
                  {i > 0 && <span style={{ color: "var(--text4)", fontSize: 11, fontWeight: 800 }}>VS</span>}
                  <div style={{ minWidth: 0, textAlign: "center", flex: 1 }}>
                    <div style={{ height: 30, display: "flex", alignItems: "center", justifyContent: "center" }}><Flag name={team} size={30} /></div>
                    <div style={{ marginTop: 6, fontSize: 15, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{team}</div>
                  </div>
                </React.Fragment>
              ))}
            </div>
            <div style={{ textAlign: "center", color: "var(--text2)", fontSize: 14, fontWeight: 600 }}>
              <b style={{ color: "var(--accent)" }}>{folketsFinale.pct}%</b> ({folketsFinale.count}/{N}) tipper denne finalen
            </div>
          </div>
        )}

        {leadGap !== null && (
          <div style={HJ.card}>
            <div style={S.fasitSectionTitle}>Tettest i toppen</div>
            {leadGap === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <div style={{ ...HJ.bigNum, fontSize: 29 }}>Delt ledelse</div>
                <div style={HJ.statText}>{tiedLeaders.length} {tiedLeaders.length === 1 ? "deltaker" : "deltakere"} står med {leader.total} poeng</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <div style={HJ.statLine}>
                  <span style={HJ.bigNum}>{leadGap}</span>
                  <span style={HJ.statText}>poeng skiller</span>
                </div>
                <div style={HJ.factLine}><b>{leader.name}</b> leder foran <b>{runnerUp.name}</b></div>
              </div>
            )}
          </div>
        )}

        {/* Norge-optimisme */}
        <div style={HJ.card}>
          <div style={S.fasitSectionTitle}>Norge-optimisme</div>
          {N === 0 ? (
            <div style={{ color: "var(--text3)", fontSize: 14 }}>Ingen tips levert ennå.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={HJ.statLine}>
                <span style={HJ.bigNum}>{nw.advance}</span>
                <span style={HJ.statText}>av {N} tror Norge tar seg videre fra gruppespillet</span>
              </div>
              {nw.deepest && nw.deepest.label !== "16-delsfinalen" && (
                <div style={HJ.factLine}>
                  {deepestOptimists.length === 1 ? "Mest optimistisk" : "Mest optimistiske"}: <b>{norwegianNameList(deepestOptimists)}</b> har Norge helt til {nw.deepest.label === "VM-gull" ? "VM-gull" : nw.deepest.label}
                </div>
              )}
              {nw.champions > 0 && (
                <div style={HJ.factLine}>{nw.champions} {nw.champions === 1 ? "person tror" : "personer tror"} Norge vinner hele VM</div>
              )}
              {nw.advance === 0 && (
                <div style={HJ.factLine}>Ingen har troa på at Norge går videre fra gruppa …</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// NORGES VEI TIL VM — redaksjonell reise
// ─────────────────────────────────────────────
const NORGE_VM_STOPS = [
  {
    id: "1998", date: "23. juni 1998", score: "Norge 2–1 Brasil", image: roadVm1998,
    title: "Da Norge skrev historie",
    body: [
      "En regntung kveld i Marseille slo Norge de regjerende verdensmesterne. Kjetil Rekdals sene straffe sendte Norge videre fra gruppespillet.",
      "Seieren over Brasil ble stående som det siste store VM-minnet — og starten på en 28 år lang ventetid.",
    ],
  },
  {
    id: "avspark", date: "Mars 2025", score: "Kvalifiseringen starter", image: roadVmOpening,
    title: "Et nytt avspark",
    body: [
      "En ny generasjon tok fatt på kvalifiseringen med den samme drømmen: å føre Norge tilbake til verdens største scene.",
      "Kampanjen åpnet med retning, tempo og en tro på at denne gangen kunne reisen gå hele veien.",
    ],
  },
  {
    id: "italia-oslo", date: "6. juni 2025", score: "Norge 3–0 Italia", image: roadVmItaly, focus: "center 60%",
    title: "Italia lagt bak",
    body: [
      "På Ullevaal kom en kveld som endret tyngden i gruppa. Norge slo Italia klart og ga kvalifiseringsløpet en helt ny form.",
      "Plutselig var ikke drømmen bare mulig. Norge hadde lagt et fundament som kunne bære helt til VM.",
    ],
  },
  {
    id: "moldova", date: "9. september 2025", score: "Norge 11–1 Moldova", image: roadVmMoldova,
    title: "En rekord som runget",
    body: [
      "Elleve mål ble et voldsomt bevis på hvor høyt nivået var blitt. Norge slo ikke bare motstanderen — de bygget en målforskjell som ga trygghet i innspurten.",
      "Angrepskraften ble selve seilet i ferden: mål etter mål, og stadig mer kontroll på veien videre.",
    ],
  },
  {
    id: "november", date: "13. november 2025", score: "Norge 4–1 Estland", image: roadVmNovember,
    title: "Nærmere enn på 28 år",
    body: [
      "Hjemme mot Estland fortsatte Norge den perfekte rekka. Fire nye mål gjorde at VM-plassen var innen rekkevidde.",
      "Før siste stopp i Milano var kursen satt. Bare et helt usannsynlig sammenbrudd kunne stanse reisen.",
    ],
  },
  {
    id: "milan", date: "16. november 2025", score: "Italia 1–4 Norge", image: roadVmMilan,
    title: "Billetten til VM",
    body: [
      "Norge snudde kampen i Milano og avsluttet kvalifiseringen med åtte seire av åtte. Etter 28 år var ventetiden over.",
      "Langskipet nådde havn: Norge vant Gruppe I, Haaland scoret 16 kvalifiseringsmål, og veien gikk videre til VM 2026.",
    ],
  },
];

const VOYAGE_CORE_NODES = [
  ...NORGE_VM_STOPS.map((s) => ({ ...s, phase: "kval" })),
  {
    id: "ankomst", phase: "arrival", date: "Juni 2026", title: "Norge har landet i USA",
    body: "Ferden over Atlanteren er fullført. Norge har gått i land i Amerika, og VM 2026 kan endelig begynne.",
    image: roadVmArrived,
  },
];

// ISO 3166 alpha-2 → flag emoji (regional indicators)
const codeToFlag = (cc) =>
  cc ? cc.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0))) : "";

const knockoutRound = (id) => {
  const gameId = Number(id);
  if (gameId >= 73 && gameId <= 88) return "16-delsfinale";
  if (gameId >= 89 && gameId <= 96) return "8-delsfinale";
  if (gameId >= 97 && gameId <= 100) return "Kvartfinale";
  if (gameId >= 101 && gameId <= 102) return "Semifinale";
  if (gameId === 103) return "Bronsefinale";
  if (gameId === 104) return "Finale";
  return "Sluttspill";
};

const VM_MATCH_STORIES = {
  18: {
    label: "VM-comebacket",
    title: "Haaland tente returen",
    body: "Første VM-kamp på 28 år ble jevnere enn 4–1 tilsier. Irak utlignet før pause og presset Norge, men Haaland straffet en keeperfeil, Østigård headet inn treeren og et sent selvmål ga en perfekt start.",
    visual: "Haaland x2",
    outcome: "Tre poeng og viktig målforskjell i åpningskampen.",
    image: vmMatchIraq,
    focus: "46% 46%",
    focusMobile: "44% 46%",
    focusDesktop: "47% 46%",
  },
  42: {
    label: "Nøkkelkampen",
    title: "Haaland avgjorde kaoskampen",
    body: "Marcus Pedersen kom tidlig inn fra benken og svarte med sitt første landslagsmål. Etter pause satte Haaland to, men Ismaïla Sarrs dobbel gjorde sluttminuttene ville før Norge rodde av stormen.",
    visual: "Knockout klar",
    outcome: "Avansementet var sikret før gruppefinalen mot Frankrike.",
    image: vmMatchSenegal,
    focus: "41% 4%",
    focusMobile: "41% 0%",
    focusDesktop: "43% 4%",
    imageHeightMobile: 250,
  },
  62: {
    label: "Gruppefinalen",
    title: "Dembélé ødela gruppefinalen",
    body: "Norge hvilte flere profiler og fikk en brutal lærepenge. Ousmane Dembélé avgjorde kampen med et hat trick før halvtimen var spilt, og en reddet Strand Larsen-straffe fjernet siste håp om comeback.",
    visual: "Varsko",
    outcome: "Andreplass i gruppa - videre, men med tydelig varsel.",
    image: vmMatchFrance,
    focus: "43% 52%",
    focusMobile: "41% 52%",
    focusDesktop: "39% 52%",
    imageHeightMobile: 250,
    imageHeightDesktop: 292,
  },
  78: {
    label: "Utslagsdramaet",
    title: "Nusa åpnet, Haaland lukket",
    body: "Antonio Nusa sendte Norge foran med et soloraid, før Amad Diallo både reddet på streken og utlignet. Fire minutter før slutt kom Bobb og Berg fri på høyresiden, og Haaland dyttet Norge videre.",
    visual: "Videre!",
    outcome: "Første norske VM-sluttspillseier. Brasil venter i åttedelsfinalen.",
    image: vmMatchIvoryCoast,
    focus: "62% 43%",
    focusMobile: "63% 43%",
    focusDesktop: "61% 43%",
    imageHeightMobile: 244,
  },
};

function matchStoryForGame(game, result, opponent) {
  if (!result) return null;
  const known = VM_MATCH_STORIES[Number(game.id)];
  if (known) return known;
  const won = result === "W";
  const drawn = result === "D";
  return {
    label: game.type === "group" ? "VM-kamp" : knockoutRound(game.id),
    title: won ? "Norge tok neste steg" : drawn ? "Alt er fortsatt åpent" : "Norge må reise seg igjen",
    body: won
      ? `Seieren mot ${opponent} ga Norge mer fart på VM-reisen og flyttet laget videre langs ruten.`
      : drawn
        ? `Uavgjort mot ${opponent} holdt spenningen levende og gjorde neste kamp enda viktigere.`
        : `Tapet mot ${opponent} ble et stopp i marsjen, men ruten videre er ikke ferdig skrevet.`,
    visual: won ? "Seier" : drawn ? "Uavgjort" : "Tap",
  };
}

function gameToVoyageNode(game) {
  const norwayHome = game.home_team_name_en === "Norway";
  const opponent = toNorwegian(norwayHome ? game.away_team_name_en : game.home_team_name_en);
  const kickoff = parseGameDate(game);
  const finished = String(game.finished).toUpperCase() === "TRUE";
  const homeScore = Number(game.home_score);
  const awayScore = Number(game.away_score);
  const hasScore = finished && game.home_score !== "" && game.away_score !== "" && Number.isFinite(homeScore) && Number.isFinite(awayScore);
  const norwayScore = norwayHome ? homeScore : awayScore;
  const opponentScore = norwayHome ? awayScore : homeScore;
  const result = !hasScore ? null : norwayScore > opponentScore ? "W" : norwayScore < opponentScore ? "L" : "D";
  const kind = game.type === "group" ? "group" : "knockout";

  return {
    id: `vm-${game.id}`,
    phase: "vm",
    kind,
    round: kind === "group" ? "Gruppespill" : knockoutRound(game.id),
    date: kickoff ? kickoff.toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" }) : "Tidspunkt kommer",
    opponent,
    oppCode: null,
    kickoff: kickoff ? kickoff.toISOString() : null,
    score: hasScore ? `${norwayScore}–${opponentScore}` : null,
    result,
    story: matchStoryForGame(game, result, opponent),
  };
}

function liveVoyageNodes(games) {
  let groupMatchesPlayed = 0;
  let groupPoints = 0;
  return (games || [])
    .filter((game) => game.home_team_name_en === "Norway" || game.away_team_name_en === "Norway")
    .map((game) => ({ node: gameToVoyageNode(game), kickoff: parseGameDate(game), id: Number(game.id) || Infinity }))
    .sort((a, b) => (a.kickoff?.getTime() ?? Infinity) - (b.kickoff?.getTime() ?? Infinity) || a.id - b.id)
    .map(({ node }) => {
      if (node.kind !== "group" || !node.result) return node;
      groupMatchesPlayed += 1;
      groupPoints += node.result === "W" ? 3 : node.result === "D" ? 1 : 0;
      return { ...node, groupMatchesPlayed, groupPoints };
    });
}

// Catmull-Rom spline through points → one smooth cubic-bezier path string
function smoothPath(pts) {
  if (pts.length < 2) return "";
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

const nodeIsDone = (n) => n.phase === "kval" || n.phase === "arrival" || !!n.score;

// One ornate "saga wave" — a cresting wave that breaks and curls into a spiral,
// in the spirit of old Norse scrollwork / Hokusai line waves. Drawn around origin.
const SAGA_WAVE = "M-16,4 C-12,4.5 -10,-1.5 -5,-5 C-1,-7.6 5,-7 8,-2.6 C10.6,1.4 7.6,6.2 2.2,5.4 C-1.8,4.8 -2.4,0.6 0.4,-0.8 C2.4,-1.8 4,0.4 2.6,2";

// Top-down longship, drawn pointing +x (rotated to the path tangent by the caller).
function Longship() {
  return (
    <g className="voyage-bob">
      <path d="M-30,0 C-21,-8 0,-10 15,-8 C28,-6 36,-3 43,0 C36,3 28,6 15,8 C0,10 -21,8 -30,0 Z" fill="#6B431F" stroke="#C7A75D" strokeWidth="1.4" />
      <path d="M-28,0 L40,0" stroke="#C7A75D" strokeWidth="0.8" opacity="0.55" />
      <g stroke="#C7A75D" strokeWidth="1.5" strokeLinecap="round">
        <path d="M-16,-8 L-20,-15" /><path d="M-16,8 L-20,15" />
        <path d="M-4,-9 L-7,-16" /><path d="M-4,9 L-7,16" />
        <path d="M8,-9 L6,-16" /><path d="M8,9 L6,16" />
        <path d="M18,-8 L17,-15" /><path d="M18,8 L17,15" />
      </g>
      <g aria-label="Norsk flagg">
        <defs><clipPath id="longship-flag-banner"><path d="M-2,-20 C3,-22 9,-21 14,-17 L14,17 C9,21 3,22 -2,19 Z" /></clipPath></defs>
        <path d="M-2,-20 C3,-22 9,-21 14,-17 L14,17 C9,21 3,22 -2,19 Z" fill="#BA1B2D" />
        <g clipPath="url(#longship-flag-banner)">
          <rect x="2" y="-22" width="5" height="44" fill="#FFFFFF" />
          <rect x="-4" y="-5" width="20" height="7" fill="#FFFFFF" />
          <rect x="3.1" y="-22" width="2.8" height="44" fill="#11296B" />
          <rect x="-4" y="-3" width="20" height="3" fill="#11296B" />
        </g>
        <path d="M-2,-20 C3,-22 9,-21 14,-17 L14,17 C9,21 3,22 -2,19 Z" fill="none" stroke="#D8B06A" strokeWidth="1" strokeLinejoin="round" />
      </g>
      <rect x="0" y="-11" width="7" height="22" rx="2" fill="#8A1D2D" stroke="#D8B06A" strokeWidth="1" />
      <circle cx="3.5" cy="0" r="1.8" fill="#D8B06A" />
      <path d="M43,0 c5,-1 8,-4 4,-7" fill="none" stroke="#C7A75D" strokeWidth="1.5" />
    </g>
  );
}

function NorgesVeiTilVM() {
  const isMobile = useIsMobile();
  // Kort stables (bilde over, info under) tidligere enn lane-bruddet — så side-ved-side
  // bare i full bredde, og under bildet når vinduet blir smalere.
  const cardMobile = useIsMobile(1024);
  const LANE_W = isMobile ? 58 : 188;
  const AMP = isMobile ? 13 : 44;
  const CX = LANE_W / 2;
  const GAP = isMobile ? 12 : 18;
  const [vmNodes, setVmNodes] = useState(() => liveVoyageNodes(initialLiveGames()));
  const voyageNodes = [...VOYAGE_CORE_NODES, ...vmNodes];
  const hasConfirmedFinal = voyageNodes.some((node) => node.round === "Finale" && node.kind === "knockout");

  const containerRef = useRef(null);
  const cardRefs = useRef([]);
  const baseRef = useRef(null);
  const fillRef = useRef(null);
  const shipRef = useRef(null);
  const lutRef = useRef(null);
  const sceneMetricsRef = useRef({ pageTop: 0, maxScroll: 0 });

  const [geo, setGeo] = useState({ pathD: "", height: 0, nodes: [], waves: [] });
  const [activeIdx, setActiveIdx] = useState(0);
  const geoRef = useRef(geo);
  geoRef.current = geo;

  useEffect(() => {
    let alive = true;
    loadLiveGames()
      .then((games) => { if (alive) setVmNodes(liveVoyageNodes(games)); })
      .catch(() => { if (alive) setVmNodes(liveVoyageNodes(initialLiveGames())); });
    return () => { alive = false; };
  }, []);

  // Re-place the ship and green fill from the current scroll position.
  function update() {
    const L = lutRef.current, cont = containerRef.current, g = geoRef.current;
    if (!L || !cont) return;
    const metrics = sceneMetricsRef.current;
    const anchor = window.innerHeight * 0.46;
    const lastNodeY = g.nodes.length ? g.nodes[g.nodes.length - 1].y : g.height;
    // Keep the whole longship inside the rail at the final stop, rather than
    // allowing its prow or flag to clip beyond the bottom edge.
    const boatHalfHeight = isMobile ? 23 : 30;
    const dockY = Math.max(0, Math.min(lastNodeY, g.height - boatHalfHeight));
    const naturalY = Math.max(0, Math.min(dockY, anchor + window.scrollY - metrics.pageTop));
    // A moderately longer final approach feels calmer without pulling the ship
    // down to the last node too early while it is still in the viewport.
    const dockingRange = Math.min(isMobile ? 500 : 440, metrics.maxScroll);
    const dockingProgress = dockingRange ? Math.max(0, Math.min(1, (dockingRange - (metrics.maxScroll - window.scrollY)) / dockingRange)) : 1;
    const easedDocking = dockingProgress * dockingProgress * (3 - 2 * dockingProgress);
    const y = naturalY + (dockY - naturalY) * easedDocking;
    let lo = 0, hi = L.lut.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (L.lut[m].y < y) lo = m + 1; else hi = m; }
    // Interpolate between lookup samples. Choosing the next sample directly
    // made the ship advance in visible steps on the tall mobile journey.
    const next = L.lut[lo], prev = L.lut[Math.max(0, lo - 1)];
    const span = next.y - prev.y;
    const t = span > 0 ? Math.max(0, Math.min(1, (y - prev.y) / span)) : 0;
    const e = {
      x: prev.x + (next.x - prev.x) * t,
      y: prev.y + (next.y - prev.y) * t,
      len: prev.len + (next.len - prev.len) * t,
      angle: prev.angle + (next.angle - prev.angle) * t,
    };
    if (shipRef.current) {
      shipRef.current.setAttribute("transform", `translate(${e.x.toFixed(1)},${e.y.toFixed(1)}) rotate(${e.angle.toFixed(1)})`);
    }
    if (fillRef.current) fillRef.current.setAttribute("stroke-dasharray", `${e.len.toFixed(1)} ${(L.total + 12).toFixed(1)}`);
    let bi = 0, bd = Infinity;
    g.nodes.forEach((n) => { const d = Math.abs(n.y - y); if (d < bd) { bd = d; bi = n.i; } });
    setActiveIdx((prev) => (prev === bi ? prev : bi));
  }

  // Measure each card's centre → node points → the curvy path that threads them.
  useLayoutEffect(() => {
    const measure = () => {
      const cont = containerRef.current;
      if (!cont) return;
      const rect = cont.getBoundingClientRect();
      sceneMetricsRef.current = {
        pageTop: rect.top + window.scrollY,
        maxScroll: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
      };
      const h = cont.offsetHeight;
      const nodes = [];
      const pts = [{ x: CX, y: Math.min(28, h) }];
      cardRefs.current.forEach((el, i) => {
        if (!el) return;
        const y = el.offsetTop + el.offsetHeight / 2;
        const x = CX + AMP * Math.sin(i * 0.95 + 0.4);
        nodes.push({ x, y, i });
        pts.push({ x, y });
      });
      const waveRows = [];
      const STEP = isMobile ? 26 : 32, ROWH = isMobile ? 34 : 40, GAPW = STEP * 1.6;
      let row = 0;
      for (let wy = 26; wy < h - 6; wy += ROWH, row++) {
        if (row % 3 === 1) continue; // leave some lines as open water
        const odd = row % 2 === 1;
        // Deterministic variation gives each row its own tide without changing
        // pattern every time ResizeObserver runs.
        const seed = ((row * 37 + 17) % 97) / 97;
        const speedSeed = ((row * 53 + 11) % 89) / 89;
        const waveRow = {
          y: wy, flip: odd,
          drift: Math.round((isMobile ? 16 : 28) + seed * (isMobile ? 16 : 22)),
          duration: 5.2 + speedSeed * 3.8,
          delay: -(row * 0.73 + seed * 1.8),
          waves: [],
        };
        const run = odd ? 5 : 4; // a group of 4–5 waves, then a horizontal gap, then more
        // Extend the pattern beyond the clipping rail so its gentle sideways
        // drift never reveals a hard edge or makes a new wave pop into view.
        let x = (odd ? STEP / 2 : 0) - 64, n = 0;
        while (x < LANE_W + 64) {
          waveRow.waves.push({ x, deep: odd });
          n++;
          x += (n % run === 0) ? GAPW : STEP;
        }
        waveRows.push(waveRow);
      }
      setGeo({ pathD: smoothPath(pts), height: h, nodes, waves: waveRows });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [isMobile, CX, AMP, vmNodes.length]);

  // Build a length→point lookup table from the rendered path (before paint, no flash).
  useLayoutEffect(() => {
    const p = baseRef.current;
    if (!p || !geo.pathD) return;
    let total = 0;
    try { total = p.getTotalLength(); } catch { return; }
    const N = 260, lut = [];
    for (let i = 0; i <= N; i++) {
      const len = (total * i) / N;
      const pt = p.getPointAtLength(len);
      lut.push({ len, x: pt.x, y: pt.y, angle: 0 });
    }
    for (let i = 0; i < lut.length; i++) {
      const a = lut[Math.max(0, i - 1)], b = lut[Math.min(lut.length - 1, i + 1)];
      lut[i].angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    }
    lutRef.current = { lut, total };
    update();
  }, [geo.pathD]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drive the ship with page scroll. Attached once; reads fresh geometry via refs.
  useEffect(() => {
    let raf = 0;
    const onScroll = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; update(); }); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={S.adminWrap}>
      <div style={{ margin: "4px 0 18px", maxWidth: 720 }}>
        <div style={{ color: "var(--accent)", fontSize: 11, fontWeight: 900, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>Landslagsskipets rute</div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <h1 style={{ margin: 0, color: "var(--text1)", fontSize: isMobile ? 27 : 36, lineHeight: 1.08, letterSpacing: -0.9 }}>Norges vei til VM</h1>
          <div style={{ flexShrink: 0 }}><VikingHorn /></div>
        </div>
        <p style={{ margin: "10px 0 0", color: "var(--text2)", fontSize: 15, lineHeight: 1.55, maxWidth: 640 }}>
          Fra Marseille i 1998 til verdens største scene i USA. Skroll deg nedover og følg langskipet over havet — fra kvalifiseringen til VM 2026.
        </p>
      </div>

      <div ref={containerRef} style={{ position: "relative", maxWidth: isMobile ? "none" : LANE_W + GAP + 960 }}>
        <svg aria-hidden="true" width={LANE_W} height={geo.height || 1} viewBox={`0 0 ${LANE_W} ${geo.height || 1}`}
          style={{ position: "absolute", left: 0, top: 0, overflow: "hidden" }}>
          <defs><clipPath id="laneClip"><rect x="0" y="0" width={LANE_W} height={geo.height || 1} rx="16" /></clipPath></defs>
          <rect x="0" y="0" width={LANE_W} height={geo.height || 1} rx="16" fill="#0A1E3C" />
          <g clipPath="url(#laneClip)">
            {geo.waves.map((row, rowIndex) => (
              <g key={rowIndex} className="voyage-wave-line" style={{
                "--wave-from": `${-row.drift}px`, "--wave-to": `${row.drift}px`,
                animationDuration: `${row.duration.toFixed(2)}s`, animationDelay: `${row.delay.toFixed(2)}s`,
              }}>
                {row.waves.map((wave, waveIndex) => (
                  <path key={waveIndex} d={SAGA_WAVE}
                    transform={`translate(${wave.x.toFixed(1)},${row.y.toFixed(1)})${row.flip ? " scale(-1,1)" : ""}`}
                    fill="none" stroke={wave.deep ? "#2F537E" : "#4C77A6"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
                ))}
              </g>
            ))}
          </g>
          {geo.pathD && <g clipPath="url(#laneClip)">
            <path ref={baseRef} d={geo.pathD} fill="none" stroke="#3A557E" strokeWidth="2.4" strokeDasharray="2 8" strokeLinecap="round" opacity="0.85" />
            <path ref={fillRef} d={geo.pathD} fill="none" stroke="#45D17F" strokeWidth="3.2" strokeLinecap="round" />
          </g>}
          {geo.nodes.map((n) => {
            const node = voyageNodes[n.i];
            const done = nodeIsDone(node);
            const gold = node.kind === "knockout" || node.phase === "arrival";
            const ring = gold ? "#C7A75D" : done ? "#45D17F" : "#7E9BC6";
            return (
              <g key={node.id}>
                <line x1={n.x} y1={n.y} x2={LANE_W} y2={n.y} stroke={ring} strokeWidth="1" opacity={n.i === activeIdx ? 0.5 : 0.2} />
                {n.i === activeIdx && <circle cx={n.x} cy={n.y} r="11" fill="none" stroke={ring} strokeWidth="1.5" opacity="0.5" />}
                <circle cx={n.x} cy={n.y} r="5.5" fill={done ? ring : "#0A1E3C"} stroke={ring} strokeWidth="2.2" />
              </g>
            );
          })}
          {geo.height > 0 && <>
            <g transform={`translate(${CX - 12}, 11)`}>
              <rect width="24" height="17" rx="1.5" fill="#BA1B2D" /><rect x="8" width="5" height="17" fill="#fff" /><rect y="6" width="24" height="5" fill="#fff" /><rect x="9.5" width="2.5" height="17" fill="#11296B" /><rect y="7.2" width="24" height="2.5" fill="#11296B" />
            </g>
            {hasConfirmedFinal && <g transform={`translate(${CX - 13}, ${geo.height - 30})`}>
              <rect width="26" height="17" rx="1.5" fill="#B22234" /><rect y="2.4" width="26" height="2.4" fill="#fff" /><rect y="7.3" width="26" height="2.4" fill="#fff" /><rect y="12.1" width="26" height="2.4" fill="#fff" /><rect width="11" height="9" fill="#3C3B6E" />
            </g>}
          </>}
          {geo.pathD && <g ref={shipRef}><Longship /></g>}
        </svg>

        <div style={{ marginLeft: LANE_W + GAP }}>
          {voyageNodes.map((node, i) => (
            <div key={node.id} ref={(el) => (cardRefs.current[i] = el)} style={{ padding: isMobile ? "9px 0" : "13px 0" }}>
              <VoyageCard node={node} active={i === activeIdx} isMobile={cardMobile} imageOnRight={i % 2 === 1} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MatchPicture({ node, isMobile, resColor }) {
  const opponent = node.opponent || "Motstander";
  const label = node.story?.visual || node.story?.label || node.round;
  const image = node.story?.image;
  const story = node.story || {};
  const imageHeight = isMobile
    ? story.imageHeightMobile || 232
    : story.imageHeightDesktop || 276;
  const imageFocus = isMobile
    ? story.focusMobile || story.focus || "center"
    : story.focusDesktop || story.focus || "center";
  const imageScale = story.scale || 1;
  return (
    <div style={{
      position: "relative", minHeight: imageHeight, height: "100%", overflow: "hidden",
      backgroundColor: "#071C42",
    }}>
      {image ? (
        <img
          src={image}
          alt=""
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", objectPosition: imageFocus,
            transform: `scale(${imageScale})`,
          }}
        />
      ) : null}
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0,
        background: `
          linear-gradient(90deg, rgba(0,0,0,0.72), rgba(0,0,0,0.22) 48%, rgba(0,0,0,0.78)),
          linear-gradient(0deg, rgba(0,0,0,0.46), transparent 44%),
          radial-gradient(circle at 18% 22%, color-mix(in srgb, ${resColor} 24%, transparent), transparent 32%)
        `,
      }} />
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0, opacity: 0.14,
        backgroundImage: `url(${norseKnitBand})`,
        backgroundRepeat: "repeat",
        backgroundSize: "96px 96px",
        mixBlendMode: "screen",
      }} />

      <div style={{ position: "relative", zIndex: 1, height: "100%", minHeight: imageHeight, padding: isMobile ? 16 : 20, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
            <Flag name="Norge" size={isMobile ? 30 : 38} />
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "rgba(255,255,255,0.68)", fontSize: 10, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase" }}>Norge</div>
              <div style={{ color: "#FFFFFF", fontSize: isMobile ? 16 : 19, fontWeight: 900, whiteSpace: "nowrap" }}>{node.score}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0, justifyContent: "flex-end" }}>
            <div style={{ minWidth: 0, textAlign: "right" }}>
              <div style={{ color: "rgba(255,255,255,0.68)", fontSize: 10, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase" }}>{codeOf(opponent)}</div>
              <div style={{ color: "#FFFFFF", fontSize: isMobile ? 13 : 15, fontWeight: 850, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: isMobile ? 126 : 150 }}>{opponent}</div>
            </div>
            <Flag name={opponent} code={node.oppCode} size={isMobile ? 30 : 38} />
          </div>
        </div>

        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 9px", borderRadius: 8, background: "rgba(0,0,0,0.34)", border: "1px solid rgba(255,255,255,0.13)" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: resColor, boxShadow: `0 0 0 4px color-mix(in srgb, ${resColor} 18%, transparent)` }} />
            <span style={{ color: "#FFFFFF", fontSize: 10.5, fontWeight: 900, letterSpacing: 1.1, textTransform: "uppercase" }}>{label}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function VoyageCard({ node, active, isMobile, imageOnRight }) {
  const splitDirection = isMobile ? "column" : imageOnRight ? "row-reverse" : "row";
  const base = {
    background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 16,
    boxShadow: active ? "0 0 0 1.5px var(--accent)" : "none",
    transition: "box-shadow .25s ease", overflow: "hidden",
    maxWidth: isMobile ? "none" : 600,
  };

  if (node.phase === "kval") {
    return (
      <article style={{ ...base, maxWidth: isMobile ? "none" : 960 }}>
        <div style={{ display: "flex", flexDirection: splitDirection, alignItems: "stretch" }}>
          <div style={{ position: "relative", flex: isMobile ? "0 0 auto" : "0 0 56%", aspectRatio: isMobile ? "3 / 2" : "auto", minHeight: isMobile ? 0 : 320, background: "#07101F", overflow: "hidden" }}>
            <img src={node.image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: node.focus || "center" }} />
          </div>
          <div style={{ flex: isMobile ? "0 0 auto" : "1 1 44%", padding: isMobile ? "13px 15px 16px" : "22px 26px", display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
            <div style={{ color: "var(--text3)", fontSize: 11, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase" }}>{node.date}</div>
            <div style={{ marginTop: 3, color: "var(--accent)", fontSize: 16, fontWeight: 900 }}>{node.score}</div>
            <h3 style={{ margin: "6px 0 0", color: "var(--text1)", fontSize: isMobile ? 20 : 24, letterSpacing: -0.4 }}>{node.title}</h3>
            <div style={{ marginTop: 9, color: "var(--text2)", fontSize: 14, lineHeight: 1.6 }}>
              {node.body.map((p) => <p key={p} style={{ margin: "0 0 8px" }}>{p}</p>)}
            </div>
          </div>
        </div>
      </article>
    );
  }

  if (node.phase === "arrival") {
    return (
      <article style={{ ...base, maxWidth: isMobile ? "none" : 960 }}>
        <div style={{ display: "flex", flexDirection: splitDirection, alignItems: "stretch" }}>
          <div style={{ position: "relative", flex: isMobile ? "0 0 auto" : "0 0 56%", aspectRatio: isMobile ? "16 / 9" : "auto", minHeight: isMobile ? 0 : 320, background: "#07101F", overflow: "hidden" }}>
            <img src={node.image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <div style={{ flex: isMobile ? "0 0 auto" : "1 1 44%", padding: isMobile ? "13px 15px 16px" : "22px 26px", display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
            <div style={{ color: "#C7A75D", fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase" }}>{codeToFlag("US")} Ankomst · VM 2026</div>
            <h3 style={{ margin: "6px 0 0", color: "var(--text1)", fontSize: isMobile ? 20 : 24, letterSpacing: -0.4 }}>{node.title}</h3>
            <p style={{ margin: "9px 0 0", color: "var(--text2)", fontSize: 14, lineHeight: 1.6 }}>{node.body}</p>
          </div>
        </div>
      </article>
    );
  }

  const played = !!node.score;
  const placeholder = node.kind === "knockout" && !node.opponent && !node.score;
  const resColor = node.result === "W" ? "var(--accent)" : node.result === "L" ? "#E0564F" : "#E0A106";
  const resLabel = node.result === "W" ? "Seier" : node.result === "L" ? "Tap" : node.result === "D" ? "Uavgjort" : "";
  const kickoff = node.kickoff ? new Date(node.kickoff) : null;
  const upcomingFixture = !played && !placeholder && Boolean(node.opponent);
  const campaignLabel = placeholder ? "Mulig videre vei" : upcomingFixture ? "Neste kamp" : resLabel;
  const campaignTitle = placeholder
    ? "Kun ved avansement"
    : upcomingFixture
      ? kickoff ? formatCountdown(kickoff) : "Kampdato kommer"
      : node.kind === "knockout"
        ? node.result === "W" ? "Videre" : node.result === "D" ? "Ekstra nerve" : "Stopp"
        : node.result === "W" ? "3 poeng" : node.result === "D" ? "1 poeng" : "0 poeng";
  const perfectGroupStart = node.kind === "group" && node.result === "W" && node.groupMatchesPlayed === 2 && node.groupPoints === 6;
  const campaignCopy = placeholder
    ? "Motstander og kampdato fastsettes etter gruppespillet."
    : upcomingFixture
      ? kickoff
        ? `${kickoff.toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "long" })} · ${kickoff.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })} norsk tid`
        : "Tidspunktet er ikke fastsatt ennå."
      : node.kind === "knockout"
        ? node.result === "W" ? "Norge lever videre i sluttspillet." : "VM-reisen stopper her."
        : node.result === "W" ? perfectGroupStart ? "Seks poeng av seks — Norge står med full pott etter to kamper." : "En sterk start på VM-reisen." : node.result === "D" ? "Alt er fortsatt åpent i gruppa." : "Norge må slå tilbake i neste kamp.";
  const panelColor = placeholder ? "#C7A75D" : upcomingFixture ? "var(--accent)" : resColor;

  if (played) {
    const story = node.story || matchStoryForGame({ id: node.id, type: node.kind }, node.result, node.opponent);
    return (
      <article style={{ ...base, maxWidth: isMobile ? "none" : 960, borderColor: `color-mix(in srgb, ${resColor} 45%, var(--border))` }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "42% 58%", alignItems: "stretch" }}>
          <MatchPicture node={node} isMobile={isMobile} resColor={resColor} />
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 216px", minWidth: 0 }}>
            <div style={{ padding: isMobile ? "14px 15px 16px" : "19px 22px", minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <span style={{ color: "var(--text3)", fontSize: 11, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase" }}>
                  {node.round}{node.date && node.date !== "Sluttspill" ? ` · ${node.date}` : ""}
                </span>
                <span style={{ color: resColor, fontSize: 11.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.4 }}>{resLabel}</span>
              </div>

              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 800, color: "var(--text1)" }}>
                  <Flag name="Norge" size={19} /> Norge
                </span>
                <span style={{ fontSize: 16, fontWeight: 900, color: resColor, minWidth: 46, textAlign: "center", padding: "2px 9px", borderRadius: 8, background: "var(--bg2)" }}>
                  {node.score}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 800, color: "var(--text1)", minWidth: 0 }}>
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{node.opponent}</span>
                  <Flag name={node.opponent} code={node.oppCode} size={19} />
                </span>
              </div>

              <div style={{ marginTop: 14, color: resColor, fontSize: 10.5, fontWeight: 900, letterSpacing: 1.1, textTransform: "uppercase" }}>{story.label}</div>
              <h3 style={{ margin: "5px 0 0", color: "var(--text1)", fontSize: isMobile ? 20 : 22, lineHeight: 1.12, fontWeight: 900, letterSpacing: -0.45 }}>{story.title}</h3>
              <p style={{ margin: "8px 0 0", color: "var(--text2)", fontSize: 13.5, lineHeight: 1.55, fontWeight: 600 }}>{story.body}</p>
            </div>
            <aside style={{
              display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0,
              padding: isMobile ? "13px 15px 15px" : "19px 20px",
              borderTop: isMobile ? "1px solid var(--border)" : "none",
              borderLeft: isMobile ? "none" : "1px solid var(--border)",
              background: `linear-gradient(135deg, color-mix(in srgb, ${panelColor} 10%, var(--bg3)), var(--bg3))`,
            }}>
              <div style={{ color: panelColor, fontSize: 10.5, fontWeight: 900, letterSpacing: 1.1, textTransform: "uppercase" }}>{campaignLabel}</div>
              <div style={{ marginTop: 5, color: "var(--text1)", fontSize: isMobile ? 19 : 23, fontWeight: 900, letterSpacing: -0.5 }}>{campaignTitle}</div>
              <div style={{ marginTop: 5, color: "var(--text3)", fontSize: 13, fontWeight: 650, lineHeight: 1.45 }}>{story.outcome || campaignCopy}</div>
            </aside>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article style={{ ...base, maxWidth: isMobile ? "none" : 960, borderColor: played ? `color-mix(in srgb, ${resColor} 45%, var(--border))` : "var(--border)" }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "56% 44%" }}>
        <div style={{ padding: isMobile ? "14px 15px" : "19px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <span style={{ color: placeholder ? "#C7A75D" : "var(--text3)", fontSize: 11, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase" }}>
              {node.round}{node.date && node.date !== "Sluttspill" ? ` · ${node.date}` : ""}
            </span>
            {played && <span style={{ color: resColor, fontSize: 11.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.4 }}>{resLabel}</span>}
            {!played && !placeholder && kickoff && <span style={{ color: "var(--text3)", fontSize: 11.5, fontWeight: 700 }}>{formatCountdown(kickoff)}</span>}
          </div>

          {placeholder ? (
            <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 8, color: "var(--text3)", fontSize: 13.5, fontWeight: 700 }}>
              <span style={{ fontSize: 16 }}>🏆</span> Venter på lagene
            </div>
          ) : (
            <div style={{ marginTop: 9, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 800, color: "var(--text1)" }}>
                <Flag name="Norge" size={19} /> Norge
              </span>
              <span style={{ fontSize: 16, fontWeight: 900, color: played ? resColor : "var(--text3)", minWidth: 46, textAlign: "center", padding: "2px 9px", borderRadius: 8, background: "var(--bg2)" }}>
                {played ? node.score : "vs"}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 800, color: "var(--text1)" }}>
                {node.opponent} <Flag name={node.opponent} code={node.oppCode} size={19} />
              </span>
            </div>
          )}
        </div>
        <aside style={{
          display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0,
          padding: isMobile ? "13px 15px 15px" : "19px 24px",
          borderTop: isMobile ? "1px solid var(--border)" : "none",
          borderLeft: isMobile ? "none" : "1px solid var(--border)",
          background: `linear-gradient(135deg, color-mix(in srgb, ${panelColor} 10%, var(--bg3)), var(--bg3))`,
        }}>
          <div style={{ color: panelColor, fontSize: 10.5, fontWeight: 900, letterSpacing: 1.1, textTransform: "uppercase" }}>{campaignLabel}</div>
          <div style={{ marginTop: 5, color: "var(--text1)", fontSize: isMobile ? 19 : 23, fontWeight: 900, letterSpacing: -0.5 }}>{campaignTitle}</div>
          <div style={{ marginTop: 5, color: "var(--text3)", fontSize: 13, fontWeight: 650, lineHeight: 1.45 }}>{campaignCopy}</div>
        </aside>
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────
// FASIT VIEW — read-only fasit
// ─────────────────────────────────────────────
function PatternSectionLabel({ children, theme }) {
  const isLight = theme === "light";
  const pattern = isLight ? norseKnitBandLight : norseKnitBand;
  return (
    <span style={{
      display: "inline-flex", position: "relative", alignItems: "center", overflow: "hidden",
      padding: "7px 12px", borderRadius: 8, color: isLight ? "#4A1917" : "var(--text1)",
      border: isLight ? "1px solid rgba(162, 76, 66, 0.22)" : "1px solid rgba(75, 123, 182, 0.42)",
      backgroundColor: isLight ? "#FAF0EE" : "#071C42",
      boxShadow: isLight ? "0 1px 0 rgba(255,255,255,0.75) inset" : "0 1px 0 rgba(255,255,255,0.08) inset",
    }}>
      <span aria-hidden="true" style={{
        position: "absolute", inset: 0, opacity: isLight ? 0.64 : 0.7,
        backgroundImage: `url(${pattern})`, backgroundRepeat: "repeat", backgroundSize: "88px 88px",
      }} />
      <span style={{ position: "relative", zIndex: 1, fontSize: 13, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase" }}>{children}</span>
    </span>
  );
}

function FasitView({ fasit, showBonus, theme }) {
  const narrowBracket = useIsMobile(1180);
  const isMobile = useIsMobile();
  const secStyle = isMobile ? { ...S.fasitSection, padding: 13 } : S.fasitSection;
  const anyGroupData = GROUP_KEYS.some((g) => fasit.groups[g].first);
  const anyMatchData = Object.values(fasit.matches).some(Boolean)
    || Object.values(fasit.matchups || {}).some((pair) => Array.isArray(pair) && pair.some(Boolean));
  const thirdPlaced = fasit.thirds || [];

  return (
    <div style={S.adminWrap}>
      <div style={secStyle}>
        <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <PatternSectionLabel theme={theme}>Gruppespill</PatternSectionLabel>
          {!anyGroupData && (
            <span style={{ color: "var(--text3)", fontSize: 12.5, fontWeight: 600 }}>Ikke spilt ennå — fylles ut underveis.</span>
          )}
        </div>
        <div style={isMobile ? { ...S.fasitGrid, gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 6 } : S.fasitGrid}>
          {GROUP_KEYS.map((g) => {
            const { first, second } = fasit.groups[g];
            return <GroupTableCard key={g} g={g} first={first} second={second} compact={isMobile} />;
          })}
        </div>
      </div>

      <div style={secStyle}>
        <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <PatternSectionLabel theme={theme}>Beste treere</PatternSectionLabel>
          {!thirdPlaced.some(Boolean) && (
            <span style={{ color: "var(--text3)", fontSize: 12.5, fontWeight: 600 }}>Ikke avgjort ennå.</span>
          )}
        </div>
        <div style={isMobile ? { ...S.fasitGrid, gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 6 } : S.fasitGrid}>
          {Array.from({ length: 8 }, (_, i) => {
            const team = thirdPlaced[i];
            return (
              <div key={i} style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: isMobile ? 9 : 12, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "stretch" }}>
                  <div style={{ width: isMobile ? 3 : 4, background: team ? "#22C55E" : "var(--border)", flexShrink: 0 }} />
                  <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 5 : 11, padding: isMobile ? "3px 6px" : "11px 14px", flex: 1, minWidth: 0 }}>
                    <span style={{ width: 16, textAlign: "center", fontSize: isMobile ? 11 : 14, fontWeight: 700, color: "var(--text3)", flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                      {team ? <Flag name={team} size={isMobile ? 13 : 18} /> : <SkelDot s={isMobile ? 9 : 12} />}
                    </span>
                    {team
                      ? <span style={{ fontSize: isMobile ? 12 : 15, fontWeight: 700, color: "var(--text1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{isMobile ? codeOf(team) : team}</span>
                      : <SkelBar w={isMobile ? 24 : 52} />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={secStyle}>
        <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <PatternSectionLabel theme={theme}>Sluttspill</PatternSectionLabel>
          {!anyMatchData && (
            <span style={{ color: "var(--text3)", fontSize: 12.5, fontWeight: 600 }}>Ikke spilt ennå — brakettene fylles ut underveis.</span>
          )}
        </div>
        {narrowBracket
          ? <VerticalBracket
              getMatch={makeMatchGetter(fasit).matchTeams}
              getBronse={() => fasit.bronse}
              getFinale={() => fasit.finale} />
          : renderBracketHorizontal({
              getMatch: makeMatchGetter(fasit).matchTeams,
              getBronse: () => fasit.bronse,
              getFinale: () => fasit.finale,
        })}
      </div>

      {showBonus && fasit.quiz.some(Boolean) && (
        <div style={secStyle}>
          <div style={S.fasitSectionTitle}>VM-quiz resultat</div>
          {QUIZ_QUESTIONS.map((q, i) =>
            fasit.quiz[i] ? (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 9 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: isMobile ? 12.5 : 13, fontWeight: 700, color: "var(--text3)", lineHeight: 1.4 }}>
                  {i + 1}. {q}
                </span>
                <span style={{ fontWeight: 700, color: "var(--accent)", textAlign: "right", whiteSpace: "nowrap", flexShrink: 0, fontSize: isMobile ? 12.5 : 14 }}>
                  {fasit.quiz[i]}
                </span>
              </div>
            ) : null
          )}
        </div>
      )}
      {!showBonus && (
        <div style={{ ...secStyle, display: "flex", alignItems: "center", gap: 10, color: "var(--text3)", fontSize: 13.5, lineHeight: 1.5 }}>
          <span style={{ color: "#D8B15A", flexShrink: 0 }}><LockIcon size={17} /></span>
          VM-quiz og bonusspørsmål avsløres under kåringen.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// FASIT — faktiske resultater
// ─────────────────────────────────────────────
function Fasit({ fasit, setFasit, applyLiveResults }) {
  const isMobile = useIsMobile();
  const secStyle = isMobile ? { ...S.fasitSection, padding: 13 } : S.fasitSection;
  const [aiState, setAiState] = useState(""); // "" | "loading" | "ok" | "error"
  const [aiMsg, setAiMsg] = useState("");

  const setGroup = (g, slot, v) =>
    setFasit({ ...fasit, groups: { ...fasit.groups, [g]: { ...fasit.groups[g], [slot]: v } } });
  const setThird = (i, v) => {
    const t = [...fasit.thirds]; t[i] = v;
    setFasit({ ...fasit, thirds: t });
  };
  const setMatch = (m, v) => setFasit({ ...fasit, matches: { ...fasit.matches, [m]: v } });
  const setSfLoser = (m, v) => setFasit({ ...fasit, sfLosers: { ...fasit.sfLosers, [m]: v } });
  const setQuiz = (i, v) => {
    const q = [...fasit.quiz]; q[i] = v;
    setFasit({ ...fasit, quiz: q });
  };

  const runAI = async () => {
    setAiState("loading");
    setAiMsg("Henter VM-resultater fra live-API …");
    try {
      const res = await fetchResultsFromAPI();
      const changed = applyLiveResults(res);
      setAiMsg(changed
        ? "Hentet fra live-API ✓ Resultater og poeng er oppdatert."
        : "Hentet fra live-API ✓ Ingen nye resultater.");
      setAiState("ok");
    } catch (e) {
      console.error(e);
      setAiState("error");
      setAiMsg(`Klarte ikke hente resultater: ${e.message || e}. Fyll inn manuelt, eller prøv igjen.`);
    }
  };

  const matchRow = (m, label) => (
    <div key={m} style={S.fasitRow}>
      <span style={S.fasitMatchLabel}>{label}</span>
      <input list="all-teams" value={fasit.matches[m] || ""}
        onChange={(e) => setMatch(m, e.target.value)}
        placeholder="Vinner" style={S.fasitInput} />
    </div>
  );

  return (
    <div style={S.adminWrap}>
      <datalist id="all-teams">
        {ALL_TEAMS.map((t) => <option key={t} value={t} />)}
      </datalist>

      <div style={S.importCard}>
        <div style={S.importTitle}>Live VM-resultater</div>
        <div style={S.importDesc}>
          Henter live gruppe-standings, beste treere og kampresultater direkte fra <b>worldcup26.ir</b> (gratis, ingen nøkkel).
          Viser <b>midlertidig stilling</b> selv om gruppen ikke er ferdigspilt.
          Serveren sjekker i bakgrunnen og lagrer først når en ny ferdigspilt kamp dukker opp. Quiz-resultat fylles inn manuelt.
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={runAI} disabled={aiState === "loading"} style={S.calcBtn}>
            {aiState === "loading" ? "Henter …" : "🔄 Oppdater resultater"}
          </button>
          <button
            onClick={() => {
              if (window.confirm("Tøm alle resultater? Dette nullstiller gruppespill, beste treere og hele sluttspillet. Quiz-svar beholdes.")) {
                setFasit({ ...emptyFasit(), quiz: fasit.quiz });
                setAiState(""); setAiMsg("");
              }
            }}
            style={{ ...S.calcBtn, background: "transparent", color: "#E8334A", border: "1px solid rgba(232,51,74,0.4)" }}>
            🗑 Tøm resultater
          </button>
          {aiMsg && (
            <span style={{ ...S.importMsg, color: aiState === "error" ? "#E8334A" : "var(--accent)" }}>
              {aiMsg}
            </span>
          )}
        </div>
      </div>

      {/* Gruppespill */}
      <div style={secStyle}>
        <div style={S.fasitSectionTitle}>Gruppespill <span style={S.pts}>({POINTS.group} p per rett)</span></div>
        <div style={S.fasitGrid}>
          {GROUP_KEYS.map((g) => (
            <div key={g} style={S.fasitGroupCard}>
              <div style={S.fasitGroupName}>Gruppe {g}</div>
              <select value={fasit.groups[g].first} onChange={(e) => setGroup(g, "first", e.target.value)} style={S.fasitSelect}>
                <option value="">1. plass …</option>
                {GROUPS[g].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={fasit.groups[g].second} onChange={(e) => setGroup(g, "second", e.target.value)} style={S.fasitSelect}>
                <option value="">2. plass …</option>
                {GROUPS[g].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Beste treere */}
      <div style={secStyle}>
        <div style={S.fasitSectionTitle}>Beste treere <span style={S.pts}>({POINTS.third} p per rett, 8 lag)</span></div>
        <div style={S.fasitGrid}>
          {fasit.thirds.map((t, i) => (
            <input key={i} list="all-teams" value={t}
              onChange={(e) => setThird(i, e.target.value)}
              placeholder={`Treer ${i + 1}`} style={S.fasitInput} />
          ))}
        </div>
      </div>

      {/* Sluttspill */}
      <div style={secStyle}>
        <div style={S.fasitSectionTitle}>16-delsfinaler <span style={S.pts}>({POINTS.r16} p per rett)</span></div>
        <div style={S.fasitGrid}>
          {Object.keys(CELLS.r16).map((m) => matchRow(m, `M${m}`))}
        </div>
      </div>
      <div style={secStyle}>
        <div style={S.fasitSectionTitle}>8-delsfinaler <span style={S.pts}>({POINTS.r8} p per rett)</span></div>
        <div style={S.fasitGrid}>
          {Object.keys(CELLS.r8).map((m) => matchRow(m, `M${m}`))}
        </div>
      </div>
      <div style={secStyle}>
        <div style={S.fasitSectionTitle}>Kvartfinaler <span style={S.pts}>({POINTS.kvart} p per rett)</span></div>
        <div style={S.fasitGrid}>
          {Object.keys(CELLS.kvart).map((m) => matchRow(m, `M${m}`))}
        </div>
      </div>
      <div style={secStyle}>
        <div style={S.fasitSectionTitle}>Semifinaler <span style={S.pts}>({POINTS.semi} p per rett, vinner og taper)</span></div>
        <div style={S.fasitGrid}>
          {["101", "102"].map((m) => (
            <React.Fragment key={m}>
              {matchRow(m, `M${m} vinner`)}
              <div style={S.fasitRow}>
                <span style={S.fasitMatchLabel}>M{m} taper</span>
                <input list="all-teams" value={fasit.sfLosers[m] || ""}
                  onChange={(e) => setSfLoser(m, e.target.value)}
                  placeholder="Taper" style={S.fasitInput} />
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
      <div style={secStyle}>
        <div style={S.fasitSectionTitle}>
          Bronsefinale & finale <span style={S.pts}>({POINTS.bronse} p / {POINTS.finale} p)</span>
        </div>
        <div style={S.fasitGrid}>
          <div style={S.fasitRow}>
            <span style={S.fasitMatchLabel}>Bronse</span>
            <input list="all-teams" value={fasit.bronse}
              onChange={(e) => setFasit({ ...fasit, bronse: e.target.value })}
              placeholder="Vinner bronsefinale" style={S.fasitInput} />
          </div>
          <div style={S.fasitRow}>
            <span style={S.fasitMatchLabel}>Mester</span>
            <input list="all-teams" value={fasit.finale}
              onChange={(e) => setFasit({ ...fasit, finale: e.target.value })}
              placeholder="Verdensmester" style={S.fasitInput} />
          </div>
        </div>
      </div>

      {/* Quiz */}
      <div style={secStyle}>
        <div style={S.fasitSectionTitle}>VM-quiz resultat <span style={S.pts}>({POINTS.quiz} p per rett)</span></div>
        {QUIZ_QUESTIONS.map((q, i) => (
          <div key={i} style={{ ...S.fasitRow, marginBottom: 8 }}>
            <span style={{ ...S.fasitMatchLabel, width: "auto", flex: 1, whiteSpace: "normal" }}>{i + 1}. {q}</span>
            <input value={fasit.quiz[i]} onChange={(e) => setQuiz(i, e.target.value)}
              placeholder="Resultat" style={{ ...S.fasitInput, maxWidth: 180 }} />
          </div>
        ))}
      </div>

      <div style={{ ...S.importDesc, textAlign: "center", padding: "8px 0 24px" }}>
        Live-oppdateringer beregner poeng automatisk. Etter manuelle endringer kan du fortsatt gå til <b>Deltakere</b> og trykke «Beregn poeng fra resultat».
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PRESENT
// ─────────────────────────────────────────────
function LockedCeremony() {
  return (
    <main className="ceremony-lock" aria-labelledby="ceremony-lock-title">
      <div className="ceremony-grain" aria-hidden="true" />
      <div className="ceremony-prize-stage" aria-hidden="true">
        <div className="ceremony-prize-aura" />
        <div className="ceremony-prize-floor" />
        <img className="ceremony-prize" src={worldCupPrizeSilhouette} alt="" />
      </div>

      <div className="ceremony-inner">
        <div className="ceremony-copy">
          <div className="ceremony-kicker"><LockIcon size={15} /> Kåringen er låst</div>
          <h1 id="ceremony-lock-title" className="ceremony-title">Hvem tar<br /><em>pokalen?</em></h1>
          <p className="ceremony-description">Premien venter. Vinneren avsløres når resultatet fra VM-finalen er klart.</p>
          <div className="ceremony-status"><span /> Åpner etter finalen</div>
        </div>
      </div>
    </main>
  );
}

function Present({ participants, ceremony, setCeremony, isAdmin, isLive, onExit }) {
  const competingParticipants = participants.filter((p) => !isExcludedFromCompetition(p));
  const normalizedCeremony = normalizeCeremony(ceremony);
  const { phase, step } = normalizedCeremony;
  const bonusRevealed = Math.min(normalizedCeremony.bonusRevealed, competingParticipants.length);

  const finalBase = competingParticipants.map((p) => ({
    ...p, base: ROUNDS.reduce((s, r) => s + (p.scores[r.key] || 0), 0),
  }));
  const participantById = new Map(finalBase.map((p) => [p.id, p]));
  const syncedBonusOrder = normalizedCeremony.bonusOrder
    ?.map((id) => participantById.get(id))
    .filter(Boolean);
  const publicRevealedOrder = normalizedCeremony.revealedBonusIds
    ?.map((id) => participantById.get(id))
    .filter(Boolean) || [];
  const bonusOrder = isAdmin
    ? (syncedBonusOrder?.length === competingParticipants.length
        ? syncedBonusOrder
        : [...finalBase].sort((a, b) => (a.bonus || 0) - (b.bonus || 0) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)))
    : publicRevealedOrder;

  const next = () => {
    if (phase === "rounds") {
      if (step < ROUNDS.length - 1) setCeremony({ ...normalizedCeremony, step: step + 1 });
      else setCeremony({
        ...normalizedCeremony,
        phase: "bonus",
        bonusRevealed: 0,
        bonusOrder: [...finalBase]
          .sort((a, b) => (a.bonus || 0) - (b.bonus || 0) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
          .map((participant) => participant.id),
      });
    } else if (phase === "bonus") {
      if (bonusRevealed < competingParticipants.length) setCeremony({ ...normalizedCeremony, bonusRevealed: bonusRevealed + 1 });
      else setCeremony({ ...normalizedCeremony, phase: "winner", bonusRevealed: competingParticipants.length });
    }
  };
  const prev = () => {
    if (phase === "winner") setCeremony({ ...normalizedCeremony, phase: "bonus", bonusRevealed: competingParticipants.length });
    else if (phase === "bonus") {
      if (bonusRevealed > 0) setCeremony({ ...normalizedCeremony, bonusRevealed: bonusRevealed - 1 });
      else setCeremony({ ...normalizedCeremony, phase: "rounds", step: ROUNDS.length - 1 });
    } else if (step > 0) setCeremony({ ...normalizedCeremony, step: step - 1 });
  };

  useEffect(() => {
    const onKey = (e) => {
      if (isAdmin && (e.key === "ArrowRight" || e.key === " ")) { e.preventDefault(); next(); }
      else if (isAdmin && e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      else if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isAdmin, phase, step, bonusRevealed, competingParticipants.length, onExit]);

  const phaseLabel = phase === "rounds" ? ROUNDS[step].label
    : phase === "bonus" ? `${BONUS_LABEL} (${bonusRevealed}/${competingParticipants.length})`
    : "Vinner!";

  return (
    <div style={S.presentWrap}>
      {phase === "rounds" && <BumpChart participants={competingParticipants} step={step} />}
      {phase === "bonus" && (
        <BonusReveal finalBase={finalBase} bonusOrder={bonusOrder} revealed={bonusRevealed} />
      )}
      {phase === "winner" && <WinnerScreen finalBase={finalBase} />}

      {isAdmin ? (
        <div style={S.presentNav}>
          <button onClick={prev} disabled={phase === "rounds" && step === 0} style={S.navBtn}>‹ Tilbake</button>
          <div style={S.phaseLabel}>
            {!isLive && <span style={S.previewLabel}>Forhåndsvisning</span>}
            {phaseLabel}
          </div>
          <button onClick={next} disabled={phase === "winner"} style={{ ...S.navBtn, ...S.navBtnPrimary }}>
            {phase === "rounds" && step === ROUNDS.length - 1 ? "Bonusrunde ›"
              : phase === "bonus" && bonusRevealed === competingParticipants.length ? "Kår vinner ›"
              : "Neste ›"}
          </button>
        </div>
      ) : (
        <div style={S.publicCeremonyStatus} role="status">
          <span style={S.publicCeremonyDot} /> {phase === "winner" ? "Kåringen er avgjort" : `Direkte kåring · ${phaseLabel}`}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// BUMP CHART
// ─────────────────────────────────────────────
function BumpChart({ participants, step }) {
  const n = participants.length;
  const atRounds = ROUNDS.map((_, i) => rankingAt(participants, i));
  const rankOf = (pid, ri) => atRounds[ri].findIndex((p) => p.id === pid);

  const rowH = Math.min(72, Math.max(40, 560 / Math.max(n, 1)));
  const W = 1000;
  // Reserve space after the active round for the participant labels. Keeping each
  // label beside its current endpoint makes the line-to-name mapping unambiguous
  // after positions swap between rounds.
  const padL = 32, padR = 200, padT = 58, padB = 20;
  const chartH = Math.max(rowH * n, 300);
  const H = padT + chartH + padB;
  const visible = step + 1;

  const xFor = (ri) =>
    padL + (ROUNDS.length === 1 ? 0 : (ri / (ROUNDS.length - 1)) * (W - padL - padR));
  const yFor = (rank) => padT + rank * rowH + rowH / 2;

  const smoothPath = (pts) => {
    if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const dx = (b.x - a.x) * 0.55;
      d += ` C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
    }
    return d;
  };

  const finalRanking = atRounds[step];

  return (
    <div style={{ ...S.chartCard, padding: "16px 12px" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>

        {Array.from({ length: n }).map((_, rank) => (
          <line key={rank}
            x1={padL} y1={yFor(rank)}
            x2={xFor(ROUNDS.length - 1) + 12} y2={yFor(rank)}
            stroke="var(--border)" strokeWidth="1" />
        ))}

        {ROUNDS.map((r, i) => (
          <g key={r.key} opacity={i < visible ? 1 : 0.25} style={{ transition: "opacity .5s" }}>
            <text x={xFor(i)} y={34} style={{ fill: i === step ? "var(--text1)" : "var(--text3)" }}
              fontSize="14" fontWeight={i === step ? 800 : 600}
              textAnchor="middle" fontFamily="'Inter', sans-serif">
              {r.short}
            </text>
            {i === step && (
              <line x1={xFor(i) - 24} y1={44} x2={xFor(i) + 24} y2={44}
                style={{ stroke: "var(--accent)" }} strokeWidth="4" strokeLinecap="round" />
            )}
          </g>
        ))}

        {participants.map((p) => {
          const pts = [];
          for (let i = 0; i < visible; i++) {
            pts.push({ x: xFor(i), y: yFor(rankOf(p.id, i)) });
          }
          const isLast = (i) => i === pts.length - 1;
          return (
            <g key={p.id}>
              <path d={smoothPath(pts)} fill="none" stroke={p.color} strokeWidth="3.5"
                strokeLinecap="round" style={{ transition: "d .7s ease" }} />
              {pts.map((pt, i) => (
                <circle key={i} cx={pt.x} cy={pt.y}
                  r={isLast(i) ? 7 : 5}
                  fill={isLast(i) ? p.color : "var(--bg3)"}
                  stroke={p.color}
                  strokeWidth={isLast(i) ? 0 : 2.5}
                  style={{ transition: "all .7s ease" }} />
              ))}
            </g>
          );
        })}

        {participants.map((p) => {
          const lastRoundIdx = visible - 1;
          const rankNow = rankOf(p.id, lastRoundIdx);
          const y = yFor(rankNow);
          const overallRank = finalRanking.findIndex((r) => r.id === p.id);
          return (
            <g key={p.id} style={{ transition: "all .7s ease" }}>
              <text x={xFor(lastRoundIdx) + 16} y={y + 5} style={{ fill: "var(--text1)" }} fontSize="14"
                fontWeight="700" fontFamily="'Inter', sans-serif">
                {firstName(p.name)}
                <tspan style={{ fill: "var(--text3)" }} fontSize="11" fontWeight="600" dx="5">#{overallRank + 1}</tspan>
              </text>
            </g>
          );
        })}

      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────
// BONUS REVEAL
// ─────────────────────────────────────────────
function BonusReveal({ finalBase, bonusOrder, revealed }) {
  const revealedIds = new Set(bonusOrder.slice(0, revealed).map((p) => p.id));
  const current = finalBase.map((p) => ({
    ...p,
    shown: p.base + (revealedIds.has(p.id) ? p.bonus || 0 : 0),
    bonusShown: revealedIds.has(p.id),
  }));
  const sorted = [...current].sort((a, b) => b.shown - a.shown || a.name.localeCompare(b.name));
  const justRevealed = revealed > 0 ? bonusOrder[revealed - 1] : null;
  const rowH = Math.min(56, Math.max(36, 500 / Math.max(sorted.length, 1)));

  return (
    <div style={S.chartCard}>
      <div style={S.bonusHeader}>
        {BONUS_LABEL}
        {justRevealed && (
          <span key={justRevealed.id} className="bonus-pop" style={S.bonusPop}>
            {firstName(justRevealed.name)} +{justRevealed.bonus || 0}
          </span>
        )}
      </div>
      <div style={{ position: "relative", height: sorted.length * rowH + 8 }}>
        {sorted.map((p, i) => (
          <div key={p.id}
            style={{
              ...S.bonusRow, top: i * rowH, height: rowH - 7,
              borderLeft: `5px solid ${p.color}`,
              background: p.bonusShown ? "var(--bg4)" : "var(--bg0)",
            }}>
            <span style={S.bonusRank}>{i + 1}</span>
            <span style={S.bonusName}>{firstName(p.name)}</span>
            {p.bonusShown && (p.bonus || 0) > 0 && (
              <span className="bonus-star" style={S.bonusStar}>+{p.bonus}</span>
            )}
            <span style={S.bonusScore}>{p.shown}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// WINNER
// ─────────────────────────────────────────────
function WinnerScreen({ finalBase }) {
  const sorted = [...finalBase]
    .map((p) => ({ ...p, total: p.base + (p.bonus || 0) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const [w, second, third] = sorted;

  return (
    <div style={S.winnerCard}>
      <Confetti />
      <div style={S.podiumWrap}>
        {second && <Podium place={2} p={second} height={140} delay={0.2} />}
        {w && <Podium place={1} p={w} height={200} delay={0} winner />}
        {third && <Podium place={3} p={third} height={100} delay={0.4} />}
      </div>
      <div style={S.winnerTitle}>{firstName(w?.name)}</div>
      <div style={S.winnerSub}>Avdelingens fremste fotballekspert · {w?.total} poeng</div>
      {sorted.length > 3 && (
        <ol style={S.restList}>
          {sorted.slice(3).map((p, i) => (
            <li key={p.id} style={S.restItem}>
              <span style={S.restRank}>{i + 4}.</span>
              <span style={{ ...S.dot, background: p.color }} />
              <span style={{ flex: 1 }}>{firstName(p.name)}</span>
              <span style={{ fontWeight: 800, color: "#00DC64" }}>{p.total} p</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Podium({ place, p, height, delay, winner }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", animationDelay: `${delay}s` }}
      className="podium-rise">
      <div style={{ width: 34, height: 34, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6,
        background: place === 1 ? "var(--accent)" : "var(--bg4)", color: place === 1 ? "var(--accent-fg)" : "var(--text2)",
        fontWeight: 800, fontSize: 16 }}>{place}</div>
      <div style={{ fontWeight: 800, fontSize: winner ? 21 : 16, color: "var(--text1)", marginBottom: 2, textAlign: "center" }}>
        {firstName(p.name)}
      </div>
      <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 8 }}>{p.total} p</div>
      <div style={{
        width: 116, height, borderRadius: "10px 10px 0 0",
        background: `linear-gradient(180deg, ${p.color}, ${p.color}99)`,
        display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 8,
        boxShadow: winner ? `0 0 40px ${p.color}66` : "none",
      }}>
        <span style={{ fontSize: 38, fontWeight: 800, color: "var(--text1)", opacity: 0.85 }}>{place}</span>
      </div>
    </div>
  );
}

function Confetti() {
  const colors = ["#00DC64", "#3D7EF5", "#E8334A", "#F5A623", "#A855F7", "#06B6D4"];
  return (
    <div style={S.confetti}>
      {Array.from({ length: 60 }).map((_, i) => (
        <span key={i} className="confetti-piece"
          style={{
            left: `${Math.random() * 100}%`,
            background: colors[i % colors.length],
            animationDelay: `${Math.random() * 3}s`,
            animationDuration: `${2.5 + Math.random() * 2}s`,
          }} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// STYLES — FotMob mørk stil
// Bg #000, kort #1C1C1E, sekundær #2C2C2E, grønn #00DC64, tekst-grå #8E8E93
// ─────────────────────────────────────────────
const S = {
  app: {
    minHeight: "100vh",
    background: "var(--bg0)",
    color: "var(--text1)",
    fontFamily: "'Inter', system-ui, sans-serif",
    display: "flex", flexDirection: "column",
  },
  header: {
    background: "var(--bg3)",
    borderBottom: "1px solid var(--border)",
    padding: "14px 0",
    position: "sticky", top: 0, zIndex: 30,
  },
  headerInner: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    flexWrap: "wrap", gap: 10,
    maxWidth: 1280, margin: "0 auto", width: "100%",
    boxSizing: "border-box", padding: "0 16px",
  },
  logo: { display: "flex", alignItems: "center", gap: 12 },
  logoMark: { width: 42, height: 42, objectFit: "contain", flexShrink: 0 },
  ball: { fontSize: 28 },
  title: { fontSize: 24, fontWeight: 900, letterSpacing: -0.5, color: "var(--text1)" },
  subtitle: { fontSize: 11, color: "var(--text3)", letterSpacing: 2, textTransform: "uppercase", fontWeight: 600 },
  modeToggle: { display: "flex", gap: 3, background: "var(--bg3)", padding: 5, borderRadius: 50 },
  modeBtn: {
    border: "none", background: "transparent", color: "var(--text3)",
    padding: "8px 13px", borderRadius: 50, cursor: "pointer", fontSize: 14, fontWeight: 700,
    transition: "all .2s", whiteSpace: "nowrap", flexShrink: 0,
  },
  modeBtnActive: { background: "var(--btn-active-bg)", color: "var(--btn-active-color)" },
  tabLock: { display: "inline-flex", verticalAlign: "-2px", marginRight: 5, opacity: 0.8 },
  ceremonyToggle: {
    background: "transparent", color: "#D8B15A", border: "1px solid #D8B15A66", padding: "6px 10px",
    borderRadius: 20, fontSize: 12, fontWeight: 750, cursor: "pointer", whiteSpace: "nowrap",
  },
  ceremonyToggleOpen: { color: "var(--accent)", borderColor: "var(--accent)66" },

  adminWrap: { padding: 16, maxWidth: 1280, margin: "0 auto", width: "100%", boxSizing: "border-box" },

  importCard: { background: "var(--bg3)", borderRadius: 16, padding: 18, marginBottom: 14 },
  importTitle: { fontSize: 17, fontWeight: 800, marginBottom: 6 },
  importDesc: { fontSize: 13.5, color: "var(--text3)", lineHeight: 1.6, marginBottom: 14 },
  fileBtn: {
    background: "var(--accent)", color: "var(--accent-fg)", padding: "12px 22px",
    borderRadius: 50, fontWeight: 800, fontSize: 14, cursor: "pointer", display: "inline-block",
  },
  calcBtn: {
    background: "var(--accent)", color: "var(--accent-fg)", border: "none", padding: "12px 22px",
    borderRadius: 50, fontWeight: 800, fontSize: 14, cursor: "pointer",
  },
  importMsg: { fontSize: 13.5, color: "var(--accent)", fontWeight: 600 },
  bonusWithheld: {
    display: "flex", alignItems: "center", gap: 7, marginTop: 13, color: "#D8B15A",
    fontSize: 12.5, fontWeight: 700, lineHeight: 1.45,
  },

  addRow: { display: "flex", gap: 10, marginBottom: 16 },
  input: {
    flex: 1, background: "var(--bg3)", border: "1px solid var(--border)", color: "var(--text1)",
    padding: "14px 16px", borderRadius: 14, fontSize: 15, outline: "none",
  },
  addBtn: {
    background: "var(--bg3)", color: "var(--accent)", border: "1px solid var(--accent)", padding: "14px 22px",
    borderRadius: 14, fontWeight: 800, fontSize: 15, cursor: "pointer",
  },
  empty: {
    textAlign: "center", color: "var(--text3)", padding: "60px 20px", fontSize: 15,
    background: "var(--bg3)", borderRadius: 16, lineHeight: 1.7,
  },
  tableScroll: { overflowX: "auto", borderRadius: 16, background: "var(--bg3)" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 720 },
  th: {
    padding: "14px 8px", fontSize: 11, color: "var(--text3)", textTransform: "uppercase",
    letterSpacing: 1, textAlign: "center", borderBottom: "1px solid var(--border)", fontWeight: 800,
  },
  td: { padding: "10px 8px", textAlign: "center", borderBottom: "1px solid var(--bg2)" },
  dot: { display: "inline-block", width: 10, height: 10, borderRadius: "50%", marginRight: 9, verticalAlign: "middle" },
  scoreInput: {
    width: 52, background: "var(--bg0)", border: "1px solid var(--border)", color: "var(--text1)",
    padding: "7px 4px", borderRadius: 8, fontSize: 14, textAlign: "center", outline: "none",
  },
  removeBtn: { background: "transparent", border: "none", color: "var(--text5)", cursor: "pointer", fontSize: 15, padding: "6px 8px", minWidth: 32, minHeight: 32 },
  previewBox: {
    marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 16,
    background: "var(--bg3)", borderRadius: 16, padding: 18,
  },
  previewTitle: { fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 14, fontWeight: 800 },
  previewItem: { display: "flex", alignItems: "center", gap: 8, padding: "11px 0", fontSize: 15, fontWeight: 700, borderBottom: "1px solid var(--border)" },
  previewRank: { width: 28, color: "var(--text3)", fontWeight: 800 },

  // Fasit
  fasitSection: { background: "var(--bg3)", borderRadius: 16, padding: 18, marginBottom: 14 },
  fasitSectionTitle: { fontSize: 16, fontWeight: 800, marginBottom: 14 },
  pts: { fontSize: 12, color: "var(--text3)", fontWeight: 600 },
  fasitGrid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(172px, 1fr))", gap: 10,
  },
  fasitGroupCard: { background: "var(--bg1)", borderRadius: 12, padding: 12 },
  fasitGroupName: { fontSize: 12, fontWeight: 800, color: "var(--text3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
  fasitSelect: {
    width: "100%", background: "var(--bg3)", border: "1px solid var(--border)", color: "var(--text1)",
    padding: "9px 10px", borderRadius: 9, fontSize: 13.5, outline: "none", marginBottom: 6,
  },
  fasitRow: { display: "flex", alignItems: "center", gap: 8 },
  fasitMatchLabel: { width: 86, fontSize: 12.5, fontWeight: 700, color: "var(--text3)", flexShrink: 0 },
  fasitInput: {
    flex: 1, background: "var(--bg0)", border: "1px solid var(--border)", color: "var(--text1)",
    padding: "9px 10px", borderRadius: 9, fontSize: 13.5, outline: "none", minWidth: 0,
  },

  presentWrap: {
    flex: 1, display: "flex", flexDirection: "column", padding: 16,
    maxWidth: 1280, margin: "0 auto", width: "100%", boxSizing: "border-box",
  },
  chartCard: {
    flex: 1, background: "var(--bg3)", borderRadius: 20, padding: 18,
    display: "flex", flexDirection: "column", justifyContent: "center",
  },
  presentNav: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, gap: 12 },
  phaseLabel: { fontSize: 17, color: "var(--text1)", fontWeight: 900, textAlign: "center", display: "flex", alignItems: "center", gap: 8 },
  previewLabel: {
    display: "inline-block", padding: "3px 7px", borderRadius: 6, color: "#D8B15A", background: "#D8B15A1A",
    fontSize: 9.5, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase",
  },
  publicCeremonyStatus: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 18,
    color: "var(--text3)", fontSize: 13, fontWeight: 700,
  },
  publicCeremonyDot: { width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", boxShadow: "0 0 0 4px color-mix(in srgb, var(--accent) 14%, transparent)" },
  navBtn: {
    background: "transparent", border: "1px solid var(--border)", color: "var(--text1)",
    padding: "12px 18px", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 700,
  },
  navBtnPrimary: { background: "var(--accent)", color: "var(--accent-fg)", border: "none", borderRadius: 50, padding: "14px 20px" },

  bonusHeader: {
    fontSize: 24, color: "var(--text1)", textAlign: "center", marginBottom: 22, fontWeight: 900,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap",
  },
  bonusPop: {
    background: "var(--accent)", color: "var(--accent-fg)", padding: "5px 16px", borderRadius: 50,
    fontSize: 15, fontWeight: 800,
  },
  bonusRow: {
    position: "absolute", left: 0, right: 0, display: "flex", alignItems: "center",
    gap: 12, padding: "0 16px", borderRadius: 12,
    transition: "top .8s cubic-bezier(.34,1.2,.64,1), background .4s",
    background: "var(--bg0)",
  },
  bonusRank: { width: 28, fontWeight: 800, color: "var(--text3)", fontSize: 15 },
  bonusName: { flex: 1, fontSize: 16, fontWeight: 700, color: "var(--text1)" },
  bonusStar: { color: "#F5A623", fontWeight: 800, fontSize: 14 },
  bonusScore: { fontSize: 20, fontWeight: 900, color: "var(--text1)", minWidth: 44, textAlign: "right" },

  winnerCard: {
    flex: 1, background: "var(--bg3)", borderRadius: 20, padding: 24,
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    position: "relative", overflow: "hidden",
  },
  podiumWrap: { display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 16, marginBottom: 28, minHeight: 270 },
  winnerTitle: { fontSize: 30, fontWeight: 900, color: "var(--text1)", textAlign: "center" },
  winnerSub: { fontSize: 14, color: "var(--text3)", marginTop: 6 },
  restList: { listStyle: "none", margin: "20px 0 0", padding: 0, width: "100%", maxWidth: 440 },
  restItem: { display: "flex", alignItems: "center", gap: 8, padding: "11px 0", fontSize: 15, borderBottom: "1px solid var(--border)" },
  restRank: { width: 28, color: "var(--text3)", fontWeight: 800 },

  confetti: { position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" },
  modalOverlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
  },
  modal: {
    background: "var(--bg3)", borderRadius: 20, padding: 28, width: "100%", maxWidth: 340,
    display: "flex", flexDirection: "column", gap: 4,
  },
  modalTitle: { fontSize: 18, fontWeight: 800, marginBottom: 12, color: "var(--text1)" },
};

const CSS = `
  :root {
    --bg0: #000000;
    --bg1: #111111;
    --bg2: #161618;
    --bg3: #1C1C1E;
    --bg4: #2C2C2E;
    --border: #2C2C2E;
    --text1: #FFFFFF;
    --text2: #E5E5EA;
    --text3: #8E8E93;
    --text4: #555555;
    --text5: #48484A;
    --btn-active-bg: #00DC64;
    --btn-active-color: #000000;
    --accent: #00DC64;
    --accent-fg: #000000;
  }
  [data-theme="light"] {
    --bg0: #FAF0EE;
    --bg1: #F5EDEB;
    --bg2: #EDE5E3;
    --bg3: #FFFFFF;
    --bg4: #F0E8E6;
    --border: #E4DCDA;
    --text1: #1C0C0A;
    --text2: #3C1C18;
    --text3: #8A8080;
    --text4: #C0B8B6;
    --text5: #B0A8A6;
    --btn-active-bg: #C8182A;
    --btn-active-color: #FFFFFF;
    --accent: #C8182A;
    --accent-fg: #FFFFFF;
  }
  .ceremony-lock {
    position: relative;
    isolation: isolate;
    flex: 1;
    min-height: calc(100svh - 85px);
    overflow: hidden;
    color: #F6F3EA;
    background:
      radial-gradient(ellipse 54% 78% at 70% 50%, rgba(189, 136, 43, 0.13), transparent 68%),
      radial-gradient(ellipse 42% 58% at 10% 92%, rgba(15, 92, 57, 0.12), transparent 72%),
      #050505;
  }
  .ceremony-grain {
    position: absolute;
    z-index: -1;
    inset: 0;
    opacity: 0.16;
    pointer-events: none;
    background-image: repeating-linear-gradient(112deg, transparent 0 2px, rgba(255,255,255,0.05) 2px 3px, transparent 3px 8px);
    mask-image: linear-gradient(to bottom, rgba(0,0,0,0.65), transparent 80%);
  }
  .ceremony-inner {
    position: relative;
    z-index: 2;
    width: 100%;
    max-width: 1280px;
    min-height: inherit;
    margin: 0 auto;
    padding: clamp(44px, 8vh, 100px) clamp(28px, 6vw, 76px);
    box-sizing: border-box;
    display: flex;
    align-items: center;
  }
  .ceremony-copy {
    width: min(430px, 42vw);
    animation: ceremony-copy-in 800ms cubic-bezier(.22, 1, .36, 1) both;
  }
  .ceremony-kicker {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #D8B15A;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.17em;
    text-transform: uppercase;
  }
  .ceremony-title {
    margin: 17px 0 16px;
    font-size: clamp(46px, 5.6vw, 82px);
    line-height: 0.91;
    letter-spacing: -0.065em;
    font-weight: 900;
  }
  .ceremony-title em {
    color: #D8B15A;
    font-family: Georgia, "Times New Roman", serif;
    font-weight: 400;
    letter-spacing: -0.075em;
  }
  .ceremony-description {
    max-width: 360px;
    margin: 0;
    color: #AAA69D;
    font-size: 15px;
    line-height: 1.65;
  }
  .ceremony-status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 29px;
    color: #D8B15A;
    font-size: 12px;
    font-weight: 750;
    letter-spacing: 0.035em;
  }
  .ceremony-status span {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #D8B15A;
    box-shadow: 0 0 0 4px rgba(216,177,90,0.12), 0 0 13px rgba(216,177,90,0.62);
  }
  .ceremony-prize-stage {
    position: absolute;
    z-index: 1;
    inset: 0 0 0 37%;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    animation: ceremony-prize-drift 9s ease-in-out infinite;
  }
  .ceremony-prize-aura {
    position: absolute;
    width: min(58vw, 810px);
    aspect-ratio: 1;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(218,172,86,0.30) 0%, rgba(154,105,28,0.11) 38%, transparent 69%);
    filter: blur(9px);
    animation: ceremony-aura-pulse 5.5s ease-in-out infinite;
  }
  .ceremony-prize-floor {
    position: absolute;
    bottom: max(4%, 28px);
    width: min(42vw, 530px);
    height: 42px;
    border-radius: 50%;
    background: radial-gradient(ellipse, rgba(205,158,76,0.26), rgba(83,52,13,0.07) 50%, transparent 72%);
    filter: blur(8px);
  }
  .ceremony-prize {
    position: relative;
    z-index: 1;
    width: auto;
    height: min(76svh, 750px);
    max-width: 56vw;
    object-fit: contain;
    opacity: 0.96;
    filter: brightness(0) contrast(1.18) drop-shadow(0 0 1px rgba(238, 200, 114, 0.88)) drop-shadow(0 22px 25px rgba(0,0,0,0.92));
  }
  @keyframes ceremony-copy-in {
    from { opacity: 0; transform: translateY(18px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes ceremony-prize-drift {
    0%, 100% { transform: translateY(0) rotate(-0.8deg); }
    50% { transform: translateY(-12px) rotate(0.8deg); }
  }
  @keyframes ceremony-aura-pulse {
    0%, 100% { opacity: 0.62; transform: scale(0.94); }
    50% { opacity: 1; transform: scale(1.05); }
  }
  .bonus-pop { animation: popIn .5s cubic-bezier(.34,1.56,.64,1); }
  @keyframes popIn { 0% { transform: scale(0); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
  .bonus-star { animation: starPop .6s cubic-bezier(.34,1.56,.64,1); }
  @keyframes starPop { 0% { transform: scale(0) rotate(-20deg); } 60% { transform: scale(1.3); } 100% { transform: scale(1); } }
  .podium-rise { animation: rise .7s cubic-bezier(.22,1,.36,1) both; }
  @keyframes rise { from { transform: translateY(60px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  .confetti-piece {
    position: absolute; top: -20px; width: 9px; height: 14px; border-radius: 2px;
    animation-name: fall; animation-timing-function: linear; animation-iteration-count: infinite;
  }
  @keyframes fall {
    0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
    100% { transform: translateY(640px) rotate(720deg); opacity: 0.3; }
  }
  .leaderboard-shell::before {
    content: "";
    position: absolute;
    z-index: 2;
    left: 0;
    right: 0;
    top: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent 0%, var(--accent) 28%, #D8B15A 50%, var(--accent) 72%, transparent 100%);
    opacity: 0.72;
    pointer-events: none;
  }
  .leaderboard-header {
    background: linear-gradient(180deg, color-mix(in srgb, var(--bg4) 54%, transparent), color-mix(in srgb, var(--bg3) 86%, transparent));
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
  }
  .leaderboard-row:hover {
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -1px 0 rgba(255,255,255,0.03);
  }
  .leaderboard-row-open {
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(255,255,255,0.04);
  }
  .leaderboard-row-champion {
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(216,177,90,0.08);
  }
  .leaderboard-row-medal {
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
  }
  .no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
  .no-scrollbar::-webkit-scrollbar { display: none; }
  .voyage-scene { animation: voyageSceneIn .46s cubic-bezier(.22,.9,.28,1) both; }
  .voyage-boat { animation: voyageBoatBob 1.5s ease-in-out infinite; }
  .voyage-oar { animation: voyageOar 1.1s ease-in-out infinite; transform-origin: center; }
  @keyframes voyageSceneIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes voyageBoatBob {
    0%, 100% { margin-top: 0; }
    50% { margin-top: -3px; }
  }
  @keyframes voyageOar {
    0%, 100% { transform: rotate(0deg); }
    50% { transform: rotate(5deg); }
  }
  .voyage-wave-line { animation-name: voyageDrift; animation-timing-function: ease-in-out; animation-iteration-count: infinite; animation-direction: alternate; will-change: transform; }
  @keyframes voyageDrift { from { transform: translateX(var(--wave-from)); } to { transform: translateX(var(--wave-to)); } }
  .voyage-bob { animation: voyageShipBob 3s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  @keyframes voyageShipBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-1.6px); } }
  .home-welcome { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 24px; }
  .supporter-rower { display: flex; align-items: center; gap: 10px; min-width: 212px; }
  .supporter-rower-button { appearance: none; border: 0; padding: 0; background: transparent; color: var(--accent); cursor: pointer; font: inherit; font-size: 11px; font-weight: 900; letter-spacing: .85px; text-align: center; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
  .supporter-rower-chant { display: inline-flex; align-items: baseline; }
  .supporter-rower-letter { display: inline-block; animation: supporterChant .82s ease-in-out infinite; animation-delay: var(--chant-delay); }
  .supporter-rower-button:hover { color: var(--text1); }
  .supporter-rower-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 5px; border-radius: 8px; }
  .supporter-rower-geometry { display: block; width: 152px; height: 95px; filter: drop-shadow(0 6px 9px rgba(0,0,0,.16)); }
  .supporter-rower-geometry-float { animation: supporterFloat 2.8s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  .supporter-rower-geometry-body { animation: geomBody .95s cubic-bezier(.36,.7,.3,1); transform-box: view-box; transform-origin: 231px 196px; }
  .supporter-rower-geometry-faroar { animation: geomFarOar .95s cubic-bezier(.36,.7,.3,1); transform-box: view-box; transform-origin: 307px 181px; }
  .supporter-rower-geometry-nearoar { animation: geomNearOar .95s cubic-bezier(.36,.7,.3,1); transform-box: view-box; transform-origin: 224px 181px; }
  .supporter-rower-button:hover .supporter-rower-geometry { transform: translateY(-2px); }
  @keyframes supporterFloat { 0%,100% { transform: translateY(0) rotate(-0.7deg); } 50% { transform: translateY(-7px) rotate(0.7deg); } }
  /* the rower dips forward toward the oars and back, with a bit of lean (rotation) layered on */
  @keyframes geomBody { 0% { transform: translateY(0) rotate(0deg); } 32% { transform: translateY(9px) rotate(-6deg); } 64% { transform: translateY(-4px) rotate(5deg); } 100% { transform: translateY(0) rotate(0deg); } }
  /* each oar levers on its oarlock so the blade sweeps; the two mirror each other */
  @keyframes geomFarOar { 0% { transform: rotate(0deg); } 30% { transform: rotate(-13deg); } 62% { transform: rotate(10deg); } 100% { transform: rotate(0deg); } }
  @keyframes geomNearOar { 0% { transform: rotate(0deg); } 30% { transform: rotate(13deg); } 62% { transform: rotate(-10deg); } 100% { transform: rotate(0deg); } }
  @keyframes supporterChant { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
  .supporter-rower-count { display: flex; flex-direction: column; align-items: flex-start; min-width: 76px; }
  .supporter-rower-count strong { color: var(--accent); font-size: 28px; line-height: 1; letter-spacing: -.8px; }
  .supporter-rower-count span { margin-top: 4px; color: var(--text2); font-size: 11px; font-weight: 800; line-height: 1.2; }
  .supporter-rower-count small { margin-top: 5px; color: #E0564F; font-size: 10px; font-weight: 700; line-height: 1.25; }
  .site-foot { display: flex; justify-content: center; padding: 26px 16px 34px; margin-top: 22px; border-top: 1px solid var(--border); }
  .viking-horn { display: flex; }
  .viking-horn-button { display: flex; flex-direction: column; align-items: center; gap: 4px; appearance: none; border: 0; padding: 0; background: transparent; cursor: pointer; opacity: .82; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; touch-action: manipulation; transition: opacity .15s; }
  .viking-horn-button:hover { opacity: 1; }
  .viking-horn-svg { display: block; width: 76px; height: 48px; overflow: visible; filter: drop-shadow(0 3px 6px rgba(0,0,0,.22)); transform: rotate(70deg) scaleY(-1); transition: transform .15s; }
  .viking-horn-button:hover .viking-horn-svg { transform: translateY(-2px) rotate(70deg) scaleY(-1); }
  .viking-horn-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 5px; border-radius: 8px; }
  .viking-horn-body { transform-box: fill-box; transform-origin: 80% 80%; }
  .viking-horn-svg.is-blowing .viking-horn-body { animation: hornBlow .62s cubic-bezier(.36,.7,.3,1); }
  .viking-horn-waves { transform-box: fill-box; transform-origin: 100% 50%; animation: hornWaves .7s ease-out forwards; }
  .viking-horn-label { font-size: 9.5px; font-weight: 800; letter-spacing: .8px; text-transform: uppercase; color: var(--text4); }
  .viking-horn-button:hover .viking-horn-label { color: var(--accent); }
  @keyframes hornBlow { 0% { transform: rotate(0); } 18% { transform: rotate(-9deg); } 45% { transform: rotate(4deg); } 70% { transform: rotate(-2deg); } 100% { transform: rotate(0); } }
  @keyframes hornWaves { 0% { opacity: 0; transform: translateX(5px) scale(.55); } 22% { opacity: .9; } 100% { opacity: 0; transform: translateX(-7px) scale(1.18); } }
  input[type=number]::-webkit-inner-spin-button { opacity: .4; }
  select option { background: #1C1C1E; }
  @media (max-width: 700px) {
    .ceremony-lock { min-height: calc(100svh - 128px); }
    .ceremony-inner {
      align-items: flex-end;
      padding: 34px 25px 42px;
    }
    .ceremony-copy {
      width: 100%;
      max-width: 390px;
      margin: 0 auto;
      text-align: center;
    }
    .ceremony-kicker, .ceremony-status { justify-content: center; }
    .ceremony-title { margin-top: 14px; font-size: clamp(45px, 14vw, 66px); }
    .ceremony-description { margin: 0 auto; font-size: 14px; }
    .ceremony-status { margin-top: 21px; }
    .ceremony-prize-stage { inset: 2% 3% 34%; }
    .ceremony-prize-aura { width: min(110vw, 620px); }
    .ceremony-prize { height: min(55svh, 510px); max-width: 82vw; }
    .ceremony-prize-floor { width: 72vw; bottom: 2%; }
    .home-welcome { grid-template-columns: 1fr; gap: 16px; }
    .supporter-rower { justify-content: flex-start; }
  }
  @media (prefers-reduced-motion: reduce) {
    .voyage-scene, .voyage-boat, .voyage-oar, .voyage-wave-line, .voyage-bob, .supporter-rower-geometry-float, .supporter-rower-geometry-body, .supporter-rower-geometry-faroar, .supporter-rower-geometry-nearoar, .supporter-rower-letter, .viking-horn-body, .viking-horn-waves { animation: none !important; }
    .voyage-boat, .voyage-rail-progress { transition: none !important; }
    .bonus-pop, .bonus-star, .podium-rise, .confetti-piece, .ceremony-copy, .ceremony-prize-stage, .ceremony-prize-aura { animation: none !important; }
  }
`;
