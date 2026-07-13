import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminSessionCookie,
  clearAdminSessionCookie,
  createAdminSession,
  readAdminSession,
  verifyPassword,
} from "../netlify/functions/lib/auth-session.js";
import { config, handler } from "../netlify/functions/auth.js";

const SECRET = "test-secret-that-is-longer-than-thirty-two-characters";

describe("admin session", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_SESSION_SECRET", SECRET);
    vi.stubEnv("ADMIN_PASSWORD", "riktig-passord");
    vi.stubEnv("CONTEXT", "production");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("signerer en åtte timers HttpOnly-cookie", () => {
    const now = Date.UTC(2026, 6, 13);
    const session = createAdminSession(now);
    const cookie = adminSessionCookie(session.token);
    expect(session.expiresAt).toBe(now + 8 * 60 * 60 * 1000);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Max-Age=28800");
    expect(readAdminSession({ headers: { cookie } }, now + 1000)).toEqual({ expiresAt: session.expiresAt });
  });

  it("avviser manipulert og utløpt cookie", () => {
    const now = 1000;
    const session = createAdminSession(now);
    expect(readAdminSession({ headers: { cookie: `vm_admin_session=${session.token}x` } }, now + 1)).toBeNull();
    expect(readAdminSession({ headers: { cookie: `vm_admin_session=${session.token}` } }, session.expiresAt)).toBeNull();
  });

  it("verifiserer passord og sletter cookien sikkert", () => {
    expect(verifyPassword("riktig-passord")).toBe(true);
    expect(verifyPassword("feil")).toBe(false);
    expect(clearAdminSessionCookie()).toContain("Max-Age=0");
  });

  it("returnerer kontrakten for innlogging og rate-limit-konfigurasjonen", async () => {
    const response = await handler({ httpMethod: "POST", body: JSON.stringify({ password: "riktig-passord" }) });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ ok: true });
    expect(response.headers["Set-Cookie"]).toContain("HttpOnly");
    expect(config.rateLimit).toEqual({ windowLimit: 5, windowSize: 180, aggregateBy: ["ip", "domain"] });
  });
});
