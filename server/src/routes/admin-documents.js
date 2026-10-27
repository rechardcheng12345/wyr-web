import { Prisma } from "@prisma/client";
import { Router } from "express";
import { requireAdmin } from "../auth.js";
import { prisma } from "../db.js";
import { getSetting } from "../settings.js";
import { logStockMovement } from "../stock.js";

// Quotations, invoices and delivery orders for walk-in and company customers, plus formal invoices
// for website orders. Quotations and invoices are issued as soon as they're created and stay editable
// until voided. A delivery order is a draft until it's issued, which takes its product lines out of
// stock (unless it belongs to a website order, whose stock the order already took); voiding an
// issued DO puts the stock back.

export const adminDocumentsRouter = Router();
adminDocumentsRouter.use(requireAdmin);

const TYPES = ["quotation", "invoice", "delivery_order"];
const MAX_LINES = 100;

/** First number of each year per type: quotations have always started at Q101. */
const FIRST_SEQ = { quotation: 101, invoice: 1, delivery_order: 1 };

function formatDocNo(type, year, seq) {
  const n = String(seq).padStart(3, "0");
  if (type === "quotation") return `${year}-Q${n}`;
  if (type === "delivery_order") return `DO-${year}-${n}`;
  return `${year}-${n}`;
}

class InputError extends Error {
  constructor(message, status = 400, fields = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
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

const cents = (d) => Math.round(Number(d) * 100);
const isoDate = (d) => (d ? d.toISOString().slice(0, 10) : null);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const toDate = (s) => new Date(`${s}T00:00:00Z`);

const include = {
  lines: { orderBy: { id: "asc" }, include: { variant: { select: { productId: true } } } },
  source: { select: { id: true, type: true, docNo: true } },
  derived: { select: { id: true, type: true, docNo: true, status: true }, orderBy: { id: "asc" } },
  order: { select: { orderNo: true } },
};

function serialize(d) {
  const lines = d.lines.map((l) => ({
    id: l.id,
    variantId: l.variantId,
    productId: l.variant?.productId ?? null,
    sku: l.sku,
    description: l.description,
    note: l.note ?? "",
    qty: l.qty,
    unitPrice: l.unitPrice.toNumber(),
  }));
  return {
    id: d.id,
    type: d.type,
    docNo: d.docNo,
    year: d.year,
    seq: d.seq,
    status: d.status,
    docDate: isoDate(d.docDate),
    clientId: d.clientId,
    billToName: d.billToName,
    billToAddress: d.billToAddress ?? "",
    attention: d.attention ?? "",
    customerRef: d.customerRef ?? "",
    validUntil: isoDate(d.validUntil),
    otherLabel: d.otherLabel ?? "",
    otherAmount: d.otherAmount.toNumber(),
    subtotal: lines.reduce((s, l) => s + cents(l.unitPrice) * l.qty, 0) / 100,
    total: d.total.toNumber(),
    notes: d.notes ?? "",
    paidAt: isoDate(d.paidAt),
    issuedAt: d.issuedAt,
    createdAt: d.createdAt,
    source: d.source,
    derived: d.derived,
    orderId: d.orderId,
    orderNo: d.order?.orderNo ?? null,
    lines,
  };
}

function str(raw, max) {
  return typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim().slice(0, max) : "";
}

function parseInput(body, type) {
  const fields = {};
  const docDate = typeof body?.docDate === "string" && DATE_RE.test(body.docDate) ? body.docDate : "";
  if (!docDate || Number.isNaN(Date.parse(docDate))) fields.docDate = "Pick a date";
  const billToName = str(body?.billToName, 200);
  if (!billToName) fields.billToName = "Required";

  let validUntil = null;
  if (type === "quotation" && body?.validUntil) {
    if (typeof body.validUntil !== "string" || !DATE_RE.test(body.validUntil) || Number.isNaN(Date.parse(body.validUntil))) fields.validUntil = "Pick a date";
    else if (docDate && body.validUntil < docDate) fields.validUntil = "Must be on or after the date";
    else validUntil = toDate(body.validUntil);
  }

  let otherAmount = 0;
  if (type === "invoice" && body?.otherAmount !== "" && body?.otherAmount != null) {
    otherAmount = Number(body.otherAmount);
    if (!Number.isFinite(otherAmount) || Math.abs(otherAmount) > 1_000_000) fields.otherAmount = "Enter an amount (use minus for a discount)";
  }

  const raw = Array.isArray(body?.lines) ? body.lines : [];
  if (raw.length === 0) fields.lines = "Add at least one line";
  if (raw.length > MAX_LINES) fields.lines = `At most ${MAX_LINES} lines`;
  const lines = raw.slice(0, MAX_LINES).map((l, i) => {
    const description = str(l?.description, 2000);
    if (!description) fields[`lines.${i}.description`] = "Required";
    const qty = Number(l?.qty);
    if (!Number.isInteger(qty) || qty <= 0 || qty > 1_000_000) fields[`lines.${i}.qty`] = "Whole number above 0";
    // Delivery orders don't show prices; lines copied from an invoice keep theirs.
    const blank = l?.unitPrice === null || l?.unitPrice === "" || l?.unitPrice === undefined;
    const unitPrice = blank && type === "delivery_order" ? 0 : blank ? NaN : Number(l.unitPrice);
    if (!Number.isFinite(unitPrice) || Math.abs(unitPrice) > 1_000_000) fields[`lines.${i}.unitPrice`] = "Enter a price (minus for a discount line)";
    return {
      variantId: Number.isInteger(l?.variantId) ? l.variantId : null,
      sku: str(l?.sku, 80) || null,
      description,
      note: str(l?.note, 500) || null,
      qty,
      unitPrice: Math.round(unitPrice * 100) / 100,
    };
  });

  let seq = null;
  if (body?.seq !== undefined && body?.seq !== null && body?.seq !== "") {
    seq = Number(body.seq);
    if (!Number.isInteger(seq) || seq < 1 || seq > 99_999) fields.seq = "Whole number from 1 to 99999";
  }

  if (Object.keys(fields).length) throw new InputError("Please fix the highlighted fields", 400, fields);
  const otherCents = cents(otherAmount);
  const totalCents = lines.reduce((s, l) => s + cents(l.unitPrice) * l.qty, 0) + otherCents;
  return {
    seq,
    docDate: toDate(docDate),
    billToName,
    billToAddress: str(body?.billToAddress, 1000) || null,
    attention: str(body?.attention, 150) || null,
    customerRef: str(body?.customerRef, 100) || null,
    validUntil,
    otherLabel: type === "invoice" && otherCents !== 0 ? str(body?.otherLabel, 100) || "Other" : null,
    otherAmount: otherCents / 100,
    total: totalCents / 100,
    notes: str(body?.notes, 5000) || null,
    lines,
  };
}

async function checkVariants(tx, lines) {
  const ids = [...new Set(lines.map((l) => l.variantId).filter((id) => id != null))];
  if (!ids.length) return;
  const found = await tx.productVariant.findMany({ where: { id: { in: ids } }, select: { id: true, sku: true } });
  const byId = new Map(found.map((v) => [v.id, v.sku]));
  for (const l of lines) {
    if (l.variantId == null) continue;
    if (!byId.has(l.variantId)) throw new InputError("A product on this document no longer exists. Pick it again.", 409);
    l.sku = byId.get(l.variantId);
  }
}

/** Saves the bill-to as a client (or refreshes its address) so the next document can pick it. */
async function saveClient(tx, input) {
  const data = { address: input.billToAddress, attention: input.attention };
  const client = await tx.client.upsert({ where: { name: input.billToName }, create: { name: input.billToName, ...data }, update: data });
  return client.id;
}

async function nextSeq(db, type, year) {
  const last = await db.document.findFirst({ where: { type, year }, orderBy: { seq: "desc" }, select: { seq: true } });
  return last ? last.seq + 1 : FIRST_SEQ[type];
}

function isUniqueError(err) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

async function loadDoc(db, idParam) {
  const id = Number(idParam);
  const doc = Number.isInteger(id) ? await db.document.findUnique({ where: { id }, include: { lines: true } }) : null;
  if (!doc) throw new InputError("Document not found", 404);
  return doc;
}

async function respond(res, id, status = 200) {
  const doc = await prisma.document.findUnique({ where: { id }, include });
  res.status(status).json(serialize(doc));
}

function company() {
  return {
    name: getSetting("company_name"),
    regNo: getSetting("company_reg_no"),
    address: getSetting("company_address"),
    phone: getSetting("company_phone"),
    email: getSetting("company_email"),
    bankInfo: getSetting("bank_info"),
    preparedBy: getSetting("document_prepared_by"),
    quotationValidDays: getSetting("quotation_valid_days"),
    quotationTerms: getSetting("quotation_terms"),
    invoiceFooter: getSetting("invoice_footer"),
  };
}

adminDocumentsRouter.get(
  "/",
  handle(async (req, res) => {
    const type = TYPES.includes(req.query.type) ? req.query.type : "invoice";
    const year = Number(req.query.year) || new Date().getFullYear();
    const [documents, clients, seq] = await Promise.all([
      prisma.document.findMany({ where: { type }, include, orderBy: [{ docDate: "desc" }, { id: "desc" }] }),
      prisma.client.findMany({ orderBy: { name: "asc" } }),
      nextSeq(prisma, type, year),
    ]);
    res.json({
      documents: documents.map(serialize),
      clients: clients.map((c) => ({ id: c.id, name: c.name, address: c.address ?? "", attention: c.attention ?? "" })),
      next: { year, seq, docNo: formatDocNo(type, year, seq) },
      company: company(),
    });
  }),
);

adminDocumentsRouter.get(
  "/:id",
  handle(async (req, res) => {
    const doc = await loadDoc(prisma, req.params.id);
    await respond(res, doc.id);
  }),
);

adminDocumentsRouter.post(
  "/",
  handle(async (req, res) => {
    const type = req.body?.type;
    if (!TYPES.includes(type)) throw new InputError("Unknown document type");
    const input = parseInput(req.body, type);
    const year = input.docDate.getUTCFullYear();
    // Invoices for website orders are created already paid.
    const paidAt = type === "invoice" && typeof req.body?.paidAt === "string" && DATE_RE.test(req.body.paidAt) ? toDate(req.body.paidAt) : null;
    const sourceId = Number.isInteger(req.body?.sourceId) ? req.body.sourceId : null;
    let orderId = Number.isInteger(req.body?.orderId) ? req.body.orderId : null;

    // An auto number can collide with a document saved at the same moment: take the next one and retry.
    for (let attempt = 0; ; attempt++) {
      try {
        const id = await prisma.$transaction(async (tx) => {
          await checkVariants(tx, input.lines);
          if (sourceId != null) {
            const source = await tx.document.findUnique({ where: { id: sourceId }, select: { orderId: true } });
            if (!source) throw new InputError("The document this was copied from no longer exists", 409);
            orderId ??= source.orderId;
          }
          if (orderId != null) {
            const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true } });
            if (!order) throw new InputError("That website order no longer exists", 409);
            if (type === "invoice") {
              const existing = await tx.document.findFirst({ where: { type, orderId, status: { not: "void" } }, select: { docNo: true } });
              if (existing) throw new InputError(`This order already has invoice ${existing.docNo}`, 409);
            }
          }
          const seq = input.seq ?? (await nextSeq(tx, type, year));
          const doc = await tx.document.create({
            data: {
              type,
              year,
              seq,
              docNo: formatDocNo(type, year, seq),
              status: type === "delivery_order" ? "draft" : "issued",
              issuedAt: type === "delivery_order" ? null : new Date(),
              docDate: input.docDate,
              clientId: await saveClient(tx, input),
              billToName: input.billToName,
              billToAddress: input.billToAddress,
              attention: input.attention,
              customerRef: input.customerRef,
              validUntil: input.validUntil,
              otherLabel: input.otherLabel,
              otherAmount: input.otherAmount,
              total: input.total,
              notes: input.notes,
              paidAt,
              sourceId,
              orderId,
              lines: { create: input.lines },
            },
          });
          return doc.id;
        });
        await respond(res, id, 201);
        return;
      } catch (err) {
        if (!isUniqueError(err)) throw err;
        if (input.seq != null) throw new InputError("That number is already used", 409, { seq: `${formatDocNo(type, year, input.seq)} already exists` });
        if (attempt >= 2) throw err;
      }
    }
  }),
);

