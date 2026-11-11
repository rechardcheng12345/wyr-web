import { prisma } from "./db.js";
import { notifyAdmin } from "./notify.js";
import { getSetting } from "./settings.js";

const CHECK_MS = 30 * 60_000;
const REPEAT_ALERT_MS = 24 * 3_600_000;
let lastStaleAlert = 0;

export function syncKeyConfigured() {
  return (process.env.SYNC_API_KEY?.trim().length ?? 0) >= 24;
}

export async function syncHealth(now = new Date()) {
  const [call, stock, order, orders, unmatched, negative] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "_last_sync_at" } }),
    prisma.inventory.aggregate({ _max: { syncedAt: true } }),
    prisma.marketplaceOrder.aggregate({ _max: { updatedAt: true } }),
    prisma.marketplaceOrder.count(),
    prisma.marketplaceOrderItem.count({ where: { variantId: null } }),
    prisma.inventory.count({ where: { available: { lt: 0 } } }),
  ]);
  const lastStockSyncAt = stock._max.syncedAt ?? null;
  const lastOrderSyncAt = order._max.updatedAt ?? null;
  const lastCallAt = call ? call.updatedAt : null;
  const lastSyncAt = [lastStockSyncAt, lastOrderSyncAt, lastCallAt].filter(Boolean).sort((a, b) => b - a)[0] ?? null;
  const staleHours = getSetting("sync_stale_hours");
  const ageHours = lastSyncAt ? (now - lastSyncAt) / 3_600_000 : null;
  const state = !lastSyncAt ? "never" : staleHours > 0 && ageHours > staleHours ? "stale" : "ok";
  return {
    keyConfigured: syncKeyConfigured(),
    state,
    staleHours,
    lastSyncAt,
    lastStockSyncAt,
    lastOrderSyncAt,
    ageHours: ageHours == null ? null : Math.round(ageHours * 10) / 10,
    marketplaceOrders: orders,
    unmatchedItems: unmatched,
    negativeSkus: negative,
  };
}

export async function checkSyncHealth(now = new Date()) {
  const health = await syncHealth(now);
  if (health.state !== "stale" || !health.keyConfigured) return { alerted: false, health };
  if (now.getTime() - lastStaleAlert < REPEAT_ALERT_MS) return { alerted: false, health };
  lastStaleAlert = now.getTime();
  const sent = await notifyAdmin({
    title: `Stock sync is stale (${Math.round(health.ageHours)} h)`,
    body: `Nothing has arrived from BigSeller since ${health.lastSyncAt.toISOString()}. Website stock may no longer match Shopee, Lazada and TikTok. Check the sync, or raise the stock safety buffer.`,
  });
  return { alerted: sent, health };
}

const TO_SHIP = ["paid", "sent_to_bigseller"];

export async function oversoldRows(variantIds) {
  if (!variantIds.length) return [];
  const rows = await prisma.inventory.findMany({
    where: { variantId: { in: variantIds }, available: { lt: 0 } },
    select: { variantId: true, available: true, variant: { select: { sku: true } } },
  });
  if (!rows.length) return [];
  const locked = await prisma.orderItem.groupBy({
    by: ["variantId"],
    where: { variantId: { in: rows.map((r) => r.variantId) }, order: { status: { in: TO_SHIP } } },
    _sum: { qty: true },
  });
  const lockedBy = new Map(locked.map((r) => [r.variantId, r._sum.qty ?? 0]));
  return rows.map((r) => ({ sku: r.variant.sku, available: r.available, locked: lockedBy.get(r.variantId) ?? 0 }));
}

export async function alertIfOrderOversold(orderId, orderNo) {
  try {
    const items = await prisma.orderItem.findMany({ where: { orderId, variantId: { not: null } }, select: { variantId: true } });
    const rows = await oversoldRows([...new Set(items.map((i) => i.variantId))]);
    if (rows.length) await alertOversold(rows, `After website order ${orderNo} was paid.`);
    return rows;
  } catch (err) {
    console.error(`[sync-health] oversell check for ${orderNo} failed: ${err.message}`);
    return [];
  }
}

export function alertOversold(rows, source) {
  if (!rows.length) return Promise.resolve(false);
  const lines = rows.map((r) => `- ${r.sku}: ${r.available} available${r.locked ? `, ${r.locked} locked for website orders` : ""}`);
  return notifyAdmin({
    title: `Oversold: ${rows.length} SKU${rows.length === 1 ? "" : "s"} below zero`,
    body: `${source}\n\n${lines.join("\n")}\n\nMore pieces were sold than are on the shelf. One of the orders has to be cancelled or the stock corrected.`,
    priority: "urgent",
    tags: "rotating_light",
  });
}

export function startSyncHealthJob() {
  const tick = () => checkSyncHealth().catch((err) => console.error("[sync-health]", err));
  return setInterval(tick, CHECK_MS).unref();
}
