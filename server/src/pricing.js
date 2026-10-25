import { getSetting } from "./settings.js";

/**
 * Per-piece tiered pricing. The single place that decides what a piece costs at a given quantity:
 * the product API (tier table), the cart quote and POST /api/checkout all go through here.
 *
 * A variant's ladder starts with its own price (special price if set) from 1 piece, followed by its
 * price_tiers rows. Stock and order quantities are always in pieces.
 */

const cents = (d) => Math.round(d.toNumber() * 100);

/**
 * The price ladder, cheapest last, or null if the variant has no price. A tier that isn't cheaper per
 * piece than the step before it is dropped, so buying more never costs more per piece (the import
 * already rejects those, but a later special price on the base could undercut a tier).
 */
export function priceLadder(v) {
  const base = v.specialPrice ?? v.price;
  if (base === null) return null;
  const ladder = [{ minQty: 1, unitPriceCents: cents(base) }];
  for (const t of [...(v.priceTiers ?? [])].sort((a, b) => a.minQty - b.minQty)) {
    const unitPriceCents = cents(t.unitPrice);
    if (t.minQty > 1 && unitPriceCents < ladder[ladder.length - 1].unitPriceCents) ladder.push({ minQty: t.minQty, unitPriceCents });
  }
  return ladder;
}

/** Per-piece price for buying `qty` pieces: the highest tier the quantity reaches. */
export function unitPriceCents(ladder, qty) {
  let price = ladder[0].unitPriceCents;
  for (const t of ladder) if (qty >= t.minQty) price = t.unitPriceCents;
  return price;
}

export function bulkQuote() {
  // Digits only, with country code (wa.me format), e.g. 60123456789.
  const number = getSetting("whatsappNumber").replace(/\D/g, "");
  return { minQty: getSetting("bulkQuoteMinQty"), whatsappNumber: number || null };
}

/** quick_qtys JSON -> sorted positive integers (anything else is ignored). */
export function quickQtys(value) {
  if (!Array.isArray(value)) return [];
  const qtys = value.filter((q) => typeof q === "number" && Number.isSafeInteger(q) && q > 1);
  return [...new Set(qtys)].sort((a, b) => a - b);
}