adminDocumentsRouter.put(
  "/:id",
  handle(async (req, res) => {
    const id = await prisma.$transaction(async (tx) => {
      const doc = await loadDoc(tx, req.params.id);
      if (doc.status === "void") throw new InputError("A void document can't be edited", 409);
      if (doc.type === "delivery_order" && doc.status !== "draft") throw new InputError("An issued delivery order can't be edited: its stock is already out. Void it and make a new one.", 409);
      const input = parseInput(req.body, doc.type);
      // The number and year stay as issued, even if the date moves into another year.
      const { seq: _seq, lines, ...data } = input;
      await checkVariants(tx, lines);
      await tx.documentLine.deleteMany({ where: { documentId: doc.id } });
      await tx.document.update({
        where: { id: doc.id },
        data: { ...data, clientId: await saveClient(tx, input), lines: { create: lines } },
      });
      return doc.id;
    });
    await respond(res, id);
  }),
);

adminDocumentsRouter.post(
  "/:id/issue",
  handle(async (req, res) => {
    const id = await prisma.$transaction(async (tx) => {
      const doc = await loadDoc(tx, req.params.id);
      if (doc.type !== "delivery_order") throw new InputError("Only delivery orders are issued separately", 400);
      const { count } = await tx.document.updateMany({ where: { id: doc.id, status: "draft" }, data: { status: "issued", issuedAt: new Date() } });
      if (count === 0) throw new InputError(`A ${doc.status} delivery order can't be issued`, 409);
      if (doc.orderId == null) {
        for (const l of doc.lines) {
          if (l.variantId == null) continue;
          await tx.inventory.upsert({
            where: { variantId: l.variantId },
            create: { variantId: l.variantId, available: -l.qty },
            update: { available: { decrement: l.qty } },
          });
          await logStockMovement(tx, { variantId: l.variantId, delta: -l.qty, reason: "delivery_order", documentId: doc.id, note: doc.docNo });
        }
      }
      return doc.id;
    });
    await respond(res, id);
  }),
);

