import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";

export const WEBSITE_SOLD_STATUSES = ["paid", "sent_to_bigseller", "shipped", "completed"];
export const MARKETPLACE_SOLD_STATUSES = ["paid", "shipped", "completed"];
export const CHANNELS = ["website", "shopee", "lazada", "tiktok"];

const TTL_MS = 60_000;
const RECENT_DAYS = 30;
let cache = null;

const empty = () => ({ website: 0, shopee: 0, lazada: 0, tiktok: 0, total: 0, website30: 0, shopee30: 0, lazada30: 0, tiktok30: 0, total30: 0 });

async function load() {
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000);
  const [site, market, bases] = await Promise.all([
    prisma.$queryRaw`
      SELECT oi.variant_id AS variantId, SUM(oi.qty) AS total,
             SUM(CASE WHEN COALESCE(o.paid_at, o.created_at) >= ${since} THEN oi.qty ELSE 0 END) AS recent
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.status IN (${Prisma.join(WEBSITE_SOLD_STATUSES)}) AND oi.variant_id IS NOT NULL
      GROUP BY oi.variant_id`,
    prisma.$queryRaw`
      SELECT mo.platform AS platform, i.variant_id AS variantId, SUM(i.qty * i.pack_qty) AS total,
             SUM(CASE WHEN COALESCE(mo.ordered_at, mo.created_at) >= ${since} THEN i.qty * i.pack_qty ELSE 0 END) AS recent
      FROM marketplace_order_items i JOIN marketplace_orders mo ON mo.id = i.order_id
      WHERE mo.status IN (${Prisma.join(MARKETPLACE_SOLD_STATUSES)}) AND i.variant_id IS NOT NULL
      GROUP BY mo.platform, i.variant_id`,
    prisma.productVariant.findMany({ select: { id: true, productId: true, product: { select: { soldBase: true } } } }),
  ]);

  const byVariant = new Map();
  const add = (variantId, channel, total, recent) => {
    const row = byVariant.get(variantId) ?? empty();
    row[channel] += total;
    row[`${channel}30`] += recent;
    row.total += total;
    row.total30 += recent;
    byVariant.set(variantId, row);
  };
  for (const r of site) add(Number(r.variantId), "website", Number(r.total ?? 0), Number(r.recent ?? 0));
  for (const r of market) add(Number(r.variantId), r.platform, Number(r.total ?? 0), Number(r.recent ?? 0));

  const byProduct = new Map();
  for (const v of bases) {
    const current = byProduct.get(v.productId) ?? Math.max(0, v.product.soldBase ?? 0);
    byProduct.set(v.productId, current + (byVariant.get(v.id)?.total ?? 0));
  }
  return { byVariant, byProduct, at: Date.now() };
}

async function current() {
  if (!cache || Date.now() - cache.at > TTL_MS) cache = await load();
  return cache;
}

export function clearSoldCache() {
  cache = null;
}

export async function soldByVariant({ fresh = false } = {}) {
  if (fresh) clearSoldCache();
  const { byVariant } = await current();
  return (variantId) => byVariant.get(variantId) ?? empty();
}

export async function soldByProduct() {
  const { byProduct } = await current();
  return (productId) => byProduct.get(productId) ?? 0;
}
