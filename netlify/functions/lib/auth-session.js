import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "vm_admin_session";
const SESSION_SECONDS = 8 * 60 * 60;

function sessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET må være minst 32 tegn");
  }
  return secret;
}

function signature(payload) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseCookies(header = "") {
  return Object.fromEntries(String(header).split(";").map((entry) => {
    const index = entry.indexOf("=");
    if (index < 0) return [entry.trim(), ""];
    return [entry.slice(0, index).trim(), decodeURIComponent(entry.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function cookieSecurity() {
  return process.env.NETLIFY_DEV === "true" || process.env.CONTEXT === "dev" ? "" : "; Secure";
}

export function verifyPassword(password) {
  return Boolean(process.env.ADMIN_PASSWORD) && safeEqual(password, process.env.ADMIN_PASSWORD);
}

export function createAdminSession(now = Date.now()) {
  const expiresAt = now + SESSION_SECONDS * 1000;
  const payload = Buffer.from(JSON.stringify({ exp: expiresAt })).toString("base64url");
  return {
    expiresAt,
    token: `${payload}.${signature(payload)}`,
  };
}

export function readAdminSession(event, now = Date.now()) {
  try {
    const cookies = parseCookies(event?.headers?.cookie || event?.headers?.Cookie || "");
    const token = cookies[COOKIE_NAME];
    if (!token) return null;
    const separator = token.lastIndexOf(".");
    if (separator < 1) return null;
    const payload = token.slice(0, separator);
    const suppliedSignature = token.slice(separator + 1);
    if (!safeEqual(suppliedSignature, signature(payload))) return null;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Number.isFinite(session.exp) || session.exp <= now) return null;
    return { expiresAt: session.exp };
  } catch {
    return null;
  }
}

export function adminSessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}${cookieSecurity()}`;
}

export function clearAdminSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${cookieSecurity()}`;
}

