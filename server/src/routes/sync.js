import { Prisma } from "@prisma/client";
import express, { Router } from "express";
import { safeEqual } from "../auth.js";
import { prisma } from "../db.js";
import { createLimiter } from "../rate-limit.js";
import { logStockMovement } from "../stock.js";

// Machine-to-machine API for keeping the site in step with BigSeller:
//   POST /api/sync/orders  marketplace orders (new or updated). Paid/shipped/completed orders take stock,
//                          cancelled/returned/unpaid ones don't, so a status change puts stock back.
//   POST /api/sync/stock   a stock count: sets each SKU's on-hand qty to the number sent.
// Both take ?dryRun=1 to see what would change without saving anything. Authenticated with the
// SYNC_API_KEY env var, sent as "Authorization: Bearer <key>" or "X-API-Key: <key>".

export const syncRouter = Router();

const MIN_KEY_LENGTH = 24;
const MAX_ORDERS = 500;
const MAX_ITEMS_PER_ORDER = 200;
const MAX_STOCK_ITEMS = 5000;
const MAX_QTY = 1_000_000;

const PLATFORMS = { shopee: "shopee", lazada: "lazada", tiktok: "tiktok", tiktokshop: "tiktok", "tiktok shop": "tiktok" };
const STATUSES = {
  unpaid: "unpaid",
  pending: "unpaid",
  paid: "paid",
  to_ship: "paid",
  ready_to_ship: "paid",
  processing: "paid",
  shipped: "shipped",
  in_transit: "shipped",
  completed: "completed",
  delivered: "completed",
  cancelled: "cancelled",
  canceled: "cancelled",
  returned: "returned",
  refunded: "returned",
};
// Orders in these statuses have their items taken out of stock.
const TAKES_STOCK = new Set(["paid", "shipped", "completed"]);
// Unique key race and write conflict/deadlock.
const RETRY_CODES = new Set(["P2002", "P2034"]);

const failedAuth = createLimiter({ windowMs: 15 * 60_000, max: 20 });

function requireSyncKey(req, res, next) {
  const key = process.env.SYNC_API_KEY?.trim() ?? "";
  if (key.length < MIN_KEY_LENGTH) {
    res.status(503).json({ error: `Sync API is off: set SYNC_API_KEY (at least ${MIN_KEY_LENGTH} characters) on the server` });
    return;
  }
  if (failedAuth.blocked(req.ip)) {
    res.status(429).json({ error: "Too many failed attempts, try again later" });
    return;
  }
  const header = req.get("authorization") ?? "";
  const given = (header.toLowerCase().startsWith("bearer ") ? header.slice(7) : req.get("x-api-key") ?? "").trim();
  if (!given || !safeEqual(given, key)) {
    failedAuth.hit(req.ip);
    res.status(401).json({ error: "Invalid API key" });
    return;
  }
  next();
}

syncRouter.use(requireSyncKey);
// Daily pushes can be large; the app-wide JSON parser stops at 100 kB.
syncRouter.use(express.json({ limit: "5mb" }));

class InputError extends Error {}

function text(raw, max, label, required = false) {
  const value = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  if (raw != null && typeof raw !== "string" && typeof raw !== "number") throw new InputError(`${label} must be text`);
  if (required && !value) throw new InputError(`${label} is required`);
  if (value.length > max) throw new InputError(`${label} is longer than ${max} characters`);
  return value || null;
}

function money(raw, label) {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n >= 1e8) throw new InputError(`${label} must be an amount in RM`);
  return Math.round(n * 100) / 100;
}

function qty(raw, label, min) {
  if (!Number.isInteger(raw) || raw < min || raw > MAX_QTY) throw new InputError(`${label} must be a whole number from ${min}`);
  return raw;
}

function timestamp(raw) {
  if (raw == null || raw === "") return null;
  // Numbers are Unix time, in seconds or milliseconds. Strings should carry a time zone, e.g. +08:00.
  const ms = typeof raw === "number" ? (raw < 1e12 ? raw * 1000 : raw) : typeof raw === "string" ? Date.parse(raw) : NaN;
  if (!Number.isFinite(ms)) throw new InputError("orderedAt must be a date, e.g. 2026-10-27T14:30:00+08:00");
  return new Date(ms);
}

