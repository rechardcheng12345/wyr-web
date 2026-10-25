import { Prisma } from "@prisma/client";
import { getSetting } from "./settings.js";

export function safetyBuffer(inventory) {
  return Math.max(inventory?.safetyBuffer ?? 0, getSetting("stock_safety_buffer"));
}

export function sellableQty(inventory) {
  if (!inventory) return null;
  return Math.max(0, inventory.available - inventory.reserved - safetyBuffer(inventory));
}

export function sellableSql() {
  return Prisma.sql`available - reserved - GREATEST(safety_buffer, ${getSetting("stock_safety_buffer")})`;
}

export function minQtyFor(basePriceCents) {
  if (basePriceCents == null) return 1;
  return basePriceCents < Math.round(getSetting("low_price_threshold") * 100) ? getSetting("low_price_min_qty") : 1;
}

export async function logStockMovement(db, { variantId, delta, reason, orderId = null, note = null }) {
  if (!delta) return;
  await db.stockMovement.create({ data: { variantId, delta, reason, orderId, note: note?.slice(0, 255) ?? null } });
}
