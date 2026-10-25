import { prisma } from "./db.js";
import { getSetting } from "./settings.js";

export const normalizeCode = (raw) => (typeof raw === "string" ? raw.trim().toUpperCase().slice(0, 40) : "");

const cents = (d) => (d == null ? null : Math.round(d.toNumber() * 100));

export function describeVoucher(v) {
  return v.type === "percent" ? `${v.value.toNumber()}% off` : `RM${v.value.toNumber().toFixed(2)} off`;
}

export function voucherProblem(v, subtotalCents, now = new Date()) {
  if (!v || !v.active) return "This voucher code isn't valid.";
  if (v.startsAt && v.startsAt > now) return "This voucher isn't active yet.";
  if (v.expiresAt && v.expiresAt <= now) return "This voucher has expired.";
  if (v.usageLimit != null && v.usedCount >= v.usageLimit) return "This voucher has been fully redeemed.";
  const minSpend = cents(v.minSpend);
  if (minSpend && subtotalCents < minSpend) return `This voucher needs a subtotal of at least RM${(minSpend / 100).toFixed(2)}.`;
  return null;
}

export function discountCents(v, subtotalCents) {
  const amount = v.type === "percent" ? Math.round((subtotalCents * v.value.toNumber()) / 100) : cents(v.value);
  return Math.max(0, Math.min(amount, subtotalCents));
}

export async function applyVoucher(code, subtotalCents, db = prisma) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  const v = await db.voucher.findUnique({ where: { code: normalized } });
  const error = voucherProblem(v, subtotalCents);
  if (error) return { code: normalized, valid: false, error, discountCents: 0 };
  return { code: v.code, valid: true, error: null, description: describeVoucher(v), discountCents: discountCents(v, subtotalCents) };
}

export async function welcomeVoucher() {
  const code = getSetting("welcome_voucher_code");
  if (!code) return null;
  const v = await prisma.voucher.findUnique({ where: { code } });
  if (!v || voucherProblem(v, Number.MAX_SAFE_INTEGER)) return null;
  return { code: v.code, description: describeVoucher(v) };
}

export async function ensureSeedVouchers(db = prisma) {
  await db.voucher.upsert({
    where: { code: "WELCOME5" },
    create: { code: "WELCOME5", type: "percent", value: 5, active: true },
    update: {},
  });
}
