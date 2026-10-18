/**
 * Per-piece tiered pricing for items the marketplaces sell as packs (3/5/10, 10/100 ...).
 *
 * Source: _handoff/bundle_items.csv, one row per Lazada pack SKU:
 *   shopee_sku, pack_qty, Price (Lazada pack price, MYR), SellerSKU, Product Name
 * For every pack_qty > 1 row the site gets a tier: from pack_qty pieces, pack price / pack_qty per
 * piece (rounded down to the sen, so N pieces here never cost more than the N-pack on Lazada). The
 * 1+ price stays the Shopee price already on the variant; pack_qty 1 rows are not used for prices.
 * Every pack size also becomes a quick-pick quantity button (product_variants.quick_qtys).
 *
 * A tier is only imported if it is cheaper per piece than the price below it (the variant's own
 * price, or the last imported tier). Rejected tiers and conflicting duplicate rows are reported
 * for the owner to confirm ("Pricing to confirm" in PROGRESS.md) and left out.
 *
 * Runs as part of import-catalog.ts, or on its own against the current catalog (which is safe
 * once orders exist, unlike the full import: only price_tiers and quick_qtys are replaced):
 *   npm run import:tiers -w server              # write
 *   npm run import:tiers -w server -- --dry-run # report only
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseCsv } from "csv-parse/sync";
import type { Prisma, PrismaClient } from "@prisma/client";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const defaultBundleCsv = path.join(repoRoot, "_handoff/bundle_items.csv");

export interface TierPlan {
  /** Lowercased variant SKU -> tiers (cheapest last) and quick-pick pack sizes. */
  bySku: Map<string, { tiers: { minQty: number; unitPriceCents: number }[]; quickQtys: number[] }>;
  /** Tiers that were left out, for the owner to confirm. */
  rejected: string[];
  /** CSV SKUs with no variant in the catalog. */
  unknownSkus: string[];
}

const rm = (cents: number) => `RM${(cents / 100).toFixed(2)}`;

/** `variants`: the catalog's SKUs with their 1+ price (special price if set). */
export function planPriceTiers(csvPath: string, variants: { sku: string; baseCents: number | null }[]): TierPlan {
  const rows: Record<string, string>[] = parseCsv(readFileSync(csvPath), { columns: true, skip_empty_lines: true, trim: true, bom: true });
  const variantBySku = new Map(variants.map((v) => [v.sku.toLowerCase(), v]));
  const plan: TierPlan = { bySku: new Map(), rejected: [], unknownSkus: [] };

  for (const [sku, skuRows] of Map.groupBy(rows, (r) => r.shopee_sku.toLowerCase())) {
    const variant = variantBySku.get(sku);
    if (!variant) {
      plan.unknownSkus.push(sku);
      continue;
    }
    const packs = new Map<number, number[]>(); // pack_qty -> distinct pack prices in cents
    for (const r of skuRows) {
      const qty = Number(r.pack_qty);
      const priceCents = Math.round(Number(r.Price) * 100);
      if (!Number.isSafeInteger(qty) || qty < 1 || !Number.isFinite(priceCents) || priceCents <= 0) {
        plan.rejected.push(`${variant.sku}: unreadable row (pack_qty "${r.pack_qty}", price "${r.Price}")`);
        continue;
      }
      const prices = packs.get(qty) ?? [];
      if (!prices.includes(priceCents)) prices.push(priceCents);
      packs.set(qty, prices);
    }

    const quickQtys = [...packs.keys()].filter((q) => q > 1).sort((a, b) => a - b);
    const tiers: { minQty: number; unitPriceCents: number }[] = [];
    if (variant.baseCents === null) {
      plan.rejected.push(`${variant.sku}: no single-piece price on the site, so no tiers imported`);
    } else {
      let below = { label: `the 1-piece price ${rm(variant.baseCents)}`, cents: variant.baseCents };
      for (const qty of quickQtys) {
        const prices = packs.get(qty)!;
        if (prices.length > 1) {
          plan.rejected.push(`${variant.sku} ${qty}+: two Lazada listings price the ${qty}-pack differently (${prices.map(rm).join(" vs ")})`);
          continue;
        }
        const unit = Math.floor(prices[0] / qty);
        const what = `${qty}-pack ${rm(prices[0])} = ${rm(unit)}/pc`;
        if (unit >= below.cents) {
          plan.rejected.push(`${variant.sku} ${qty}+: ${what}, ${unit === below.cents ? "no cheaper than" : "dearer than"} ${below.label}`);
          continue;
        }
        tiers.push({ minQty: qty, unitPriceCents: unit });
        below = { label: `the ${qty}+ tier ${rm(unit)}/pc`, cents: unit };
      }
    }
    plan.bySku.set(sku, { tiers, quickQtys });
  }
  return plan;
}

/** Replaces all price tiers and quick-pick sizes. `variantIds`: lowercased SKU -> variant id. */
export async function writePriceTiers(tx: Prisma.TransactionClient, plan: TierPlan, variantIds: Map<string, number>) {
  await tx.priceTier.deleteMany();
  await tx.$executeRaw`UPDATE product_variants SET quick_qtys = NULL WHERE quick_qtys IS NOT NULL`;
  for (const [sku, { tiers, quickQtys }] of plan.bySku) {
    const variantId = variantIds.get(sku)!;
    if (quickQtys.length > 0) await tx.productVariant.update({ where: { id: variantId }, data: { quickQtys } });
    if (tiers.length > 0) {
      await tx.priceTier.createMany({ data: tiers.map((t) => ({ variantId, minQty: t.minQty, unitPrice: t.unitPriceCents / 100 })) });
    }
  }
}

export function reportPriceTiers(plan: TierPlan, verbose = false) {
  const tierCount = [...plan.bySku.values()].reduce((n, s) => n + s.tiers.length, 0);
  console.log(`Price tiers: ${plan.bySku.size} pack SKUs, ${tierCount} tiers imported, ${plan.rejected.length} left out`);
  if (verbose) {
    for (const [sku, s] of plan.bySku) {
      console.log(`  ${sku.padEnd(34)} quick ${s.quickQtys.join("/").padEnd(8)} ${s.tiers.map((t) => `${t.minQty}+ ${rm(t.unitPriceCents)}`).join("  ") || "(no tiers)"}`);
    }
  }
  if (plan.unknownSkus.length > 0) console.log(`  Not in the catalog (skipped): ${plan.unknownSkus.join(", ")}`);
  if (plan.rejected.length > 0) {
    console.log("  Pricing to confirm (not imported):");
    for (const r of plan.rejected) console.log(`    - ${r}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--csv");
  const csvPath = path.resolve(i >= 0 ? args[i + 1] : defaultBundleCsv);
  const { PrismaClient } = await import("@prisma/client");
  const prisma: PrismaClient = new PrismaClient();
  try {
    const variants = await prisma.productVariant.findMany({ select: { id: true, sku: true, price: true, specialPrice: true } });
    const plan = planPriceTiers(
      csvPath,
      variants.map((v) => {
        const base = v.specialPrice ?? v.price;
        return { sku: v.sku, baseCents: base === null ? null : Math.round(base.toNumber() * 100) };
      }),
    );
    reportPriceTiers(plan, args.includes("--verbose") || args.includes("--dry-run"));
    if (args.includes("--dry-run")) {
      console.log("\nDry run: nothing written.");
      return;
    }
    const ids = new Map(variants.map((v) => [v.sku.toLowerCase(), v.id]));
    await prisma.$transaction((tx) => writePriceTiers(tx, plan, ids));
    console.log("\nPrice tiers written.");
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
