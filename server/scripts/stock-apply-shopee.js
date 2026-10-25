import "../src/env.js";
import { prisma } from "../src/db.js";
import { logStockMovement } from "../src/stock.js";
import { loadShopeeRows, matchShopeeRows } from "./stock-crosscheck.js";

const apply = process.argv.includes("--apply");

const rows = await loadShopeeRows();
const { results } = await matchShopeeRows(rows);

const planned = new Map();
for (const { row, variant } of results) {
  if (!variant) continue;
  const prev = planned.get(variant.id);
  if (prev && prev.target !== row.stock) {
    console.warn(`! ${variant.sku}: several Shopee rows with different stock (${prev.target} vs ${row.stock}); keeping the first`);
    continue;
  }
  if (!prev) planned.set(variant.id, { variant, target: row.stock, shopeeSku: row.sku });
}

const changes = [...planned.values()].filter(({ variant, target }) => (variant.inventory?.available ?? 0) !== target);
console.log(`${apply ? "APPLY" : "DRY RUN"}: ${changes.length} variant(s) would change (of ${planned.size} matched)`);
for (const { variant, target, shopeeSku } of changes) {
  const current = variant.inventory?.available ?? 0;
  console.log(`  ${variant.sku.padEnd(32)} ${String(current).padStart(6)} -> ${String(target).padStart(6)} (${target - current >= 0 ? "+" : ""}${target - current}) [shopee ${shopeeSku}]`);
}

if (!apply) {
  console.log("\nNothing written. Run with --apply to set site stock to the Shopee numbers.");
} else {
  for (const { variant, target, shopeeSku } of changes) {
    await prisma.$transaction(async (tx) => {
      const before = await tx.inventory.findUnique({ where: { variantId: variant.id } });
      await tx.inventory.upsert({ where: { variantId: variant.id }, create: { variantId: variant.id, available: target }, update: { available: target } });
      await logStockMovement(tx, { variantId: variant.id, delta: target - (before?.available ?? 0), reason: "import", note: `Shopee stock ${shopeeSku}` });
    });
  }
  console.log(`\nUpdated ${changes.length} variant(s); each change is logged in stock_movements (reason 'import').`);
}
await prisma.$disconnect();
