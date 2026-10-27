import { Prisma } from "@prisma/client";
import { Router } from "express";
import { requireAdmin } from "../auth.js";
import { prisma } from "../db.js";

// Customers of quotations, invoices and delivery orders. Every document saves its bill-to here
// (routes/admin-documents.js), and they can also be added or edited by hand. Editing a customer
// only changes what new documents pick up: issued documents keep the details printed on them.

export const adminClientsRouter = Router();
adminClientsRouter.use(requireAdmin);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function str(raw, max) {
  return typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim().slice(0, max) : "";
}

/** Phone and email checks shared with the document form. Returns the cleaned values. */
export function parseContact(body, fields) {
  const phone = str(body?.phone, 30);
  const email = str(body?.email, 255);
  if (email && !EMAIL_RE.test(email)) fields.email = "Check the email address";
  return { phone: phone || null, email: email || null };
}

function parseClient(body) {
  const fields = {};
  const name = str(body?.name, 200);
  if (!name) fields.name = "Required";
  const contact = parseContact(body, fields);
  if (Object.keys(fields).length) throw new InputError("Please fix the highlighted fields", 400, fields);
  return { name, address: str(body?.address, 1000) || null, attention: str(body?.attention, 150) || null, ...contact };
}

const isoDate = (d) => (d ? d.toISOString().slice(0, 10) : null);
const cents = (d) => Math.round(Number(d) * 100);

function serializeClient(c) {
  return { id: c.id, name: c.name, address: c.address ?? "", attention: c.attention ?? "", phone: c.phone ?? "", email: c.email ?? "", createdAt: c.createdAt };
}

/** Counts and money per customer, from documents that aren't void. */
function summarize(docs) {
  const s = { quotations: 0, invoices: 0, deliveryOrders: 0, invoicedCents: 0, unpaidCents: 0, lastDocDate: null };
  for (const d of docs) {
    if (!s.lastDocDate || d.docDate > s.lastDocDate) s.lastDocDate = d.docDate;
    if (d.status === "void") continue;
    if (d.type === "quotation") s.quotations++;
    if (d.type === "delivery_order") s.deliveryOrders++;
    if (d.type === "invoice") {
      s.invoices++;
      s.invoicedCents += cents(d.total);
      if (!d.paidAt) s.unpaidCents += cents(d.total);
    }
  }
  return {
    quotations: s.quotations,
    invoices: s.invoices,
    deliveryOrders: s.deliveryOrders,
    invoiced: s.invoicedCents / 100,
    unpaid: s.unpaidCents / 100,
    lastDocDate: isoDate(s.lastDocDate),
  };
}

const docSelect = { id: true, type: true, docNo: true, docDate: true, status: true, total: true, paidAt: true, customerRef: true };

async function loadClient(idParam) {
  const id = Number(idParam);
  const client = Number.isInteger(id) ? await prisma.client.findUnique({ where: { id } }) : null;
  if (!client) throw new InputError("Customer not found", 404);
  return client;
}

function isUniqueError(err) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

const nameTaken = (name) => new InputError("Another customer already has that name", 409, { name: `${name} already exists` });

async function respond(res, id, status = 200) {
  const client = await prisma.client.findUnique({
    where: { id },
    include: { documents: { select: docSelect, orderBy: [{ docDate: "desc" }, { id: "desc" }] } },
  });
  res.status(status).json({
    ...serializeClient(client),
    ...summarize(client.documents),
    documents: client.documents.map((d) => ({ ...d, docDate: isoDate(d.docDate), paidAt: isoDate(d.paidAt), total: d.total.toNumber(), customerRef: d.customerRef ?? "" })),
  });
}

adminClientsRouter.get(
  "/",
  handle(async (_req, res) => {
    const clients = await prisma.client.findMany({
      orderBy: { name: "asc" },
      include: { documents: { select: { type: true, status: true, total: true, paidAt: true, docDate: true } } },
    });
    res.json(clients.map((c) => ({ ...serializeClient(c), ...summarize(c.documents) })));
  }),
);

adminClientsRouter.get(
  "/:id",
  handle(async (req, res) => {
    const client = await loadClient(req.params.id);
    await respond(res, client.id);
  }),
);

adminClientsRouter.post(
  "/",
  handle(async (req, res) => {
    const data = parseClient(req.body);
    try {
      const client = await prisma.client.create({ data });
      await respond(res, client.id, 201);
    } catch (err) {
      if (isUniqueError(err)) throw nameTaken(data.name);
      throw err;
    }
  }),
);

adminClientsRouter.put(
  "/:id",
  handle(async (req, res) => {
    const client = await loadClient(req.params.id);
    const data = parseClient(req.body);
    try {
      await prisma.client.update({ where: { id: client.id }, data });
    } catch (err) {
      if (isUniqueError(err)) throw nameTaken(data.name);
      throw err;
    }
    await respond(res, client.id);
  }),
);

adminClientsRouter.delete(
  "/:id",
  handle(async (req, res) => {
    const client = await loadClient(req.params.id);
    const count = await prisma.document.count({ where: { clientId: client.id } });
    if (count) throw new InputError(`This customer has ${count} document${count === 1 ? "" : "s"}, so it can't be deleted.`, 409);
    await prisma.client.delete({ where: { id: client.id } });
    res.json({ ok: true });
  }),
);
