// Export products to stock.md for filling in the sold count, then apply it to products.sold_base.
//   npm run sold:export -w server            writes <repo>/stock.md
//   npm run sold:set -w server [-- --apply]  reads stock.md; dry run unless --apply
// Values come from the Sold count column, or from plain "<id> <count>" lines anywhere in the file.
// The sold count is per product (all variants together), the same as the admin "Starting sold count".
import "../src/env.js";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { prisma } from "../src/db.js";
import { soldByProduct } from "../src/sold.js";

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../stock.md");
const [mode, ...rest] = process.argv.slice(2);
const apply = rest.includes("--apply");
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

async function exportMd() {
  const products = await prisma.product.findMany({
    orderBy: { id: "asc" },
    select: { id: true, name: true, isActive: true, soldBase: true, variants: { orderBy: { id: "asc" }, select: { sku: true, variationName: true, inventory: { select: { available: true } } } } },
  });
  const sold = await soldByProduct();
  const lines = [
    "# Stock and sold count",
    "",
    `Exported ${new Date().toISOString().slice(0, 10)} from the database the server is configured for.`,
    "",
    "Fill in the last column **Sold count** with the total pieces sold so far on other platforms (whole number per product, all variants together).",
    "Leave it blank to keep the product unchanged. Then run `npm run sold:set -w server` (dry run) and `npm run sold:set -w server -- --apply`.",
    "The website shows Sold count + pieces sold through the website itself.",
    "",
    "| ID | Product | Variants (SKU: stock) | Stock | Current sold base | Sold count |",
    "|---:|---|---|---:|---:|---:|",
  ];
  for (const p of products) {
    const stock = p.variants.reduce((n, v) => n + (v.inventory?.available ?? 0), 0);
    const variants = p.variants.map((v) => `${v.sku}${v.variationName ? ` (${v.variationName})` : ""}: ${v.inventory?.available ?? 0}`).join("<br>");
    const name = (p.isActive ? "" : "(hidden) ") + p.name;
    lines.push(`| ${p.id} | ${cell(name)} | ${cell(variants)} | ${stock} | ${p.soldBase} | |`);
  }
  writeFileSync(FILE, lines.join("\n") + "\n");
  console.log(`Wrote ${products.length} products to ${FILE}`);
}

async function applyMd() {
  const text = readFileSync(FILE, "utf8");
  const changes = new Map();
  for (const line of text.split("\n")) {
    const plain = line.trim().match(/^(\d+)\s+([\d,]+)$/);
    if (plain) {
      const id = Number(plain[1]);
      if (changes.has(id)) {
        console.error(`Product #${id} is listed twice`);
        process.exit(1);
      }
      changes.set(id, Number(plain[2].replace(/,/g, "")));
      continue;
    }
    if (!line.startsWith("|")) continue;
    const cols = line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());
    if (cols.length < 6 || !/^\d+$/.test(cols[0])) continue;
    const id = Number(cols[0]);
    const raw = cols[5].replace(/[,\s]/g, "");
    if (raw === "") continue;
    if (!/^\d+$/.test(raw)) {
      console.error(`Product #${id}: "${cols[5]}" is not a whole number`);
      process.exit(1);
    }
    changes.set(id, Number(raw));
  }
  if (!changes.size) {
    console.log("No Sold count values filled in stock.md; nothing to do.");
    return;
  }
  const products = await prisma.product.findMany({ where: { id: { in: [...changes.keys()] } }, select: { id: true, name: true, soldBase: true } });
  const found = new Map(products.map((p) => [p.id, p]));
  const missing = [...changes.keys()].filter((id) => !found.has(id));
  if (missing.length) {
    console.error(`Unknown product ids: ${missing.join(", ")}`);
    process.exit(1);
  }
  let n = 0;
  for (const [id, value] of changes) {
    const p = found.get(id);
    const mark = p.soldBase === value ? "  (same)" : "";
    console.log(`#${id}  ${p.soldBase} -> ${value}${mark}  ${p.name}`);
    if (p.soldBase !== value) n++;
  }
  if (!apply) {
    console.log(`\nDry run: ${n} products would change. Re-run with --apply to write.`);
    return;
  }
  await prisma.$transaction([...changes].filter(([id, v]) => found.get(id).soldBase !== v).map(([id, v]) => prisma.product.update({ where: { id }, data: { soldBase: v } })));
  console.log(`\nUpdated ${n} products. The site picks it up within 60 s (sold cache) or on restart.`);
}

if (mode === "export") await exportMd();
else if (mode === "apply") await applyMd();
else {
  console.error("Usage: node scripts/sold-base-md.js export | apply [--apply]");
  process.exit(1);
}
await prisma.$disconnect();
