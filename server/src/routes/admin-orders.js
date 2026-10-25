import { Router } from "express";
import { requireAdmin } from "../auth.js";
import { prisma } from "../db.js";

export const adminOrdersRouter = Router();
adminOrdersRouter.use(requireAdmin);

const TABS = {
  to_ship: { statuses: ["paid", "sent_to_bigseller"], orderBy: [{ paidAt: "asc" }, { id: "asc" }] },
  shipped: { statuses: ["shipped"], orderBy: [{ id: "desc" }] },
  completed: { statuses: ["completed"], orderBy: [{ id: "desc" }] },
  awaiting_payment: { statuses: ["pending_payment"], orderBy: [{ id: "desc" }] },
  cancelled: { statuses: ["cancelled", "refunded"], orderBy: [{ id: "desc" }] },
};

const MAX_ROWS = 200;

const include = {
  items: {
    orderBy: { id: "asc" },
    include: {
      variant: {
        select: {
          sku: true,
          variationName: true,
          product: { select: { name: true, slug: true, images: { where: { variantId: null }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: 1 } } },
        },
      },
    },
  },
};

function serialize(o) {
  return {
    id: o.id,
    orderNo: o.orderNo,
    status: o.status,
    email: o.email,
    createdAt: o.createdAt,
    paidAt: o.paidAt,
    expiresAt: o.expiresAt,
    subtotal: o.subtotal?.toNumber() ?? null,
    voucherCode: o.voucherCode,
    discount: o.discount?.toNumber() ?? 0,
    companyName: o.companyName,
    note: o.note,
    shippingFee: o.shippingFee?.toNumber() ?? null,
    total: o.total?.toNumber() ?? null,
    courier: o.courier,
    trackingNo: o.trackingNo,
    shipping: {
      name: o.shipName,
      phone: o.shipPhone,
      address: o.shipAddress,
      postcode: o.shipPostcode,
      city: o.shipCity,
      state: o.shipState,
    },
    items: o.items.map((i) => ({
      id: i.id,
      qty: i.qty,
      unitPrice: i.unitPrice?.toNumber() ?? null,
      sku: i.variant?.sku ?? null,
      variantName: i.variant?.variationName ?? null,
      productName: i.variant?.product.name ?? "(deleted product)",
      productSlug: i.variant?.product.slug ?? null,
      image: i.variant?.product.images[0]?.url ?? null,
    })),
  };
}

async function tabCounts() {
  const rows = await prisma.order.groupBy({ by: ["status"], _count: { _all: true } });
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
  return Object.fromEntries(Object.entries(TABS).map(([tab, t]) => [tab, t.statuses.reduce((s, st) => s + (byStatus[st] ?? 0), 0)]));
}

function badRequest(res, status, error) {
  res.status(status).json({ error });
}

async function findOrder(req, res) {
  const id = Number(req.params.id);
  const order = Number.isInteger(id) ? await prisma.order.findUnique({ where: { id } }) : null;
  if (!order) badRequest(res, 404, "Order not found");
  return order;
}

async function respondWithOrder(res, id) {
  const order = await prisma.order.findUnique({ where: { id }, include });
  res.json(serialize(order));
}

const PAID_STATUSES = ["paid", "sent_to_bigseller", "shipped", "completed"];

function csvCell(value) {
  let s = value == null ? "" : String(value);
  if (/^[=+@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function mytDate(raw, endOfDay) {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+08:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const mytStamp = (d) => (d ? new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 19).replace("T", " ") : "");
const rm = (d) => (d == null ? "" : d.toNumber().toFixed(2));

adminOrdersRouter.get("/export.csv", async (req, res) => {
  const from = mytDate(req.query.from, false);
  const to = mytDate(req.query.to, true);
  const orders = await prisma.order.findMany({
    where: { status: { in: PAID_STATUSES }, ...((from || to) && { paidAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }) },
    include,
    orderBy: [{ paidAt: "asc" }, { id: "asc" }],
  });
  const header = ["order_no", "date", "customer", "phone", "address", "state", "sku", "qty", "unit_price", "line_total", "shipping", "voucher", "total", "note", "company"];
  const rows = [header];
  for (const o of orders) {
    const address = [o.shipAddress, o.shipPostcode, o.shipCity].filter(Boolean).join(", ");
    const voucher = o.voucherCode ? `${o.voucherCode} (-${rm(o.discount)})` : "";
    for (const i of o.items) {
      rows.push([
        o.orderNo,
        mytStamp(o.paidAt ?? o.createdAt),
        o.shipName,
        o.shipPhone,
        address,
        o.shipState,
        i.variant?.sku ?? "",
        i.qty,
        rm(i.unitPrice),
        i.unitPrice && i.qty ? i.unitPrice.mul(i.qty).toFixed(2) : "",
        rm(o.shippingFee),
        voucher,
        rm(o.total),
        o.note,
        o.companyName,
      ]);
    }
  }
  const name = `wyr-paid-orders${req.query.from ? `-${req.query.from}` : ""}${req.query.to ? `-to-${req.query.to}` : ""}.csv`;
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="${name}"`);
  res.send(`\uFEFF${rows.map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`);
});

adminOrdersRouter.get("/counts", async (_req, res) => {
  res.json(await tabCounts());
});

adminOrdersRouter.get("/", async (req, res) => {
  const tab = TABS[req.query.tab] ? req.query.tab : "to_ship";
  const [orders, counts] = await Promise.all([
    prisma.order.findMany({ where: { status: { in: TABS[tab].statuses } }, include, orderBy: TABS[tab].orderBy, take: MAX_ROWS }),
    tabCounts(),
  ]);
  res.json({ tab, orders: orders.map(serialize), counts });
});

adminOrdersRouter.post("/:id/ship", async (req, res) => {
  const order = await findOrder(req, res);
  if (!order) return;
  const courier = typeof req.body?.courier === "string" ? req.body.courier.trim().slice(0, 50) : "";
  const trackingNo = typeof req.body?.trackingNo === "string" ? req.body.trackingNo.trim().slice(0, 80) : "";
  if (!courier || (!trackingNo && courier !== "Self pickup")) return badRequest(res, 400, "Courier and tracking number are both required");
  const { count } = await prisma.order.updateMany({
    where: { id: order.id, status: { in: ["paid", "sent_to_bigseller", "shipped"] } },
    data: { status: "shipped", courier, trackingNo: trackingNo || null },
  });
  if (count === 0) return badRequest(res, 409, `Can't ship an order that is ${order.status.replace(/_/g, " ")}`);
  await respondWithOrder(res, order.id);
});

adminOrdersRouter.post("/:id/unship", async (req, res) => {
  const order = await findOrder(req, res);
  if (!order) return;
  const { count } = await prisma.order.updateMany({ where: { id: order.id, status: "shipped" }, data: { status: "paid", courier: null, trackingNo: null } });
  if (count === 0) return badRequest(res, 409, "Only shipped orders can be moved back to To ship");
  await respondWithOrder(res, order.id);
});

adminOrdersRouter.post("/:id/complete", async (req, res) => {
  const order = await findOrder(req, res);
  if (!order) return;
  const { count } = await prisma.order.updateMany({ where: { id: order.id, status: "shipped" }, data: { status: "completed" } });
  if (count === 0) return badRequest(res, 409, "Only shipped orders can be marked completed");
  await respondWithOrder(res, order.id);
});
