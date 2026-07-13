import { CELLS, GROUP_KEYS, canonicalTeam, isOfficialTeam } from "../../../shared/competition.js";

const ANSWER_SHEET_SIGNATURE = [
  ["A1", "gruppespill"],
  ["D1", "16-delsfinaler"],
  ["G1", "8-delsfinaler"],
  ["J1", "kvartfinaler"],
  ["M1", "semifinaler"],
  ["Q1", "bronsefinale"],
  ["T1", "finale"],
];

function matchupCellsForWinner(winnerCell) {
  const match = /^([A-Z])(\d+)$/.exec(winnerCell);
  if (!match) throw new Error(`Ugyldig Excel-celle: ${winnerCell}`);
  const [, winnerColumn, winnerRow] = match;
  const matchupColumn = String.fromCharCode(winnerColumn.charCodeAt(0) - 1);
  const row = Number(winnerRow);
  return [`${matchupColumn}${row - 1}`, `${matchupColumn}${row}`];
}

const winnerCellsByMatch = {
  ...CELLS.r16,
  ...CELLS.r8,
  ...CELLS.kvart,
  101: CELLS.semi[101].win,
  102: CELLS.semi[102].win,
  103: CELLS.bronse,
  104: CELLS.finale,
};

const matchupCells = Object.fromEntries(Object.entries(winnerCellsByMatch)
  .map(([matchId, winnerCell]) => [matchId, matchupCellsForWinner(winnerCell)]));

const normalizeExcelLabel = (value) => String(value || "")
  .replace(/\u00a0/g, " ")
  .trim()
  .toLowerCase()
  .replace(/\s+/g, " ");

export function readExcelCell(sheetData, address) {
  const match = /^([A-Z]+)(\d+)$/i.exec(address);
  if (!match) throw new Error(`Ugyldig Excel-celle: ${address}`);
  const column = match[1].toUpperCase().split("")
    .reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
  const row = Number(match[2]);
  const value = sheetData?.[row - 1]?.[column - 1];
  return value === undefined || value === null ? "" : String(value).trim();
}

function answerSheet(sheets) {
  const knockoutAddresses = [
    ...Object.values(CELLS.r16),
    ...Object.values(CELLS.r8),
    ...Object.values(CELLS.kvart),
    CELLS.semi[101].win,
    CELLS.semi[101].lose,
    CELLS.semi[102].win,
    CELLS.semi[102].lose,
    CELLS.bronse,
    CELLS.finale,
  ];
  const groupAddresses = [
    ...GROUP_KEYS.flatMap((group) => [CELLS.groups[group].first, CELLS.groups[group].second]),
    ...CELLS.thirds,
  ];
  let best = null;

  for (const sheetEntry of sheets) {
    const sheet = sheetEntry.data;
    const read = (address) => readExcelCell(sheet, address);
    const isTemplate = ANSWER_SHEET_SIGNATURE.every(([address, label]) =>
      normalizeExcelLabel(read(address)).startsWith(label));
    if (!isTemplate) continue;
    const score = knockoutAddresses.filter((address) => isOfficialTeam(read(address))).length * 3
      + groupAddresses.filter((address) => isOfficialTeam(read(address))).length;
    if (!best || score > best.score) best = { sheet, score };
  }

  if (!best) throw new Error("Fant ikke et VM 2026-svarark med riktig Excel-mal.");
  return best.sheet;
}

export function parseWorkbook(sheets, filename) {
  const sheet = answerSheet(sheets);
  const value = (address) => {
    const cell = readExcelCell(sheet, address);
    return cell === "0" ? "" : cell;
  };
  const team = (address) => canonicalTeam(value(address));
  const picks = {
    groups: {},
    thirds: [],
    matches: {},
    matchups: {},
    sfLosers: {},
    bronse: "",
    finale: "",
    quiz: [],
  };

  for (const group of GROUP_KEYS) {
    picks.groups[group] = { first: team(CELLS.groups[group].first), second: team(CELLS.groups[group].second) };
  }
  picks.thirds = CELLS.thirds.map(team);
  for (const [match, address] of Object.entries(CELLS.r16)) picks.matches[match] = team(address);
  for (const [match, address] of Object.entries(CELLS.r8)) picks.matches[match] = team(address);
  for (const [match, address] of Object.entries(CELLS.kvart)) picks.matches[match] = team(address);
  picks.matches["101"] = team(CELLS.semi[101].win);
  picks.matches["102"] = team(CELLS.semi[102].win);
  picks.sfLosers["101"] = team(CELLS.semi[101].lose);
  picks.sfLosers["102"] = team(CELLS.semi[102].lose);
  picks.bronse = team(CELLS.bronse);
  picks.finale = team(CELLS.finale);
  for (const [match, addresses] of Object.entries(matchupCells)) picks.matchups[match] = addresses.map(team);
  picks.quiz = CELLS.quiz.map(value);

  let name = filename.replace(/\.xlsx$/i, "");
  const dashIndex = name.lastIndexOf("-");
  if (dashIndex >= 0) name = name.slice(dashIndex + 1);
  name = name.replace(/_/g, " ").trim() || "Ukjent";
  return { name, picks };
}
