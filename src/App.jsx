import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import * as XLSX from "xlsx";
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

const GROUPS = {
  A: ["Mexico", "Sør Afrika", "Sør Korea", "Tsjekkia"],
  B: ["Canada", "Bosnia og Herzegovina", "Qatar", "Sveits"],
  C: ["Brasil", "Marokko", "Haiti", "Skottland"],
  D: ["USA", "Paraguay", "Australia", "Tyrkia"],
  E: ["Tyskland", "Curacao", "Elfenbenskysten", "Ecuador"],
  F: ["Nederland", "Japan", "Sverige", "Tunisia"],
  G: ["Belgia", "Egypt", "Iran", "New Zealand"],
  H: ["Spania", "Kapp Verde", "Saudi Arabia", "Uruguay"],
  I: ["Frankrike", "Senegal", "Irak", "Norge"],
  J: ["Argentina", "Algerie", "Østerrike", "Jordan"],
  K: ["Portugal", "Kongo", "Uzbekistan", "Colombia"],
  L: ["England", "Kroatia", "Ghana", "Panama"],
};
const GROUP_KEYS = Object.keys(GROUPS);
const ALL_TEAMS = GROUP_KEYS.flatMap((g) => GROUPS[g]);

// ── Cellekart for Excel-malen ──
const CELLS = {
  groups: {
    A: { first: "B4", second: "B6" }, B: { first: "B9", second: "B11" },
    C: { first: "B14", second: "B16" }, D: { first: "B19", second: "B21" },
    E: { first: "B24", second: "B26" }, F: { first: "B29", second: "B31" },
    G: { first: "B34", second: "B36" }, H: { first: "B39", second: "B41" },
    I: { first: "B44", second: "B46" }, J: { first: "B49", second: "B51" },
    K: { first: "B54", second: "B56" }, L: { first: "B59", second: "B61" },
  },
  thirds: ["B64", "B66", "B68", "B70", "B72", "B74", "B76", "B78"],
  thirdLabels: ["ABCDF", "CDFGH", "CEFHI", "EHIJK", "BEFIJ", "AEHIJ", "EFGIJ", "DEIJL"],
  r16: { 73: "E5", 74: "E10", 75: "E15", 76: "E20", 77: "E25", 78: "E30", 79: "E35", 80: "E40", 81: "E45", 82: "E50", 83: "E55", 84: "E60", 85: "E65", 86: "E70", 87: "E75", 88: "E80" },
  r8: { 89: "H25", 90: "H30", 91: "H35", 92: "H40", 93: "H45", 94: "H50", 95: "H55", 96: "H60" },
  kvart: { 97: "K28", 98: "K33", 99: "K38", 100: "K43" },
  semi: { 101: { win: "N32", lose: "N33" }, 102: { win: "N37", lose: "N38" } },
  bronse: "R35",
  finale: "U35",
  quiz: ["J83", "J84", "J85", "J86", "J87", "J88", "J89", "J90", "J91", "J92"],
};

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
const POINTS = {
  group: 2, third: 2, r16: 3, r8: 3, kvart: 4, semi: 5, bronse: 5, finale: 10, quiz: 1,
  koBonus: 1, koBonusSemi: 2, // rett lag i runden, men feil bracket-plass
};

// FotMob-inspirert: mettede farger som popper mot helsvart bakgrunn
const PALETTE = [
  "#00DC64", "#3D7EF5", "#E8334A", "#F5A623", "#A855F7",
  "#06B6D4", "#F97316", "#84CC16", "#EC4899", "#14B8A6",
  "#8B5CF6", "#EAB308", "#3B82F6", "#10B981", "#F43F5E",
  "#6366F1", "#0EA5E9", "#D946EF", "#F59E0B", "#22C55E",
];

const STORAGE_KEY = "vm2026_ranking_data_v2";
const DEFAULT_CEREMONY = { phase: "rounds", step: 0, bonusRevealed: 0 };
const DEFAULT_SETTINGS = { ceremonyUnlocked: false, ceremony: DEFAULT_CEREMONY };

function normalizeCeremony(value) {
  const phase = ["rounds", "bonus", "winner"].includes(value?.phase) ? value.phase : DEFAULT_CEREMONY.phase;
  return {
    phase,
    step: Math.max(0, Math.min(ROUNDS.length - 1, Number(value?.step) || 0)),
    bonusRevealed: Math.max(0, Number(value?.bonusRevealed) || 0),
    bonusOrder: Array.isArray(value?.bonusOrder) ? value.bonusOrder.filter((id) => typeof id === "string") : undefined,
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
    matches: { ...Object.fromEntries(Object.keys(CELLS.r16).map((id, i) => [id, ["Brasil","USA","Frankrike","Nederland","Portugal","Spania","England","Argentina","Mexico","Canada","Tyskland","Belgia","Norge","Østerrike","Colombia","Kroatia"][i]])), ...Object.fromEntries(Object.keys(CELLS.r8).map((id, i) => [id, ["Brasil","Frankrike","Portugal","Argentina","USA","Spania","England","Kroatia"][i]])), ...Object.fromEntries(Object.keys(CELLS.kvart).map((id, i) => [id, ["Brasil","Frankrike","Portugal","Argentina"][i]])), 101: "Brasil", 102: "Frankrike" },
    sfLosers: { 101: "Portugal", 102: "Argentina" },
    bronse: "Argentina", finale: "Brasil",
    quiz: ["3","Ronaldo","8","140","Nei","5","Panama","3","Brasil","Nei"],
  };

  return { participants, fasit };
})() : null;

async function saveData(data, adminPassword) {
  const payload = { ...data, updatedAt: new Date().toISOString() };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch {}
  if (!adminPassword) throw new Error("Mangler admin-tilgang for lagring");

  const res = await fetch("/.netlify/functions/data", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${adminPassword}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    throw new Error(body.error || `Serveren svarte med ${res.status}`);
  }
}

async function loadData(adminPassword) {
  let localData = null;
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    localData = cached ? JSON.parse(cached) : null;
  } catch {}

  try {
    const res = await fetch("/.netlify/functions/data", adminPassword
      ? { headers: { "Authorization": `Bearer ${adminPassword}` } }
      : undefined);
    if (res.ok) {
      const d = await res.json();
      if (d?.participants) {
        // If a previous authenticated write failed, preserve that newer local
        // import and let the save queue retry it once the page has loaded.
        if (adminPassword && localData?.updatedAt && (!d.updatedAt || localData.updatedAt > d.updatedAt)) {
          return localData;
        }
        return d;
      }
    }
  } catch {}
  return localData;
}

// ── Hjelpere ──
const norm = (s) =>
  String(s || "").toLowerCase().replace(/[^a-zæøåäöü0-9]/g, "");

const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "";

const teamMatch = (a, b) => {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
};

// Klassifiserer hvert tips i en sluttspillrunde mot fasit:
//   "hit"   = rett lag på rett bracket-plass (full poeng)
//   "bonus" = rett lag i runden, men feil plass (liten bonus)
//   "miss"  = laget kom ikke videre i denne runden
// Posisjonstreff prioriteres, deretter mengde-match mot gjenstående fasit-lag.
function classifyRound(preds, actuals) {
  const status = preds.map(() => "miss");
  const usedActual = new Set();
  preds.forEach((p, i) => {
    if (p && actuals[i] && teamMatch(p, actuals[i])) { status[i] = "hit"; usedActual.add(i); }
  });
  preds.forEach((p, i) => {
    if (status[i] === "hit" || !p) return;
    const j = actuals.findIndex((a, k) => a && !usedActual.has(k) && teamMatch(p, a));
    if (j >= 0) { status[i] = "bonus"; usedActual.add(j); }
  });
  return status;
}

function emptyFasit() {
  return {
    groups: Object.fromEntries(GROUP_KEYS.map((g) => [g, { first: "", second: "" }])),
    thirds: Array(8).fill(""),
    matches: {}, // { "73": "Norge", ... "102": "..." }
    sfLosers: { 101: "", 102: "" },
    bronse: "",
    finale: "",
    quiz: Array(10).fill(""),
  };
}

