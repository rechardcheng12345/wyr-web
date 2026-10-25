import { Router } from "express";
import { requireAdmin } from "../auth.js";
import { prisma } from "../db.js";
import { normalizeCode } from "../vouchers.js";

export const adminVouchersRouter = Router();
adminVouchersRouter.use(requireAdmin);

const toNumber = (d) => (d == null ? null : d.toNumber());

function serialize(v) {
  return {
    id: v.id,
    code: v.code,
    type: v.type,
    value: toNumber(v.value),
    minSpend: toNumber(v.minSpend),
    active: v.active,
    startsAt: v.startsAt,
    expiresAt: v.expiresAt,
    usageLimit: v.usageLimit,
    usedCount: v.usedCount,
    createdAt: v.createdAt,
  };
}

function optionalDate(raw, field, fields) {
  if (raw === "" || raw == null) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    fields[field] = "Not a valid date";
    return null;
  }
  return d;
}

function parse(body) {
  const fields = {};
  const code = normalizeCode(body?.code);
  if (!code) fields.code = "Required";
  else if (!/^[A-Z0-9_-]+$/.test(code)) fields.code = "Letters, digits, - and _ only";
  if (body?.type !== "percent" && body?.type !== "fixed") fields.type = "Pick percent or fixed";
  const value = Number(body?.value);
  if (!Number.isFinite(value) || value <= 0) fields.value = "Enter an amount above 0";
  else if (body?.type === "percent" && value > 100) fields.value = "At most 100%";

  let minSpend = null;
  if (body?.minSpend !== "" && body?.minSpend != null) {
    minSpend = Number(body.minSpend);
    if (!Number.isFinite(minSpend) || minSpend < 0) fields.minSpend = "Enter 0 or more";
  }
  let usageLimit = null;
  if (body?.usageLimit !== "" && body?.usageLimit != null) {
    usageLimit = Number(body.usageLimit);
    if (!Number.isInteger(usageLimit) || usageLimit < 1) fields.usageLimit = "Whole number, 1 or more";
  }
  const startsAt = optionalDate(body?.startsAt, "startsAt", fields);
  const expiresAt = optionalDate(body?.expiresAt, "expiresAt", fields);
  if (startsAt && expiresAt && expiresAt <= startsAt) fields.expiresAt = "Must be after the start";

  const round = (n) => (n == null ? null : Math.round(n * 100) / 100);
  return {
    fields,
    data: { code, type: body?.type, value: round(value), minSpend: round(minSpend), usageLimit, startsAt, expiresAt, active: body?.active !== false },
  };
}

adminVouchersRouter.get("/", async (_req, res) => {
  const vouchers = await prisma.voucher.findMany({ orderBy: [{ active: "desc" }, { id: "desc" }] });
  res.json(vouchers.map(serialize));
});

adminVouchersRouter.post("/", async (req, res) => {
  const { data, fields } = parse(req.body);
  if (Object.keys(fields).length) return res.status(400).json({ error: "Please fix the highlighted fields", fields });
  if (await prisma.voucher.findUnique({ where: { code: data.code } })) {
    return res.status(409).json({ error: "That code already exists", fields: { code: "Already exists" } });
  }
  res.status(201).json(serialize(await prisma.voucher.create({ data })));
});

adminVouchersRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const existing = Number.isInteger(id) ? await prisma.voucher.findUnique({ where: { id } }) : null;
  if (!existing) return res.status(404).json({ error: "Voucher not found" });
  const { data, fields } = parse({ ...serialize(existing), ...req.body });
  if (Object.keys(fields).length) return res.status(400).json({ error: "Please fix the highlighted fields", fields });
  if (data.code !== existing.code && (await prisma.voucher.findUnique({ where: { code: data.code } }))) {
    return res.status(409).json({ error: "That code already exists", fields: { code: "Already exists" } });
  }
  res.json(serialize(await prisma.voucher.update({ where: { id }, data })));
});
