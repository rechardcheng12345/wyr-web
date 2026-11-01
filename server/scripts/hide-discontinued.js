import "../src/env.js";
import { prisma } from "../src/db.js";
import { DISCONTINUED_PRODUCTS, matchesDiscontinued } from "./discontinued-products.js";

const dryRun = process.argv.includes("--dry-run");
const { hostname, port, pathname } = new URL(process.env.DATABASE_URL);
console.log(`Database: ${hostname}:${port}${pathname}${dryRun ? " (dry run)" : ""}`);

const plan = [];
for (const entry of DISCONTINUED_PRODUCTS) {
  const candidates = await prisma.product.findMany({
    where: { OR: [{ variants: { some: { sku: { in: entry.skus } } } }, { name: { contains: entry.nameContains } }] },
    select: { id: true, name: true, slug: true, isActive: true, variants: { select: { sku: true } } },
  });
  const matches = candidates.filter((p) => matchesDiscontinued(entry, p.name, p.variants.map((v) => v.sku)));
  if (matches.length !== 1) {
    console.error(`${entry.label}: expected exactly 1 product, found ${matches.length}${matches.map((p) => `\n  #${p.id} ${p.name}`).join("")}`);
    console.error("No changes made.");
    process.exitCode = 1;
    await prisma.$disconnect();
    process.exit();
  }
  plan.push({ entry, product: matches[0] });
}

for (const { entry, product } of plan) {
  const skus = product.variants.map((v) => v.sku).join(", ");
  if (product.isActive === false) {
    console.log(`already hidden  #${product.id} ${product.name} [${skus}]`);
    continue;
  }
  if (!dryRun) await prisma.product.update({ where: { id: product.id }, data: { isActive: false } });
  console.log(`${dryRun ? "would hide" : "hidden"}  #${product.id} ${product.name} [${skus}] (${entry.label})`);
}

await prisma.$disconnect();
