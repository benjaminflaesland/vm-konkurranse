import {
  adminSessionCookie,
  clearAdminSessionCookie,
  createAdminSession,
  readAdminSession,
  verifyPassword,
} from "./lib/auth-session.js";

const HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const response = (statusCode, body, headers = {}) => ({
  statusCode,
  headers: { ...HEADERS, ...headers },
  body: body === undefined ? "" : JSON.stringify(body),
});

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return response(204);

  if (event.httpMethod === "GET") {
    const session = readAdminSession(event);
    return response(200, session
      ? { authenticated: true, expiresAt: new Date(session.expiresAt).toISOString() }
      : { authenticated: false });
  }

  if (event.httpMethod === "DELETE") {
    return response(204, undefined, { "Set-Cookie": clearAdminSessionCookie() });
  }

  if (event.httpMethod !== "POST") return response(405, { error: "Metoden støttes ikke" });

  let password = "";
  try {
    ({ password } = JSON.parse(event.body || "{}"));
  } catch {
    return response(400, { ok: false, error: "Ugyldig JSON" });
  }

  if (!verifyPassword(password)) return response(401, { ok: false, error: "Feil passord" });

  try {
    const session = createAdminSession();
    return response(200, {
      ok: true,
      expiresAt: new Date(session.expiresAt).toISOString(),
    }, { "Set-Cookie": adminSessionCookie(session.token) });
  } catch (error) {
    console.error("Kunne ikke opprette adminsesjon:", error.message);
    return response(500, { ok: false, error: "Adminsesjon er ikke konfigurert" });
  }
};

export const config = {
  rateLimit: {
    windowLimit: 5,
    windowSize: 180,
    aggregateBy: ["ip", "domain"],
  },
};
