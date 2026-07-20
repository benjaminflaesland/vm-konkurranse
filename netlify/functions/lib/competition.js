export const GROUPS = {
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
export const GROUP_KEYS = Object.keys(GROUPS);

export const CELLS = {
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

export const POINTS = {
  group: 2, third: 2, r16: 3, r8: 3, kvart: 4, semi: 5, bronse: 5, finale: 10, quiz: 1,
  koBonus: 1, koBonusSemi: 2,
};

export const DEFAULT_QUIZ_RESULTS = [
  "5",
  "Kylian Mbappé",
  "10",
  "308",
  "Nei",
  "15",
  "Irak",
  "4",
  "Slovenia",
  "Ja",
];

const TEAM_NAME_MAP = {
  "south africa": "Sør Afrika", "south korea": "Sør Korea",
  "czechia": "Tsjekkia", "czech republic": "Tsjekkia",
  "mexico": "Mexico", "usa": "USA", "united states": "USA",
  "canada": "Canada", "brazil": "Brasil", "brasil": "Brasil",
  "morocco": "Marokko", "marocco": "Marokko", "scotland": "Skottland", "skotland": "Skottland", "haiti": "Haiti",
  "paraguay": "Paraguay", "australia": "Australia",
  "turkey": "Tyrkia", "turkiye": "Tyrkia", "türkiye": "Tyrkia",
  "germany": "Tyskland", "deutschland": "Tyskland",
  "curacao": "Curacao", "curaçao": "Curacao", "netherlands": "Nederland", "holland": "Nederland",
  "japan": "Japan", "sweden": "Sverige", "tunisia": "Tunisia",
  "belgium": "Belgia", "egypt": "Egypt", "iran": "Iran",
  "new zealand": "New Zealand", "spain": "Spania",
  "cape verde": "Kapp Verde", "saudi arabia": "Saudi Arabia",
  "uruguay": "Uruguay", "france": "Frankrike", "senegal": "Senegal",
  "iraq": "Irak", "norway": "Norge", "argentina": "Argentina",
  "algeria": "Algerie", "austria": "Østerrike", "jordan": "Jordan",
  "portugal": "Portugal", "congo": "Kongo", "dr congo": "Kongo", "congo dr": "Kongo",
  "democratic republic of the congo": "Kongo", "democratic republic of congo": "Kongo",
  "democratic republic congo": "Kongo", "drc": "Kongo", "rd congo": "Kongo",
  "uzbekistan": "Uzbekistan", "colombia": "Colombia",
  "england": "England", "croatia": "Kroatia", "ghana": "Ghana",
  "panama": "Panama", "ivory coast": "Elfenbenskysten",
  "côte d'ivoire": "Elfenbenskysten", "cote d'ivoire": "Elfenbenskysten",
  "ecuador": "Ecuador", "qatar": "Qatar", "switzerland": "Sveits",
  "bosnia": "Bosnia og Herzegovina",
  "bosnia and herzegovina": "Bosnia og Herzegovina",
};

const TEAM_CONJ = new Set(["og", "and", "the", "of"]);
const norm = (s) => String(s || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-zæøå0-9]/g, "");
const normWords = (s) => String(s || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .match(/[a-zæøå0-9]+/g) || [];
const normTeam = (s) =>
  String(s || "").replace(/\u00a0/g, " ").toLowerCase()
    .split(/[^a-zæøåäöü0-9]+/).filter((t) => t && !TEAM_CONJ.has(t)).join("");
const ALL_OFFICIAL_TEAMS = [...new Set(Object.values(GROUPS).flat())];
const CANON_LOOKUP = (() => {
  const m = {};
  for (const t of ALL_OFFICIAL_TEAMS) m[normTeam(t)] = t;
  for (const [from, to] of Object.entries(TEAM_NAME_MAP)) {
    const key = normTeam(from);
    if (!m[key]) m[key] = to;
  }
  return m;
})();

export function canonicalTeam(name) {
  const clean = String(name || "").replace(/\u00a0/g, " ").trim();
  if (!clean) return "";
  const key = normTeam(clean);
  if (CANON_LOOKUP[key]) return CANON_LOOKUP[key];
  if (key.length >= 4) {
    for (const t of ALL_OFFICIAL_TEAMS) {
      const tk = normTeam(t);
      if (tk.includes(key) || key.includes(tk)) return t;
    }
  }
  return clean;
}

export function isOfficialTeam(name) {
  const key = normTeam(name);
  return Boolean(key && CANON_LOOKUP[key]);
}

export function quizAnswerMatches(actual, pick, index) {
  if (!actual || !pick) return false;
  if (index === 3) {
    const actualGoals = parseInt(String(actual).replace(/\D/g, ""), 10);
    const pickedGoals = parseInt(String(pick).replace(/\D/g, ""), 10);
    return Number.isFinite(actualGoals) && Number.isFinite(pickedGoals) && Math.abs(actualGoals - pickedGoals) <= 5;
  }
  if (norm(actual) === norm(pick)) return true;
  if (index !== 1) return false;
  const actualWords = normWords(actual);
  const pickedWords = normWords(pick);
  return actualWords.length > 0
    && pickedWords.length > 0
    && actualWords[actualWords.length - 1] === pickedWords[pickedWords.length - 1];
}

export function rankByScore(items, getScore = (item) => item.total) {
  let previousScore = null;
  let currentRank = 0;
  return [...(items || [])]
    .sort((a, b) => {
      const scoreDifference = (Number(getScore(b)) || 0) - (Number(getScore(a)) || 0);
      if (scoreDifference) return scoreDifference;
      const nameDifference = String(a?.name || "").localeCompare(String(b?.name || ""), "nb-NO");
      return nameDifference || String(a?.id || "").localeCompare(String(b?.id || ""), "nb-NO");
    })
    .map((item, index) => {
      const score = Number(getScore(item)) || 0;
      if (index === 0 || score !== previousScore) currentRank = index + 1;
      previousScore = score;
      return { ...item, rank: currentRank };
    });
}

export function toNorwegian(name) {
  const cleanName = String(name || "").replace(/\u00a0/g, " ").trim();
  return TEAM_NAME_MAP[cleanName.toLowerCase()] || canonicalTeam(cleanName);
}

export function firstNumber(...values) {
  for (const value of values) {
    const n = parseInt(value, 10);
    if (!isNaN(n)) return n;
  }
  return NaN;
}

export function teamMatch(a, b) {
  if (!a || !b) return false;
  const ca = canonicalTeam(a), cb = canonicalTeam(b);
  if (ca === cb) return true;
  const na = norm(ca), nb = norm(cb);
  return !!na && !!nb && (na === nb || na.includes(nb) || nb.includes(na));
}

export function classifyRound(preds, actuals) {
  const status = preds.map(() => "miss");
  const usedActual = new Set();
  preds.forEach((p, i) => {
    if (p && actuals[i] && teamMatch(p, actuals[i])) {
      status[i] = "hit";
      usedActual.add(i);
    }
  });
  preds.forEach((p, i) => {
    if (status[i] === "hit" || !p) return;
    const j = actuals.findIndex((a, k) => a && !usedActual.has(k) && teamMatch(p, a));
    if (j >= 0) {
      status[i] = "bonus";
      usedActual.add(j);
    }
  });
  return status;
}

export function emptyFasit() {
  return {
    groups: Object.fromEntries(GROUP_KEYS.map((g) => [g, { first: "", second: "" }])),
    thirds: Array(8).fill(""),
    matches: {},
    matchups: {},
    sfLosers: { 101: "", 102: "" },
    bronse: "",
    finale: "",
    quiz: Array(10).fill(""),
  };
}

export function mergeLiveResults(currentFasit, liveResults) {
  const base = { ...emptyFasit(), ...(currentFasit || {}) };
  const merged = {
    ...base,
    groups: Object.fromEntries(GROUP_KEYS.map((g) => [g, { ...(base.groups?.[g] || {}) }])),
    thirds: [...(base.thirds || [])],
    matches: { ...(base.matches || {}) },
    matchups: { ...(base.matchups || {}) },
    sfLosers: { ...(base.sfLosers || {}) },
    quiz: [...(base.quiz || [])],
  };

  if (liveResults?.groups) {
    for (const g of GROUP_KEYS) {
      if (liveResults.groups[g]?.first) merged.groups[g].first = liveResults.groups[g].first;
      if (liveResults.groups[g]?.second) merged.groups[g].second = liveResults.groups[g].second;
    }
  }
  if (Array.isArray(liveResults?.thirds)) {
    merged.thirds = merged.thirds.map((cur, i) => liveResults.thirds[i] || cur);
  }
  if (liveResults?.matches) {
    for (const [m, winner] of Object.entries(liveResults.matches)) {
      if (winner) merged.matches[m] = winner;
    }
  }
  if (liveResults?.matchups) {
    for (const [m, teams] of Object.entries(liveResults.matchups)) {
      if (Array.isArray(teams) && teams.some(Boolean)) merged.matchups[m] = teams.slice(0, 2);
    }
  }
  if (liveResults?.sfLosers) {
    for (const m of ["101", "102"]) {
      if (liveResults.sfLosers[m]) merged.sfLosers[m] = liveResults.sfLosers[m];
    }
  }
  if (liveResults?.bronse) merged.bronse = liveResults.bronse;
  if (liveResults?.finale) merged.finale = liveResults.finale;
  return merged;
}

export function liveResultsSignature(fasit) {
  const f = { ...emptyFasit(), ...(fasit || {}) };
  const matches = {};
  for (const key of Object.keys(f.matches || {}).sort((a, b) => Number(a) - Number(b))) {
    matches[key] = f.matches[key] || "";
  }
  const matchups = {};
  for (const key of Object.keys(f.matchups || {}).sort((a, b) => Number(a) - Number(b))) {
    const pair = Array.isArray(f.matchups[key]) ? f.matchups[key] : [];
    matchups[key] = [pair[0] || "", pair[1] || ""];
  }
  return JSON.stringify({
    groups: Object.fromEntries(GROUP_KEYS.map((g) => [g, {
      first: f.groups?.[g]?.first || "",
      second: f.groups?.[g]?.second || "",
    }])),
    thirds: (f.thirds || []).map((v) => v || ""),
    matches,
    matchups,
    sfLosers: {
      101: f.sfLosers?.[101] || "",
      102: f.sfLosers?.[102] || "",
    },
    bronse: f.bronse || "",
    finale: f.finale || "",
  });
}

export function computeScores(picks, fasit) {
  const s = { gruppe: 0, r16: 0, r8: 0, kvart: 0, semi: 0, bronse_finale: 0, bonus: 0 };
  if (!picks) return s;

  for (const g of GROUP_KEYS) {
    const f = fasit.groups[g] || {};
    const p = picks.groups?.[g] || {};
    if (f.first && teamMatch(p.first, f.first)) s.gruppe += POINTS.group;
    if (f.second && teamMatch(p.second, f.second)) s.gruppe += POINTS.group;
  }

  const fThirds = (fasit.thirds || []).filter(Boolean);
  const pThirds = (picks.thirds || []).filter(Boolean);
  const used = new Set();
  for (const pt of pThirds) {
    const hit = fThirds.findIndex((ft, i) => !used.has(i) && teamMatch(pt, ft));
    if (hit >= 0) {
      used.add(hit);
      s.gruppe += POINTS.third;
    }
  }

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

  const sf = ["101", "102"];
  addRound("semi", sf.map((m) => picks.matches?.[m]), sf.map((m) => fasit.matches?.[m]), POINTS.semi, POINTS.koBonusSemi);
  addRound("semi", sf.map((m) => picks.sfLosers?.[m]), sf.map((m) => fasit.sfLosers?.[m]), POINTS.semi, POINTS.koBonusSemi);

  if (fasit.bronse && teamMatch(picks.bronse, fasit.bronse)) s.bronse_finale += POINTS.bronse;
  if (fasit.finale && teamMatch(picks.finale, fasit.finale)) s.bronse_finale += POINTS.finale;

  for (let i = 0; i < 10; i++) {
    const f = fasit.quiz?.[i], p = picks.quiz?.[i];
    if (!f || !p) continue;
    if (quizAnswerMatches(f, p, i)) s.bonus += POINTS.quiz;
  }
  return s;
}

export function recalculateParticipantScores(participants, fasit) {
  return (participants || []).map((p) => {
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
  });
}

export function buildLiveFasitFromFeeds({ teamsData, groupsData, gamesData }) {
  const result = emptyFasit();
  const teamMap = {};
  for (const t of (teamsData?.teams || [])) {
    teamMap[String(t.id)] = toNorwegian(t.name_en);
  }

  const cmpStandings = (a, b) =>
    (parseInt(b.pts) || 0) - (parseInt(a.pts) || 0) ||
    (parseInt(b.gd) || 0) - (parseInt(a.gd) || 0) ||
    (parseInt(b.gf) || 0) - (parseInt(a.gf) || 0);
  const thirdPlaced = [];
  for (const g of (groupsData?.groups || [])) {
    const letter = (g.name || "").toUpperCase();
    if (!GROUP_KEYS.includes(letter)) continue;
    const teams = [...(g.teams || [])].sort(cmpStandings);
    if (teams[0]) result.groups[letter].first = teamMap[teams[0].team_id] || "";
    if (teams[1]) result.groups[letter].second = teamMap[teams[1].team_id] || "";
    if (teams[2]) thirdPlaced.push(teams[2]);
  }

  result.thirds = thirdPlaced.sort(cmpStandings).slice(0, 8).map((t) => teamMap[t.team_id] || "");
  while (result.thirds.length < 8) result.thirds.push("");

  for (const g of (gamesData?.games || [])) {
    const mn = parseInt(g.id, 10);
    if (!mn) continue;
    const home = toNorwegian(g.home_team_name_en || "");
    const away = toNorwegian(g.away_team_name_en || "");
    if (mn >= 73 && mn <= 88 && (home || away)) {
      result.matchups[String(mn)] = [home, away];
    }

    if (!isFinishedGame(g)) continue;
    const homeScore = firstNumber(g.home_score);
    const awayScore = firstNumber(g.away_score);
    if (isNaN(homeScore) || isNaN(awayScore)) continue;
    let homeWon = homeScore > awayScore;
    if (homeScore === awayScore) {
      const homePenalty = firstNumber(g.home_penalty_score, g.home_penalties, g.home_penalty, g.penalty_home_score);
      const awayPenalty = firstNumber(g.away_penalty_score, g.away_penalties, g.away_penalty, g.penalty_away_score);
      if (isNaN(homePenalty) || isNaN(awayPenalty) || homePenalty === awayPenalty) continue;
      homeWon = homePenalty > awayPenalty;
    }

    const winner = homeWon ? home : away;
    const loser = homeWon ? away : home;
    if (mn >= 73 && mn <= 102) {
      result.matches[String(mn)] = winner;
      if (mn === 101 || mn === 102) result.sfLosers[String(mn)] = loser;
    } else if (mn === 103) result.bronse = winner;
    else if (mn === 104) result.finale = winner;
  }

  return result;
}

export function isFinishedGame(game) {
  return String(game?.finished || "").toUpperCase() === "TRUE";
}

export function finishedGamesSignature(gamesData) {
  const finished = (gamesData?.games || [])
    .filter(isFinishedGame)
    .map((game) => ({
      id: String(game.id || ""),
      home: String(game.home_team_id || game.home_team_name_en || ""),
      away: String(game.away_team_id || game.away_team_name_en || ""),
      homeScore: String(game.home_score ?? ""),
      awayScore: String(game.away_score ?? ""),
      homePenalty: String(game.home_penalty_score ?? game.home_penalties ?? game.home_penalty ?? game.penalty_home_score ?? ""),
      awayPenalty: String(game.away_penalty_score ?? game.away_penalties ?? game.away_penalty ?? game.penalty_away_score ?? ""),
    }))
    .sort((a, b) => Number(a.id) - Number(b.id));
  return finished.length ? JSON.stringify(finished) : "";
}
