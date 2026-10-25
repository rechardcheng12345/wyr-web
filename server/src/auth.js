import crypto from "node:crypto";

const COOKIE_NAME = "wyr_admin";
const SESSION_HOURS = 8;
const isProduction = !["dev", "development"].includes(process.env.NODE_ENV ?? "");

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

export const USING_DEFAULT_ADMIN_LOGIN = !process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD;
export const USING_RANDOM_SESSION_SECRET = !process.env.SESSION_SECRET;

export function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");
}

export function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function checkCredentials(username, password) {
  const userOk = safeEqual(String(username ?? "").trim().toLowerCase(), ADMIN_USERNAME.toLowerCase());
  const passOk = safeEqual(String(password ?? ""), ADMIN_PASSWORD);
  return userOk && passOk ? { username: ADMIN_USERNAME, name: "Administrator", role: "admin" } : null;
}

export function readCookie(req, name) {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function setSession(res, user) {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + SESSION_HOURS * 3600_000 })).toString("base64url");
  res.cookie(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/api",
    maxAge: SESSION_HOURS * 3600_000,
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: "lax", secure: isProduction, path: "/api" });
}

export function getSessionUser(req) {
  const raw = readCookie(req, COOKIE_NAME);
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return null;
  try {
    const { exp, ...user } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return exp > Date.now() ? user : null;
  } catch {
    return null;
  }
}

export function requireAdmin(req, res, next) {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  req.user = user;
  next();
}
