import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  GROUPS,
  GROUP_KEYS,
  CELLS,
  DEFAULT_QUIZ_RESULTS,
  POINTS,
  buildLiveFasitFromFeeds,
  canonicalTeam,
  classifyRound,
  computeScores,
  emptyFasit,
  liveResultsSignature,
  mergeLiveResults,
  quizAnswerMatches,
  recalculateParticipantScores,
  teamMatch,
  toNorwegian,
} from "../shared/competition.js";
import { Flag, codeOf } from "./components/Flag.jsx";
import { CrownIcon } from "./components/CrownIcon.jsx";
import {
  formatCountdown,
  pickNextNorwayGame,
  pickUpcomingGames,
  useLiveGames,
} from "./features/live-games.js";
import { useIsMobile } from "./hooks/useMediaQuery.js";
import { useAdminSession } from "./hooks/useAdminSession.js";
import { useCompetitionData } from "./hooks/useCompetitionData.js";
import vmTrophyMark from "./assets/vm-trophy-mark-26-header.webp";
import norseKnitBand from "./assets/norse-knit-band.webp";
import norseKnitBandLight from "./assets/norse-knit-band-light.webp";

const NorgesVeiTilVM = React.lazy(() => import("./features/voyage/NorgesVeiTilVM.jsx"));
const Ceremony = React.lazy(() => import("./features/ceremony/Ceremony.jsx"));

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

const ALL_TEAMS = GROUP_KEYS.flatMap((g) => GROUPS[g]);

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
  "Laget med færrest poeng (dårligst målforskjell avgjør ved likhet)?",
  "Antall straffekonkurranser?",
  "Finaledommerens land?",
  "Blir Ronaldo toppscorer for Portugal? (Ja/Nei)",
];

function quizResultItems(picks, fasit) {
  return QUIZ_QUESTIONS.map((question, index) => {
    const pick = picks?.quiz?.[index] || "";
    const actual = fasit?.quiz?.[index] || "";
    if (!pick && !actual) return null;

    let status = "pending";
    if (actual) status = quizAnswerMatches(actual, pick, index) ? "hit" : "miss";

    return {
      index,
      label: `${index + 1}. ${question}`,
      pick,
      actual,
      status,
      points: status === "hit" ? POINTS.quiz : 0,
      max: POINTS.quiz,
      team: false,
    };
  }).filter(Boolean);
}

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

const LEGACY_ADMIN_STORAGE_KEY = "vm2026_ranking_data_v2";
const LAST_PUBLIC_MODE_KEY = "vm2026_last_public_mode";
const SUPPORTER_ROW_ENDPOINT = "/.netlify/functions/supporter-row";
const SUPPORTER_ROW_DEV_KEY = "vm2026_supporter_rows_dev";
const SUPPORTER_COUNT_CACHE_KEY = "vm2026_supporter_count_cache";
const CEREMONY_DISMISSED_PREFIX = "vm2026_ceremony_dismissed_";

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
const DEFAULT_SETTINGS = { ceremonyUnlocked: false, ceremonyReleaseId: null, ceremony: DEFAULT_CEREMONY };

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

function ceremonyDismissedKey(releaseId) {
  return `${CEREMONY_DISMISSED_PREFIX}${releaseId || "legacy"}`;
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
    quiz: [...DEFAULT_QUIZ_RESULTS],
  };

  return { participants, fasit };
})() : null;


async function supporterRows(method = "GET", delta = 1) {
  if (import.meta.env.DEV) {
    const stored = Number(localStorage.getItem(SUPPORTER_ROW_DEV_KEY));
    const count = Number.isFinite(stored) && stored >= 0 ? stored : 0;
    const next = method === "POST" ? count + delta : count;
    if (method === "POST") localStorage.setItem(SUPPORTER_ROW_DEV_KEY, String(next));
    return next;
  }

  const res = await fetch(SUPPORTER_ROW_ENDPOINT, method === "POST"
    ? { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ delta }) }
    : { method });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !Number.isFinite(body.count)) throw new Error(body.error || "Kunne ikke hente åretak");
  return body.count;
}


