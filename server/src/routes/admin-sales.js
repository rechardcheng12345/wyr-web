import { Router } from "express";
import { requireAdmin } from "../auth.js";
import { prisma } from "../db.js";

export const adminSalesRouter = Router();
adminSalesRouter.use(requireAdmin);

const SOLD = ["paid", "sent_to_bigseller", "shipped", "completed"];
const MYT_OFFSET_MS = 8 * 3600_000;
const MAX_DAYS = 366;

const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const mytDay = (date) => new Date(date.getTime() + MYT_OFFSET_MS).toISOString().slice(0, 10);

adminSalesRouter.get("/", async (req, res) => {
  const { from, to } = req.query;
  if (!isDate(from) || !isDate(to) || from > to) {
    res.status(400).json({ error: "from and to must be dates (YYYY-MM-DD), from ≤ to" });
    return;
  }
  const start = new Date(Date.parse(`${from}T00:00:00Z`) - MYT_OFFSET_MS);
  const end = new Date(Date.parse(`${to}T00:00:00Z`) - MYT_OFFSET_MS + 86_400_000);
  if ((end - start) / 86_400_000 > MAX_DAYS) {
    res.status(400).json({ error: `Pick at most ${MAX_DAYS} days` });
    return;
  }

  const orders = await prisma.order.findMany({
    where: { status: { in: SOLD }, paidAt: { gte: start, lt: end } },
    select: {
      total: true,
      paidAt: true,
      items: { select: { qty: true, unitPrice: true, variant: { select: { product: { select: { name: true } } } } } },
    },
  });

  const byDay = new Map();
  for (let t = start.getTime(); t < end.getTime(); t += 86_400_000) byDay.set(mytDay(new Date(t)), 0);
  const byProduct = new Map();
  let revenue = 0;
  for (const o of orders) {
    const total = o.total?.toNumber() ?? 0;
    revenue += total;
    const day = mytDay(o.paidAt);
    byDay.set(day, (byDay.get(day) ?? 0) + total);
    for (const i of o.items) {
      const name = i.variant?.product.name ?? "(deleted product)";
      const p = byProduct.get(name) ?? { revenue: 0, qty: 0 };
      p.revenue += (i.unitPrice?.toNumber() ?? 0) * (i.qty ?? 0);
      p.qty += i.qty ?? 0;
      byProduct.set(name, p);
    }
  }

  const round = (n) => Math.round(n * 100) / 100;
  res.json({
    revenue: round(revenue),
    orders: orders.length,
    avgOrderValue: orders.length ? round(revenue / orders.length) : 0,
    revenueByDay: [...byDay].map(([date, value]) => ({ date, revenue: round(value) })),
    topProducts: [...byProduct]
      .map(([product, p]) => ({ product, revenue: round(p.revenue), qty: p.qty }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5),
  });
});
