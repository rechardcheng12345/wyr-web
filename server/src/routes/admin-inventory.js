import { Router } from "express";
import { requireAdmin } from "../auth.js";
import { prisma } from "../db.js";
import { safetyBuffer, sellableQty } from "../stock.js";

export const adminInventoryRouter = Router();
adminInventoryRouter.use(requireAdmin);

const TO_SHIP = ["paid", "sent_to_bigseller"];

adminInventoryRouter.get("/", async (_req, res) => {
  const [variants, lockedItems] = await Promise.all([
    prisma.productVariant.findMany({
      include: {
        inventory: true,
        product: {
          select: {
            id: true,
            name: true,
            isActive: true,
            category: { select: { id: true, name: true } },
            images: { where: { variantId: null }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: 1 },
          },
        },
      },
      orderBy: [{ productId: "asc" }, { id: "asc" }],
    }),
    prisma.orderItem.findMany({
      where: { order: { status: { in: TO_SHIP } }, variantId: { not: null } },
      select: { variantId: true, qty: true, order: { select: { id: true, orderNo: true, paidAt: true } } },
    }),
  ]);

  const locked = new Map();
  for (const item of lockedItems) {
    const entry = locked.get(item.variantId) ?? { qty: 0, orders: new Map() };
    entry.qty += item.qty ?? 0;
    const o = entry.orders.get(item.order.id) ?? { orderNo: item.order.orderNo, paidAt: item.order.paidAt, qty: 0 };
    o.qty += item.qty ?? 0;
    entry.orders.set(item.order.id, o);
    locked.set(item.variantId, entry);
  }

  res.json(
    variants.map((v) => {
      const inv = v.inventory;
      const available = inv?.available ?? 0;
      const reserved = inv?.reserved ?? 0;
      const lock = locked.get(v.id);
      return {
        variantId: v.id,
        sku: v.sku,
        variantName: v.variationName,
        productId: v.product.id,
        productName: v.product.name,
        productActive: v.product.isActive !== false,
        category: v.product.category,
        image: v.product.images[0]?.url ?? null,
        tracked: Boolean(inv),
        available,
        reserved,
        safetyBuffer: inv ? safetyBuffer(inv) : 0,
        sellable: inv ? sellableQty(inv) : 0,
        lockedToShip: lock?.qty ?? 0,
        onShelf: available + (lock?.qty ?? 0),
        lockedOrders: lock ? [...lock.orders.values()].sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt)) : [],
      };
    }),
  );
});