function parseOrder(raw) {
  if (!raw || typeof raw !== "object") throw new InputError("Each order must be an object");
  const platform = PLATFORMS[String(raw.platform ?? "").trim().toLowerCase()];
  if (!platform) throw new InputError("platform must be shopee, lazada or tiktok");
  const status = STATUSES[String(raw.status ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_")];
  if (!status) throw new InputError(`status must be one of: ${Object.keys(STATUSES).join(", ")}`);
  if (!Array.isArray(raw.items) || raw.items.length === 0) throw new InputError("items must be a non-empty list");
  if (raw.items.length > MAX_ITEMS_PER_ORDER) throw new InputError(`At most ${MAX_ITEMS_PER_ORDER} items per order`);
  return {
    platform,
    orderNo: text(raw.orderNo, 80, "orderNo", true),
    bigsellerOrderId: text(raw.bigsellerOrderId, 80, "bigsellerOrderId"),
    status,
    buyerName: text(raw.buyerName, 150, "buyerName"),
    total: money(raw.total, "total"),
    orderedAt: timestamp(raw.orderedAt),
    items: raw.items.map((item, i) => {
      const label = `items[${i}]`;
      if (!item || typeof item !== "object") throw new InputError(`${label} must be an object`);
      return {
        sku: text(item.sku, 120, `${label}.sku`, true),
        name: text(item.name, 255, `${label}.name`),
        qty: qty(item.qty, `${label}.qty`, 1),
        unitPrice: money(item.unitPrice, `${label}.unitPrice`),
      };
    }),
  };
}

const lower = (s) => s.toLowerCase();

/**
 * Finds the variant behind each SKU: the platform's own SKU mapping first (pack SKUs count as
 * pack_qty pieces), then our variant SKU. Returns lookup(platform, sku) -> { variantId, packQty } | null.
 */
async function skuResolver(entries) {
  const skus = [...new Set(entries.map((e) => e.sku))];
  const [platformSkus, variants] = await Promise.all([
    prisma.platformSku.findMany({
      where: { platformSku: { in: skus } },
      select: { platform: true, platformSku: true, variantId: true, packQty: true },
    }),
    prisma.productVariant.findMany({ where: { sku: { in: skus } }, select: { id: true, sku: true } }),
  ]);
  const byPlatform = new Map(platformSkus.map((p) => [`${p.platform}|${lower(p.platformSku)}`, p]));
  const byVariant = new Map(variants.map((v) => [lower(v.sku), v.id]));
  return (platform, sku) => {
    const mapped = byPlatform.get(`${platform}|${lower(sku)}`);
    if (mapped) return { variantId: mapped.variantId, packQty: Math.max(1, mapped.packQty) };
    const variantId = byVariant.get(lower(sku));
    return variantId ? { variantId, packQty: 1 } : null;
  };
}

const num = (d) => (d == null ? null : Number(d));
const itemKey = (i) => `${i.sku}|${i.name ?? ""}|${i.qty}|${i.unitPrice ?? ""}|${i.variantId ?? ""}|${i.packQty}`;

function sameOrder(existing, order) {
  return (
    existing.status === order.status &&
    existing.bigsellerOrderId === order.bigsellerOrderId &&
    existing.buyerName === order.buyerName &&
    num(existing.total) === order.total &&
    (existing.orderedAt?.getTime() ?? null) === (order.orderedAt?.getTime() ?? null) &&
    existing.items.map((i) => itemKey({ ...i, unitPrice: num(i.unitPrice) })).sort().join("\n") === order.items.map(itemKey).sort().join("\n")
  );
}

async function syncOrder(order, apply) {
  return prisma.$transaction(async (tx) => {
    // Lock the order so two pushes of the same order can't both take its stock. This must be the
    // transaction's first read: InnoDB takes its snapshot at the first plain read, and a snapshot from
    // before the lock wait would miss the stock the other push just took.
    const [found] = await tx.$queryRaw`SELECT id FROM marketplace_orders WHERE platform = ${order.platform} AND order_no = ${order.orderNo} FOR UPDATE`;
    const existing = found ? await tx.marketplaceOrder.findUnique({ where: { id: found.id }, include: { items: true } }) : null;

    // Pieces this order should have taken per variant, against what its earlier syncs took.
    const wanted = new Map();
    if (TAKES_STOCK.has(order.status)) {
      for (const i of order.items) if (i.variantId) wanted.set(i.variantId, (wanted.get(i.variantId) ?? 0) + i.qty * i.packQty);
    }
    const taken = new Map();
    if (existing) {
      const ledger = await tx.stockMovement.groupBy({ by: ["variantId"], where: { marketplaceOrderId: existing.id }, _sum: { delta: true } });
      for (const row of ledger) taken.set(row.variantId, -(row._sum.delta ?? 0));
    }
    const changes = [];
    for (const variantId of new Set([...wanted.keys(), ...taken.keys()])) {
      const delta = (taken.get(variantId) ?? 0) - (wanted.get(variantId) ?? 0);
      if (delta) changes.push({ variantId, delta });
    }

    const result = !existing ? "created" : changes.length || !sameOrder(existing, order) ? "updated" : "unchanged";
    if (!apply || result === "unchanged") return { result, changes };

    const data = {
      bigsellerOrderId: order.bigsellerOrderId,
      status: order.status,
      buyerName: order.buyerName,
      total: order.total,
      orderedAt: order.orderedAt,
    };
    const items = order.items.map(({ sku, name, qty, unitPrice, variantId, packQty }) => ({ sku, name, qty, unitPrice, variantId, packQty }));
    let id = existing?.id;
    if (existing) {
      await tx.marketplaceOrderItem.deleteMany({ where: { orderId: id } });
      await tx.marketplaceOrder.update({ where: { id }, data: { ...data, items: { create: items } } });
    } else {
      id = (await tx.marketplaceOrder.create({ data: { platform: order.platform, orderNo: order.orderNo, ...data, items: { create: items } } })).id;
    }
    // Fixed lock order by variant id, as in orders.js.
    for (const { variantId, delta } of changes.sort((a, b) => a.variantId - b.variantId)) {
      await tx.inventory.upsert({
        where: { variantId },
        create: { variantId, available: delta },
        update: { available: { increment: delta } },
      });
      await tx.stockMovement.create({
        data: { variantId, delta, reason: "marketplace", marketplaceOrderId: id, note: `${order.platform} ${order.orderNo} ${order.status}`.slice(0, 255) },
      });
    }
    return { result, changes };
  });
}

async function variantSkus(ids) {
  if (!ids.length) return new Map();
  const rows = await prisma.productVariant.findMany({ where: { id: { in: ids } }, select: { id: true, sku: true } });
  return new Map(rows.map((r) => [r.id, r.sku]));
}

const isDryRun = (req) => ["1", "true", "yes"].includes(String(req.query.dryRun ?? "").toLowerCase());

syncRouter.post("/orders", async (req, res, next) => {
  try {
    const list = req.body?.orders;
    if (!Array.isArray(list) || list.length === 0) {
      res.status(400).json({ error: 'Send { "orders": [ ... ] } with at least one order' });
      return;
    }
    if (list.length > MAX_ORDERS) {
      res.status(400).json({ error: `At most ${MAX_ORDERS} orders per request; send the rest in another request` });
      return;
    }
    const apply = !isDryRun(req);
    const parsed = list.map((raw, index) => {
      try {
        return { index, order: parseOrder(raw) };
      } catch (err) {
        if (!(err instanceof InputError)) throw err;
        return { index, error: err.message, platform: raw?.platform ?? null, orderNo: raw?.orderNo ?? null };
      }
    });
    const resolve = await skuResolver(parsed.flatMap((p) => (p.order ? p.order.items : [])));
    for (const { order } of parsed) {
      if (!order) continue;
      for (const item of order.items) Object.assign(item, resolve(order.platform, item.sku) ?? { variantId: null, packQty: 1 });
    }

    const results = [];
    for (const p of parsed) {
      if (!p.order) {
        results.push({ index: p.index, platform: p.platform, orderNo: p.orderNo, result: "error", error: p.error });
        continue;
      }
      const { order } = p;
      const unmatched = [...new Set(order.items.filter((i) => !i.variantId).map((i) => i.sku))];
      let synced;
      for (let attempt = 1; !synced; attempt++) {
        try {
          synced = await syncOrder(order, apply);
        } catch (err) {
          // Pushes of the same new order at once: one creates it, the others hit the unique key or an
          // InnoDB gap-lock deadlock, roll back, and run again as an update of it.
          if (!(err instanceof Prisma.PrismaClientKnownRequestError && RETRY_CODES.has(err.code)) || attempt === 3) throw err;
        }
      }
      results.push({ index: p.index, platform: order.platform, orderNo: order.orderNo, status: order.status, ...synced, unmatched });
    }

    const skuOf = await variantSkus([...new Set(results.flatMap((r) => (r.changes ?? []).map((c) => c.variantId)))]);
    const count = (result) => results.filter((r) => r.result === result).length;
    res.json({
      dryRun: !apply,
      summary: { created: count("created"), updated: count("updated"), unchanged: count("unchanged"), failed: count("error") },
      unmatchedSkus: [...new Set(results.flatMap((r) => r.unmatched ?? []))],
      orders: results.map(({ changes, ...r }) => ({
        ...r,
        ...(changes ? { stock: changes.map((c) => ({ sku: skuOf.get(c.variantId) ?? `variant ${c.variantId}`, delta: c.delta })) } : {}),
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** Stock count SKUs: our variant SKU, or a single-piece platform SKU that points at exactly one variant. */
async function stockSkuResolver(skus) {
  const [variants, platformSkus] = await Promise.all([
    prisma.productVariant.findMany({ where: { sku: { in: skus } }, select: { id: true, sku: true } }),
    prisma.platformSku.findMany({ where: { platformSku: { in: skus }, packQty: 1 }, select: { platformSku: true, variantId: true } }),
  ]);
  const byVariant = new Map(variants.map((v) => [lower(v.sku), v.id]));
  const byPlatform = new Map();
  for (const p of platformSkus) {
    const key = lower(p.platformSku);
    byPlatform.set(key, (byPlatform.get(key) ?? new Set()).add(p.variantId));
  }
  return (sku) => {
    const id = byVariant.get(lower(sku));
    if (id) return id;
    const ids = byPlatform.get(lower(sku));
    return ids?.size === 1 ? [...ids][0] : null;
  };
}

syncRouter.post("/stock", async (req, res, next) => {
  try {
    const list = req.body?.items;
    if (!Array.isArray(list) || list.length === 0) {
      res.status(400).json({ error: 'Send { "items": [ { "sku": "...", "qty": 10 } ] }' });
      return;
    }
    if (list.length > MAX_STOCK_ITEMS) {
      res.status(400).json({ error: `At most ${MAX_STOCK_ITEMS} SKUs per request` });
      return;
    }
    let note;
    try {
      note = text(req.body.note, 200, "note") ?? "stock count";
    } catch (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    const apply = !isDryRun(req);

    const rows = list.map((raw, index) => {
      try {
        if (!raw || typeof raw !== "object") throw new InputError("Each item must be an object");
        return { index, sku: text(raw.sku, 120, "sku", true), qty: qty(raw.qty, "qty", 0) };
      } catch (err) {
        if (!(err instanceof InputError)) throw err;
        return { index, sku: raw?.sku ?? null, result: "error", error: err.message };
      }
    });
    const resolve = await stockSkuResolver([...new Set(rows.filter((r) => !r.result).map((r) => r.sku))]);
    const seen = new Map();
    for (const r of rows) {
      if (r.result) continue;
      r.variantId = resolve(r.sku);
      if (!r.variantId) Object.assign(r, { result: "unmatched", error: "No product variant has this SKU" });
      else if (seen.has(r.variantId)) Object.assign(r, { result: "error", error: `Same product as ${seen.get(r.variantId)} earlier in this list` });
      else seen.set(r.variantId, r.sku);
    }

    const counted = rows.filter((r) => !r.result);
    await prisma.$transaction(
      async (tx) => {
        const ids = counted.map((r) => r.variantId);
        const current = ids.length
          ? await tx.$queryRaw`SELECT variant_id AS variantId, available FROM inventory WHERE variant_id IN (${Prisma.join(ids)}) FOR UPDATE`
          : [];
        const before = new Map(current.map((c) => [Number(c.variantId), Number(c.available)]));
        const now = new Date();
        for (const r of counted) {
          r.before = before.get(r.variantId) ?? null;
          r.after = r.qty;
          r.delta = r.qty - (r.before ?? 0);
          r.result = r.before === r.qty ? "unchanged" : "updated";
          if (!apply) continue;
          await tx.inventory.upsert({
            where: { variantId: r.variantId },
            create: { variantId: r.variantId, available: r.qty, syncedAt: now },
            update: { available: r.qty, syncedAt: now },
          });
          await logStockMovement(tx, { variantId: r.variantId, delta: r.delta, reason: "stock_count", note });
        }
      },
      { timeout: 60_000 },
    );

    const count = (result) => rows.filter((r) => r.result === result).length;
    res.json({
      dryRun: !apply,
      summary: { updated: count("updated"), unchanged: count("unchanged"), unmatched: count("unmatched"), failed: count("error") },
      items: rows.map(({ index, sku, result, before, after, delta, error }) => ({ index, sku, result, ...(error ? { error } : { before, after, delta }) })),
    });
  } catch (err) {
    next(err);
  }
});