function useIsMobile(bp = 640) {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.innerWidth < bp);
  useEffect(() => {
    const on = () => setM(window.innerWidth < bp);
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

// FIFA 3-letter codes — used in the compact mobile bracket where full names won't fit.
const CODES = {
  "Mexico": "MEX", "USA": "USA", "Canada": "CAN", "Sveits": "SUI", "Brasil": "BRA",
  "Marokko": "MAR", "Australia": "AUS", "Tyskland": "GER", "Elfenbenskysten": "CIV",
  "Nederland": "NED", "Japan": "JPN", "Belgia": "BEL", "Iran": "IRN", "Spania": "ESP",
  "Uruguay": "URU", "Frankrike": "FRA", "Norge": "NOR", "Argentina": "ARG",
  "Østerrike": "AUT", "Portugal": "POR", "Colombia": "COL", "England": "ENG",
  "Kroatia": "CRO", "Panama": "PAN", "Bolivia": "BOL", "Kosovo": "KOS", "Senegal": "SEN",
  "Sør-Korea": "KOR", "Sør-Afrika": "RSA", "Qatar": "QAT", "Tsjekkia": "CZE",
};
const codeOf = (name) => CODES[name] || (name ? name.slice(0, 3).toUpperCase() : "");

// FotMob-style group "table" row block: qualification bar + position + flag + name.
function GroupTableCard({ g, first, second, compact }) {
  const teams = [first, second];
  return (
    <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: compact ? 9 : 12, overflow: "hidden" }}>
      <div style={{ padding: compact ? "2px 7px" : "10px 14px", fontSize: compact ? 9.5 : 12, fontWeight: 800, color: "var(--text3)",
        textTransform: "uppercase", letterSpacing: compact ? 0.5 : 1, borderBottom: "1px solid var(--border)" }}>{compact ? g : `Gruppe ${g}`}</div>
      {teams.map((team, i) => team ? (
        <div key={i} style={{ display: "flex", alignItems: "stretch",
          borderBottom: i === 0 && second ? "1px solid var(--bg2)" : "none" }}>
          <div style={{ width: compact ? 3 : 4, background: "#22C55E", flexShrink: 0 }} />
          <div style={{ display: "flex", alignItems: "center", gap: compact ? 5 : 11, padding: compact ? "3px 6px" : "11px 14px", flex: 1, minWidth: 0 }}>
            {!compact && <span style={{ width: 16, textAlign: "center", fontSize: 14, fontWeight: 700, color: "var(--text3)", flexShrink: 0 }}>{i + 1}</span>}
            <span style={{ fontSize: compact ? 13 : 18, flexShrink: 0 }}>{flagOf(team)}</span>
            <span style={{ fontSize: compact ? 12 : 15, fontWeight: 700, letterSpacing: compact ? 0.3 : 0, color: "var(--text1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{compact ? codeOf(team) : team}</span>
          </div>
        </div>
      ) : null)}
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

// FotMob-style mirrored horizontal bracket (desktop / wide screens). Two halves of
// the draw converge on a center column holding the final, the bronze match and the
// champion. Connectors are rounded SVG paths drawn behind the cards.
function renderBracketHorizontal({ getSlot, getBronse, getFinale }) {
  const CW = 132, ROWH = 33, CH = 2 * ROWH + 1, CONN = 26, CS = CW + CONN, H = 384;
  const centerX = 3 * CS;
  const totalW = 6 * CS + CW;

  const leftCols = [
    { x: 0,      cards: [[73, 74], [75, 76], [77, 78], [79, 80]] },
    { x: CS,     cards: [[89, 90], [91, 92]] },
    { x: 2 * CS, cards: [[97, 98]] },
  ];
  const rightCols = [
    { x: 4 * CS, cards: [[99, 100]] },
    { x: 5 * CS, cards: [[93, 94], [95, 96]] },
    { x: 6 * CS, cards: [[81, 82], [83, 84], [85, 86], [87, 88]] },
  ];
  const cy = (n, i) => H * (i + 0.5) / n;

  const Row = (name, divider) => (
    <>
      {divider && <div style={{ height: 1, background: "var(--bg2)" }} />}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 11px", height: ROWH }}>
        <span style={{ fontSize: 15, width: 20, textAlign: "center", flexShrink: 0 }}>{flagOf(name)}</span>
        <span style={{
          fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          color: name ? "var(--text1)" : "var(--text4)",
        }}>{name || "—"}</span>
      </div>
    </>
  );
  const Card = (ids, x, top, accent) => (
    <div style={{
      position: "absolute", left: x, top, width: CW, zIndex: 2,
      background: "var(--bg4)", borderRadius: 10, overflow: "hidden",
      border: accent ? "1.5px solid var(--accent)" : "1px solid var(--border)",
      boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
    }}>
      {Row(ids[0] != null ? getSlot(ids[0]) : null, false)}
      {Row(ids[1] != null ? getSlot(ids[1]) : null, true)}
    </div>
  );

  const paths = [];
  leftCols.forEach((col, k) => {
    if (k === leftCols.length - 1) return;
    const next = leftCols[k + 1], n = col.cards.length;
    next.cards.forEach((_, j) => {
      const c0 = cy(n, 2 * j), c1 = cy(n, 2 * j + 1), py = cy(next.cards.length, j);
      const childRight = col.x + CW, parentLeft = next.x;
      paths.push(elbowH(childRight, c0, parentLeft, py), elbowH(childRight, c1, parentLeft, py));
    });
  });
  rightCols.forEach((col, k) => {
    if (k === rightCols.length - 1) return;
    const next = rightCols[k + 1], nn = next.cards.length;
    col.cards.forEach((_, j) => {
      const c0 = cy(nn, 2 * j), c1 = cy(nn, 2 * j + 1), py = cy(col.cards.length, j);
      const parentRight = col.x + CW, childLeft = next.x;
      paths.push(elbowH(childLeft, c0, parentRight, py), elbowH(childLeft, c1, parentRight, py));
    });
  });
  paths.push(elbowH(leftCols[2].x + CW, H / 2, centerX, H / 2));
  paths.push(elbowH(rightCols[0].x, H / 2, centerX + CW, H / 2));

  const lbl = {
    position: "absolute", width: CW, textAlign: "center", top: -24,
    fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: "var(--text3)", textTransform: "uppercase",
  };
  const colLabels = ["16-DEL", "8-DEL", "KVART"];
  const finale = getFinale(), bronse = getBronse();
  const finalTop = H / 2 - CH / 2;

  return (
    <div style={{ overflowX: "auto", paddingBottom: 4 }}>
      <div style={{ position: "relative", width: totalW, minWidth: totalW, height: H, margin: "32px auto 8px" }}>
        {colLabels.map((t, i) => <div key={`ll${i}`} style={{ ...lbl, left: leftCols[i].x }}>{t}</div>)}
        {colLabels.map((t, i) => <div key={`rl${i}`} style={{ ...lbl, left: rightCols[2 - i].x }}>{t}</div>)}

        <svg width={totalW} height={H} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", overflow: "visible" }}>
          <g style={{ stroke: "var(--text5)", strokeWidth: 1.5, fill: "none" }} strokeLinecap="round" strokeLinejoin="round">
            {paths.map((d, i) => <path key={i} d={d} />)}
          </g>
        </svg>

        {leftCols.map((col, k) => col.cards.map((ids, i) => (
          <React.Fragment key={`lc${k}-${i}`}>{Card(ids, col.x, cy(col.cards.length, i) - CH / 2, false)}</React.Fragment>
        )))}
        {rightCols.map((col, k) => col.cards.map((ids, i) => (
          <React.Fragment key={`rc${k}-${i}`}>{Card(ids, col.x, cy(col.cards.length, i) - CH / 2, false)}</React.Fragment>
        )))}

        {/* Champion */}
        <div style={{ position: "absolute", left: centerX, top: 6, width: CW, textAlign: "center" }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: "var(--text3)", textTransform: "uppercase", marginBottom: 4 }}>Mester</div>
          <TrophyIcon size={34} />
          <div style={{
            marginTop: 4, fontSize: 16, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            color: finale ? "var(--accent)" : "var(--text4)",
          }}>{finale || "—"}</div>
        </div>

        {/* Final */}
        <div style={{ position: "absolute", left: centerX, top: finalTop, width: CW, zIndex: 3 }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: -22, textAlign: "center" }}><Badge kind="finale">Finale</Badge></div>
          <div style={{ background: "var(--bg4)", borderRadius: 10, overflow: "hidden", border: "1.5px solid var(--accent)", boxShadow: "0 2px 10px rgba(0,0,0,0.12)" }}>
            {Row(getSlot(101), false)}
            {Row(getSlot(102), true)}
          </div>
        </div>

        {/* Bronze */}
        <div style={{ position: "absolute", left: centerX, top: finalTop + CH + 38, width: CW }}>
          <div style={{ marginBottom: 6, textAlign: "center" }}><Badge kind="bronse">Bronse</Badge></div>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "0 11px", height: ROWH,
            background: "var(--bg4)", borderRadius: 10, border: "1px solid var(--border)", boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
          }}>
            <span style={{ fontSize: 15, width: 20, textAlign: "center", flexShrink: 0 }}>{flagOf(bronse)}</span>
            <span style={{
              fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              color: bronse ? "var(--text1)" : "var(--text4)",
            }}>{bronse || "—"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// FotMob-style vertical mirrored bracket (mobile / narrow). The top half flows down
// and the bottom half flows up, meeting at a center row that holds the bronze match,
// the final and the champion. Connectors are rounded SVG paths behind the cards.
function renderBracketVertical({ getSlot, getBronse, getFinale, containerW = 330 }) {
  const RH = 21, CH = 2 * RH + 1, CV = 30;
  // Sized to the measured container width: never overflows, and grows to fill the
  // space on wider views — switching from 3-letter codes to full names when roomy.
  const HALF_W = Math.min(580, Math.floor(containerW));
  const CW = Math.min(132, Math.max(52, Math.floor(HALF_W / 4) - 8));
  const useCode = CW < 96;
  const teamText = (name) => (name ? (useCode ? codeOf(name) : name) : "—");
  const topRounds = [
    { pairs: [[73, 74], [75, 76], [77, 78], [79, 80]] },
    { pairs: [[89, 90], [91, 92]] },
    { pairs: [[97, 98]] },
    { pairs: [[101]] },
  ];
  const botRounds = [
    { pairs: [[102]] },
    { pairs: [[99, 100]] },
    { pairs: [[93, 94], [95, 96]] },
    { pairs: [[81, 82], [83, 84], [85, 86], [87, 88]] },
  ];
  const HALF_H = topRounds.length * CH + (topRounds.length - 1) * CV;

  const VRow = (name, divider) => (
    <>
      {divider && <div style={{ height: 1, background: "var(--bg2)" }} />}
      <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 7px", height: RH }}>
        <span style={{ fontSize: 12, width: 16, textAlign: "center", flexShrink: 0 }}>{flagOf(name)}</span>
        <span style={{
          flex: 1, minWidth: 0, fontSize: useCode ? 11 : 11.5, fontWeight: 700,
          letterSpacing: useCode ? 0.3 : 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          color: name ? "var(--text1)" : "var(--text4)",
        }}>{teamText(name)}</span>
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
      const cur = round.pairs.length, nxt = rounds[ri + 1].pairs.length;
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
          const N = round.pairs.length, y = ri * (CH + CV);
          return round.pairs.map((slots, j) => {
            const cx = (j + 0.5) * HALF_W / N;
            return (
              <div key={`${ri}-${j}`} style={{ position: "absolute", left: cx - CW / 2, top: y, zIndex: 2, ...cardStyle(false) }}>
                {slots.map((id, si) => <React.Fragment key={si}>{VRow(id != null ? getSlot(id) : null, si > 0)}</React.Fragment>)}
              </div>
            );
          });
        })}
      </div>
    );
  };

  const finale = getFinale(), bronse = getBronse();

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: HALF_W, minWidth: HALF_W, margin: "0 auto", padding: "12px 0 8px" }}>
        {renderHalf(topRounds)}

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 12, padding: "16px 0" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ marginBottom: 5 }}><Badge kind="bronse">Bronse</Badge></div>
            <div style={cardStyle(false)}>{VRow(bronse || null, false)}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ marginBottom: 5 }}><Badge kind="finale">Finale</Badge></div>
            <div style={cardStyle(true)}>
              {VRow(getSlot(101), false)}
              {VRow(getSlot(102), true)}
            </div>
          </div>
          <div style={{ textAlign: "center", width: CW }}>
            <TrophyIcon size={26} />
            <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1, color: "var(--text3)", textTransform: "uppercase", marginTop: 2 }}>Mester</div>
            <div style={{
              fontSize: 13, fontWeight: 800, letterSpacing: useCode ? 0.3 : 0, whiteSpace: "nowrap",
              overflow: "hidden", textOverflow: "ellipsis",
              color: finale ? "var(--accent)" : "var(--text4)",
            }}>{teamText(finale)}</div>
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