const editableSnapshot = (participants, fasit, settings) => ({ participants, fasit, settings });
const snapshotSignature = (snapshot) => JSON.stringify(snapshot);

// ── Hjelpere ──
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
  const fasitFinale = getFasitFinale ? getFasitFinale() : null;
  const fasitBronse = getFasitBronse ? getFasitBronse() : null;
  const finaleResult = specialPoint("finale", finale, POINTS.finale, fasitFinale);
  const bronseResult = specialPoint("bronse", bronse, POINTS.bronse, fasitBronse);
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
            {Row(finA, false)}
            {Row(finB, true)}
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
  const vFasitFinale = getFasitFinale ? getFasitFinale() : null;
  const vFasitBronse = getFasitBronse ? getFasitBronse() : null;
  const finaleResult = specialPoint("finale", finale, POINTS.finale, vFasitFinale);
  const bronseResult = specialPoint("bronse", bronse, POINTS.bronse, vFasitBronse);

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
              {VRow(finA, false)}
              {VRow(finB, true)}
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

  // VM-quiz: spm. 4 har ±5-toleranse. Ventende spørsmål skal ikke telle
  // før fasiten er fylt inn.
  push("quiz", "VM-quiz", quizResultItems(picks, fasit).filter((item) => item.actual));

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
  const adminSession = useAdminSession();
  const competitionData = useCompetitionData();
  const [participants, setParticipants] = useState([]);
  const [fasit, setFasit] = useState(emptyFasit());
  const [movementSnapshot, setMovementSnapshot] = useState(null);
  const [settings, setSettings] = useState(() => normalizeSettings());
  const [adminPreviewCeremony, setAdminPreviewCeremony] = useState(() => normalizeCeremony());
  const [viewerCeremony, setViewerCeremony] = useState(() => normalizeCeremony());
  const [showCeremonyModal, setShowCeremonyModal] = useState(false);
  const [showViewerCeremonyIntro, setShowViewerCeremonyIntro] = useState(true);
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
  const [, setLogoClicks] = useState(0);
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
      const result = await competitionData.save(pending.snapshot, revisionRef.current);
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
  }, [competitionData]);
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
    try { localStorage.setItem(LAST_PUBLIC_MODE_KEY, mode); } catch { /* Privat nettlesermodus kan blokkere lagring. */ }
  }, [mode]);

  useEffect(() => {
    let active = true;
    try { localStorage.removeItem(LEGACY_ADMIN_STORAGE_KEY); } catch { /* Ingen lokal adminstate skal gjenopprettes. */ }

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

    const cached = competitionData.readPublicCache();
    if (cached?.participants) setParticipants(cached.participants);
    if (cached?.fasit) setFasit({ ...emptyFasit(), ...cached.fasit });
    if (cached?.settings) setSettings(normalizeSettings(cached.settings));
    if (cached?.participants) setLoaded(true);

    const hydrate = async () => {
      try {
        const session = await adminSession.read();
        if (!active) return;
        setSessionState(session.authenticated ? "admin-loading" : "public");
        const envelope = await competitionData.load({ allowPublicCache: !session.authenticated });
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
  }, [adminSession, applyDataEnvelope, competitionData]);

  useEffect(() => {
    if (!loaded || !isAdmin || !hydratedAdminRef.current || DEMO_DATA || conflictSnapshotRef.current) return;
    const snapshot = { participants, fasit, settings };
    const signature = snapshotSignature(snapshot);
    if (signature === lastSavedSnapshotRef.current) return;
    pendingSaveRef.current = { snapshot, signature };
    window.clearTimeout(saveTimerRef.current);
    if (mode !== "fasit") saveTimerRef.current = window.setTimeout(() => flushSaveRef.current?.(), 750);
    return () => window.clearTimeout(saveTimerRef.current);
  }, [participants, fasit, settings, loaded, isAdmin, mode]);

  useEffect(() => {
    const warnIfDirty = (event) => {
      if (!pendingSaveRef.current && !saveInFlightRef.current && !conflictSnapshotRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnIfDirty);
    return () => window.removeEventListener("beforeunload", warnIfDirty);
  }, []);

  // Public viewers pick up admin publication changes without needing to reload.
  useEffect(() => {
    if (!loaded || sessionState !== "public" || DEMO_DATA) return;
    let active = true;
    const refresh = async () => {
      try {
        const envelope = await competitionData.load({ allowPublicCache: true });
        if (active) applyDataEnvelope(envelope, "Siste skyoppdatering");
      } catch { /* Behold sist kjente offentlige snapshot ved midlertidig nettverksfeil. */ }
    };
    const interval = window.setInterval(refresh, 30000);
    return () => { active = false; window.clearInterval(interval); };
  }, [loaded, sessionState, applyDataEnvelope, competitionData]);

  // Once admin publishes a ceremony, each public device gets its own local
  // walkthrough. Dismissing it is remembered only for that specific release.
  useEffect(() => {
    if (!loaded || isAdmin || !settings.ceremonyUnlocked) {
      if (!settings.ceremonyUnlocked) setShowCeremonyModal(false);
      return;
    }
    let dismissed = false;
    try { dismissed = localStorage.getItem(ceremonyDismissedKey(settings.ceremonyReleaseId)) === "1"; } catch { /* Popupen fungerer også uten localStorage. */ }
    if (dismissed) return;
    setViewerCeremony(normalizeCeremony());
    setShowViewerCeremonyIntro(true);
    setShowCeremonyModal(true);
  }, [loaded, isAdmin, settings.ceremonyUnlocked, settings.ceremonyReleaseId]);

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
      await adminSession.create(passwordInput);
      setSessionState("admin-loading");
      const envelope = await competitionData.load();
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
      await adminSession.destroy().catch(() => undefined);
      hydratedAdminRef.current = false;
      setIsAdmin(false);
      setSessionState("public");
      setPasswordError(error.message || "Innlogging feilet");
    }
  };

  const handleLogout = async () => {
    await adminSession.destroy().catch(() => undefined);
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
      const envelope = await competitionData.load({ allowPublicCache: true });
      applyDataEnvelope(envelope, "Offentlig visning");
    } catch { /* Logout er fullført selv om offentlig oppfriskning feiler. */ }
  };

  const retrySave = () => {
    saveRetryRef.current = 0;
    window.clearTimeout(saveTimerRef.current);
    flushSaveRef.current?.();
  };

  const saveCurrentChanges = () => {
    const nextParticipants = recalculateParticipantScores(participants, fasit);
    recordScoreboardMovement(participants, nextParticipants, "Oppdatert resultat");
    setParticipants(nextParticipants);
    const snapshot = editableSnapshot(nextParticipants, fasit, settings);
    const signature = snapshotSignature(snapshot);
    if (signature === lastSavedSnapshotRef.current) return;
    pendingSaveRef.current = { snapshot, signature };
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
    const envelope = await competitionData.load();
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
      const ceremony = normalizeCeremony();
      setAdminPreviewCeremony(ceremony);
      setSettings((current) => ({ ...normalizeSettings(current), ceremonyUnlocked: false, ceremony }));
      return;
    }
    const ceremony = normalizeCeremony();
    setAdminPreviewCeremony(ceremony);
    setSettings((current) => ({
      ...normalizeSettings(current),
      ceremonyUnlocked: true,
      ceremonyReleaseId: `${Date.now()}`,
      ceremony,
    }));
  };

  const dismissPublicCeremony = () => {
    try { localStorage.setItem(ceremonyDismissedKey(settings.ceremonyReleaseId), "1"); } catch { /* Lukkeknappen fungerer også uten localStorage. */ }
    setShowCeremonyModal(false);
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
  const bonusPublished = settings.ceremonyUnlocked;
  const publicSelfGuided = !isAdmin && settings.ceremonyUnlocked;
  const activeCeremony = publicSelfGuided
    ? viewerCeremony
    : settings.ceremonyUnlocked ? settings.ceremony : adminPreviewCeremony;
  const updateActiveCeremony = publicSelfGuided ? setViewerCeremony : setCeremony;
  const hasUnsavedChanges = isAdmin && hydratedAdminRef.current
    && snapshotSignature(editableSnapshot(participants, fasit, settings)) !== lastSavedSnapshotRef.current;

  return (
    <div style={S.app} data-theme={theme}>
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

      {showCeremonyModal && !isAdmin && settings.ceremonyUnlocked && (
        <div role="dialog" aria-modal="true" aria-label="VM-kåring" style={S.ceremonyModalOverlay}>
          <div style={S.ceremonyModal}>
            <button type="button" aria-label="Lukk kåringen" onClick={dismissPublicCeremony} style={S.ceremonyModalClose}>×</button>
            <React.Suspense fallback={<div style={S.adminWrap}>Laster kåringen …</div>}>
              <Ceremony
                unlocked
                participants={participants}
                ceremony={viewerCeremony}
                setCeremony={setViewerCeremony}
                isAdmin={false}
                isLive
                selfGuided
                showIntro={showViewerCeremonyIntro}
                onStart={() => setShowViewerCeremonyIntro(false)}
                onExit={dismissPublicCeremony} />
            </React.Suspense>
          </div>
        </div>
      )}

      <header style={S.header}>
        <div style={{
          ...S.headerInner,
          ...(!isCompactHeader ? { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)" } : {}),
        }}>
          <button type="button" aria-label="VM 2026" onClick={handleLogoClock} style={{ ...S.logo, cursor: "default", userSelect: "none", border: 0, padding: 0, background: "transparent", textAlign: "left", ...(!isCompactHeader ? { justifySelf: "start" } : {}) }}>
            <img src={vmTrophyMark} alt="" decoding="async" style={S.logoMark} />
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
          </button>
          <div className="no-scrollbar" style={{
            ...S.modeToggle,
            marginLeft: isCompactHeader && !isMobile ? "auto" : 0,
            ...(!isCompactHeader ? { justifySelf: "center" } : {}),
            ...(isMobile ? { order: 3, flexBasis: "100%", maxWidth: "100%", overflowX: "auto", justifyContent: "flex-start" } : {}),
          }}>
            {tabs.map(([m, label]) => (
              <button key={m} type="button" aria-current={mode === m ? "page" : undefined} onClick={() => setMode(m)}
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
                {settings.ceremonyUnlocked ? "Trekk tilbake kåring" : "Gjør kåring tilgjengelig"}
              </button>
            )}
            <button type="button" aria-pressed={theme === "light"} onClick={() => {
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
              <button type="button" aria-pressed={isAdmin} onClick={() => {
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
              <button type="button" title="Lås siden" onClick={handleLogout}
                style={{ ...S.removeBtn, fontSize: 12, fontWeight: 700, padding: "6px 10px", color: "var(--text3)", border: "1px solid var(--border)", borderRadius: 20 }}>Lås</button>
            )}
          </div>
        </div>
      </header>

      {mode === "hjem" && <Hjem participants={participants} showBonus={bonusPublished} theme={theme} />}
      {mode === "stilling" && <Stilling participants={participants} fasit={fasit} showBonus={bonusPublished} movementSnapshot={movementSnapshot} />}
      {mode === "fasit-view" && <FasitView fasit={fasit} showBonus={bonusPublished} theme={theme} />}
      {mode === "vei-vm" && (
        <React.Suspense fallback={<div style={S.adminWrap}>Laster VM-reisen …</div>}>
          <NorgesVeiTilVM />
        </React.Suspense>
      )}
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
      {mode === "fasit" && (
        <Fasit
          fasit={fasit}
          setFasit={setFasit}
          applyLiveResults={applyLiveResults}
          hasUnsavedChanges={hasUnsavedChanges}
          saveStatus={saveStatus}
          onSave={saveCurrentChanges}
        />
      )}
      {mode === "present" && (
        <React.Suspense fallback={<div style={S.adminWrap}>Laster kåringen …</div>}>
          <Ceremony
            unlocked={isAdmin || settings.ceremonyUnlocked}
            participants={participants}
            ceremony={activeCeremony}
            setCeremony={updateActiveCeremony}
            isAdmin={isAdmin}
            isLive={settings.ceremonyUnlocked}
            selfGuided={publicSelfGuided}
            standalone
            onExit={() => setMode("stilling")} />
        </React.Suspense>
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
    const selectedFiles = Array.from(e.target.files || []);
    const files = selectedFiles.slice(0, 20);
    if (!files.length) return;
    const truncated = selectedFiles.length > files.length;
    setImportMsg(truncated
      ? "Maks 20 filer kan importeres om gangen. Åpner de første 20 …"
      : "Åpner Excel-leser …");
    let readExcelFile;
    let parseWorkbook;
    try {
      // Keep the heavy spreadsheet parser out of the public first-load bundle.
      // Vite caches this chunk after the first admin import in a session.
      const [excelModule, adapterModule] = await Promise.all([
        import("read-excel-file/browser"),
        import("./features/import/parse-workbook.js"),
      ]);
      readExcelFile = excelModule.default;
      parseWorkbook = adapterModule.parseWorkbook;
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
        if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Kun .xlsx støttes");
        if (file.size > 5 * 1024 * 1024) throw new Error("Filen er større enn 5 MB");
        const sheets = await readExcelFile(file);
        const { name, picks } = parseWorkbook(sheets, file.name);
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
    const truncatedText = truncated ? " Kun de første 20 valgte filene ble behandlet." : "";
    setImportMsg(`Importert: ${added} nye, ${updated} oppdatert.${failedText}${truncatedText}`);
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
            <input ref={fileRef} type="file" accept=".xlsx" multiple
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
                              {(p.picks.quiz?.some(Boolean) || fasit.quiz?.some(Boolean)) && (
                                <div style={{ padding: "14px 16px" }}>
                                  <QuizParticipantResults picks={p.picks} fasit={fasit} showHeader />
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

function QuizParticipantResults({ picks, fasit, items: providedItems, showHeader = false }) {
  const items = providedItems || quizResultItems(picks, fasit);
  if (!items.length) return null;

  const decided = items.filter((item) => item.status !== "pending");
  const hits = decided.filter((item) => item.status === "hit").length;
  const points = decided.reduce((sum, item) => sum + item.points, 0);

  return (
    <div>
      {showHeader && (
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 9 }}>
          <span style={{ color: "var(--text3)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2 }}>VM-quiz</span>
          <span style={{ color: "var(--text3)", fontSize: 11.5, whiteSpace: "nowrap" }}>
            {decided.length ? <><b style={{ color: "var(--text1)" }}>{hits}/{decided.length}</b> rett · <b style={{ color: "var(--accent)" }}>{points} p</b></> : "Venter på fasit"}
          </span>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 6 }}>
        {items.map((item) => (
          <div key={item.index} style={{ padding: "8px 10px", background: "var(--bg4)", borderRadius: 8, borderLeft: `3px solid ${STATUS_COLOR[item.status]}` }}>
            <div style={{ color: "var(--text3)", fontSize: 11.5, lineHeight: 1.35, marginBottom: 6 }}>{item.label}</div>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "5px 10px", fontSize: 11.5 }}>
              <span style={{ color: "var(--text4)" }}>Tips: <b style={{ color: "var(--text1)" }}>{item.pick || "—"}</b></span>
              <span style={{ color: "var(--text4)" }}>Fasit: <b style={{ color: "var(--text2)" }}>{item.actual || "Venter"}</b></span>
              <span style={{ marginLeft: "auto", color: STATUS_COLOR[item.status], fontWeight: 800, whiteSpace: "nowrap" }}>
                {item.status === "hit" ? `Rett · +${item.points} p` : item.status === "miss" ? "Bom" : "Ikke avgjort"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuizAnswerKey({ fasit }) {
  const items = quizResultItems(null, fasit).filter((item) => item.actual);
  if (!items.length) return null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 7 }}>
      {items.map((item) => (
        <div key={item.index} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 9 }}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, flexShrink: 0, borderRadius: 7, background: "color-mix(in srgb, var(--accent) 12%, var(--bg4))", color: "var(--accent)", fontSize: 11, fontWeight: 900 }}>
            {item.index + 1}
          </span>
          <span style={{ flex: 1, minWidth: 0, color: "var(--text3)", fontSize: 12.5, lineHeight: 1.4 }}>{QUIZ_QUESTIONS[item.index]}</span>
          <span style={{ color: "var(--accent)", fontSize: 13, fontWeight: 800, textAlign: "right", flexShrink: 0 }}>{item.actual}</span>
        </div>
      ))}
    </div>
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
                return decided > 0
                  ? <><b style={{ color: "var(--text1)" }}>{sec.hits}/{decided}</b>{sec.bonuses > 0 ? <> · <b style={{ color: STATUS_COLOR.bonus }}>{sec.bonuses}</b> nesten</> : null} · <b style={{ color: "var(--accent)" }}>{sec.earned} p</b></>
                  : <b>Venter</b>;
              })()}{sec.items.filter((it) => it.status === "pending").length > 0 ? ` · ${sec.items.filter((it) => it.status === "pending").length} venter` : null}
            </span>
          </div>
          {sec.key === "quiz" ? (
            <QuizParticipantResults picks={picks} fasit={fasit} items={sec.items} />
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
      <button type="button" className={rowClass} onClick={onToggle} aria-expanded={open} style={{
        position: "relative", display: "grid", gridTemplateColumns: leaderboardGridColumns(isMobile, roundColumnWidth), columnGap: isMobile ? 10 : "clamp(6px, 1.3vw, 12px)",
        alignItems: "center", padding: isMobile ? "15px 14px 15px 17px" : "16px clamp(12px, 2.4vw, 20px)", cursor: "pointer",
        width: "100%", border: 0, color: "inherit", font: "inherit", textAlign: "left",
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
      </button>
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


// Shows an instant bundled fixture, then replaces it with data from the live
// provider. This avoids an empty homepage on a new computer or a cold cache.
function NorwayNextGame({ theme }) {
  const liveGames = useLiveGames();
  const game = pickNextNorwayGame(liveGames);

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

// A bundled schedule fills the first paint while the live call is in flight.
function UpcomingGames() {
  const liveGames = useLiveGames();
  const games = pickUpcomingGames(liveGames, 6);
  const [start, setStart] = useState(0);

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


function RowingSupporter() {
  const [count, setCount] = useState(readCachedSupporterCount);   // seeded from cache so refresh/tab-switch never dips
  const [error, setError] = useState("");
  const [stroke, setStroke] = useState(0);     // drives the rowing animation + chant
  const pendingStrokesRef = useRef(0);
  const batchTimerRef = useRef(null);
  const batchInFlightRef = useRef(false);
  const flushBatchRef = useRef(null);

  // Strokes never un-happen, so the total only ever climbs. Lift towards any count
  // the server reports, but never let an eventually-consistent (briefly stale) read
  // pull the number back below what the supporter already sees.
  const liftTo = (next) => setCount((prev) => Math.max(prev ?? 0, next));

  // Remember the latest total across reloads and tab switches.
  useEffect(() => {
    if (count === null) return;
    try { localStorage.setItem(SUPPORTER_COUNT_CACHE_KEY, String(count)); } catch { /* Telleren fungerer også uten lokal cache. */ }
  }, [count]);

  useEffect(() => {
    let active = true;
    supporterRows()
      .then((total) => { if (active) liftTo(total); })
      .catch(() => { if (active) setError("Kunne ikke hente årets total."); });
    return () => { active = false; };
  }, []);

  const flushBatch = useCallback(async () => {
    if (batchInFlightRef.current || pendingStrokesRef.current < 1) return;
    const delta = Math.min(10, pendingStrokesRef.current);
    pendingStrokesRef.current -= delta;
    batchInFlightRef.current = true;
    try {
      liftTo(await supporterRows("POST", delta));
    } catch {
      setCount((prev) => Math.max(0, (prev ?? delta) - delta));
      setError(delta === 1 ? "Åretaket ble ikke telt. Prøv igjen." : `${delta} åretak ble ikke telt. Prøv igjen.`);
    } finally {
      batchInFlightRef.current = false;
      if (pendingStrokesRef.current > 0) batchTimerRef.current = window.setTimeout(() => flushBatchRef.current?.(), 0);
    }
  }, []);
  flushBatchRef.current = flushBatch;

  useEffect(() => () => window.clearTimeout(batchTimerRef.current), []);

  const row = () => {
    setCount((prev) => (prev ?? 0) + 1);
    setStroke((value) => value + 1);
    setError("");
    pendingStrokesRef.current += 1;
    window.clearTimeout(batchTimerRef.current);
    batchTimerRef.current = window.setTimeout(() => flushBatchRef.current?.(), 500);
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
          <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <PatternSectionLabel theme={theme}>VM-quiz fasit</PatternSectionLabel>
            <span style={{ color: "var(--text3)", fontSize: 12.5, fontWeight: 600 }}>1 poeng per rett svar · spørsmål 4 godtar ±5 mål.</span>
          </div>
          <QuizAnswerKey fasit={fasit} />
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
function Fasit({ fasit, setFasit, applyLiveResults, hasUnsavedChanges, saveStatus, onSave }) {
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
          Serveren sjekker i bakgrunnen og lagrer først når en ny ferdigspilt kamp dukker opp. Forhåndsutfylt quizfasit kan justeres under.
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

      {hasUnsavedChanges && (
        <div style={S.fasitSaveBar}>
          <span role="status">{saveStatus.state === "error" ? saveStatus.message : "Du har ulagrede endringer."}</span>
          <button
            type="button"
            onClick={onSave}
            disabled={["saving", "conflict"].includes(saveStatus.state)}
            style={S.fasitSaveBtn}>
            {saveStatus.state === "saving" ? "Lagrer …" : "Lagre endringer"}
          </button>
        </div>
      )}

      <div style={{ ...S.importDesc, textAlign: "center", padding: "8px 0 24px" }}>
        Poengene beregnes automatisk når du lagrer resultatendringer.
      </div>
    </div>
  );
}

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
  fasitSaveBar: {
    position: "sticky", bottom: 12, zIndex: 12, margin: "18px auto", width: "min(100%, 620px)",
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
    padding: "12px 14px 12px 18px", borderRadius: 14, background: "var(--bg3)",
    border: "1px solid var(--accent)", boxShadow: "0 14px 36px rgba(0,0,0,.28)",
    color: "var(--text1)", fontSize: 13, fontWeight: 700,
  },
  fasitSaveBtn: {
    border: 0, borderRadius: 50, padding: "11px 17px", background: "var(--accent)",
    color: "var(--accent-fg)", fontSize: 13, fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap",
  },
  ceremonyModalOverlay: {
    position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
    padding: "clamp(8px, 2vw, 24px)", background: "rgba(0, 0, 0, 0.82)", backdropFilter: "blur(8px)", boxSizing: "border-box",
  },
  ceremonyModal: {
    position: "relative", width: "min(1180px, 100%)", height: "min(820px, calc(100dvh - 16px))",
    display: "flex", overflow: "auto", background: "var(--bg0)", border: "1px solid var(--border)", borderRadius: 20,
    boxShadow: "0 28px 90px rgba(0, 0, 0, 0.65)",
  },
  ceremonyModalClose: {
    position: "absolute", top: 10, right: 10, zIndex: 3, display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 38, height: 38, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--bg4)", color: "var(--text1)",
    fontSize: 25, lineHeight: 1, cursor: "pointer", boxShadow: "0 8px 24px rgba(0, 0, 0, 0.28)",
  },

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