adminDocumentsRouter.post(
  "/:id/void",
  handle(async (req, res) => {
    const id = await prisma.$transaction(async (tx) => {
      const doc = await loadDoc(tx, req.params.id);
      const { count } = await tx.document.updateMany({ where: { id: doc.id, status: { not: "void" } }, data: { status: "void" } });
      if (count === 0) throw new InputError("Already void", 409);
      if (doc.type === "delivery_order" && doc.status === "issued" && doc.orderId == null) {
        for (const l of doc.lines) {
          if (l.variantId == null) continue;
          await tx.inventory.upsert({
            where: { variantId: l.variantId },
            create: { variantId: l.variantId, available: l.qty },
            update: { available: { increment: l.qty } },
          });
          await logStockMovement(tx, { variantId: l.variantId, delta: l.qty, reason: "do_void", documentId: doc.id, note: `${doc.docNo} voided` });
        }
      }
      return doc.id;
    });
    await respond(res, id);
  }),
);

adminDocumentsRouter.post(
  "/:id/payment",
  handle(async (req, res) => {
    const doc = await loadDoc(prisma, req.params.id);
    if (doc.type !== "invoice") throw new InputError("Only invoices are paid", 400);
    if (doc.status === "void") throw new InputError("A void invoice can't be paid", 409);
    const raw = req.body?.paidAt;
    let paidAt = null;
    if (raw != null && raw !== "") {
      if (typeof raw !== "string" || !DATE_RE.test(raw) || Number.isNaN(Date.parse(raw))) throw new InputError("Pick a payment date", 400, { paidAt: "Pick a date" });
      paidAt = toDate(raw);
    }
    await prisma.document.update({ where: { id: doc.id }, data: { paidAt } });
    await respond(res, doc.id);
  }),
);

adminDocumentsRouter.delete(
  "/:id",
  handle(async (req, res) => {
    const doc = await loadDoc(prisma, req.params.id);
    if (doc.status !== "draft") throw new InputError("Only draft delivery orders can be deleted. Void the document instead, so its number stays on record.", 409);
    await prisma.document.delete({ where: { id: doc.id } });
    res.json({ ok: true });
  }),
);
