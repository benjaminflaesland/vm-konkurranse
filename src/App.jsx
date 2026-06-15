import React, { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";

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
};

// FotMob-inspirert: mettede farger som popper mot helsvart bakgrunn
const PALETTE = [
  "#00DC64", "#3D7EF5", "#E8334A", "#F5A623", "#A855F7",
  "#06B6D4", "#F97316", "#84CC16", "#EC4899", "#14B8A6",
  "#8B5CF6", "#EAB308", "#3B82F6", "#10B981", "#F43F5E",
  "#6366F1", "#0EA5E9", "#D946EF", "#F59E0B", "#22C55E",
];

const STORAGE_KEY = "vm2026_ranking_data_v2";

async function saveData(data, adminPassword) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
  if (!adminPassword) return;
  try {
    await fetch("/.netlify/functions/data", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminPassword}`,
      },
      body: JSON.stringify(data),
    });
  } catch (e) { console.error("Kunne ikke lagre til server:", e); }
}

async function loadData() {
  try {
    const res = await fetch("/.netlify/functions/data");
    if (res.ok) {
      const d = await res.json();
      if (d?.participants) return d;
    }
  } catch {}
  try {
    const d = localStorage.getItem(STORAGE_KEY);
    return d ? JSON.parse(d) : null;
  } catch { return null; }
}

// ── Hjelpere ──
const norm = (s) =>
  String(s || "").toLowerCase().replace(/[^a-zæøåäöü0-9]/g, "");

const teamMatch = (a, b) => {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
};

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

  // Sluttspillrunder: vinner per kamp
  const rounds = [
    ["r16", CELLS.r16, POINTS.r16],
    ["r8", CELLS.r8, POINTS.r8],
    ["kvart", CELLS.kvart, POINTS.kvart],
  ];
  for (const [key, cellMap, pts] of rounds) {
    for (const m of Object.keys(cellMap)) {
      const f = fasit.matches?.[m];
      const p = picks.matches?.[m];
      if (f && teamMatch(p, f)) s[key] += pts;
    }
  }

  // Semifinaler: vinner + taper per kamp
  for (const m of ["101", "102"]) {
    const fw = fasit.matches?.[m], pw = picks.matches?.[m];
    if (fw && teamMatch(pw, fw)) s.semi += POINTS.semi;
    const fl = fasit.sfLosers?.[m], pl = picks.sfLosers?.[m];
    if (fl && teamMatch(pl, fl)) s.semi += POINTS.semi;
  }

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
  const [mode, setMode] = useState("deltakere");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const _d = loadData(); (() => { const d = _d;
      if (d?.participants) setParticipants(d.participants);
      if (d?.fasit) setFasit({ ...emptyFasit(), ...d.fasit });
      setLoaded(true);
    })();
  }, []);
  useEffect(() => {
    if (loaded) saveData({ participants, fasit });
  }, [participants, fasit, loaded]);

  if (!loaded) {
    return (
      <div style={{ ...S.app, alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>Laster …</div>
      </div>
    );
  }

  return (
    <div style={S.app}>
      <style>{CSS}</style>
      <header style={S.header}>
        <div style={S.logo}>
          <span style={S.ball}>⚽</span>
          <div>
            <div style={S.title}>VM 2026</div>
            <div style={S.subtitle}>Tippekonkurranse</div>
          </div>
        </div>
        <div style={S.modeToggle}>
          {[
            ["deltakere", "Deltakere"],
            ["fasit", "Fasit"],
            ["present", "Kåring"],
          ].map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)}
              disabled={m === "present" && participants.length < 2}
              style={{ ...S.modeBtn, ...(mode === m ? S.modeBtnActive : {}) }}>
              {label}
            </button>
          ))}
        </div>
      </header>

      {mode === "deltakere" && (
        <Deltakere participants={participants} setParticipants={setParticipants} fasit={fasit} />
      )}
      {mode === "fasit" && <Fasit fasit={fasit} setFasit={setFasit} />}
      {mode === "present" && <Present participants={participants} onExit={() => setMode("deltakere")} />}
    </div>
  );
}

// ─────────────────────────────────────────────
// DELTAKERE — import + manuell redigering
// ─────────────────────────────────────────────
function Deltakere({ participants, setParticipants, fasit }) {
  const [newName, setNewName] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const fileRef = useRef(null);

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
    setImportMsg("Poeng beregnet fra fasit ✓");
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
            <button onClick={calcAll} style={S.calcBtn}>⚡ Beregn poeng fra fasit</button>
          )}
          {importMsg && <span style={S.importMsg}>{importMsg}</span>}
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
          Poeng kan fylles inn manuelt eller beregnes automatisk fra fasit.
        </div>
      ) : (
        <div style={S.tableScroll}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={{ ...S.th, textAlign: "left", paddingLeft: 16 }}>Deltaker</th>
                {ROUNDS.map((r) => <th key={r.key} style={S.th}>{r.short}</th>)}
                <th style={{ ...S.th, color: "#F5A623" }}>Bonus</th>
                <th style={{ ...S.th, color: "#00DC64" }}>Sum</th>
                <th style={S.th}></th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => {
                const base = ROUNDS.reduce((s, r) => s + (p.scores[r.key] || 0), 0);
                return (
                  <tr key={p.id}>
                    <td style={{ ...S.td, textAlign: "left", paddingLeft: 16, fontWeight: 600, whiteSpace: "nowrap" }}>
                      <span style={{ ...S.dot, background: p.color }} />
                      {p.name}
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
                    <td style={{ ...S.td, fontWeight: 800, color: "#00DC64", fontSize: 16 }}>{base + (p.bonus || 0)}</td>
                    <td style={S.td}>
                      <button onClick={() => remove(p.id)} style={S.removeBtn} title="Fjern">✕</button>
                    </td>
                  </tr>
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
                <span style={{ flex: 1 }}>{p.name}</span>
                <span style={{ fontWeight: 800, color: "#00DC64" }}>{p.total} p</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// FASIT — faktiske resultater
// ─────────────────────────────────────────────
function Fasit({ fasit, setFasit }) {
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
        <div style={S.importTitle}>⚡ Live VM-resultater</div>
        <div style={S.importDesc}>
          Henter live gruppe-standings og kampresultater direkte fra <b>worldcup26.ir</b> (gratis, ingen nøkkel).
          Viser <b>midlertidig stilling</b> selv om gruppen ikke er ferdigspilt.
          Trykk på nytt etter hver kampdag for å oppdatere. Quiz-fasit fylles inn manuelt.
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={runAI} disabled={aiState === "loading"} style={S.calcBtn}>
            {aiState === "loading" ? "Henter …" : "🔄 Oppdater resultater"}
          </button>
          {aiMsg && (
            <span style={{ ...S.importMsg, color: aiState === "error" ? "#E8334A" : "#00DC64" }}>
              {aiMsg}
            </span>
          )}
        </div>
      </div>

      {/* Gruppespill */}
      <div style={S.fasitSection}>
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
      <div style={S.fasitSection}>
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
      <div style={S.fasitSection}>
        <div style={S.fasitSectionTitle}>16-delsfinaler <span style={S.pts}>({POINTS.r16} p per rett)</span></div>
        <div style={S.fasitGrid}>
          {Object.keys(CELLS.r16).map((m) => matchRow(m, `M${m}`))}
        </div>
      </div>
      <div style={S.fasitSection}>
        <div style={S.fasitSectionTitle}>8-delsfinaler <span style={S.pts}>({POINTS.r8} p per rett)</span></div>
        <div style={S.fasitGrid}>
          {Object.keys(CELLS.r8).map((m) => matchRow(m, `M${m}`))}
        </div>
      </div>
      <div style={S.fasitSection}>
        <div style={S.fasitSectionTitle}>Kvartfinaler <span style={S.pts}>({POINTS.kvart} p per rett)</span></div>
        <div style={S.fasitGrid}>
          {Object.keys(CELLS.kvart).map((m) => matchRow(m, `M${m}`))}
        </div>
      </div>
      <div style={S.fasitSection}>
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
      <div style={S.fasitSection}>
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
            <span style={S.fasitMatchLabel}>🏆 Mester</span>
            <input list="all-teams" value={fasit.finale}
              onChange={(e) => setFasit({ ...fasit, finale: e.target.value })}
              placeholder="Verdensmester" style={S.fasitInput} />
          </div>
        </div>
      </div>

      {/* Quiz */}
      <div style={S.fasitSection}>
        <div style={S.fasitSectionTitle}>VM-quiz fasit <span style={S.pts}>({POINTS.quiz} p per rett)</span></div>
        {QUIZ_QUESTIONS.map((q, i) => (
          <div key={i} style={{ ...S.fasitRow, marginBottom: 8 }}>
            <span style={{ ...S.fasitMatchLabel, width: "auto", flex: 1, whiteSpace: "normal" }}>{i + 1}. {q}</span>
            <input value={fasit.quiz[i]} onChange={(e) => setQuiz(i, e.target.value)}
              placeholder="Fasit" style={{ ...S.fasitInput, maxWidth: 180 }} />
          </div>
        ))}
      </div>

      <div style={{ ...S.importDesc, textAlign: "center", padding: "8px 0 24px" }}>
        Når fasiten er oppdatert: gå til <b>Deltakere</b> og trykk «⚡ Beregn poeng fra fasit».
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PRESENT
// ─────────────────────────────────────────────
function Present({ participants, onExit }) {
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState("rounds");
  const [bonusRevealed, setBonusRevealed] = useState(0);

  const finalBase = participants.map((p) => ({
    ...p, base: ROUNDS.reduce((s, r) => s + (p.scores[r.key] || 0), 0),
  }));
  const bonusOrder = [...finalBase].sort((a, b) => (a.bonus || 0) - (b.bonus || 0));

  const next = () => {
    if (phase === "rounds") {
      if (step < ROUNDS.length - 1) setStep(step + 1);
      else setPhase("bonus");
    } else if (phase === "bonus") {
      if (bonusRevealed < participants.length) setBonusRevealed(bonusRevealed + 1);
      else setPhase("winner");
    }
  };
  const prev = () => {
    if (phase === "winner") { setPhase("bonus"); setBonusRevealed(participants.length); }
    else if (phase === "bonus") {
      if (bonusRevealed > 0) setBonusRevealed(bonusRevealed - 1);
      else { setPhase("rounds"); setStep(ROUNDS.length - 1); }
    } else if (step > 0) setStep(step - 1);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      else if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div style={S.presentWrap}>
      {phase === "rounds" && <BumpChart participants={participants} step={step} />}
      {phase === "bonus" && (
        <BonusReveal finalBase={finalBase} bonusOrder={bonusOrder} revealed={bonusRevealed} />
      )}
      {phase === "winner" && <WinnerScreen finalBase={finalBase} />}

      <div style={S.presentNav}>
        <button onClick={prev} disabled={phase === "rounds" && step === 0} style={S.navBtn}>‹ Tilbake</button>
        <div style={S.phaseLabel}>
          {phase === "rounds" ? ROUNDS[step].label
            : phase === "bonus" ? `${BONUS_LABEL} (${bonusRevealed}/${participants.length})`
            : "Vinner!"}
        </div>
        <button onClick={next} disabled={phase === "winner"} style={{ ...S.navBtn, ...S.navBtnPrimary }}>
          {phase === "rounds" && step === ROUNDS.length - 1 ? "Bonusrunde ›"
            : phase === "bonus" && bonusRevealed === participants.length ? "Kår vinner ›"
            : "Neste ›"}
        </button>
      </div>
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
  const padL = 30, padR = 180, padT = 58, padB = 20;
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
            stroke="#2C2C2E" strokeWidth="1" />
        ))}

        {ROUNDS.map((r, i) => (
          <g key={r.key} opacity={i < visible ? 1 : 0.25} style={{ transition: "opacity .5s" }}>
            <text x={xFor(i)} y={34} fill={i === step ? "#fff" : "#8E8E93"}
              fontSize="14" fontWeight={i === step ? 800 : 600}
              textAnchor="middle" fontFamily="'Inter', sans-serif">
              {r.short}
            </text>
            {i === step && (
              <line x1={xFor(i) - 24} y1={44} x2={xFor(i) + 24} y2={44}
                stroke="#00DC64" strokeWidth="4" strokeLinecap="round" />
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
                  fill={isLast(i) ? p.color : "#1C1C1E"}
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
          const x = xFor(lastRoundIdx);
          const y = yFor(rankNow);
          const overallRank = finalRanking.findIndex((r) => r.id === p.id);
          return (
            <g key={p.id} style={{ transition: "all .7s ease" }}>
              <text x={x + 16} y={y + 5} fill="#fff" fontSize="15"
                fontWeight="700" fontFamily="'Inter', sans-serif">
                {p.name}
                <tspan fill="#8E8E93" fontSize="12" fontWeight="600" dx="6">#{overallRank + 1}</tspan>
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
        ⭐ {BONUS_LABEL} ⭐
        {justRevealed && (
          <span key={justRevealed.id} className="bonus-pop" style={S.bonusPop}>
            {justRevealed.name} +{justRevealed.bonus || 0}
          </span>
        )}
      </div>
      <div style={{ position: "relative", height: sorted.length * rowH + 8 }}>
        {sorted.map((p, i) => (
          <div key={p.id}
            style={{
              ...S.bonusRow, top: i * rowH, height: rowH - 7,
              borderLeft: `5px solid ${p.color}`,
              background: p.bonusShown ? "#2C2C2E" : "#000",
            }}>
            <span style={S.bonusRank}>{i + 1}</span>
            <span style={S.bonusName}>{p.name}</span>
            {p.bonusShown && (p.bonus || 0) > 0 && (
              <span className="bonus-star" style={S.bonusStar}>+{p.bonus} ⭐</span>
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
      <div style={S.winnerTitle}>🏆 {w?.name} 🏆</div>
      <div style={S.winnerSub}>Avdelingens fremste fotballekspert · {w?.total} poeng</div>
      {sorted.length > 3 && (
        <ol style={S.restList}>
          {sorted.slice(3).map((p, i) => (
            <li key={p.id} style={S.restItem}>
              <span style={S.restRank}>{i + 4}.</span>
              <span style={{ ...S.dot, background: p.color }} />
              <span style={{ flex: 1 }}>{p.name}</span>
              <span style={{ fontWeight: 800, color: "#00DC64" }}>{p.total} p</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Podium({ place, p, height, delay, winner }) {
  const medal = place === 1 ? "🥇" : place === 2 ? "🥈" : "🥉";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", animationDelay: `${delay}s` }}
      className="podium-rise">
      <div style={{ fontSize: 32, marginBottom: 4 }}>{medal}</div>
      <div style={{ fontWeight: 800, fontSize: winner ? 21 : 16, color: "#fff", marginBottom: 2, textAlign: "center" }}>
        {p.name}
      </div>
      <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 8 }}>{p.total} p</div>
      <div style={{
        width: 116, height, borderRadius: "10px 10px 0 0",
        background: `linear-gradient(180deg, ${p.color}, ${p.color}99)`,
        display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 8,
        boxShadow: winner ? `0 0 40px ${p.color}66` : "none",
      }}>
        <span style={{ fontSize: 38, fontWeight: 800, color: "#fff", opacity: 0.85 }}>{place}</span>
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
    background: "#000000",
    color: "#FFFFFF",
    fontFamily: "'Inter', system-ui, sans-serif",
    display: "flex", flexDirection: "column",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "16px 20px", background: "#000000",
    flexWrap: "wrap", gap: 10,
  },
  logo: { display: "flex", alignItems: "center", gap: 12 },
  ball: { fontSize: 28 },
  title: { fontSize: 24, fontWeight: 900, letterSpacing: -0.5, color: "#FFFFFF" },
  subtitle: { fontSize: 11, color: "#8E8E93", letterSpacing: 2, textTransform: "uppercase", fontWeight: 600 },
  modeToggle: { display: "flex", gap: 4, background: "#1C1C1E", padding: 5, borderRadius: 50 },
  modeBtn: {
    border: "none", background: "transparent", color: "#8E8E93",
    padding: "8px 16px", borderRadius: 50, cursor: "pointer", fontSize: 14, fontWeight: 700,
    transition: "all .2s",
  },
  modeBtnActive: { background: "#00DC64", color: "#000" },

  adminWrap: { padding: 16, maxWidth: 1100, margin: "0 auto", width: "100%", boxSizing: "border-box" },

  importCard: { background: "#1C1C1E", borderRadius: 16, padding: 18, marginBottom: 14 },
  importTitle: { fontSize: 17, fontWeight: 800, marginBottom: 6 },
  importDesc: { fontSize: 13.5, color: "#8E8E93", lineHeight: 1.6, marginBottom: 14 },
  fileBtn: {
    background: "#00DC64", color: "#000", padding: "12px 22px",
    borderRadius: 50, fontWeight: 800, fontSize: 14, cursor: "pointer", display: "inline-block",
  },
  calcBtn: {
    background: "#00DC64", color: "#000", border: "none", padding: "12px 22px",
    borderRadius: 50, fontWeight: 800, fontSize: 14, cursor: "pointer",
  },
  importMsg: { fontSize: 13.5, color: "#00DC64", fontWeight: 600 },

  addRow: { display: "flex", gap: 10, marginBottom: 16 },
  input: {
    flex: 1, background: "#1C1C1E", border: "1px solid #2C2C2E", color: "#fff",
    padding: "14px 16px", borderRadius: 14, fontSize: 15, outline: "none",
  },
  addBtn: {
    background: "#1C1C1E", color: "#00DC64", border: "1px solid #00DC64", padding: "14px 22px",
    borderRadius: 14, fontWeight: 800, fontSize: 15, cursor: "pointer",
  },
  empty: {
    textAlign: "center", color: "#8E8E93", padding: "60px 20px", fontSize: 15,
    background: "#1C1C1E", borderRadius: 16, lineHeight: 1.7,
  },
  tableScroll: { overflowX: "auto", borderRadius: 16, background: "#1C1C1E" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 720 },
  th: {
    padding: "14px 8px", fontSize: 11, color: "#8E8E93", textTransform: "uppercase",
    letterSpacing: 1, textAlign: "center", borderBottom: "1px solid #2C2C2E", fontWeight: 800,
  },
  td: { padding: "10px 8px", textAlign: "center", borderBottom: "1px solid #161618" },
  dot: { display: "inline-block", width: 10, height: 10, borderRadius: "50%", marginRight: 9, verticalAlign: "middle" },
  scoreInput: {
    width: 52, background: "#000", border: "1px solid #2C2C2E", color: "#fff",
    padding: "7px 4px", borderRadius: 8, fontSize: 14, textAlign: "center", outline: "none",
  },
  removeBtn: { background: "transparent", border: "none", color: "#48484A", cursor: "pointer", fontSize: 15 },
  previewBox: { marginTop: 16, background: "#1C1C1E", borderRadius: 16, padding: 18 },
  previewTitle: { fontSize: 11, color: "#8E8E93", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 14, fontWeight: 800 },
  previewItem: { display: "flex", alignItems: "center", gap: 8, padding: "11px 0", fontSize: 15, borderBottom: "1px solid #2C2C2E" },
  previewRank: { width: 28, color: "#8E8E93", fontWeight: 800 },

  // Fasit
  fasitSection: { background: "#1C1C1E", borderRadius: 16, padding: 18, marginBottom: 14 },
  fasitSectionTitle: { fontSize: 16, fontWeight: 800, marginBottom: 14 },
  pts: { fontSize: 12, color: "#8E8E93", fontWeight: 600 },
  fasitGrid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10,
  },
  fasitGroupCard: { background: "#000", borderRadius: 12, padding: 12 },
  fasitGroupName: { fontSize: 12, fontWeight: 800, color: "#8E8E93", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
  fasitSelect: {
    width: "100%", background: "#1C1C1E", border: "1px solid #2C2C2E", color: "#fff",
    padding: "9px 10px", borderRadius: 9, fontSize: 13.5, outline: "none", marginBottom: 6,
  },
  fasitRow: { display: "flex", alignItems: "center", gap: 8 },
  fasitMatchLabel: { width: 86, fontSize: 12.5, fontWeight: 700, color: "#8E8E93", flexShrink: 0 },
  fasitInput: {
    flex: 1, background: "#000", border: "1px solid #2C2C2E", color: "#fff",
    padding: "9px 10px", borderRadius: 9, fontSize: 13.5, outline: "none", minWidth: 0,
  },

  presentWrap: {
    flex: 1, display: "flex", flexDirection: "column", padding: 16,
    maxWidth: 1200, margin: "0 auto", width: "100%", boxSizing: "border-box",
  },
  chartCard: {
    flex: 1, background: "#1C1C1E", borderRadius: 20, padding: 18,
    display: "flex", flexDirection: "column", justifyContent: "center",
  },
  presentNav: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, gap: 12 },
  phaseLabel: { fontSize: 17, color: "#fff", fontWeight: 900, textAlign: "center" },
  navBtn: {
    background: "#1C1C1E", border: "1px solid #2C2C2E", color: "#fff",
    padding: "14px 20px", borderRadius: 50, cursor: "pointer", fontSize: 14, fontWeight: 700,
  },
  navBtnPrimary: { background: "#00DC64", color: "#000", border: "none" },

  bonusHeader: {
    fontSize: 24, color: "#fff", textAlign: "center", marginBottom: 22, fontWeight: 900,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap",
  },
  bonusPop: {
    background: "#00DC64", color: "#000", padding: "5px 16px", borderRadius: 50,
    fontSize: 15, fontWeight: 800,
  },
  bonusRow: {
    position: "absolute", left: 0, right: 0, display: "flex", alignItems: "center",
    gap: 12, padding: "0 16px", borderRadius: 12,
    transition: "top .8s cubic-bezier(.34,1.2,.64,1), background .4s",
    background: "#000",
  },
  bonusRank: { width: 28, fontWeight: 800, color: "#8E8E93", fontSize: 15 },
  bonusName: { flex: 1, fontSize: 16, fontWeight: 700, color: "#fff" },
  bonusStar: { color: "#F5A623", fontWeight: 800, fontSize: 14 },
  bonusScore: { fontSize: 20, fontWeight: 900, color: "#fff", minWidth: 44, textAlign: "right" },

  winnerCard: {
    flex: 1, background: "#1C1C1E", borderRadius: 20, padding: 24,
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    position: "relative", overflow: "hidden",
  },
  podiumWrap: { display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 16, marginBottom: 28, minHeight: 270 },
  winnerTitle: { fontSize: 30, fontWeight: 900, color: "#fff", textAlign: "center" },
  winnerSub: { fontSize: 14, color: "#8E8E93", marginTop: 6 },
  restList: { listStyle: "none", margin: "20px 0 0", padding: 0, width: "100%", maxWidth: 440 },
  restItem: { display: "flex", alignItems: "center", gap: 8, padding: "11px 0", fontSize: 15, borderBottom: "1px solid #2C2C2E" },
  restRank: { width: 28, color: "#8E8E93", fontWeight: 800 },

  confetti: { position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" },
};

const CSS = `
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
  input[type=number]::-webkit-inner-spin-button { opacity: .4; }
  select option { background: #1C1C1E; }
  @media (prefers-reduced-motion: reduce) {
    .bonus-pop, .bonus-star, .podium-rise, .confetti-piece { animation: none !important; }
  }
`;