// ─────────────────────────────────────────────
// POENGBEREGNING: picks vs fasit
// ─────────────────────────────────────────────
function computeScores(picks, fasit) {
  const s = { gruppe: 0, r16: 0, r8: 0, kvart: 0, semi: 0, bronse_finale: 0, bonus: 0 };
  if (!picks) return s;

  // Gruppespill: 1. og 2. plass
  for (const g of GROUP_KEYS) {
    const f = fasit.groups[g] || {};
    const p = picks.groups?.[g] || {};
    if (f.first && teamMatch(p.first, f.first)) s.gruppe += POINTS.group;
    if (f.second && teamMatch(p.second, f.second)) s.gruppe += POINTS.group;
  }
  // Beste treere: rekkefølge spiller ingen rolle, sammenlign som mengder
  const fThirds = (fasit.thirds || []).filter(Boolean);
  const pThirds = (picks.thirds || []).filter(Boolean);
  const used = new Set();
  for (const pt of pThirds) {
    const hit = fThirds.findIndex((ft, i) => !used.has(i) && teamMatch(pt, ft));
    if (hit >= 0) { used.add(hit); s.gruppe += POINTS.third; }
  }

  // Sluttspillrunder: full poeng for rett lag på rett plass, liten bonus for
  // rett lag i runden men feil bracket-plass.
  const addRound = (bucket, preds, actuals, pts, bonus) => {
    const st = classifyRound(preds, actuals);
    s[bucket] += st.filter((x) => x === "hit").length * pts
               + st.filter((x) => x === "bonus").length * bonus;
  };
  const rounds = [
    ["r16", CELLS.r16, POINTS.r16],
    ["r8", CELLS.r8, POINTS.r8],
    ["kvart", CELLS.kvart, POINTS.kvart],
  ];
  for (const [key, cellMap, pts] of rounds) {
    const ids = Object.keys(cellMap);
    addRound(key, ids.map((m) => picks.matches?.[m]), ids.map((m) => fasit.matches?.[m]), pts, POINTS.koBonus);
  }

  // Semifinaler: finalister (vinnere) + bronsekamp-lag (tapere) — større bonus
  const sf = ["101", "102"];
  addRound("semi", sf.map((m) => picks.matches?.[m]), sf.map((m) => fasit.matches?.[m]), POINTS.semi, POINTS.koBonusSemi);
  addRound("semi", sf.map((m) => picks.sfLosers?.[m]), sf.map((m) => fasit.sfLosers?.[m]), POINTS.semi, POINTS.koBonusSemi);

  // Bronse + finale
  if (fasit.bronse && teamMatch(picks.bronse, fasit.bronse)) s.bronse_finale += POINTS.bronse;
  if (fasit.finale && teamMatch(picks.finale, fasit.finale)) s.bronse_finale += POINTS.finale;

  // Quiz: 1 p per riktig; spm 4 (idx 3) har ±5-toleranse
  for (let i = 0; i < 10; i++) {
    const f = fasit.quiz?.[i], p = picks.quiz?.[i];
    if (!f || !p) continue;
    if (i === 3) {
      const fn = parseInt(String(f).replace(/\D/g, ""), 10);
      const pn = parseInt(String(p).replace(/\D/g, ""), 10);
      if (!isNaN(fn) && !isNaN(pn) && Math.abs(fn - pn) <= 5) s.bonus += POINTS.quiz;
    } else if (norm(f) === norm(p)) {
      s.bonus += POINTS.quiz;
    }
  }
  return s;
}

