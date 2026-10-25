import { Router } from "express";
import { requireAdmin } from "../auth.js";
import { prisma } from "../db.js";

export const adminPurchasingRouter = Router();
adminPurchasingRouter.use(requireAdmin);

const EDITABLE = ["draft", "ordered"];
const MAX_LINES = 100;

class InputError extends Error {
  constructor(message, status = 400, fields = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

const include = { lines: { orderBy: { id: "asc" }, include: { variant: { select: { productId: true } } } } };

function serialize(po) {
  const lines = po.lines.map((l) => ({
    id: l.id,
    variantId: l.variantId,
    productId: l.variant?.productId ?? null,
    sku: l.sku,
    description: l.description,
    qty: l.qty,
    unitCost: l.unitCost.toNumber(),
  }));
  return {
    id: po.id,
    poNumber: po.poNumber,
    supplier: po.supplier,
    orderDate: po.orderDate.toISOString().slice(0, 10),
    status: po.status,
    notes: po.notes ?? "",
    createdAt: po.createdAt,
    receivedAt: po.receivedAt,
    total: Math.round(lines.reduce((s, l) => s + l.qty * l.unitCost, 0) * 100) / 100,
    lines,
  };
}

function parseInput(body) {
  const fields = {};
  const supplier = typeof body?.supplier === "string" ? body.supplier.trim().slice(0, 150) : "";
  if (!supplier) fields.supplier = "Required";
  const orderDate = typeof body?.orderDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.orderDate) ? body.orderDate : "";
  if (!orderDate || Number.isNaN(Date.parse(orderDate))) fields.orderDate = "Pick a date";
  const status = EDITABLE.includes(body?.status) ? body.status : "draft";
  const notes = typeof body?.notes === "string" ? body.notes.trim().slice(0, 5000) || null : null;

  const raw = Array.isArray(body?.lines) ? body.lines : [];
  if (raw.length === 0) fields.lines = "Add at least one line";
  if (raw.length > MAX_LINES) fields.lines = `At most ${MAX_LINES} lines`;
  const lines = raw.slice(0, MAX_LINES).map((l, i) => {
    const description = typeof l?.description === "string" ? l.description.trim().slice(0, 255) : "";
    if (!description) fields[`lines.${i}.description`] = "Required";
    const qty = Number(l?.qty);
    if (!Number.isInteger(qty) || qty <= 0) fields[`lines.${i}.qty`] = "Whole number above 0";
    const unitCost = l?.unitCost === null || l?.unitCost === "" ? NaN : Number(l?.unitCost);
    if (!Number.isFinite(unitCost) || unitCost < 0) fields[`lines.${i}.unitCost`] = "Enter a cost, 0 or more";
    return {
      variantId: Number.isInteger(l?.variantId) ? l.variantId : null,
      sku: typeof l?.sku === "string" ? l.sku.trim().slice(0, 80) || null : null,
      description,
      qty,
      unitCost: Math.round(unitCost * 100) / 100,
    };
  });

  if (Object.keys(fields).length) throw new InputError("Please fix the highlighted fields", 400, fields);
  return { supplier, orderDate: new Date(`${orderDate}T00:00:00Z`), status, notes, lines };
}

async function checkVariants(tx, lines) {
  const ids = [...new Set(lines.map((l) => l.variantId).filter((id) => id != null))];
  if (!ids.length) return;
  const found = await tx.productVariant.findMany({ where: { id: { in: ids } }, select: { id: true, sku: true } });
  const byId = new Map(found.map((v) => [v.id, v.sku]));
  for (const l of lines) {
    if (l.variantId == null) continue;
    if (!byId.has(l.variantId)) throw new InputError("A product on this PO no longer exists. Pick it again.", 409);
    l.sku = byId.get(l.variantId);
  }
}

async function nextPoNumber(tx, orderDate) {
  const year = orderDate.getUTCFullYear();
  const prefix = `PO-${year}-`;
  const last = await tx.purchaseOrder.findFirst({ where: { poNumber: { startsWith: prefix } }, orderBy: { poNumber: "desc" }, select: { poNumber: true } });
  const n = last ? Number(last.poNumber.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

function handle(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof InputError) res.status(err.status).json({ error: err.message, fields: err.fields });
      else next(err);
    }
  };
}

