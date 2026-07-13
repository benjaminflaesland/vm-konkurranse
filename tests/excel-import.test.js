import { describe, expect, it } from "vitest";
import { parseWorkbook, readExcelCell } from "../src/features/import/parse-workbook.js";

function addressToPosition(address) {
  const [, letters, row] = /^([A-Z]+)(\d+)$/.exec(address);
  const column = letters.split("").reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
  return [Number(row) - 1, column - 1];
}

function setCell(rows, address, value) {
  const [row, column] = addressToPosition(address);
  rows[row] ||= [];
  rows[row][column] = value;
}

describe("Excel import adapter", () => {
  it("leser celleadresser fra 2D-data", () => {
    const rows = [["A1", "B1"], ["A2", 42]];
    expect(readExcelCell(rows, "B2")).toBe("42");
  });

  it("finner riktig svarark og konverterer tips", () => {
    const cover = [["Instruksjoner"]];
    const answers = [];
    for (const [address, label] of [
      ["A1", "Gruppespill"], ["D1", "16-delsfinaler"], ["G1", "8-delsfinaler"],
      ["J1", "Kvartfinaler"], ["M1", "Semifinaler"], ["Q1", "Bronsefinale"], ["T1", "Finale"],
    ]) setCell(answers, address, label);
    setCell(answers, "B4", "Mexico");
    setCell(answers, "B6", "South Africa");
    setCell(answers, "E5", "türkiye");
    setCell(answers, "U35", "Côte d'Ivoire");
    setCell(answers, "J83", "3");

    const result = parseWorkbook([
      { sheet: "Forside", data: cover },
      { sheet: "Svar", data: answers },
    ], "Fotball_VM_2026_konkurranse_-_Ada_Lovelace.xlsx");

    expect(result.name).toBe("Ada Lovelace");
    expect(result.picks.groups.A).toEqual({ first: "Mexico", second: "Sør Afrika" });
    expect(result.picks.matches[73]).toBe("Tyrkia");
    expect(result.picks.finale).toBe("Elfenbenskysten");
    expect(result.picks.quiz[0]).toBe("3");
  });
});