// ─────────────────────────────────────────────
// TREFF-OVERSIKT: hvilke tips var riktige (per kategori), med poeng
// ─────────────────────────────────────────────
function pickResults(picks, fasit) {
  picks = picks || {};
  const sections = [];
  // Posisjonelt tips (gruppe/bronse/finale/quiz): hit eller miss.
  const mk = (label, pick, actual, pts, team = true) => {
    const status = pick && actual && teamMatch(pick, actual) ? "hit" : "miss";
    return { label, pick: pick || "", actual, status, points: status === "hit" ? pts : 0, max: pts, team };
  };
  // Sluttspillrunde: hit (rett plass), bonus (rett lag feil plass) eller miss.
  const koItems = (ids, pts, bonus, labelFn, getA, getP) => {
    const actuals = ids.map(getA);
    if (!actuals.some(Boolean)) return [];
    const preds = ids.map(getP);
    const status = classifyRound(preds, actuals);
    return ids
      .map((m, i) => ({
        label: labelFn(i), pick: preds[i] || "", actual: actuals[i] || null, status: status[i],
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
    if (f.first) groupItems.push(mk(`Gruppe ${g} · 1.`, p.first, f.first, POINTS.group));
    if (f.second) groupItems.push(mk(`Gruppe ${g} · 2.`, p.second, f.second, POINTS.group));
  }
  const fThirds = (fasit.thirds || []).filter(Boolean);
  if (fThirds.length) {
    const used = new Set();
    (picks.thirds || []).filter(Boolean).forEach((pt) => {
      const hit = fThirds.findIndex((ft, i) => !used.has(i) && teamMatch(pt, ft));
      if (hit >= 0) used.add(hit);
      groupItems.push({ label: "Beste 3.-plass", pick: pt, actual: null, status: hit >= 0 ? "hit" : "miss", points: hit >= 0 ? POINTS.third : 0, max: POINTS.third, team: true });
    });
  }
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
  if (fasit.bronse) bf.push(mk("Bronsefinale", picks.bronse, fasit.bronse, POINTS.bronse));
  if (fasit.finale) bf.push(mk("Finale · mester", picks.finale, fasit.finale, POINTS.finale));
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
function parseWorkbook(wb, filename) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const val = (addr) => {
    const c = ws[addr];
    if (!c || c.v === undefined || c.v === null) return "";
    const v = String(c.v).trim();
    return v === "0" ? "" : v;
  };

  const picks = {
    groups: {}, thirds: [], matches: {}, sfLosers: {}, bronse: "", finale: "", quiz: [],
  };
  for (const g of GROUP_KEYS) {
    picks.groups[g] = { first: val(CELLS.groups[g].first), second: val(CELLS.groups[g].second) };
  }
  picks.thirds = CELLS.thirds.map(val);
  for (const [m, addr] of Object.entries(CELLS.r16)) picks.matches[m] = val(addr);
  for (const [m, addr] of Object.entries(CELLS.r8)) picks.matches[m] = val(addr);
  for (const [m, addr] of Object.entries(CELLS.kvart)) picks.matches[m] = val(addr);
  picks.matches["101"] = val(CELLS.semi[101].win);
  picks.matches["102"] = val(CELLS.semi[102].win);
  picks.sfLosers["101"] = val(CELLS.semi[101].lose);
  picks.sfLosers["102"] = val(CELLS.semi[102].lose);
  picks.bronse = val(CELLS.bronse);
  picks.finale = val(CELLS.finale);
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
const TEAM_NAME_MAP = {
  "south africa": "Sør Afrika", "south korea": "Sør Korea",
  "czechia": "Tsjekkia", "czech republic": "Tsjekkia",
  "mexico": "Mexico", "usa": "USA", "united states": "USA",
  "canada": "Canada", "brazil": "Brasil", "brasil": "Brasil",
  "morocco": "Marokko", "scotland": "Skottland", "haiti": "Haiti",
  "paraguay": "Paraguay", "australia": "Australia",
  "turkey": "Tyrkia", "turkiye": "Tyrkia",
  "germany": "Tyskland", "deutschland": "Tyskland",
  "curacao": "Curaçao", "netherlands": "Nederland", "holland": "Nederland",
  "japan": "Japan", "sweden": "Sverige", "tunisia": "Tunisia",
  "belgium": "Belgia", "egypt": "Egypt", "iran": "Iran",
  "new zealand": "New Zealand", "spain": "Spania",
  "cape verde": "Kapp Verde", "saudi arabia": "Saudi Arabia",
  "uruguay": "Uruguay", "france": "Frankrike", "senegal": "Senegal",
  "iraq": "Irak", "norway": "Norge", "argentina": "Argentina",
  "algeria": "Algerie", "austria": "Østerrike", "jordan": "Jordan",
  "portugal": "Portugal", "congo": "Kongo", "dr congo": "Kongo",
  "uzbekistan": "Uzbekistan", "colombia": "Colombia",
  "england": "England", "croatia": "Kroatia", "ghana": "Ghana",
  "panama": "Panama", "ivory coast": "Elfenbenskysten",
  "côte d'ivoire": "Elfenbenskysten", "ecuador": "Ecuador",
  "qatar": "Qatar", "switzerland": "Sveits",
  "bosnia": "Bosnia og Herzegovina",
  "bosnia and herzegovina": "Bosnia og Herzegovina",
};

function toNorwegian(name) {
  if (!name) return "";
  return TEAM_NAME_MAP[name.toLowerCase().trim()] || name;
}

async function fetchResultsFromAPI() {
  const BASE = "/.netlify/functions/wc?endpoint=";

  // Hent teams og groups parallelt; games er valgfritt (kan time ut)
  const [teamsRes, groupsRes, gamesRes] = await Promise.all([
    fetch(`${BASE}teams`),
    fetch(`${BASE}groups`),
    fetch(`${BASE}games`).catch(() => null),
  ]);
  if (!teamsRes.ok || !groupsRes.ok) throw new Error("API utilgjengelig");

  const teamsData = await teamsRes.json();
  const groupsData = await groupsRes.json();
  const result = emptyFasit();

  // Bygg team-ID → norsk navn-kart
  const teamMap = {};
  for (const t of (teamsData.teams || [])) {
    teamMap[String(t.id)] = toNorwegian(t.name_en);
  }

  // Gruppe-standings
  for (const g of (groupsData?.groups || [])) {
    const letter = (g.name || "").toUpperCase();
    if (!GROUP_KEYS.includes(letter)) continue;
    const teams = [...(g.teams || [])].sort((a, b) =>
      (parseInt(b.pts) || 0) - (parseInt(a.pts) || 0) ||
      (parseInt(b.gd) || 0) - (parseInt(a.gd) || 0) ||
      (parseInt(b.gf) || 0) - (parseInt(a.gf) || 0)
    );
    if (teams[0]) result.groups[letter].first = teamMap[teams[0].team_id] || "";
    if (teams[1]) result.groups[letter].second = teamMap[teams[1].team_id] || "";
  }

  // Kampresultater (kun hvis games-endepunktet svarte)
  if (gamesRes?.ok) {
    const gamesData = await gamesRes.json();
    for (const g of (gamesData?.games || [])) {
      if (g.finished !== "TRUE") continue;
      const hs = parseInt(g.home_score);
      const as_ = parseInt(g.away_score);
      if (isNaN(hs) || isNaN(as_) || hs === as_) continue;

      const home = toNorwegian(g.home_team_name_en || "");
      const away = toNorwegian(g.away_team_name_en || "");
      const winner = hs > as_ ? home : away;
      const loser = hs > as_ ? away : home;
      const mn = parseInt(g.id);
      if (!mn) continue;
      if (mn >= 73 && mn <= 102) {
        result.matches[String(mn)] = winner;
        if (mn === 101 || mn === 102) result.sfLosers[String(mn)] = loser;
      } else if (mn === 103) result.bronse = winner;
      else if (mn === 104) result.finale = winner;
    }
  }

  return result;
}

// ─────────────────────────────────────────────
// APP
// ─────────────────────────────────────────────
export default function App() {
  const [participants, setParticipants] = useState([]);
  const [fasit, setFasit] = useState(emptyFasit());
  const [settings, setSettings] = useState(() => normalizeSettings());
  const [adminPreviewCeremony, setAdminPreviewCeremony] = useState(() => normalizeCeremony());
  const [mode, setMode] = useState("hjem");
  const [loaded, setLoaded] = useState(false);
  const isMobile = useIsMobile();
  const [isAdmin, setIsAdmin] = useState(() =>
    sessionStorage.getItem("vm_admin") === "1" && Boolean(sessionStorage.getItem("vm_pw"))
  );
  const [theme, setTheme] = useState(() => localStorage.getItem("vm_theme") || "dark");
  const [adminPassword, setAdminPassword] = useState(() => sessionStorage.getItem("vm_pw") || "");
  const [logoClicks, setLogoClicks] = useState(0);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const logoClickTimer = useRef(null);
  const saveQueueRef = useRef(Promise.resolve());
  const saveVersionRef = useRef(0);
  const [saveStatus, setSaveStatus] = useState({ state: "idle", message: "" });

  useEffect(() => {
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
      setLoaded(true);
      return;
    }
    loadData(adminPassword).then((d) => {
      if (d?.participants) setParticipants(d.participants);
      if (d?.fasit) setFasit({ ...emptyFasit(), ...d.fasit });
      if (d?.settings) setSettings(normalizeSettings(d.settings));
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded || !isAdmin || DEMO_DATA) return;

    const version = ++saveVersionRef.current;
    const snapshot = { participants, fasit, settings };
    setSaveStatus({ state: "saving", message: "Lagrer endringer i skyen …" });

    // Keep writes in order. This prevents an older request from overwriting a
    // newer spreadsheet import when several changes happen in quick succession.
    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(() => saveData(snapshot, adminPassword))
      .then(() => {
        if (version === saveVersionRef.current) {
          setSaveStatus({ state: "saved", message: "Lagret i skyen" });
        }
      })
      .catch((error) => {
        if (version === saveVersionRef.current) {
          setSaveStatus({ state: "error", message: `Ikke lagret: ${error.message}` });
        }
      });
  }, [participants, fasit, settings, loaded, isAdmin, adminPassword]);

  // Public viewers follow the admin-controlled ceremony without needing to reload.
  useEffect(() => {
    if (!loaded || isAdmin || DEMO_DATA) return;
    let active = true;
    const refresh = async () => {
      const d = await loadData();
      if (!active || !d?.participants) return;
      setParticipants(d.participants);
      if (d?.fasit) setFasit({ ...emptyFasit(), ...d.fasit });
      if (d?.settings) setSettings(normalizeSettings(d.settings));
    };
    const interval = window.setInterval(refresh, 5000);
    return () => { active = false; window.clearInterval(interval); };
  }, [loaded, isAdmin]);

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
    const res = await fetch("/.netlify/functions/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: passwordInput }),
    });
    const { ok } = await res.json();
    if (ok) {
      const d = await loadData(passwordInput);
      if (d?.participants) setParticipants(d.participants);
      if (d?.fasit) setFasit({ ...emptyFasit(), ...d.fasit });
      if (d?.settings) setSettings(normalizeSettings(d.settings));
      setIsAdmin(true);
      setAdminPassword(passwordInput);
      sessionStorage.setItem("vm_admin", "1");
      sessionStorage.setItem("vm_pw", passwordInput);
      setShowPasswordModal(false);
      setPasswordInput("");
      setPasswordError(false);
      setMode("deltakere");
    } else {
      setPasswordError(true);
    }
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
              onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(false); }}
              onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
              placeholder="Passord"
              style={{ ...S.input, marginBottom: 8 }}
            />
            {passwordError && <div style={{ color: "#E8334A", fontSize: 13, marginBottom: 8 }}>Feil passord</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handlePasswordSubmit} style={S.calcBtn}>Logg inn</button>
              <button onClick={() => { setShowPasswordModal(false); setPasswordInput(""); setPasswordError(false); }}
                style={{ ...S.addBtn }}>Avbryt</button>
            </div>
          </div>
        </div>
      )}

      <header style={S.header}>
        <div style={S.headerInner}>
          <div onClick={handleLogoClock} style={{ ...S.logo, cursor: "default", userSelect: "none" }}>
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
            marginLeft: isMobile ? 0 : "auto",
            ...(isMobile ? { order: 3, flexBasis: "100%", maxWidth: "100%", overflowX: "auto", justifyContent: "flex-start" } : {}),
          }}>
            {tabs.map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)}
                disabled={m === "present" && (isAdmin || settings.ceremonyUnlocked) && participants.length < 2}
                style={{ ...S.modeBtn, ...(mode === m ? S.modeBtnActive : {}) }}>
                {m === "present" && !settings.ceremonyUnlocked && <span aria-hidden="true" style={S.tabLock}><LockIcon size={12} /></span>}
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                  setIsAdmin(false); setAdminPassword(""); setMode("stilling");
                } else {
                  setIsAdmin(true); setAdminPassword("dev"); setMode("deltakere");
                }
              }} style={{ ...S.removeBtn, fontSize: 11, padding: "5px 10px", color: isAdmin ? "var(--accent)" : "#F5A623", borderColor: isAdmin ? "var(--accent)" : "#F5A62340" }}>
                {isAdmin ? "ADMIN ON" : "ADMIN OFF"}
              </button>
            )}
            {isAdmin && !import.meta.env.DEV && (
              <button title="Lås siden" onClick={() => {
                setIsAdmin(false);
                setAdminPassword("");
                sessionStorage.removeItem("vm_admin");
                sessionStorage.removeItem("vm_pw");
                setMode("stilling");
              }} style={{ ...S.removeBtn, fontSize: 12, fontWeight: 700, padding: "6px 10px", color: "var(--text3)", border: "1px solid var(--border)", borderRadius: 20 }}>Lås</button>
            )}
          </div>
        </div>
      </header>

      {mode === "hjem" && <Hjem participants={participants} showBonus={bonusPublished} theme={theme} />}
      {mode === "stilling" && <Stilling participants={participants} fasit={fasit} showBonus={bonusPublished} />}
      {mode === "fasit-view" && <FasitView fasit={fasit} showBonus={bonusPublished} theme={theme} />}
      {mode === "vei-vm" && <NorgesVeiTilVM theme={theme} />}
      {mode === "deltakere" && (
        <Deltakere participants={participants} setParticipants={setParticipants} fasit={fasit} saveStatus={saveStatus} />
      )}
      {mode === "fasit" && <Fasit fasit={fasit} setFasit={setFasit} />}
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
    </div>
  );
}

