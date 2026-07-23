import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const blobs = vi.hoisted(() => ({
  connectLambda: vi.fn(),
  getStore: vi.fn(),
}));

vi.mock("@netlify/blobs", () => blobs);

import { adminSessionCookie, createAdminSession } from "../netlify/functions/lib/auth-session.js";
import { handler as authHandler } from "../netlify/functions/auth.js";
import { handler as dataHandler } from "../netlify/functions/data.js";
import { config as supporterConfig, handler as supporterHandler } from "../netlify/functions/supporter-row.js";
import { config as wcConfig } from "../netlify/functions/wc.js";

const SECRET = "test-secret-that-is-longer-than-thirty-two-characters";

function storedData() {
  return {
    schemaVersion: 5,
    revision: "r1",
    updatedAt: "2026-07-13T10:00:00.000Z",
    participants: [{
      id: "a",
      name: "Ada Lovelace",
      color: "#123456",
      scores: {},
      bonus: 2,
      excluded: false,
      internalNote: "privat",
    }],
    fasit: { groups: {}, quiz: [] },
    settings: { ceremonyUnlocked: false, ceremony: { phase: "rounds", step: 0, bonusRevealed: 0 } },
  };
}

function adminCookie() {
  return adminSessionCookie(createAdminSession().token);
}

describe("Netlify handlers", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_SESSION_SECRET", SECRET);
    vi.stubEnv("CONTEXT", "production");
    blobs.connectLambda.mockReset();
    blobs.getStore.mockReset();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("avviser ugyldig auth-payload kontrollert", async () => {
    const response = await authHandler({ httpMethod: "POST", body: "null" });
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ ok: false, error: "Ugyldig forespørsel" });
  });

  it("returnerer 503 ved lagringsfeil i GET /data", async () => {
    blobs.getStore.mockReturnValue({ get: vi.fn().mockRejectedValue(new Error("blob nede")) });
    const response = await dataHandler({ httpMethod: "GET", headers: {} });
    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toEqual({ error: "Konkurransedata er midlertidig utilgjengelig" });
  });

  it("returnerer eksplisitt offentlig data uten adminmetadata", async () => {
    blobs.getStore.mockReturnValue({ get: vi.fn().mockResolvedValue(storedData()) });
    const response = await dataHandler({ httpMethod: "GET", headers: {} });
    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(200);
    expect(body.revision).toBe("r1");
    expect(body.data.participants[0]).not.toHaveProperty("internalNote");
  });

  it("avviser offentlig redigering og ugyldige admindata", async () => {
    blobs.getStore.mockReturnValue({});
    const unauthorized = await dataHandler({ httpMethod: "POST", headers: {}, body: "{}" });
    expect(unauthorized.statusCode).toBe(401);

    const invalid = await dataHandler({
      httpMethod: "POST",
      headers: { cookie: adminCookie() },
      body: JSON.stringify({ data: { participants: [], fasit: {}, settings: null }, baseRevision: "r1" }),
    });
    expect(invalid.statusCode).toBe(422);

    const invalidPayload = await dataHandler({
      httpMethod: "POST",
      headers: { cookie: adminCookie() },
      body: "null",
    });
    expect(invalidPayload.statusCode).toBe(400);
  });

  it("oppdager revisjonskonflikt uten å skrive", async () => {
    const store = {
      get: vi.fn().mockResolvedValue(storedData()),
      setJSON: vi.fn(),
      list: vi.fn(),
      delete: vi.fn(),
    };
    blobs.getStore.mockReturnValue(store);
    const response = await dataHandler({
      httpMethod: "POST",
      headers: { cookie: adminCookie() },
      body: JSON.stringify({ data: storedData(), baseRevision: "gammel" }),
    });
    expect(response.statusCode).toBe(409);
    expect(store.setJSON).not.toHaveBeenCalled();
  });

  it("tar backup før et gyldig snapshot overskrives", async () => {
    const store = {
      get: vi.fn().mockResolvedValue(storedData()),
      setJSON: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({
        blobs: Array.from({ length: 21 }, (_, index) => ({
          key: `competition-backups/${String(index).padStart(2, "0")}`,
        })),
      }),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    blobs.getStore.mockReturnValue(store);
    const response = await dataHandler({
      httpMethod: "POST",
      headers: { cookie: adminCookie() },
      body: JSON.stringify({ data: storedData(), baseRevision: "r1" }),
    });
    expect(response.statusCode).toBe(200);
    expect(store.setJSON.mock.calls[0][0]).toMatch(/^competition-backups\//);
    expect(store.setJSON.mock.calls[1][0]).toBe("competition-data");
    expect(store.delete).toHaveBeenCalledOnce();
    expect(store.delete).toHaveBeenCalledWith("competition-backups/00");
  });

  it("migrerer supporterantall og validerer delta", async () => {
    const store = {
      get: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue({ blobs: [{ key: "1" }, { key: "2" }] }),
      setJSON: vi.fn().mockResolvedValue(undefined),
    };
    blobs.getStore.mockReturnValue(store);
    const response = await supporterHandler({ httpMethod: "POST", body: JSON.stringify({ delta: 3 }) });
    expect(JSON.parse(response.body)).toEqual({ count: 5 });
    const invalid = await supporterHandler({ httpMethod: "POST", body: JSON.stringify({ delta: 11 }) });
    expect(invalid.statusCode).toBe(422);
    const invalidPayload = await supporterHandler({ httpMethod: "POST", body: "null" });
    expect(invalidPayload.statusCode).toBe(400);
  });

  it("har avtalte rate limits", () => {
    expect(supporterConfig.rateLimit).toMatchObject({ windowLimit: 30, windowSize: 60 });
    expect(wcConfig.rateLimit).toMatchObject({ windowLimit: 60, windowSize: 60 });
  });
});
