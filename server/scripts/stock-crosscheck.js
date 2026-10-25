import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import "../src/env.js";
import { prisma } from "../src/db.js";
import { SERVER_ROOT } from "../src/env.js";
import { loadSettings } from "../src/settings.js";
import { minQtyFor, sellableQty } from "../src/stock.js";

const HANDOFF = path.resolve(SERVER_ROOT, "../_handoff");
const args = process.argv.slice(2);
const inputPath = path.resolve(args.find((a) => !a.startsWith("--")) ?? path.join(HANDOFF, "shopee_2026-10-24.csv"));
const outputPath = path.join(HANDOFF, "stock-diff.csv");

const norm = (s) => String(s ?? "").trim().toLowerCase();

export async function loadShopeeRows(file = inputPath) {
  const rows = parse(fs.readFileSync(file, "utf8"), { columns: true, skip_empty_lines: true, trim: true, bom: true });
  return rows
    .filter((r) => norm(r.platform) === "shopee" && norm(r.sku_variation))
    .map((r) => ({ sku: r.sku_variation.trim(), item: r.item, stock: Number.parseInt(r.stock, 10) || 0 }));
}

export async function matchShopeeRows(rows) {
  const variants = await prisma.productVariant.findMany({
    include: { inventory: true, product: { select: { name: true, isActive: true } }, platformSkus: { where: { platform: "shopee" } } },
  });
  const byPlatformSku = new Map();
  const bySku = new Map();
  for (const v of variants) {
    bySku.set(norm(v.sku), v);
    for (const ps of v.platformSkus) byPlatformSku.set(norm(ps.platformSku), v);
  }
  const matched = new Set();
  const results = rows.map((r) => {
    const key = norm(r.sku);
    let variant = byPlatformSku.get(key);
    let matchedBy = variant ? "platform_skus" : null;
    if (!variant) {
      variant = bySku.get(key);
      matchedBy = variant ? "variant_sku" : null;
    }
    if (variant) matched.add(variant.id);
    return { row: r, variant, matchedBy };
  });
  const unmatchedSite = variants.filter((v) => !matched.has(v.id));
  return { results, unmatchedSite, variants };
}

function statusOf(shopeeStock, siteStock) {
  if (shopeeStock === siteStock) return "match";
  if (siteStock <= 0 && shopeeStock > 0) return "site_oos_shopee_in_stock";
  if (shopeeStock <= 0 && siteStock > 0) return "shopee_oos_site_in_stock";
  return "differs";
}

function csvCell(value) {
  const s = value == null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function siteSellable(v) {
  const base = v.specialPrice ?? v.price;
  if (base == null || !v.inventory) return false;
  return sellableQty(v.inventory) >= minQtyFor(Math.round(base.toNumber() * 100));
}

async function main() {
  await loadSettings();
  const rows = await loadShopeeRows();
  const { results, unmatchedSite, variants } = await matchShopeeRows(rows);
  const header = ["shopee_sku", "shopee_item", "shopee_stock", "matched_by", "product", "variant", "variant_sku", "site_stock", "site_reserved", "diff", "status"];
  const out = [header];
  const counts = {};
  const bump = (s) => (counts[s] = (counts[s] ?? 0) + 1);

  for (const { row, variant, matchedBy } of results) {
    if (!variant) {
      out.push([row.sku, row.item, row.stock, "", "", "", "", "", "", "", "unmatched_shopee"]);
      bump("unmatched_shopee");
      continue;
    }
    const siteStock = variant.inventory?.available ?? 0;
    const status = statusOf(row.stock, siteStock);
    bump(status);
    out.push([row.sku, row.item, row.stock, matchedBy, variant.product.name, variant.variationName, variant.sku, siteStock, variant.inventory?.reserved ?? 0, siteStock - row.stock, status]);
  }
  for (const v of unmatchedSite) {
    bump("unmatched_site");
    out.push(["", "", "", "", v.product.name, v.variationName, v.sku, v.inventory?.available ?? 0, v.inventory?.reserved ?? 0, "", "unmatched_site"]);
  }
  fs.writeFileSync(outputPath, `${out.map((r) => r.map(csvCell).join(",")).join("\n")}\n`);

  const shopeeBySiteVariant = new Map();
  for (const r of results) if (r.variant) shopeeBySiteVariant.set(r.variant.id, [...(shopeeBySiteVariant.get(r.variant.id) ?? []), r.row]);
  const products = new Map();
  for (const v of variants) {
    const p = products.get(v.productId) ?? { name: v.product.name, isActive: v.product.isActive !== false, variants: [] };
    p.variants.push(v);
    products.set(v.productId, p);
  }
  const oos = [...products.values()].filter((p) => p.variants.every((v) => !siteSellable(v)));

  console.log(`Shopee rows: ${rows.length}, site variants: ${variants.length}`);
  console.log("Status counts:", counts);
  console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);
  console.log(`\nProducts fully out of stock on the site (no variant sellable: stock - reserved - buffer below the min qty): ${oos.length}`);
  for (const p of oos) {
    const site = p.variants.map((v) => `${v.sku}=${v.inventory?.available ?? "none"}`).join(", ");
    const shopee = p.variants.flatMap((v) => (shopeeBySiteVariant.get(v.id) ?? []).map((r) => `${r.sku}=${r.stock}`));
    const inStock = p.variants.flatMap((v) => shopeeBySiteVariant.get(v.id) ?? []).filter((r) => r.stock > 0);
    console.log(`- ${p.name}${p.isActive ? "" : " [hidden]"} | site: ${site} | Shopee: ${shopee.join(", ") || "no Shopee SKU"}${inStock.length ? " | SHOPEE IN STOCK" : ""}`);
  }
  await prisma.$disconnect();
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
