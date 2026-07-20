import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function envelope(name, revision = "r1") {
  return {
    data: {
      participants: [{ id: "original", name, color: "#123456", scores: {}, bonus: 0, picks: null, excluded: false }],
      fasit: { groups: {}, thirds: [], matches: {}, matchups: {}, sfLosers: {}, bronse: "", finale: "", quiz: [] },
      settings: { ceremonyUnlocked: false, ceremony: { phase: "rounds", step: 0, bonusRevealed: 0 } },
    },
    revision,
    updatedAt: "2026-07-13T12:00:00.000Z",
  };
}

async function renderAdmin(fetchMock) {
  vi.stubGlobal("fetch", fetchMock);
  const { default: App } = await import("../src/App.jsx");
  render(<App />);
  await screen.findByRole("button", { name: "Deltakere" });
}

describe("admin hydration and persistence", () => {
  beforeEach(() => {
    vi.stubEnv("DEV", false);
    vi.resetModules();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("lagrer aldri under hydrering og samler raske endringer i ett snapshot", async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url.endsWith("/auth") && !options.method) return response(200, { authenticated: true });
      if (url.endsWith("/data") && !options.method) return response(200, envelope("Admin Person"));
      if (url.endsWith("/data") && options.method === "POST") return response(200, { ok: true, revision: "r2" });
      throw new Error(`Uventet kall: ${url}`);
    });
    await renderAdmin(fetchMock);
    expect(screen.getByRole("navigation", { name: "Hovednavigasjon" }).querySelectorAll(".nav-icon")).toHaveLength(7);
    expect(fetchMock.mock.calls.filter(([url, options = {}]) => url.endsWith("/data") && options.method === "POST")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Deltakere" }));
    const input = await screen.findByPlaceholderText("Legg til deltaker manuelt");
    fireEvent.change(input, { target: { value: "Lokal En" } });
    fireEvent.click(screen.getByRole("button", { name: "Legg til" }));
    fireEvent.change(input, { target: { value: "Lokal To" } });
    fireEvent.click(screen.getByRole("button", { name: "Legg til" }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([url, options = {}]) => url.endsWith("/data") && options.method === "POST")).toHaveLength(1);
    }, { timeout: 2000 });
    const saveCall = fetchMock.mock.calls.find(([url, options = {}]) => url.endsWith("/data") && options.method === "POST");
    const saved = JSON.parse(saveCall[1].body);
    expect(saved.data.participants.map((participant) => participant.name)).toEqual(["Admin Person", "Lokal En", "Lokal To"]);
  });

  it("beholder lokale endringer synlige når lagring feiler", async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url.endsWith("/auth") && !options.method) return response(200, { authenticated: true });
      if (url.endsWith("/data") && !options.method) return response(200, envelope("Admin Person"));
      if (url.endsWith("/data") && options.method === "POST") return response(503, { error: "Lager nede" });
      throw new Error(`Uventet kall: ${url}`);
    });
    await renderAdmin(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Deltakere" }));
    fireEvent.change(await screen.findByPlaceholderText("Legg til deltaker manuelt"), { target: { value: "Ikke mist meg" } });
    fireEvent.click(screen.getByRole("button", { name: "Legg til" }));
    expect(await screen.findAllByText("Ikke")).not.toHaveLength(0);
    expect(await screen.findByText(/Lagring feilet/, {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getAllByText("Ikke")).not.toHaveLength(0);
    const failedSave = fetchMock.mock.calls.find(([url, options = {}]) => url.endsWith("/data") && options.method === "POST");
    expect(JSON.parse(failedSave[1].body).data.participants.at(-1).name).toBe("Ikke mist meg");
  });

  it("tømmer adminvisningen og hydrerer offentlig data ved logout", async () => {
    let dataReads = 0;
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url.endsWith("/auth") && !options.method) return response(200, { authenticated: true });
      if (url.endsWith("/auth") && options.method === "DELETE") return response(204, {});
      if (url.endsWith("/data") && !options.method) {
        dataReads += 1;
        return response(200, dataReads === 1 ? envelope("Admin Hemmelig") : envelope("Offentlig Person", "r2"));
      }
      throw new Error(`Uventet kall: ${url}`);
    });
    await renderAdmin(fetchMock);
    fireEvent.click(screen.getByTitle("Lås siden"));
    await screen.findByText("Offentlig");
    expect(screen.queryByRole("button", { name: "Deltakere" })).not.toBeInTheDocument();
    expect(screen.queryByText("Admin Hemmelig")).not.toBeInTheDocument();
    expect(screen.getByText("Offentlig")).toBeInTheDocument();
  });
});
