import { Router } from "express";
import { clearCustomerSession, getCustomer, hashPassword, requireCustomer, serializeCustomer, setCustomerSession, verifyPassword } from "../customer-auth.js";
import { prisma } from "../db.js";
import { displayNameOf } from "../display-name.js";
import { CheckoutError, normalizePhone, PHONE_ERROR } from "../orders.js";
import { createLimiter } from "../rate-limit.js";
import { isMalaysianState } from "../shipping.js";

export const accountRouter = Router();

const loginFailures = createLimiter({ windowMs: 15 * 60_000, max: 8 });
const loginAttemptsPerIp = createLimiter({ windowMs: 15 * 60_000, max: 40 });
const registrations = createLimiter({ windowMs: 60 * 60_000, max: 10 });

const TOO_MANY = "Too many attempts. Please wait 15 minutes and try again.";
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;

function str(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function normalizeEmail(v) {
  return str(v, 255).toLowerCase();
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function checkPassword(password, field, errors) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN) errors[field] = `At least ${PASSWORD_MIN} characters`;
  else if (password.length > PASSWORD_MAX) errors[field] = `At most ${PASSWORD_MAX} characters`;
}

function fail(errors) {
  if (Object.keys(errors).length) throw new CheckoutError(400, "Please check the highlighted fields.", { fields: errors });
}

function parseProfile(body, errors) {
  const name = str(body?.name, 150);
  if (!name) errors.name = "Required";
  const rawPhone = str(body?.phone, 30);
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (rawPhone && !phone) errors.phone = PHONE_ERROR;
  return { name, phone };
}

function parseAddress(raw, errors) {
  const a = raw ?? {};
  const addressLine = str(a.addressLine, 300);
  const postcode = str(a.postcode, 10);
  const city = str(a.city, 100);
  const state = str(a.state, 50);
  if (postcode && !/^\d{5}$/.test(postcode)) errors.postcode = "Postcode must be 5 digits";
  if (state && !isMalaysianState(state)) errors.state = "Choose a state";
  return { addressLine: addressLine || null, postcode: postcode || null, city: city || null, state: state || null };
}

accountRouter.post("/register", async (req, res) => {
  if (registrations.blocked(req.ip)) throw new CheckoutError(429, TOO_MANY);
  const errors = {};
  const email = normalizeEmail(req.body?.email);
  if (!email) errors.email = "Required";
  else if (!validEmail(email)) errors.email = "Enter a valid email address";
  const profile = parseProfile(req.body, errors);
  checkPassword(req.body?.password, "password", errors);
  fail(errors);

  registrations.hit(req.ip);
  const existing = await prisma.customer.findUnique({ where: { email } });
  if (existing?.passwordHash) {
    throw new CheckoutError(409, "An account with this email already exists. Log in instead.", { fields: { email: "Already registered" } });
  }
  const passwordHash = await hashPassword(req.body.password);
  const data = { ...profile, passwordHash, lastLoginAt: new Date() };
  const customer = existing
    ? await prisma.customer.update({ where: { id: existing.id }, data: { ...data, sessionVersion: { increment: 1 } } })
    : await prisma.customer.create({ data: { email, ...data } });
  setCustomerSession(res, customer);
  res.status(201).json({ customer: serializeCustomer(customer) });
});

accountRouter.post("/login", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === "string" ? req.body.password.slice(0, PASSWORD_MAX) : "";
  const key = `${req.ip}|${email}`;
  if (loginFailures.blocked(key) || loginAttemptsPerIp.blocked(req.ip)) throw new CheckoutError(429, TOO_MANY);
  loginAttemptsPerIp.hit(req.ip);

  const customer = email ? await prisma.customer.findUnique({ where: { email } }) : null;
  let ok = false;
  if (customer?.passwordHash) ok = await verifyPassword(password, customer.passwordHash);
  else await hashPassword(password);
  if (!ok) {
    loginFailures.hit(key);
    throw new CheckoutError(401, "Wrong email or password.");
  }
  loginFailures.reset(key);
  const updated = await prisma.customer.update({ where: { id: customer.id }, data: { lastLoginAt: new Date() } });
  setCustomerSession(res, updated);
  res.json({ customer: serializeCustomer(updated) });
});

accountRouter.post("/logout", (_req, res) => {
  clearCustomerSession(res);
  res.json({ ok: true });
});

accountRouter.get("/me", async (req, res) => {
  const customer = await getCustomer(req);
  res.json({ customer: customer ? serializeCustomer(customer) : null });
});

accountRouter.patch("/", requireCustomer, async (req, res) => {
  const errors = {};
  const profile = parseProfile(req.body, errors);
  const address = parseAddress(req.body?.address, errors);
  fail(errors);
  const customer = await prisma.customer.update({ where: { id: req.customer.id }, data: { ...profile, ...address } });
  res.json({ customer: serializeCustomer(customer) });
});

accountRouter.post("/password", requireCustomer, async (req, res) => {
  const errors = {};
  const key = `${req.ip}|${req.customer.email}`;
  if (loginFailures.blocked(key)) throw new CheckoutError(429, TOO_MANY);
  if (!(await verifyPassword(String(req.body?.currentPassword ?? "").slice(0, PASSWORD_MAX), req.customer.passwordHash))) {
    loginFailures.hit(key);
    errors.currentPassword = "Wrong password";
  }
  checkPassword(req.body?.newPassword, "newPassword", errors);
  fail(errors);
  const customer = await prisma.customer.update({
    where: { id: req.customer.id },
    data: { passwordHash: await hashPassword(req.body.newPassword), sessionVersion: { increment: 1 } },
  });
  setCustomerSession(res, customer);
  res.json({ customer: serializeCustomer(customer) });
});

accountRouter.post("/logout-everywhere", requireCustomer, async (req, res) => {
  await prisma.customer.update({ where: { id: req.customer.id }, data: { sessionVersion: { increment: 1 } } });
  clearCustomerSession(res);
  res.json({ ok: true });
});

accountRouter.get("/orders", requireCustomer, async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { customerId: req.customer.id },
    orderBy: { id: "desc" },
    take: 200,
    include: {
      items: {
        orderBy: { id: "asc" },
        select: {
          qty: true,
          variant: {
            select: {
              variationName: true,
              product: { select: { name: true, displayName: true, images: { where: { variantId: null }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: 1 } } },
            },
          },
        },
      },
    },
  });
  res.json(
    orders.map((o) => ({
      orderNo: o.orderNo,
      status: o.status,
      createdAt: o.createdAt,
      paidAt: o.paidAt,
      shippedAt: o.shippedAt,
      completedAt: o.completedAt,
      expiresAt: o.expiresAt,
      total: o.total?.toNumber() ?? null,
      courier: o.courier,
      trackingNo: o.trackingNo,
      itemCount: o.items.reduce((n, i) => n + (i.qty ?? 0), 0),
      items: o.items.slice(0, 3).map((i) => ({
        name: i.variant ? displayNameOf(i.variant.product) : "(removed product)",
        variantName: i.variant?.variationName ?? null,
        qty: i.qty,
        image: i.variant?.product.images[0]?.url ?? null,
      })),
      moreItems: Math.max(0, o.items.length - 3),
    })),
  );
});