// ─────────────────────────────────────────────
// DELTAKERE — import + manuell redigering
// ─────────────────────────────────────────────
function Deltakere({ participants, setParticipants, fasit, saveStatus }) {
  const narrowBracket = useIsMobile(1024);
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
      scores: {}, bonus: 0, picks: null,
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
    let added = 0, updated = 0, failed = 0;
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
            scores: {}, bonus: 0, picks,
          });
          added++;
        }
      } catch (err) {
        console.error("Import feilet for", file.name, err);
        failed++;
      }
    }
    setParticipants(next);
    setImportMsg(`Importert: ${added} nye, ${updated} oppdatert${failed ? `, ${failed} feilet` : ""}`);
    if (fileRef.current) fileRef.current.value = "";
  };

  const calcAll = () => {
    setParticipants(participants.map((p) => {
      if (!p.picks) return p;
      const s = computeScores(p.picks, fasit);
      return {
        ...p,
        scores: {
          gruppe: s.gruppe, r16: s.r16, r8: s.r8,
          kvart: s.kvart, semi: s.semi, bronse_finale: s.bronse_finale,
        },
        bonus: s.bonus,
      };
    }));
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
                color: saveStatus.state === "error" ? "#E8334A" : saveStatus.state === "saved" ? "var(--accent)" : "var(--text3)",
              }}>
              {saveStatus.state === "saved" ? "✓ " : ""}{saveStatus.message}
            </span>
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
                                return (
                                  <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                                    <div style={{ color: "var(--text3)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 10 }}>Sluttspill</div>
                                    {narrowBracket
                                      ? <VerticalBracket
                                          getSlot={id => p.picks.matches?.[id] ?? null}
                                          getBronse={() => p.picks.bronse}
                                          getFinale={() => p.picks.finale} />
                                      : renderBracketHorizontal({
                                          getSlot: id => p.picks.matches?.[id] ?? null,
                                          getBronse: () => p.picks.bronse,
                                          getFinale: () => p.picks.finale,
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
const STATUS_COLOR = { hit: "var(--accent)", bonus: "#E0A106", miss: "var(--text5)" };

function StillingBreakdown({ picks, fasit, showBonus }) {
  if (!picks) return <div style={{ padding: "0 20px 18px", color: "var(--text3)", fontSize: 13 }}>Ingen tips registrert.</div>;
  const results = pickResults(picks, fasit);
  const sections = showBonus ? results.sections : results.sections.filter((sec) => sec.key !== "quiz");
  const earned = sections.reduce((sum, sec) => sum + sec.earned, 0);
  const hits = sections.reduce((sum, sec) => sum + sec.hits, 0);
  const bonuses = sections.reduce((sum, sec) => sum + sec.bonuses, 0);
  const itemCount = sections.reduce((sum, sec) => sum + sec.items.length, 0);
  if (!sections.length) return <div style={{ padding: "0 20px 18px", color: "var(--text3)", fontSize: 13 }}>Ingen resultater lagt inn ennå.</div>;

  const Dot = ({ c }) => <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: c, marginRight: 5, verticalAlign: "middle" }} />;

  const Chip = ({ it }) => (
    <div style={{
      display: "flex", flexDirection: "column", gap: 2, padding: "6px 9px", borderRadius: 8,
      background: "var(--bg4)", borderLeft: `3px solid ${STATUS_COLOR[it.status]}`,
    }}>
      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
        color: "var(--text3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.label}</span>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          color: it.status === "miss" ? "var(--text3)" : "var(--text1)" }}>
          {it.team && flagOf(it.pick) ? `${flagOf(it.pick)} ` : ""}{it.pick || "—"}
        </span>
        {it.status === "hit"
          ? <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--accent)", flexShrink: 0 }}>+{it.points}</span>
          : it.status === "bonus"
            ? <span style={{ fontSize: 11.5, fontWeight: 800, color: STATUS_COLOR.bonus, flexShrink: 0 }}>+{it.points}</span>
            : (it.actual ? <span style={{ fontSize: 10.5, color: "var(--text4)", flexShrink: 0, whiteSpace: "nowrap" }}>→ {it.actual}</span> : null)}
      </div>
    </div>
  );

  return (
    <div style={{ padding: "0 20px 20px" }}>
      <div style={{ fontSize: 12.5, color: "var(--text3)", marginBottom: 6 }}>
        <b style={{ color: "var(--text1)" }}>{hits}/{itemCount}</b> rett{bonuses > 0 ? <> · <b style={{ color: STATUS_COLOR.bonus }}>{bonuses}</b> nesten</> : null} · <b style={{ color: "var(--accent)" }}>{earned} poeng</b>
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 10.5, color: "var(--text3)" }}>
        <span><Dot c={STATUS_COLOR.hit} />rett lag, rett plass</span>
        <span><Dot c={STATUS_COLOR.bonus} />rett lag, feil plass</span>
        <span><Dot c={STATUS_COLOR.miss} />bom</span>
      </div>
      {sections.map((sec) => (
        <div key={sec.key} style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--text3)" }}>{sec.label}</span>
            <span style={{ fontSize: 11.5, color: "var(--text3)", whiteSpace: "nowrap" }}>
              <b style={{ color: "var(--text1)" }}>{sec.hits}/{sec.items.length}</b>{sec.bonuses > 0 ? <> · <b style={{ color: STATUS_COLOR.bonus }}>{sec.bonuses}</b> nesten</> : null} · <b style={{ color: "var(--accent)" }}>{sec.earned} p</b>
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
    </div>
  );
}

function Stilling({ participants, fasit, showBonus }) {
  const isMobile = useIsMobile();
  const [openId, setOpenId] = useState(null);
  const roundColumnWidth = 68;
  const withTotal = [...participants]
    .map((p) => {
      const base = cumulative(p, ROUNDS.length - 1);
      return { ...p, total: base + (showBonus ? p.bonus || 0 : 0) };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "nb-NO"));

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
      <div style={{ position: "relative", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
          {!isMobile && <div style={{
            display: "flex", alignItems: "center", gap: 12, padding: "14px 20px 12px",
            borderBottom: "1px solid var(--border)", color: "var(--text3)", fontSize: 10.5,
            fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase",
          }}>
            <span style={{ width: 28 }} />
            <span style={{ width: 12 }} />
            <span style={{ flex: 1 }}>Spiller</span>
            {ROUNDS.map((r) => <span key={r.key} style={{ width: roundColumnWidth, textAlign: "right" }}>{r.short}</span>)}
            <span style={{ minWidth: 44, textAlign: "right", color: "var(--text3)" }}>Totalt</span>
            <span style={{ width: 14 }} />
          </div>}
          {withTotal.map((p, i) => {
          const open = openId === p.id;
          return (
            <div key={p.id} style={{ borderBottom: i < withTotal.length - 1 ? "1px solid var(--border)" : "none" }}>
              <div onClick={() => setOpenId(open ? null : p.id)} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", cursor: "pointer",
                background: open ? "var(--bg2)" : "transparent", transition: "background .15s",
              }}>
                <span style={{ width: 28, fontWeight: 800, fontSize: 18, color: i < 3 ? "var(--accent)" : "var(--text3)" }}>
                  {i + 1}
                </span>
                <span style={{ ...S.dot, background: p.color, width: 12, height: 12 }} />
                <span style={{ flex: 1, fontWeight: 700, fontSize: 16, color: "var(--text1)" }}>{firstName(p.name)}</span>
                {!isMobile && ROUNDS.map((r) => (
                  <span key={r.key} style={{ display: "flex", alignItems: "baseline", justifyContent: "flex-end", gap: 3, width: roundColumnWidth }}>
                    <span style={{ color: "var(--text1)", fontWeight: 700, fontSize: 13 }}>{p.scores[r.key] || 0}</span>
                    <span style={{ fontSize: 10, color: "var(--text4)", whiteSpace: "nowrap" }}>{r.short}</span>
                  </span>
                ))}
                <span style={{ fontWeight: 900, fontSize: 20, color: "var(--accent)", minWidth: 44, textAlign: "right" }}>
                  {p.total}
                </span>
                <span style={{ color: "var(--text4)", fontSize: 11, width: 14, textAlign: "center",
                  transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▾</span>
              </div>
              {open && <StillingBreakdown picks={p.picks} fasit={fasit} showBonus={showBonus} />}
            </div>
          );
          })}
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
  const deepest = [...depths].sort((a, b) => b.depth - a.depth)[0];
  const deepestShown = deepest && deepest.depth >= 1 ? { name: deepest.name, label: DEPTH_LABEL[deepest.depth] } : null;
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

function readCachedLiveGames() {
  try {
    const cached = JSON.parse(localStorage.getItem(LIVE_GAMES_CACHE_KEY) || "null");
    return Array.isArray(cached?.games) ? cached.games : null;
  } catch {
    return null;
  }
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

// Fetches the fixture list from the existing wc proxy and shows Norway's next
// unplayed match. In local development it falls back to the shared sample
// schedule, while production only displays live fixture data.
function NorwayNextGame({ theme }) {
  const [game, setGame] = useState(() => pickNextNorwayGame(readCachedLiveGames() || DEV_SAMPLE_GAMES));
  useEffect(() => {
    let alive = true;
    loadLiveGames()
      .then((games) => { if (alive) setGame(pickNextNorwayGame(games)); })
      .catch(() => { if (alive) setGame(DEV_SAMPLE_GAMES ? pickNextNorwayGame(DEV_SAMPLE_GAMES) : null); });
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
  const TeamCol = (flag, name) => (
    <div style={{ textAlign: "center", flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 34, lineHeight: 1 }}>{flag}</div>
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
          {TeamCol(flagOf("Norge"), "Norge")}
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text3)", flexShrink: 0 }}>VS</div>
          {TeamCol(flagOf(opp) || "🏳️", opp || "?")}
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
  ? [
      ["Norway", "Spain", 20], ["Brazil", "France", 27], ["Argentina", "Croatia", 44],
      ["England", "Netherlands", 51], ["Portugal", "Germany", 68], ["Belgium", "Morocco", 75],
    ].map(([h, a, hrs]) => ({
      home_team_name_en: h, away_team_name_en: a, finished: "FALSE",
      date_time: new Date(Date.now() + hrs * 3600 * 1000).toISOString(),
    }))
  : null;

// Henter kampoppsettet fra wc-proxyen og viser de neste kampene som skal spilles.
// Renderer ingenting ved feil/ingen kamper, på samme måte som Neste Norge-kamp.
function UpcomingGames() {
  const [games, setGames] = useState(() => pickUpcomingGames(readCachedLiveGames() || DEV_SAMPLE_GAMES));
  useEffect(() => {
    let alive = true;
    loadLiveGames()
      .then((liveGames) => { if (alive) setGames(pickUpcomingGames(liveGames)); })
      .catch(() => { if (alive) setGames(DEV_SAMPLE_GAMES ? pickUpcomingGames(DEV_SAMPLE_GAMES) : null); });
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
          <span style={{ fontSize: 18, flexShrink: 0 }}>{flagOf(home) || "🏳️"}</span>
          <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{home || "?"}</span>
          <span style={{ color: "var(--text4)", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>VS</span>
          <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 13.5, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{away || "?"}</span>
          <span style={{ fontSize: 18, flexShrink: 0 }}>{flagOf(away) || "🏳️"}</span>
        </div>
      </div>
    );
  };

  return (
    <div style={HJ.card}>
      <div style={S.fasitSectionTitle}>Kommende kamper</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {games.map((x, i) => <Row key={i} x={x} />)}
      </div>
    </div>
  );
}

function Hjem({ participants, showBonus, theme }) {
  const stats = computeHomeStats(participants, showBonus);
  const N = stats.total;
  const top = stats.championRanking.slice(0, 4);
  const folketsFinale = stats.finalistRanking[0];
  const nw = stats.norway;
  const leader = stats.leaderboard[0];
  const runnerUp = stats.leaderboard[1];
  const tiedLeaders = leader ? stats.leaderboard.filter((p) => p.total === leader.total) : [];
  const leadGap = leader && runnerUp && leader.total > 0 ? leader.total - runnerUp.total : null;

  return (
    <div style={S.adminWrap}>
      {/* Hero / om konkurransen */}
      <div style={{ ...HJ.card, borderTop: "3px solid var(--accent)", marginBottom: 14 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: "var(--text1)", marginBottom: 8 }}>VM 2026 – Tippekonkurranse</div>
        <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: 14.5, margin: "0 0 14px", maxWidth: 640 }}>
          Velkommen til VM 2026-tippekonkurransen! VM-feberen er i gang, og her følger dere stillingen og resultatene etter hver kampdag. Hvem hadde de beste tipsene?
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <span style={HJ.chip}>{N} {N === 1 ? "deltaker" : "deltakere"}</span>
          {leader && N > 0 && <span style={HJ.chip}>Leder: {leader.name}</span>}
        </div>
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
                  <span style={{ fontSize: 20, width: 26, textAlign: "center", flexShrink: 0 }}>{flagOf(c.name)}</span>
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
                    <div style={{ fontSize: 30, lineHeight: 1 }}>{flagOf(team) || "🏳️"}</div>
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
                <div style={HJ.factLine}>Mest optimistisk: <b>{nw.deepest.name}</b> har Norge helt til {nw.deepest.label === "VM-gull" ? "VM-gull" : nw.deepest.label}</div>
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
  };
}

function liveVoyageNodes(games) {
  return (games || [])
    .filter((game) => game.home_team_name_en === "Norway" || game.away_team_name_en === "Norway")
    .map((game) => ({ node: gameToVoyageNode(game), kickoff: parseGameDate(game), id: Number(game.id) || Infinity }))
    .sort((a, b) => (a.kickoff?.getTime() ?? Infinity) - (b.kickoff?.getTime() ?? Infinity) || a.id - b.id)
    .map(({ node }) => node);
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
  const LANE_W = isMobile ? 58 : 188;
  const AMP = isMobile ? 13 : 44;
  const CX = LANE_W / 2;
  const GAP = isMobile ? 12 : 18;
  const [vmNodes, setVmNodes] = useState(() => liveVoyageNodes(readCachedLiveGames() || DEV_SAMPLE_GAMES));
  const voyageNodes = [...VOYAGE_CORE_NODES, ...vmNodes];
  const hasConfirmedFinal = voyageNodes.some((node) => node.round === "Finale" && node.kind === "knockout");

  const containerRef = useRef(null);
  const cardRefs = useRef([]);
  const baseRef = useRef(null);
  const fillRef = useRef(null);
  const shipRef = useRef(null);
  const lutRef = useRef(null);

  const [geo, setGeo] = useState({ pathD: "", height: 0, nodes: [], waves: [] });
  const [activeIdx, setActiveIdx] = useState(0);
  const geoRef = useRef(geo);
  geoRef.current = geo;

  useEffect(() => {
    let alive = true;
    loadLiveGames()
      .then((games) => { if (alive) setVmNodes(liveVoyageNodes(games)); })
      .catch(() => { if (alive) setVmNodes(liveVoyageNodes(DEV_SAMPLE_GAMES)); });
    return () => { alive = false; };
  }, []);

  // Re-place the ship and green fill from the current scroll position.
  function update() {
    const L = lutRef.current, cont = containerRef.current, g = geoRef.current;
    if (!L || !cont) return;
    const rect = cont.getBoundingClientRect();
    const anchor = window.innerHeight * 0.46;
    const lastNodeY = g.nodes.length ? g.nodes[g.nodes.length - 1].y : g.height;
    const naturalY = Math.max(0, Math.min(lastNodeY, anchor - rect.top));
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const dockingRange = Math.min(360, maxScroll);
    const dockingProgress = dockingRange ? Math.max(0, Math.min(1, (dockingRange - (maxScroll - window.scrollY)) / dockingRange)) : 1;
    const easedDocking = dockingProgress * dockingProgress * (3 - 2 * dockingProgress);
    const y = naturalY + (lastNodeY - naturalY) * easedDocking;
    let lo = 0, hi = L.lut.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (L.lut[m].y < y) lo = m + 1; else hi = m; }
    const e = L.lut[lo];
    if (shipRef.current) {
      shipRef.current.style.transition = dockingProgress > 0 ? "transform 420ms cubic-bezier(.16, 1, .3, 1)" : "";
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
      const waves = [];
      const STEP = isMobile ? 26 : 32, ROWH = isMobile ? 34 : 40, GAPW = STEP * 1.6;
      let row = 0;
      for (let wy = 26; wy < h - 6; wy += ROWH, row++) {
        if (row % 3 === 1) continue; // leave some lines as open water
        const odd = row % 2 === 1;
        const run = odd ? 5 : 4; // a group of 4–5 waves, then a horizontal gap, then more
        let x = (odd ? STEP / 2 : 0) - 8, n = 0;
        while (x < LANE_W + 14) {
          waves.push({ x, y: wy, flip: odd, deep: odd });
          n++;
          x += (n % run === 0) ? GAPW : STEP;
        }
      }
      setGeo({ pathD: smoothPath(pts), height: h, nodes, waves });
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
      <div style={{ margin: "4px 0 18px", maxWidth: 640 }}>
        <div style={{ color: "var(--accent)", fontSize: 11, fontWeight: 900, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>Landslagsskipets rute</div>
        <h1 style={{ margin: 0, color: "var(--text1)", fontSize: isMobile ? 27 : 36, lineHeight: 1.08, letterSpacing: -0.9 }}>Norges vei til VM</h1>
        <p style={{ margin: "10px 0 0", color: "var(--text2)", fontSize: 15, lineHeight: 1.55 }}>
          Fra Marseille i 1998 til verdens største scene i USA. Skroll deg nedover og følg langskipet over havet — fra kvalifiseringen til VM 2026.
        </p>
      </div>

      <div ref={containerRef} style={{ position: "relative", maxWidth: isMobile ? "none" : LANE_W + GAP + 960 }}>
        <svg aria-hidden="true" width={LANE_W} height={geo.height || 1} viewBox={`0 0 ${LANE_W} ${geo.height || 1}`}
          style={{ position: "absolute", left: 0, top: 0, overflow: "hidden" }}>
          <defs><clipPath id="laneClip"><rect x="0" y="0" width={LANE_W} height={geo.height || 1} rx="16" /></clipPath></defs>
          <rect x="0" y="0" width={LANE_W} height={geo.height || 1} rx="16" fill="#0A1E3C" />
          <g className="voyage-waves" clipPath="url(#laneClip)">
            {geo.waves.map((w, i) => (
              <path key={i} d={SAGA_WAVE}
                transform={`translate(${w.x.toFixed(1)},${w.y.toFixed(1)})${w.flip ? " scale(-1,1)" : ""}`}
                fill="none" stroke={w.deep ? "#2F537E" : "#4C77A6"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
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
              <VoyageCard node={node} active={i === activeIdx} isMobile={isMobile} imageOnRight={i % 2 === 1} />
            </div>
          ))}
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
  const campaignTitle = placeholder ? "Kun ved avansement" : upcomingFixture ? kickoff ? formatCountdown(kickoff) : "Kampdato kommer" : node.result === "W" ? "3 poeng" : node.result === "D" ? "1 poeng" : "0 poeng";
  const campaignCopy = placeholder
    ? "Motstander og kampdato fastsettes etter gruppespillet."
    : upcomingFixture
      ? kickoff
        ? `${kickoff.toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "long" })} · ${kickoff.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })} norsk tid`
        : "Tidspunktet er ikke fastsatt ennå."
      : node.result === "W" ? "En sterk start på VM-reisen." : node.result === "D" ? "Alt er fortsatt åpent i gruppa." : "Norge må slå tilbake i neste kamp.";
  const panelColor = placeholder ? "#C7A75D" : upcomingFixture ? "var(--accent)" : resColor;

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
                <span style={{ fontSize: 19 }}>{codeToFlag("NO")}</span> Norge
              </span>
              <span style={{ fontSize: 16, fontWeight: 900, color: played ? resColor : "var(--text3)", minWidth: 46, textAlign: "center", padding: "2px 9px", borderRadius: 8, background: "var(--bg2)" }}>
                {played ? node.score : "vs"}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 800, color: "var(--text1)" }}>
                {node.opponent} <span style={{ fontSize: 19 }}>{flagOf(node.opponent) || codeToFlag(node.oppCode) || "🏳️"}</span>
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
  const narrowBracket = useIsMobile(1024);
  const isMobile = useIsMobile();
  const secStyle = isMobile ? { ...S.fasitSection, padding: 13 } : S.fasitSection;
  const anyGroupData = GROUP_KEYS.some((g) => fasit.groups[g].first);
  const anyMatchData = Object.values(fasit.matches).some(Boolean);

  return (
    <div style={S.adminWrap}>
      {!anyGroupData && !anyMatchData ? (
        <div style={S.empty}>Resultatet er ikke lagt inn ennå.</div>
      ) : (
        <>
          {anyGroupData && (
            <div style={secStyle}>
              <div style={{ marginBottom: 12 }}><PatternSectionLabel theme={theme}>Gruppespill</PatternSectionLabel></div>
              <div style={isMobile ? { ...S.fasitGrid, gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 6 } : S.fasitGrid}>
                {GROUP_KEYS.map((g) => {
                  const { first, second } = fasit.groups[g];
                  if (!first && !second) return null;
                  return <GroupTableCard key={g} g={g} first={first} second={second} compact={isMobile} />;
                })}
              </div>
            </div>
          )}

          {anyMatchData && (
            <div style={secStyle}>
              <div style={{ marginBottom: 12 }}><PatternSectionLabel theme={theme}>Sluttspill</PatternSectionLabel></div>
              {narrowBracket
                ? <VerticalBracket
                    getSlot={id => fasit.matches?.[id] ?? null}
                    getBronse={() => fasit.bronse}
                    getFinale={() => fasit.finale} />
                : renderBracketHorizontal({
                    getSlot: id => fasit.matches?.[id] ?? null,
                    getBronse: () => fasit.bronse,
                    getFinale: () => fasit.finale,
                  })}
            </div>
          )}

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
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// FASIT — faktiske resultater
// ─────────────────────────────────────────────
function Fasit({ fasit, setFasit }) {
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
      let res;
      res = await fetchResultsFromAPI();
      setAiMsg("Hentet fra live-API ✓ Midlertidig stilling er oppdatert.");
      const merged = { ...fasit };
      if (res.groups) {
        for (const g of GROUP_KEYS) {
          if (res.groups[g]?.first) merged.groups[g].first = res.groups[g].first;
          if (res.groups[g]?.second) merged.groups[g].second = res.groups[g].second;
        }
      }
      if (Array.isArray(res.thirds)) {
        merged.thirds = merged.thirds.map((cur, i) => res.thirds[i] || cur);
      }
      if (res.matches) {
        for (const [m, v] of Object.entries(res.matches)) {
          if (v) merged.matches = { ...merged.matches, [m]: v };
        }
      }
      if (res.sfLosers) {
        for (const m of ["101", "102"]) if (res.sfLosers[m]) merged.sfLosers[m] = res.sfLosers[m];
      }
      if (res.bronse) merged.bronse = res.bronse;
      if (res.finale) merged.finale = res.finale;
      setFasit(merged);
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
          Henter live gruppe-standings og kampresultater direkte fra <b>worldcup26.ir</b> (gratis, ingen nøkkel).
          Viser <b>midlertidig stilling</b> selv om gruppen ikke er ferdigspilt.
          Trykk på nytt etter hver kampdag for å oppdatere. Quiz-resultat fylles inn manuelt.
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={runAI} disabled={aiState === "loading"} style={S.calcBtn}>
            {aiState === "loading" ? "Henter …" : "🔄 Oppdater resultater"}
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
        Når resultatet er oppdatert: gå til <b>Deltakere</b> og trykk «Beregn poeng fra resultat».
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
  const normalizedCeremony = normalizeCeremony(ceremony);
  const { phase, step } = normalizedCeremony;
  const bonusRevealed = Math.min(normalizedCeremony.bonusRevealed, participants.length);

  const finalBase = participants.map((p) => ({
    ...p, base: ROUNDS.reduce((s, r) => s + (p.scores[r.key] || 0), 0),
  }));
  const participantById = new Map(finalBase.map((p) => [p.id, p]));
  const syncedBonusOrder = normalizedCeremony.bonusOrder
    ?.map((id) => participantById.get(id))
    .filter(Boolean);
  const bonusOrder = syncedBonusOrder?.length === participants.length
    ? syncedBonusOrder
    : [...finalBase].sort((a, b) => (a.bonus || 0) - (b.bonus || 0));

  const next = () => {
    if (phase === "rounds") {
      if (step < ROUNDS.length - 1) setCeremony({ ...normalizedCeremony, step: step + 1 });
      else setCeremony({ ...normalizedCeremony, phase: "bonus", bonusRevealed: 0 });
    } else if (phase === "bonus") {
      if (bonusRevealed < participants.length) setCeremony({ ...normalizedCeremony, bonusRevealed: bonusRevealed + 1 });
      else setCeremony({ ...normalizedCeremony, phase: "winner", bonusRevealed: participants.length });
    }
  };
  const prev = () => {
    if (phase === "winner") setCeremony({ ...normalizedCeremony, phase: "bonus", bonusRevealed: participants.length });
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
  }, [isAdmin, phase, step, bonusRevealed, participants.length, onExit]);

  const phaseLabel = phase === "rounds" ? ROUNDS[step].label
    : phase === "bonus" ? `${BONUS_LABEL} (${bonusRevealed}/${participants.length})`
    : "Vinner!";

  return (
    <div style={S.presentWrap}>
      {phase === "rounds" && <BumpChart participants={participants} step={step} />}
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
              : phase === "bonus" && bonusRevealed === participants.length ? "Kår vinner ›"
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
  .voyage-waves { animation: voyageDrift 9s linear infinite; }
  @keyframes voyageDrift { from { transform: translateX(0); } to { transform: translateX(-32px); } }
  .voyage-bob { animation: voyageShipBob 3s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  @keyframes voyageShipBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-1.6px); } }
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
  }
  @media (prefers-reduced-motion: reduce) {
    .voyage-scene, .voyage-boat, .voyage-oar, .voyage-waves, .voyage-bob { animation: none !important; }
    .voyage-boat, .voyage-rail-progress { transition: none !important; }
    .bonus-pop, .bonus-star, .podium-rise, .confetti-piece, .ceremony-copy, .ceremony-prize-stage, .ceremony-prize-aura { animation: none !important; }
  }
`;
