// Per-piece tier lookup for display. The server (server/src/pricing.ts) is the source of truth: it sends
// the tiers with each product and re-prices the cart and checkout itself; this only mirrors the rule.

export interface PriceTier {
  /** From this many pieces up. The first tier is always 1 (the normal price). */
  minQty: number;
  /** RM per piece. */
  unitPrice: number;
}

/** The tier a quantity falls in (highest minQty <= qty), or null without tiers. */
export function tierFor(tiers: PriceTier[], qty: number): PriceTier | null {
  let tier: PriceTier | null = null;
  for (const t of tiers) if (qty >= t.minQty) tier = t;
  return tier ?? tiers[0] ?? null;
}

/** Whole-percent saving of `unit` against `base`, e.g. 1.30 vs 1.50 -> 13. */
export function savingPct(base: number, unit: number) {
  return base > 0 ? Math.round((1 - unit / base) * 100) : 0;
}

/** Same rounding as the server: unit price in sen times qty. */
export function lineTotal(unitPrice: number, qty: number) {
  return (Math.round(unitPrice * 100) * qty) / 100;
}
