import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function winnerEnvelope() {
  return {
    data: {
      participants: [{
        id: "ada",
        name: "Ada Nordmann",
        color: "#00DC64",
        scores: { gruppe: 0, r16: 0, r8: 0, kvart: 0, semi: 0, bronse_finale: 0 },
        bonus: 1,
        excluded: false,
        picks: {
          groups: {}, thirds: [], matches: {}, matchups: {}, sfLosers: {}, bronse: "", finale: "",
          quiz: ["3", "Mbappe", "Haaland"],
        },
      }],
      fasit: {
        groups: Object.fromEntries("ABCDEFGHIJKL".split("").map((group) => [group, { first: "", second: "" }])),
        thirds: [], matches: {}, matchups: {}, sfLosers: {}, bronse: "", finale: "",
        quiz: ["3", "Kylian Mbappé", "Ronaldo"],
      },
      settings: {
        ceremonyUnlocked: true,
        ceremonyReleaseId: "release-quiz-test",
        ceremony: { phase: "rounds", step: 0, bonusRevealed: 0 },
      },
    },
    revision: "r1",
  };
}

describe("offentlig VM-quizfasit", () => {
  beforeEach(() => {
    vi.stubEnv("DEV", false);
    vi.resetModules();
    localStorage.clear();
    localStorage.setItem("vm2026_last_public_mode", "fasit-view");
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("åpner en selvstyrt popup og viser quizen etter at den lukkes", async () => {
    const publicEnvelope = winnerEnvelope();
    publicEnvelope.data.participants.push({
      ...publicEnvelope.data.participants[0],
      id: "bea",
      name: "Bea Nordmann",
      color: "#3D7EF5",
    });
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (url.endsWith("/auth")) return response(200, { authenticated: false });
      if (url.endsWith("/data")) return response(200, publicEnvelope);
      throw new Error(`Uventet kall: ${url}`);
    }));

    const { default: App } = await import("../src/App.jsx");
    render(<App />);

    const ceremonyDialog = await screen.findByRole("dialog", { name: "VM-kåring" });
    expect(await within(ceremonyDialog).findByRole("heading", { name: "Hvem tok pokalen?" })).toBeInTheDocument();
    expect(within(ceremonyDialog).queryByRole("button", { name: "Neste ›" })).not.toBeInTheDocument();
    fireEvent.click(within(ceremonyDialog).getByRole("button", { name: "Start kåringen" }));
    const nextButton = await within(ceremonyDialog).findByRole("button", { name: "Neste ›" });
    fireEvent.click(nextButton);
    expect(within(ceremonyDialog).getByRole("heading", { name: "16-delsfinalene" })).toBeInTheDocument();
    expect(within(ceremonyDialog).queryByText("16-delsfinaler")).not.toBeInTheDocument();
    expect(within(ceremonyDialog).getAllByText("#1 · 0 p")).toHaveLength(2);
    expect(ceremonyDialog.querySelectorAll(".ceremony-leader-crown")).toHaveLength(2);
    fireEvent.click(within(ceremonyDialog).getByRole("button", { name: "Lukk kåringen" }));
    expect(screen.queryByRole("dialog", { name: "VM-kåring" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Kåring" }));
    expect(screen.queryByRole("dialog", { name: "VM-kåring" })).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "16-delsfinalene" })).toBeInTheDocument();
    expect(document.querySelector(".ceremony-present--standalone")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Resultat" }));
    expect(await screen.findByText("VM-quiz fasit")).toBeInTheDocument();
    expect(screen.getByText("Kylian Mbappé")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Stilling" }));
    const participantRow = await screen.findByRole("button", { name: /Ada/ });
    const tiedParticipantRow = await screen.findByRole("button", { name: /Bea/ });
    expect(participantRow).toHaveTextContent(/^1/);
    expect(tiedParticipantRow).toHaveTextContent(/^1/);
    fireEvent.click(participantRow);

    const quizHeading = await screen.findByText("VM-quiz");
    const quizSection = quizHeading.parentElement?.parentElement;
    expect(quizSection).toBeTruthy();
    expect(within(quizSection).getAllByText("Rett · +1 p")).toHaveLength(2);
    expect(within(quizSection).getByText("Bom")).toBeInTheDocument();
    expect(within(quizSection).getAllByText(/Tips:/)).toHaveLength(3);
    expect(within(quizSection).getAllByText(/Fasit:/)).toHaveLength(3);
  });

  it("lar admin publisere en ny kåring med en egen utgivelses-id", async () => {
    const adminEnvelope = winnerEnvelope();
    adminEnvelope.data.participants.push({
      ...adminEnvelope.data.participants[0],
      id: "bea",
      name: "Bea Nordmann",
      color: "#3D7EF5",
    });
    adminEnvelope.data.participants[0].bonus = 99;
    adminEnvelope.data.settings = {
      ceremonyUnlocked: false,
      ceremonyReleaseId: null,
      ceremony: { phase: "rounds", step: 0, bonusRevealed: 0 },
    };

    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url.endsWith("/auth")) return response(200, { authenticated: true });
      if (url.endsWith("/data") && !options.method) return response(200, adminEnvelope);
      if (url.endsWith("/data") && options.method === "POST") return response(200, { ok: true, revision: "r2" });
      throw new Error(`Uventet kall: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { default: App } = await import("../src/App.jsx");
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Rediger resultat" }));
    const quizInputs = await screen.findAllByPlaceholderText("Resultat");
    fireEvent.change(quizInputs[0], { target: { value: "5" } });
    const saveButton = screen.getByRole("button", { name: "Lagre endringer" });
    expect(saveButton).toBeInTheDocument();
    fireEvent.click(saveButton);
    await waitFor(() => {
      const quizSaveCall = fetchMock.mock.calls.find(([, options = {}]) => {
        if (options.method !== "POST") return false;
        return JSON.parse(options.body).data.fasit.quiz[0] === "5";
      });
      expect(quizSaveCall).toBeTruthy();
      expect(JSON.parse(quizSaveCall[1].body).data.participants[0].bonus).toBe(1);
      expect(screen.queryByRole("button", { name: "Lagre endringer" })).not.toBeInTheDocument();
    });
    fireEvent.click(await screen.findByRole("button", { name: "Kåring" }));
    fireEvent.click(screen.getByRole("button", { name: "Gjør kåring tilgjengelig" }));

    await waitFor(() => {
      const saveCall = fetchMock.mock.calls.find(([, options = {}]) => {
        if (options.method !== "POST") return false;
        return JSON.parse(options.body).data.settings.ceremonyUnlocked === true;
      });
      expect(saveCall).toBeTruthy();
      const saved = JSON.parse(saveCall[1].body).data.settings;
      expect(saved.ceremonyUnlocked).toBe(true);
      expect(saved.ceremonyReleaseId).toMatch(/^\d+$/);
      expect(saved.ceremony).toMatchObject({ phase: "rounds", step: 0, bonusRevealed: 0 });
    }, { timeout: 2000 });
  });

  it("avslører seksten bonusresultater i puljer på fire", async () => {
    const publicEnvelope = winnerEnvelope();
    publicEnvelope.data.participants = Array.from({ length: 16 }, (_, index) => ({
      ...publicEnvelope.data.participants[0],
      id: `participant-${index + 1}`,
      name: `Deltaker ${index + 1}`,
    }));
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (url.endsWith("/auth")) return response(200, { authenticated: false });
      if (url.endsWith("/data")) return response(200, publicEnvelope);
      throw new Error(`Uventet kall: ${url}`);
    }));

    const { default: App } = await import("../src/App.jsx");
    render(<App />);

    const ceremonyDialog = await screen.findByRole("dialog", { name: "VM-kåring" });
    fireEvent.click(await within(ceremonyDialog).findByRole("button", { name: "Start kåringen" }));
    for (let index = 0; index < 3; index += 1) {
      fireEvent.click(within(ceremonyDialog).getByRole("button", { name: "Neste ›" }));
    }
    const guideEnd = Number(ceremonyDialog.querySelector(".ceremony-rank-guide")?.getAttribute("x2"));
    const activeNodeCenter = Number(ceremonyDialog.querySelector(".ceremony-active-node")?.getAttribute("cx"));
    const firstLabelStart = Number(ceremonyDialog.querySelector(".ceremony-participant-label")?.getAttribute("x"));
    expect(guideEnd).toBe(activeNodeCenter);
    expect(guideEnd).toBeLessThan(firstLabelStart);
    for (let index = 0; index < 2; index += 1) {
      fireEvent.click(within(ceremonyDialog).getByRole("button", { name: "Neste ›" }));
    }
    fireEvent.click(within(ceremonyDialog).getByRole("button", { name: "Bonusrunde ›" }));

    expect(within(ceremonyDialog).getByText("Bonusspørsmål (0/16)")).toBeInTheDocument();
    fireEvent.click(within(ceremonyDialog).getByRole("button", { name: "Vis neste 4 ›" }));
    expect(within(ceremonyDialog).getByText("Bonusspørsmål (4/16)")).toBeInTheDocument();
    expect(ceremonyDialog.querySelectorAll(".ceremony-bonus-reveal-item")).toHaveLength(4);
    fireEvent.click(within(ceremonyDialog).getByRole("button", { name: "Vis neste 4 ›" }));
    expect(within(ceremonyDialog).getByText("Bonusspørsmål (8/16)")).toBeInTheDocument();
    fireEvent.click(within(ceremonyDialog).getByRole("button", { name: "‹ Tilbake" }));
    expect(within(ceremonyDialog).getByText("Bonusspørsmål (4/16)")).toBeInTheDocument();
    for (let index = 0; index < 3; index += 1) {
      fireEvent.click(within(ceremonyDialog).getByRole("button", { name: "Vis neste 4 ›" }));
    }
    fireEvent.click(within(ceremonyDialog).getByRole("button", { name: "Kår vinner ›" }));
    expect(within(ceremonyDialog).getByText("Vinner!")).toBeInTheDocument();
    expect(within(ceremonyDialog).getByText("16 delte vinnere")).toBeInTheDocument();
    expect(within(ceremonyDialog).getByText("Deler førsteplassen · 1 poeng hver")).toBeInTheDocument();
    expect(ceremonyDialog.querySelector(".ceremony-winner-card")?.style.justifyContent).toBe("flex-start");
    expect(ceremonyDialog.querySelector(".ceremony-winner-card")?.style.overflowY).toBe("auto");
    expect(ceremonyDialog.querySelector(".ceremony-winner-rest")?.style.gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))");
    expect(within(ceremonyDialog).queryByRole("button", { name: "Neste ›" })).not.toBeInTheDocument();
    expect(within(ceremonyDialog).queryByRole("button", { name: "Kår vinner ›" })).not.toBeInTheDocument();
  });

  it("holder navigasjon og deltakernavn innenfor mobilvisningen", async () => {
    vi.stubGlobal("matchMedia", vi.fn((query) => ({
      matches: query.includes("max-width"),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })));
    const publicEnvelope = winnerEnvelope();
    publicEnvelope.data.participants = Array.from({ length: 13 }, (_, index) => ({
      ...publicEnvelope.data.participants[0],
      id: `mobile-participant-${index + 1}`,
      name: index === 0 ? "Ekstremtlangtdeltakernavn Nordmann" : `Deltaker${index + 1} Nordmann`,
    }));
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (url.endsWith("/auth")) return response(200, { authenticated: false });
      if (url.endsWith("/data")) return response(200, publicEnvelope);
      throw new Error(`Uventet kall: ${url}`);
    }));

    const { default: App } = await import("../src/App.jsx");
    render(<App />);

    const ceremonyDialog = await screen.findByRole("dialog", { name: "VM-kåring" });
    fireEvent.click(await within(ceremonyDialog).findByRole("button", { name: "Start kåringen" }));
    for (let index = 0; index < 5; index += 1) {
      fireEvent.click(within(ceremonyDialog).getByRole("button", { name: "Neste ›" }));
    }
    fireEvent.click(within(ceremonyDialog).getByRole("button", { name: "Bonusrunde ›" }));

    const navigation = ceremonyDialog.querySelector(".ceremony-present-nav");
    const nextButton = within(ceremonyDialog).getByRole("button", { name: "Vis neste 4 ›" });
    expect(navigation?.style.gridTemplateAreas).toBe('"phase phase" "back next"');
    expect(nextButton.style.width).toBe("100%");
    expect(nextButton.style.whiteSpace).toBe("nowrap");
    expect(ceremonyDialog.querySelector(".ceremony-bonus-list")?.style.overflowY).toBe("auto");
    expect(ceremonyDialog.querySelector(".ceremony-bonus-name")?.style.textOverflow).toBe("ellipsis");

    fireEvent.click(within(ceremonyDialog).getByRole("button", { name: /Vis neste/ }));
    const mobileRevealBatch = ceremonyDialog.querySelector(".ceremony-bonus-reveal-batch");
    expect(ceremonyDialog.querySelectorAll(".ceremony-bonus-reveal-item")).toHaveLength(4);
    expect(mobileRevealBatch?.style.width).toBe("100%");
    expect(mobileRevealBatch?.style.flexWrap).toBe("wrap");
    for (let index = 0; index < 3; index += 1) {
      fireEvent.click(within(ceremonyDialog).getByRole("button", { name: /Vis neste/ }));
    }
    expect(ceremonyDialog.querySelectorAll(".ceremony-bonus-reveal-item")).toHaveLength(1);
    fireEvent.click(within(ceremonyDialog).getByRole("button", { name: "Kår vinner ›" }));
    expect(ceremonyDialog.querySelector(".ceremony-podium-name")?.style.textOverflow).toBe("ellipsis");
    expect(ceremonyDialog.querySelector(".ceremony-rest-name")?.style.textOverflow).toBe("ellipsis");
    expect(ceremonyDialog.querySelector(".ceremony-winner-rest")?.style.gridTemplateColumns).toBe("1fr");
  });
});