async function loadPo(tx, idParam) {
  const id = Number(idParam);
  const po = Number.isInteger(id) ? await tx.purchaseOrder.findUnique({ where: { id } }) : null;
  if (!po) throw new InputError("Purchase order not found", 404);
  return po;
}

async function respond(res, id, status = 200) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, include });
  res.status(status).json(serialize(po));
}

adminPurchasingRouter.get(
  "/",
  handle(async (_req, res) => {
    const [orders, suppliers] = await Promise.all([
      prisma.purchaseOrder.findMany({ include, orderBy: [{ orderDate: "desc" }, { id: "desc" }] }),
      prisma.purchaseOrder.findMany({ distinct: ["supplier"], select: { supplier: true }, orderBy: { supplier: "asc" } }),
    ]);
    res.json({ orders: orders.map(serialize), suppliers: suppliers.map((s) => s.supplier) });
  }),
);

adminPurchasingRouter.post(
  "/",
  handle(async (req, res) => {
    const input = parseInput(req.body);
    const id = await prisma.$transaction(async (tx) => {
      await checkVariants(tx, input.lines);
      const po = await tx.purchaseOrder.create({
        data: {
          poNumber: await nextPoNumber(tx, input.orderDate),
          supplier: input.supplier,
          orderDate: input.orderDate,
          status: input.status,
          notes: input.notes,
          lines: { create: input.lines },
        },
      });
      return po.id;
    });
    await respond(res, id, 201);
  }),
);

adminPurchasingRouter.put(
  "/:id",
  handle(async (req, res) => {
    const input = parseInput(req.body);
    const id = await prisma.$transaction(async (tx) => {
      const po = await loadPo(tx, req.params.id);
      if (!EDITABLE.includes(po.status)) throw new InputError(`A ${po.status} PO can't be edited`, 409);
      await checkVariants(tx, input.lines);
      await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: po.id } });
      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: { supplier: input.supplier, orderDate: input.orderDate, status: input.status, notes: input.notes, lines: { create: input.lines } },
      });
      return po.id;
    });
    await respond(res, id);
  }),
);

adminPurchasingRouter.post(
  "/:id/receive",
  handle(async (req, res) => {
    const id = await prisma.$transaction(async (tx) => {
      const po = await loadPo(tx, req.params.id);
      const { count } = await tx.purchaseOrder.updateMany({
        where: { id: po.id, status: { in: EDITABLE } },
        data: { status: "received", receivedAt: new Date() },
      });
      if (count === 0) throw new InputError(`A ${po.status} PO can't be received`, 409);
      const lines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: po.id, variantId: { not: null } } });
      for (const l of lines) {
        await tx.inventory.upsert({
          where: { variantId: l.variantId },
          create: { variantId: l.variantId, available: l.qty },
          update: { available: { increment: l.qty } },
        });
      }
      return po.id;
    });
    await respond(res, id);
  }),
);

adminPurchasingRouter.post(
  "/:id/cancel",
  handle(async (req, res) => {
    const po = await loadPo(prisma, req.params.id);
    const { count } = await prisma.purchaseOrder.updateMany({ where: { id: po.id, status: { in: EDITABLE } }, data: { status: "cancelled" } });
    if (count === 0) throw new InputError(`A ${po.status} PO can't be cancelled`, 409);
    await respond(res, po.id);
  }),
);

adminPurchasingRouter.delete(
  "/:id",
  handle(async (req, res) => {
    const po = await loadPo(prisma, req.params.id);
    if (po.status === "received") throw new InputError("A received PO can't be deleted: its stock is already counted", 409);
    await prisma.purchaseOrder.delete({ where: { id: po.id } });
    res.json({ ok: true });
  }),
);
