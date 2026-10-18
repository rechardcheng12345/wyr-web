import type { Prisma } from "@prisma/client";

/**
 * Per-piece tiered pricing. The single place that decides what a piece costs at a given quantity:
 * the product API (tier table), the cart quote and POST /api/checkout all go through here.
 *
 * A variant's ladder starts with its own price (special price if set) from 1 piece, followed by its
 * price_tiers rows. Stock and order quantities are always in pieces.
 */

export interface Tier {
  minQty: number;
  unitPriceCents: number;
}

export interface PricedVariant {
  price: Prisma.Decimal | null;
  specialPrice: Prisma.Decimal | null;
  priceTiers?: { minQty: number; unitPrice: Prisma.Decimal }[];
}

const cents = (d: Prisma.Decimal) => Math.round(d.toNumber() * 100);

/**
 * The price ladder, cheapest last, or null if the variant has no price. A tier that isn't cheaper per
 * piece than the step before it is dropped, so buying more never costs more per piece (the import
 * already rejects those, but a later special price on the base could undercut a tier).
 */
export function priceLadder(v: PricedVariant): Tier[] | null {
  const base = v.specialPrice ?? v.price;
  if (base === null) return null;
  const ladder: Tier[] = [{ minQty: 1, unitPriceCents: cents(base) }];
  for (const t of [...(v.priceTiers ?? [])].sort((a, b) => a.minQty - b.minQty)) {
    const unitPriceCents = cents(t.unitPrice);
    if (t.minQty > 1 && unitPriceCents < ladder[ladder.length - 1].unitPriceCents) ladder.push({ minQty: t.minQty, unitPriceCents });
  }
  return ladder;
}

/** Per-piece price for buying `qty` pieces: the highest tier the quantity reaches. */
export function unitPriceCents(ladder: Tier[], qty: number) {
  let price = ladder[0].unitPriceCents;
  for (const t of ladder) if (qty >= t.minQty) price = t.unitPriceCents;
  return price;
}

/** From this many pieces the product page also offers a bulk / business quote over WhatsApp. */
export const BULK_QUOTE_MIN_QTY = 50;

export function bulkQuote() {
  // Digits only, with country code (wa.me format), e.g. 60123456789.
  const number = (process.env.WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
  return { minQty: BULK_QUOTE_MIN_QTY, whatsappNumber: number || null };
}

/** quick_qtys JSON -> sorted positive integers (anything else is ignored). */
export function quickQtys(value: Prisma.JsonValue | null): number[] {
  if (!Array.isArray(value)) return [];
  const qtys = value.filter((q): q is number => typeof q === "number" && Number.isSafeInteger(q) && q > 1);
  return [...new Set(qtys)].sort((a, b) => a - b);
}
