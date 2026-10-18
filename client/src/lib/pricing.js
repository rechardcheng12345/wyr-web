// Per-piece tier lookup for display. The server (server/src/pricing.js) is the source of truth: it sends
// the tiers with each product and re-prices the cart and checkout itself; this only mirrors the rule.

/** The tier a quantity falls in (highest minQty <= qty), or null without tiers. */
export function tierFor(tiers, qty) {
  let tier = null;
  for (const t of tiers) if (qty >= t.minQty) tier = t;
  return tier ?? tiers[0] ?? null;
}

/** Whole-percent saving of `unit` against `base`, e.g. 1.30 vs 1.50 -> 13. */
export function savingPct(base, unit) {
  return base > 0 ? Math.round((1 - unit / base) * 100) : 0;
}

/** Same rounding as the server: unit price in sen times qty. */
export function lineTotal(unitPrice, qty) {
  return (Math.round(unitPrice * 100) * qty) / 100;
}
