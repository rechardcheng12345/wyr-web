// One-off import: WYR Virtual Concept MT4/MT5 EAs & indicators (40 digital products).
// Writes exactly what the admin "New product" form writes (product, images, one variant, inventory, stock movement).
//   node scripts/import-wyrvc-ea.js                 # dry run (default): reads only, prints the plan
//   node scripts/import-wyrvc-ea.js --apply         # create products (skips any parentSku/SKU that already exists)
//   --images=local  (default) copy the Mac photos into UPLOAD_DIR/images/YYYY-MM/ and link /uploads/... (admin upload convention)
//   --images=shopee use the Shopee CDN URLs from the sheet instead (same as the existing catalog's images)
// Never updates or deletes existing products.
import "../src/env.js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const { prisma } = await import("../src/db.js");
const { UPLOAD_DIR, UPLOAD_URL } = await import("../src/routes/admin-uploads.js");
const { logStockMovement } = await import("../src/stock.js");

const SRC = "/Users/rechardcheng/Documents/1_virtual_listing_product/ea_photos";
const DATA = path.join(SRC, "import_en.json");
const APPLY = process.argv.includes("--apply");
const IMAGES = (process.argv.find((a) => a.startsWith("--images=")) ?? "--images=local").split("=")[1];
const STOCK = 999;
const CATEGORY = { name: "Trading EA & Indicators", slug: "trading-ea-indicators" };

const slugify = (t) => t.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 200);

function photoDir(row) {
  const folder = path.basename(row.folder); // e.g. 25_ea_liquidity_grabber_mt5
  for (const parent of ["photos", "photos 2"]) {
    const d = path.join(SRC, parent, folder);
    if (fs.existsSync(d)) return d;
  }
  throw new Error(`No photo folder for row ${row.no}: ${folder}`);
}
function localPhotos(row) {
  const d = photoDir(row);
  const files = fs.readdirSync(d).filter((f) => /^\d+\.jpe?g$/i.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
  if (!String(path.basename(d)).startsWith(String(row.no).padStart(2, "0") + "_")) throw new Error(`Folder/row mismatch ${row.no} ${d}`);
  if (files.length !== row.photo_count) throw new Error(`Row ${row.no}: ${files.length} photos in folder, sheet says ${row.photo_count}`);
  return files.map((f) => path.join(d, f));
}

const rows = JSON.parse(fs.readFileSync(DATA, "utf8"));
console.log(`${APPLY ? "APPLY" : "DRY RUN"} | images=${IMAGES} | ${rows.length} rows | DB host ${process.env.DB_HOST}/${process.env.DB_NAME}`);

const store = await prisma.store.findFirst({ orderBy: { id: "asc" }, select: { id: true, name: true } });
let category = await prisma.category.findUnique({ where: { slug: CATEGORY.slug } });
console.log(`store #${store.id} ${store.name}; category ${category ? `#${category.id} exists` : "will be created"}`);
if (APPLY && !category) category = await prisma.category.create({ data: { ...CATEGORY, parentId: null } });

const month = new Date().toISOString().slice(0, 7);
const created = [], skipped = [];
for (const row of rows) {
  const sku = row.import_sku;
  const exists = (await prisma.product.findFirst({ where: { parentSku: sku }, select: { id: true } })) || (await prisma.productVariant.findFirst({ where: { sku }, select: { id: true } }));
  if (exists) { skipped.push(`${row.no} ${sku} (already exists)`); continue; }
  let slug = slugify(row.english_name);
  for (let n = 2; await prisma.product.findFirst({ where: { slug }, select: { id: true } }); n++) slug = `${slugify(row.english_name)}-${n}`;
  const photos = localPhotos(row); // always validate the folder
  if (!APPLY) { console.log(`plan ${String(row.no).padStart(2)} ${sku} | ${slug} | RM${row.price} | ${photos.length} imgs`); continue; }

  const copied = [];
  let urls;
  if (IMAGES === "shopee") urls = row.photo_urls;
  else {
    urls = photos.map((src, i) => {
      const rel = path.posix.join("images", month, `${crypto.randomBytes(4).toString("hex")}-${slugify(sku).slice(0, 50)}-${i + 1}.jpg`);
      const dest = path.join(UPLOAD_DIR, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      copied.push(dest);
      return `${UPLOAD_URL}/${rel}`;
    });
  }
  try {
    const id = await prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: { storeId: store.id, categoryId: category.id, parentSku: sku, name: row.english_name.trim().slice(0, 255), slug,
          description: row.english_description.trim(), productType: "digital", isActive: true, showOnGoogle: true },
      });
      await tx.productImage.createMany({ data: urls.map((url, i) => ({ productId: p.id, url, sortOrder: i })) });
      const v = await tx.productVariant.create({ data: { productId: p.id, sku, price: row.price } });
      await tx.inventory.create({ data: { variantId: v.id, available: STOCK } });
      await logStockMovement(tx, { variantId: v.id, delta: STOCK, reason: "adjust", note: "WYR Virtual Concept EA import" });
      return p.id;
    }, { timeout: 20_000 });
    created.push(`${row.no} #${id} ${sku}`);
    console.log(`created ${String(row.no).padStart(2)} #${id} ${sku} (${urls.length} imgs)`);
  } catch (e) {
    copied.forEach((f) => fs.rmSync(f, { force: true }));
    console.error(`FAILED ${row.no} ${sku}: ${e.message}`);
  }
}
console.log(`done: created ${created.length}, skipped ${skipped.length}`, skipped);
await prisma.$disconnect();
