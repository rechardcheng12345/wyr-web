import { Router } from "express";
import { requireAdmin } from "../auth.js";
import { prisma } from "../db.js";
import { MARKETPLACE_SOLD_STATUSES, soldByVariant } from "../sold.js";
import { safetyBuffer, sellableQty } from "../stock.js";
import { syncHealth } from "../sync-health.js";

export const adminInventoryRouter = Router();
adminInventoryRouter.use(requireAdmin);

const TO_SHIP = ["paid", "sent_to_bigseller"];
const PLATFORMS = ["shopee", "lazada", "tiktok"];
const MOVEMENT_LIMIT = 200;

class InputError extends Error {}

function positiveId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new InputError("Invalid id");
  return id;
}

adminInventoryRouter.get("/", async (_req, res) => {
  const [variants, lockedItems, mappings, sold, health] = await Promise.all([
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
    prisma.platformSku.findMany({ select: { variantId: true, platform: true, needsReview: true } }),
    soldByVariant({ fresh: true }),
    syncHealth(),
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

  const mapped = new Map();
  for (const m of mappings) {
    const entry = mapped.get(m.variantId) ?? { shopee: 0, lazada: 0, tiktok: 0, needsReview: 0 };
    entry[m.platform] += 1;
    if (m.needsReview) entry.needsReview += 1;
    mapped.set(m.variantId, entry);
  }

  const staleMs = health.staleHours > 0 ? health.staleHours * 3_600_000 : null;
  const now = Date.now();

  res.json({
    sync: health,
    items: variants.map((v) => {
      const inv = v.inventory;
      const available = inv?.available ?? 0;
      const reserved = inv?.reserved ?? 0;
      const lock = locked.get(v.id);
      const map = mapped.get(v.id) ?? { shopee: 0, lazada: 0, tiktok: 0, needsReview: 0 };
      const syncedAt = inv?.syncedAt ?? null;
      const syncStatus = !inv ? "untracked" : !syncedAt ? "never" : staleMs && now - syncedAt.getTime() > staleMs ? "stale" : "ok";
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
        syncedAt,
        syncStatus,
        mappings: map,
        sold: sold(v.id),
      };
    }),
  });
});

adminInventoryRouter.get("/sync-status", async (_req, res) => {
  res.json(await syncHealth());
});

adminInventoryRouter.get("/mappings", async (_req, res) => {
  const [mappings, unmatched, variants] = await Promise.all([
    prisma.platformSku.findMany({
      include: { variant: { select: { id: true, sku: true, variationName: true, product: { select: { id: true, name: true } } } } },
      orderBy: [{ needsReview: "desc" }, { platform: "asc" }, { platformSku: "asc" }],
    }),
    prisma.marketplaceOrderItem.findMany({
      where: { variantId: null },
      select: { sku: true, name: true, qty: true, order: { select: { platform: true, orderNo: true, status: true, orderedAt: true, createdAt: true } } },
      orderBy: { id: "desc" },
      take: 2000,
    }),
    prisma.productVariant.findMany({
      select: { id: true, sku: true, variationName: true, product: { select: { name: true } } },
      orderBy: [{ productId: "asc" }, { id: "asc" }],
    }),
  ]);

  const groups = new Map();
  for (const item of unmatched) {
    const key = `${item.order.platform}|${item.sku.toLowerCase()}`;
    const g = groups.get(key) ?? { platform: item.order.platform, sku: item.sku, name: item.name, orders: 0, pieces: 0, lastOrderNo: item.order.orderNo, lastSeenAt: item.order.orderedAt ?? item.order.createdAt };
    g.orders += 1;
    if (MARKETPLACE_SOLD_STATUSES.includes(item.order.status)) g.pieces += item.qty;
    groups.set(key, g);
  }

  res.json({
    platforms: PLATFORMS,
    mappings: mappings.map((m) => ({
      id: m.id,
      platform: m.platform,
      platformSku: m.platformSku,
      packQty: m.packQty,
      needsReview: Boolean(m.needsReview),
      matchMethod: m.matchMethod,
      variantId: m.variantId,
      variantSku: m.variant.sku,
      variantName: m.variant.variationName,
      productName: m.variant.product.name,
    })),
    unmatched: [...groups.values()],
    variants: variants.map((v) => ({ id: v.id, sku: v.sku, name: v.variationName, productName: v.product.name })),
  });
});

async function parseMapping(body, { partial = false } = {}) {
  const data = {};
  if (!partial || body?.platform !== undefined) {
    if (!PLATFORMS.includes(body?.platform)) throw new InputError("Platform must be shopee, lazada or tiktok");
    data.platform = body.platform;
  }
  if (!partial || body?.platformSku !== undefined) {
    const sku = typeof body?.platformSku === "string" ? body.platformSku.trim() : "";
    if (!sku || sku.length > 120) throw new InputError("Marketplace SKU is required (at most 120 characters)");
    data.platformSku = sku;
  }
  if (!partial || body?.variantId !== undefined) {
    const variantId = Number(body?.variantId);
    if (!Number.isInteger(variantId) || !(await prisma.productVariant.findUnique({ where: { id: variantId }, select: { id: true } }))) {
      throw new InputError("Pick the product variant this SKU belongs to");
    }
    data.variantId = variantId;
  }
  if (!partial || body?.packQty !== undefined) {
    const packQty = Number(body?.packQty ?? 1);
    if (!Number.isInteger(packQty) || packQty < 1 || packQty > 10_000) throw new InputError("Pack size must be a whole number from 1");
    data.packQty = packQty;
  }
  return data;
}

async function attachUnmatched(platform, platformSku, variantId, packQty) {
  return prisma.$transaction(async (tx) => {
    const items = await tx.marketplaceOrderItem.findMany({
      where: { variantId: null, sku: platformSku, order: { platform } },
      select: { id: true, qty: true, order: { select: { id: true, orderNo: true, status: true } } },
    });
    if (!items.length) return 0;
    await tx.marketplaceOrderItem.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { variantId, packQty } });
    for (const item of items) {
      if (!MARKETPLACE_SOLD_STATUSES.includes(item.order.status)) continue;
      const delta = -(item.qty * packQty);
      await tx.inventory.upsert({ where: { variantId }, create: { variantId, available: delta }, update: { available: { increment: delta } } });
      await tx.stockMovement.create({
        data: { variantId, delta, reason: "marketplace", marketplaceOrderId: item.order.id, note: `${platform} ${item.order.orderNo} ${item.order.status} (SKU mapped)`.slice(0, 255) },
      });
    }
    return items.length;
  });
}

