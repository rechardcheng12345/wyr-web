import { Router } from "express";
import { requireAdmin } from "../auth.js";
import { prisma } from "../db.js";

export const adminCostingRouter = Router();
adminCostingRouter.use(requireAdmin);

const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;
const num = (d) => (d == null ? null : d.toNumber());

function summarize(lines) {
  const received = lines.filter((l) => l.status === "received");
  const qty = received.reduce((s, l) => s + l.qty, 0);
  const spend = received.reduce((s, l) => s + l.qty * l.unitCost, 0);
  const latest = [...received].sort((a, b) => b.orderDate.localeCompare(a.orderDate) || b.poId - a.poId)[0] ?? null;
  const costs = received.map((l) => l.unitCost);
  return {
    receivedQty: qty,
    totalSpend: round2(spend),
    avgUnitCost: qty ? round4(spend / qty) : null,
    lastUnitCost: latest?.unitCost ?? null,
    lastSupplier: latest?.supplier ?? null,
    lastDate: latest?.orderDate ?? null,
    minUnitCost: costs.length ? Math.min(...costs) : null,
    maxUnitCost: costs.length ? Math.max(...costs) : null,
    poCount: new Set(received.map((l) => l.poId)).size,
    onOrderQty: lines.filter((l) => l.status === "ordered").reduce((s, l) => s + l.qty, 0),
  };
}

async function purchaseLines(where) {
  const rows = await prisma.purchaseOrderLine.findMany({
    where: { ...where, variantId: { not: null }, purchaseOrder: { status: { in: ["received", "ordered"] } } },
    select: {
      variantId: true,
      qty: true,
      unitCost: true,
      purchaseOrder: { select: { id: true, poNumber: true, supplier: true, orderDate: true, status: true, receivedAt: true } },
    },
  });
  return rows.map((r) => ({
    variantId: r.variantId,
    qty: r.qty,
    unitCost: r.unitCost.toNumber(),
    poId: r.purchaseOrder.id,
    poNumber: r.purchaseOrder.poNumber,
    supplier: r.purchaseOrder.supplier,
    orderDate: r.purchaseOrder.orderDate.toISOString().slice(0, 10),
    status: r.purchaseOrder.status,
    receivedAt: r.purchaseOrder.receivedAt,
  }));
}

adminCostingRouter.get("/", async (_req, res) => {
  const [variants, lines] = await Promise.all([
    prisma.productVariant.findMany({
      select: { id: true, sku: true, variationName: true, price: true, specialPrice: true, product: { select: { name: true } } },
      orderBy: [{ productId: "asc" }, { id: "asc" }],
    }),
    purchaseLines({}),
  ]);
  const byVariant = new Map();
  for (const l of lines) byVariant.set(l.variantId, [...(byVariant.get(l.variantId) ?? []), l]);
  res.json(
    variants.map((v) => {
      const s = summarize(byVariant.get(v.id) ?? []);
      return {
        variantId: v.id,
        sku: v.sku,
        variantName: v.variationName,
        productName: v.product.name,
        price: num(v.price),
        specialPrice: num(v.specialPrice),
        avgUnitCost: s.avgUnitCost,
        receivedQty: s.receivedQty,
      };
    }),
  );
});

adminCostingRouter.get("/:variantId", async (req, res) => {
  const variantId = Number(req.params.variantId);
  const variant = Number.isInteger(variantId)
    ? await prisma.productVariant.findUnique({
        where: { id: variantId },
        select: { id: true, sku: true, variationName: true, price: true, specialPrice: true, product: { select: { id: true, name: true } } },
      })
    : null;
  if (!variant) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  const lines = (await purchaseLines({ variantId })).sort((a, b) => b.orderDate.localeCompare(a.orderDate) || b.poId - a.poId);
  res.json({
    variant: {
      variantId: variant.id,
      productId: variant.product.id,
      productName: variant.product.name,
      variantName: variant.variationName,
      sku: variant.sku,
      price: num(variant.price),
      specialPrice: num(variant.specialPrice),
    },
    summary: summarize(lines),
    history: lines.map(({ variantId: _v, ...l }) => l),
  });
});
