import crypto from "node:crypto";
import { promisify } from "node:util";
import { readCookie, safeEqual, sign } from "./auth.js";
import { prisma } from "./db.js";

const COOKIE_NAME = "wyr_customer";
const SESSION_DAYS = 30;
const isProduction = !["dev", "development"].includes(process.env.NODE_ENV ?? "");
const scrypt = promisify(crypto.scrypt);

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, n, salt, hash] = String(stored ?? "").split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(password, Buffer.from(salt, "base64url"), expected.length, { N: Number(n), r: SCRYPT.r, p: SCRYPT.p });
  return crypto.timingSafeEqual(actual, expected);
}

const cookieOptions = { httpOnly: true, sameSite: "lax", secure: isProduction, path: "/api" };

export function setCustomerSession(res, customer) {
  const payload = Buffer.from(JSON.stringify({ id: customer.id, v: customer.sessionVersion, exp: Date.now() + SESSION_DAYS * 86400_000 })).toString("base64url");
  res.cookie(COOKIE_NAME, `${payload}.${sign(`customer.${payload}`)}`, { ...cookieOptions, maxAge: SESSION_DAYS * 86400_000 });
}

export function clearCustomerSession(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions);
}

function readSession(req) {
  const raw = readCookie(req, COOKIE_NAME);
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(`customer.${payload}`))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString());
    return session.exp > Date.now() && Number.isInteger(session.id) ? session : null;
  } catch {
    return null;
  }
}

export async function getCustomer(req) {
  const session = readSession(req);
  if (!session) return null;
  const customer = await prisma.customer.findUnique({ where: { id: session.id } });
  return customer && customer.passwordHash && customer.sessionVersion === session.v ? customer : null;
}

export async function requireCustomer(req, res, next) {
  const customer = await getCustomer(req);
  if (!customer) {
    res.status(401).json({ error: "Please log in" });
    return;
  }
  req.customer = customer;
  next();
}

export function serializeCustomer(c) {
  return {
    id: c.id,
    email: c.email,
    name: c.name,
    phone: c.phone,
    address: { addressLine: c.addressLine ?? "", postcode: c.postcode ?? "", city: c.city ?? "", state: c.state ?? "" },
    createdAt: c.createdAt,
  };
}