function sendError(res, err) {
  if (err instanceof InputError) return res.status(400).json({ error: err.message });
  if (err?.code === "P2002") return res.status(409).json({ error: "That marketplace SKU is already mapped for this platform" });
  if (err?.code === "P2025") return res.status(404).json({ error: "Mapping not found" });
  throw err;
}

adminInventoryRouter.post("/mappings", async (req, res) => {
  try {
    const data = await parseMapping(req.body);
    const created = await prisma.platformSku.create({ data: { ...data, matchMethod: "manual", needsReview: false } });
    const attached = await attachUnmatched(data.platform, data.platformSku, data.variantId, data.packQty);
    res.status(201).json({ id: created.id, attachedItems: attached });
  } catch (err) {
    sendError(res, err);
  }
});

adminInventoryRouter.put("/mappings/:id", async (req, res) => {
  try {
    const id = positiveId(req.params.id);
    const data = await parseMapping(req.body, { partial: true });
    const updated = await prisma.platformSku.update({ where: { id }, data: { ...data, matchMethod: "manual", needsReview: false } });
    res.json({ id: updated.id });
  } catch (err) {
    sendError(res, err);
  }
});

adminInventoryRouter.delete("/mappings/:id", async (req, res) => {
  try {
    await prisma.platformSku.delete({ where: { id: positiveId(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

adminInventoryRouter.get("/:variantId/movements", async (req, res) => {
  let variantId;
  try {
    variantId = positiveId(req.params.variantId);
  } catch (err) {
    return sendError(res, err);
  }
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { id: true, sku: true, variationName: true, product: { select: { name: true } }, inventory: true },
  });
  if (!variant) return res.status(404).json({ error: "Variant not found" });
  const rows = await prisma.stockMovement.findMany({
    where: { variantId },
    include: {
      order: { select: { orderNo: true } },
      marketplaceOrder: { select: { platform: true, orderNo: true } },
      document: { select: { docNo: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MOVEMENT_LIMIT,
  });
  let balance = variant.inventory?.available ?? 0;
  const movements = rows.map((m) => {
    const after = balance;
    balance -= m.delta;
    return {
      id: m.id,
      at: m.createdAt,
      delta: m.delta,
      after,
      reason: m.reason,
      note: m.note,
      orderNo: m.order?.orderNo ?? null,
      marketplace: m.marketplaceOrder ? `${m.marketplaceOrder.platform} ${m.marketplaceOrder.orderNo}` : null,
      document: m.document?.docNo ?? null,
    };
  });
  res.json({
    variantId,
    sku: variant.sku,
    variantName: variant.variationName,
    productName: variant.product.name,
    available: variant.inventory?.available ?? null,
    limit: MOVEMENT_LIMIT,
    movements,
  });
});
