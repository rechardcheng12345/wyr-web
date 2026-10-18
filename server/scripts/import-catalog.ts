/**
 * Import the WYR Technology catalog.
 *
 * Shopee is the master: products, variants, images and starting stock come from the
 * Shopee "mass update" exports (basic / sales / media info). Lazada comes from
 * sku_mapping.csv (produced by import/match_skus.py):
 *   - exact / prefix_rule rows become platform_skus pointing at the matched Shopee variant
 *   - excluded_inactive rows are skipped
 *   - lazada_only rows listed in LAZADA_ONLY_MERGES are attached to the Shopee product
 *     they belong to; any others become their own products (one per Lazada product ID)
 *
 * Per-piece price tiers and quick-pick pack sizes come from bundle_items.csv (see price-tiers.ts).
 *
 * The import replaces the whole catalog (categories, products, variants, images,
 * listings, inventory, platform_skus, price_tiers). It refuses to run once orders reference
 * variants; `npm run import:tiers` can still refresh the price tiers on their own.
 *
 * Usage:
 *   npm run import:catalog -w server              # write to DATABASE_URL
 *   npm run import:catalog -w server -- --dry-run # parse and report only, no DB needed
 *   npx -w server tsx scripts/import-catalog.ts --dry-run --verbose   # npm swallows --verbose
 */
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseCsv } from "csv-parse/sync";
import ExcelJS from "exceljs";
import type { PrismaClient } from "@prisma/client";
import { defaultBundleCsv, planPriceTiers, reportPriceTiers, writePriceTiers, type TierPlan } from "./price-tiers.js";

const SHOPEE_SHOP_ID = "147356782";
const STORE_NAME = "WYR Technology";
const shopeeUrl = (itemId: string) => `https://shopee.com.my/product/${SHOPEE_SHOP_ID}/${itemId}`;
// Lazada resolves /products/-i<itemId>.html to the listing regardless of the slug part.
const lazadaUrl = (itemId: string) => `https://www.lazada.com.my/products/-i${itemId}.html`;

const HEADER_ROW = 3;
const FIRST_DATA_ROW = 7;
const MAX_ITEM_IMAGES = 8;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultExportDir = path.join(repoRoot, "_handoff/catalog-export/wyr-technology");
const defaultMappingCsv = path.join(repoRoot, "_handoff/wyr-website/import/sku_mapping.csv");

// Site categories. Shopee's own categories are inconsistent for this catalog (NFC tags
// filed under "Door Hardware", UHF tags under "Network Components"), so products are
// assigned by name keywords instead. First matching rule wins, so order matters.
const CATEGORIES = [
  { slug: "nfc-tags", name: "NFC Tags & Stickers" },
  { slug: "rfid-cards", name: "RFID Cards & Key Fobs" },
  { slug: "uhf-rfid-tags", name: "UHF RFID Tags" },
  { slug: "readers-writers", name: "Readers, Writers & Scanners" },
  { slug: "review-social-nfc", name: "Review & Social NFC" },
  { slug: "gps-trackers", name: "GPS Trackers" },
  { slug: "card-printers", name: "Card Printers & Supplies" },
  { slug: "smart-home", name: "Smart Home & Networking" },
  { slug: "others", name: "Lifestyle & Others" },
] as const;
type CategorySlug = (typeof CATEGORIES)[number]["slug"];

const CATEGORY_RULES: [RegExp, CategorySlug][] = [
  [/mirror|badminton|shuttlecock|pickle ?ball|torch|led strip|neon/i, "others"],
  [/hiti|pvc card|ribbon|card printer/i, "card-printers"],
  [/review|standee|bump tag/i, "review-social-nfc"],
  [/gps|tracker|find my/i, "gps-trackers"],
  [/reader|writer|scanner|acr122/i, "readers-writers"],
  [/tuya|smoke|alarm|sensor|antenna/i, "smart-home"],
  [/desfire|dual chip|key ?fob|access card/i, "rfid-cards"],
  [/ntag|nfc|13\.56|cuid|coin tag/i, "nfc-tags"],
  [/uhf|ultra-high|915|860/i, "uhf-rfid-tags"],
];

function categorize(name: string): CategorySlug {
  return CATEGORY_RULES.find(([re]) => re.test(name))?.[1] ?? "others";
}

// Rows the matcher marks lazada_only that are really part of an existing Shopee product
// (checked by hand against the other SKUs and prices on the same Lazada listing). Keyed by
// lowercased seller SKU without the wholesale<N>_ prefix; the prefix still sets pack_qty.
//   variant: map to this Shopee variant
//   addTo:   Shopee has no such variant, so add one to the product with this parent SKU
const LAZADA_ONLY_MERGES: Record<string, { variant: string } | { addTo: string }> = {
  // Same listing as RFIDTag9640 at +RM0.20: the same tag with the printing option.
  rfidtag9640_print: { variant: "RFIDTag9640" },
  // Lazada names these google_<x>; Shopee has the same five tags as <x> / google_<colour>.
  nfc_bump_tag_google_insta: { variant: "nfc_bump_tag_insta" },
  nfc_bump_tag_google_fb: { variant: "nfc_bump_tag_fb" },
  nfc_bump_tag_google_tiktok: { variant: "nfc_bump_tag_tiktok" },
  // Lazada sells Black and White on one listing; the Shopee listing only has Black.
  gpstagwhite: { addTo: "GPSTag" },
};

// ---------------------------------------------------------------------------
// Drafts: the whole catalog is built in memory first, then written in one go.

interface VariantDraft {
  sku: string;
  variationName: string | null;
  price: string | null;
  specialPrice: string | null;
  stock: number | null; // null = unknown, no inventory row is created
}

interface ImageDraft {
  url: string;
  variantSku: string | null;
  sortOrder: number;
}

interface ListingDraft {
  platform: "shopee" | "lazada";
  externalItemId: string;
  url: string;
}

interface ProductDraft {
  source: "shopee" | "lazada_only";
  externalItemId: string;
  parentSku: string | null;
  name: string;
  slug: string;
  description: string | null;
  category: CategorySlug;
  variants: VariantDraft[];
  images: ImageDraft[];
  listings: ListingDraft[];
}

interface PlatformSkuDraft {
  variantSku: string;
  platform: "shopee" | "lazada";
  platformSku: string;
  externalItemId: string;
  packQty: number;
  matchMethod: "exact" | "prefix_rule" | "manual";
  needsReview: boolean;
}

const warnings: string[] = [];
const warn = (msg: string) => warnings.push(msg);

// ---------------------------------------------------------------------------
// Readers

type Row = Record<string, string>;

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if ("richText" in value) return value.richText.map((r) => r.text).join("").trim();
  if ("text" in value) return String(value.text).trim();
  if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
  return "";
}

/** Shopee mass-update sheets: header on row 3, notes on rows 4-6, data from row 7. */
async function readShopeeSheet(file: string): Promise<Row[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  const headers: string[] = [];
  ws.getRow(HEADER_ROW).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = cellText(cell.value);
  });
  const rows: Row[] = [];
  for (let r = FIRST_DATA_ROW; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const record: Row = {};
    headers.forEach((h, col) => {
      if (h) record[h] = cellText(row.getCell(col).value);
    });
    if (record["Product ID"]) rows.push(record);
  }
  return rows;
}

function findExport(dir: string, prefix: string): string {
  const matches = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".xlsx"))
    .sort();
  if (matches.length === 0) throw new Error(`No ${prefix}*.xlsx in ${dir}`);
  if (matches.length > 1) warn(`Several ${prefix}*.xlsx files, using the newest: ${matches.at(-1)}`);
  return path.join(dir, matches.at(-1)!);
}

// ---------------------------------------------------------------------------
// Helpers

const lower = (s: string) => s.toLowerCase();

function money(value: string | undefined): string | null {
  if (!value) return null;
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null;
}

function decodeEntities(s: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–" };
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => named[name.toLowerCase()] ?? m);
}

const usedSlugs = new Set<string>();
function uniqueSlug(name: string): string {
  let base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (base.length > 80) base = base.slice(0, 80).replace(/-[^-]*$/, "");
  base ||= "product";
  let slug = base;
  for (let i = 2; usedSlugs.has(slug); i++) slug = `${base}-${i}`;
  usedSlugs.add(slug);
  return slug;
}

function commonPrefix(values: string[]): string {
  if (values.length < 2) return "";
  let prefix = values[0];
  for (const v of values) while (!v.startsWith(prefix)) prefix = prefix.slice(0, -1);
  return prefix;
}

const WHOLESALE_RE = /^wholesale(\d+)_/i;

/** "wholesale10_RFIDTag9640_print" with siblings sharing "RFIDTag9640" -> "Print · 10 pcs" */
function lazadaVariationName(sellerSku: string, siblingSkus: string[]): string {
  const strip = (s: string) => s.replace(WHOLESALE_RE, "");
  const pack = Number(WHOLESALE_RE.exec(sellerSku)?.[1] ?? 1);
  const base = strip(sellerSku);
  const prefix = commonPrefix([...new Set(siblingSkus.map(strip))]);
  const rest = base.slice(prefix.length).replace(/[_-]+/g, " ").trim() || base.replace(/[_-]+/g, " ");
  const label = rest.charAt(0).toUpperCase() + rest.slice(1);
  return pack > 1 ? `${label} · ${pack} pcs` : label;
}

// ---------------------------------------------------------------------------
// Shopee

async function buildShopeeProducts(exportDir: string): Promise<ProductDraft[]> {
  const basic = await readShopeeSheet(findExport(exportDir, "mass_update_basic_info_"));
  const sales = await readShopeeSheet(findExport(exportDir, "mass_update_sales_info_"));
  const media = await readShopeeSheet(findExport(exportDir, "mass_update_media_info_"));

  const salesByItem = Map.groupBy(sales, (r) => r["Product ID"]);
  const mediaByItem = new Map(media.map((r) => [r["Product ID"], r]));

  const products: ProductDraft[] = [];
  for (const b of basic) {
    const itemId = b["Product ID"];
    const name = b["Product Name"];
    const parentSku = b["Parent SKU"] || null;
    const salesRows = salesByItem.get(itemId) ?? [];
    if (salesRows.length === 0) {
      warn(`Shopee ${itemId} "${name}": no rows in sales_info, skipped`);
      continue;
    }

    const variants: VariantDraft[] = [];
    for (const s of salesRows) {
      let sku = s["SKU"];
      if (!sku && salesRows.length === 1 && parentSku) sku = parentSku;
      if (!sku) {
        sku = `SHOPEE-${s["Variation ID"]}`;
        warn(`Shopee ${itemId} variation ${s["Variation ID"]}: no SKU, using ${sku}`);
      }
      if (variants.some((v) => lower(v.sku) === lower(sku))) {
        warn(`Shopee ${itemId}: SKU ${sku} repeated within the product, kept the first`);
        continue;
      }
      const stock = Number.parseInt(s["Stock"], 10);
      variants.push({
        sku,
        variationName: s["Variation Name"] || null,
        price: money(s["Price"]),
        specialPrice: null,
        stock: Number.isFinite(stock) ? stock : null,
      });
    }

    const m = mediaByItem.get(itemId);
    const images: ImageDraft[] = [];
    if (m) {
      const productUrls = [m["Cover image"], ...Array.from({ length: MAX_ITEM_IMAGES }, (_, i) => m[`Item Image ${i + 1}`])];
      for (const url of new Set(productUrls.filter((u) => /^https?:\/\//.test(u ?? "")))) {
        images.push({ url, variantSku: null, sortOrder: images.length });
      }
      // Option images belong to the first variation tier ("Red" in "Red,40").
      const optionImages = new Map<string, string>();
      for (let i = 1; m[`Option ${i} Name`] !== undefined; i++) {
        const opt = m[`Option ${i} Name`];
        const url = m[`Option ${i} Image`];
        if (opt && /^https?:\/\//.test(url)) optionImages.set(lower(opt), url);
      }
      for (const v of variants) {
        const tier1 = lower(v.variationName?.split(",")[0].trim() ?? "");
        const url = optionImages.get(tier1);
        if (url) images.push({ url, variantSku: v.sku, sortOrder: 100 + images.length });
      }
    } else {
      warn(`Shopee ${itemId} "${name}": no media_info row, no images`);
    }

    products.push({
      source: "shopee",
      externalItemId: itemId,
      parentSku,
      name,
      slug: "", // assigned once duplicates are resolved
      description: b["Product Description"] || null,
      category: categorize(name),
      variants,
      images,
      listings: [{ platform: "shopee", externalItemId: itemId, url: shopeeUrl(itemId) }],
    });
  }
  return products;
}

/** parent_sku is UNIQUE. On a clash keep the product whose variants actually carry that SKU. */
function resolveParentSkuClashes(products: ProductDraft[]) {
  const byParent = Map.groupBy(
    products.filter((p) => p.parentSku),
    (p) => lower(p.parentSku!),
  );
  for (const [key, group] of byParent) {
    if (group.length < 2) continue;
    const owns = (p: ProductDraft) => p.variants.some((v) => lower(v.sku).startsWith(key));
    const keeper = group.find(owns) ?? group[0];
    for (const p of group) {
      if (p === keeper) continue;
      warn(`Parent SKU ${p.parentSku} is on both Shopee ${keeper.externalItemId} and ${p.externalItemId} ("${p.name}"); cleared it on the latter`);
      p.parentSku = null;
    }
  }
}

/** variant sku is UNIQUE. A SKU listed in several Shopee products goes to its dedicated (single-variant) listing. */
function resolveVariantSkuClashes(products: ProductDraft[]): ProductDraft[] {
  const owners = new Map<string, ProductDraft[]>();
  for (const p of products) for (const v of p.variants) owners.set(lower(v.sku), [...(owners.get(lower(v.sku)) ?? []), p]);
  for (const [sku, group] of owners) {
    if (group.length < 2) continue;
    const keeper = group.find((p) => p.variants.length === 1) ?? group[0];
    for (const p of group) {
      if (p === keeper) continue;
      p.variants = p.variants.filter((v) => lower(v.sku) !== sku);
      p.images = p.images.filter((i) => i.variantSku === null || lower(i.variantSku) !== sku);
      warn(`SKU ${sku} is listed in Shopee ${keeper.externalItemId} and ${p.externalItemId}; kept on ${keeper.externalItemId}, removed from "${p.name}"`);
    }
  }
  return products.filter((p) => {
    if (p.variants.length > 0) return true;
    warn(`Shopee ${p.externalItemId} "${p.name}" has no variants left, skipped`);
    return false;
  });
}

// ---------------------------------------------------------------------------
// Lazada

interface MappingRow {
  "Product ID": string;
  "Product Name": string;
  SellerSKU: string;
  Price: string;
  SpecialPrice: string;
  shopee_sku: string;
  pack_qty: string;
  method: string;
}

function applyLazadaMapping(csvFile: string, products: ProductDraft[]) {
  const rows: MappingRow[] = parseCsv(readFileSync(csvFile), { columns: true, skip_empty_lines: true, trim: true, bom: true });

  const variantOwner = new Map<string, ProductDraft>();
  for (const p of products) for (const v of p.variants) variantOwner.set(lower(v.sku), p);

  const platformSkus: PlatformSkuDraft[] = [];
  const seenLazadaSku = new Map<string, PlatformSkuDraft>();
  const addPlatformSku = (d: PlatformSkuDraft) => {
    const key = lower(d.platformSku);
    const prev = seenLazadaSku.get(key);
    if (prev) {
      // Same seller SKU on two Lazada listings. platform_skus is unique per (platform, sku),
      // and order mapping only needs SKU -> variant, so keep the first.
      const sameTarget = lower(prev.variantSku) === lower(d.variantSku);
      warn(`Lazada SKU ${d.platformSku} appears in items ${prev.externalItemId} and ${d.externalItemId}${sameTarget ? "" : " with DIFFERENT targets"}; kept the first`);
      return;
    }
    seenLazadaSku.set(key, d);
    platformSkus.push(d);
  };

  // Which Lazada item best represents each Shopee product (for the buy strip).
  const lazadaVotes = new Map<ProductDraft, Map<string, number>>();
  const lazadaMatchedRows = new Map<string, number>();
  const lazadaOnly = new Map<string, MappingRow[]>();
  const allSkusByLazadaItem = Map.groupBy(rows, (r) => r["Product ID"]);
  const counts = { matched: 0, merged: 0, excluded: 0, lazadaOnly: 0, unmatched: 0 };

  const mapToVariant = (r: MappingRow, owner: ProductDraft, variantSku: string, sku: Omit<PlatformSkuDraft, "variantSku" | "platform" | "platformSku" | "externalItemId">) => {
    addPlatformSku({ variantSku, platform: "lazada", platformSku: r.SellerSKU, externalItemId: r["Product ID"], ...sku });
    lazadaMatchedRows.set(r["Product ID"], (lazadaMatchedRows.get(r["Product ID"]) ?? 0) + 1);
    const votes = lazadaVotes.get(owner) ?? new Map<string, number>();
    votes.set(r["Product ID"], (votes.get(r["Product ID"]) ?? 0) + 1);
    lazadaVotes.set(owner, votes);
  };

  /** Apply LAZADA_ONLY_MERGES to a lazada_only row. Returns false if the row has no merge or its target is gone. */
  const merge = (r: MappingRow): boolean => {
    const rule = LAZADA_ONLY_MERGES[lower(r.SellerSKU.replace(WHOLESALE_RE, ""))];
    if (!rule) return false;
    const packQty = Number(WHOLESALE_RE.exec(r.SellerSKU)?.[1] ?? 1);
    let owner: ProductDraft | undefined;
    let variantSku: string;
    if ("variant" in rule) {
      owner = variantOwner.get(lower(rule.variant));
      variantSku = owner?.variants.find((v) => lower(v.sku) === lower(rule.variant))?.sku ?? rule.variant;
    } else {
      owner = products.find((p) => p.parentSku && lower(p.parentSku) === lower(rule.addTo));
      variantSku = r.SellerSKU.replace(WHOLESALE_RE, "");
      if (owner && !variantOwner.has(lower(variantSku))) {
        const price = money(r.Price);
        const special = money(r.SpecialPrice);
        owner.variants.push({
          sku: variantSku,
          variationName: lazadaVariationName(variantSku, owner.variants.map((v) => v.sku).concat(variantSku)),
          // Lazada list prices run above Shopee's; the sale price is the comparable one.
          price: special && price && Number(special) < Number(price) ? special : price,
          specialPrice: null,
          stock: null,
        });
        variantOwner.set(lower(variantSku), owner);
      }
    }
    if (!owner) {
      warn(`Lazada ${r.SellerSKU}: merge target ${"variant" in rule ? rule.variant : rule.addTo} not found in the Shopee export, kept as Lazada-only`);
      return false;
    }
    counts.merged++;
    mapToVariant(r, owner, variantSku, { packQty, matchMethod: "manual", needsReview: true });
    return true;
  };

  for (const r of rows) {
    const method = r.method;
    if (method === "excluded_inactive") {
      counts.excluded++;
      continue;
    }
    // The matcher sometimes misses a SKU that does exist on Shopee verbatim; map those
    // to the Shopee variant (flagged for review) rather than duplicating the product.
    const verbatim = method === "lazada_only" && variantOwner.has(lower(r.SellerSKU));
    if (method === "lazada_only" && !verbatim) {
      if (merge(r)) continue;
      counts.lazadaOnly++;
      lazadaOnly.set(r["Product ID"], [...(lazadaOnly.get(r["Product ID"]) ?? []), r]);
      continue;
    }
    if (method !== "exact" && method !== "prefix_rule" && method !== "manual" && !verbatim) {
      warn(`Lazada ${r.SellerSKU}: unknown method "${method}", skipped`);
      continue;
    }
    const shopeeSku = verbatim ? r.SellerSKU : r.shopee_sku;
    const owner = variantOwner.get(lower(shopeeSku));
    if (!owner) {
      counts.unmatched++;
      warn(`Lazada ${r.SellerSKU}: shopee_sku "${shopeeSku}" not found in the Shopee export, skipped`);
      continue;
    }
    if (verbatim) warn(`Lazada ${r.SellerSKU} is marked lazada_only but exists on Shopee; mapped to it (needs_review)`);
    counts.matched++;
    const variant = owner.variants.find((v) => lower(v.sku) === lower(shopeeSku))!;
    mapToVariant(r, owner, variant.sku, {
      packQty: verbatim ? 1 : Number.parseInt(r.pack_qty, 10) || 1,
      matchMethod: verbatim ? "manual" : (method as PlatformSkuDraft["matchMethod"]),
      needsReview: verbatim,
    });
  }

  // Prefer the Lazada item with the most matched SKUs; on a tie, the one most dedicated to
  // this product (a single-product listing beats a catch-all that also carries the SKU).
  for (const [product, votes] of lazadaVotes) {
    const purity = (id: string) => votes.get(id)! / lazadaMatchedRows.get(id)!;
    const [itemId] = [...votes].sort((a, b) => b[1] - a[1] || purity(b[0]) - purity(a[0]))[0];
    product.listings.push({ platform: "lazada", externalItemId: itemId, url: lazadaUrl(itemId) });
  }

  const newProducts: ProductDraft[] = [];
  for (const [itemId, group] of lazadaOnly) {
    const name = decodeEntities(group[0]["Product Name"]);
    const siblings = allSkusByLazadaItem.get(itemId)!.map((r) => r.SellerSKU);
    const variants: VariantDraft[] = [];
    for (const r of group) {
      if (variantOwner.has(lower(r.SellerSKU)) || variants.some((v) => lower(v.sku) === lower(r.SellerSKU))) {
        warn(`Lazada-only SKU ${r.SellerSKU} clashes with an existing variant SKU, skipped`);
        continue;
      }
      const price = money(r.Price);
      const special = money(r.SpecialPrice);
      variants.push({
        sku: r.SellerSKU,
        variationName: lazadaVariationName(r.SellerSKU, siblings),
        price,
        specialPrice: special && price && Number(special) < Number(price) ? special : null,
        stock: null,
      });
      addPlatformSku({
        variantSku: r.SellerSKU,
        platform: "lazada",
        platformSku: r.SellerSKU,
        externalItemId: itemId,
        packQty: 1,
        matchMethod: "exact",
        needsReview: true, // no Shopee counterpart to check against
      });
    }
    if (variants.length === 0) continue;
    newProducts.push({
      source: "lazada_only",
      externalItemId: itemId,
      parentSku: null,
      name,
      slug: "",
      description: null,
      category: categorize(name),
      variants,
      images: [],
      listings: [{ platform: "lazada", externalItemId: itemId, url: lazadaUrl(itemId) }],
    });
  }

  return { platformSkus, newProducts, counts };
}

// ---------------------------------------------------------------------------
// Database

async function writeCatalog(prisma: PrismaClient, products: ProductDraft[], platformSkus: PlatformSkuDraft[], tiers: TierPlan) {
  const ordered = await prisma.orderItem.count();
  if (ordered > 0) {
    throw new Error(`${ordered} order items reference variants; refusing to replace the catalog. Write an incremental sync instead.`);
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.platformSku.deleteMany();
      await tx.priceTier.deleteMany();
      await tx.inventory.deleteMany();
      await tx.productImage.deleteMany();
      await tx.marketplaceListing.deleteMany();
      await tx.productVariant.deleteMany();
      await tx.product.deleteMany();
      await tx.category.deleteMany();

      const store = (await tx.store.findFirst({ where: { name: STORE_NAME } })) ?? (await tx.store.create({ data: { name: STORE_NAME } }));

      const categoryId = new Map<string, number>();
      for (const c of CATEGORIES) {
        const created = await tx.category.create({ data: { name: c.name, slug: c.slug } });
        categoryId.set(c.slug, created.id);
      }

      const variantId = new Map<string, number>();
      for (const p of products) {
        const created = await tx.product.create({
          data: {
            storeId: store.id,
            categoryId: categoryId.get(p.category),
            parentSku: p.parentSku,
            name: p.name,
            slug: p.slug,
            description: p.description,
            productType: /review package/i.test(p.name) ? "digital" : "physical",
            variants: {
              create: p.variants.map((v) => ({
                sku: v.sku,
                variationName: v.variationName,
                price: v.price,
                specialPrice: v.specialPrice,
                // Seeded from the Shopee export; BigSeller sync becomes the source of truth later.
                ...(v.stock !== null && { inventory: { create: { available: v.stock } } }),
              })),
            },
            marketplaceListings: { create: p.listings },
          },
          include: { variants: true },
        });
        for (const v of created.variants) variantId.set(lower(v.sku), v.id);
        if (p.images.length > 0) {
          await tx.productImage.createMany({
            data: p.images.map((i) => ({
              productId: created.id,
              variantId: i.variantSku ? variantId.get(lower(i.variantSku)) : null,
              url: i.url,
              sortOrder: i.sortOrder,
            })),
          });
        }
      }

      await tx.platformSku.createMany({
        data: platformSkus.map((s) => ({
          variantId: variantId.get(lower(s.variantSku))!,
          platform: s.platform,
          platformSku: s.platformSku,
          externalItemId: s.externalItemId,
          packQty: s.packQty,
          matchMethod: s.matchMethod,
          needsReview: s.needsReview,
        })),
      });

      await writePriceTiers(tx, tiers, variantId);
    },
    { timeout: 120_000 },
  );
}

// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const argValue = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const exportDir = path.resolve(argValue("--exports") ?? defaultExportDir);
  const mappingCsv = path.resolve(argValue("--mapping") ?? defaultMappingCsv);
  const bundleCsv = path.resolve(argValue("--bundles") ?? defaultBundleCsv);

  let products = await buildShopeeProducts(exportDir);
  resolveParentSkuClashes(products);
  products = resolveVariantSkuClashes(products);

  const shopeeSkus: PlatformSkuDraft[] = products.flatMap((p) =>
    p.variants
      .filter((v) => !v.sku.startsWith("SHOPEE-"))
      .map((v) => ({
        variantSku: v.sku,
        platform: "shopee" as const,
        platformSku: v.sku,
        externalItemId: p.externalItemId,
        packQty: 1,
        matchMethod: "exact" as const,
        needsReview: false,
      })),
  );
  const lazada = applyLazadaMapping(mappingCsv, products);
  products.push(...lazada.newProducts);
  for (const p of products) p.slug = uniqueSlug(p.name);
  const platformSkus = [...shopeeSkus, ...lazada.platformSkus];

  const variantCount = products.reduce((n, p) => n + p.variants.length, 0);
  const imageCount = products.reduce((n, p) => n + p.images.length, 0);
  console.log(`Products: ${products.length} (${products.length - lazada.newProducts.length} Shopee, ${lazada.newProducts.length} Lazada-only)`);
  console.log(`Variants: ${variantCount}   Images: ${imageCount}`);
  console.log(
    `Lazada mapping rows: ${lazada.counts.matched} matched, ${lazada.counts.merged} lazada_only merged into Shopee products, ${lazada.counts.lazadaOnly} lazada_only as new products, ${lazada.counts.excluded} excluded_inactive, ${lazada.counts.unmatched} unmatched`,
  );
  console.log(`platform_skus: ${shopeeSkus.length} shopee + ${lazada.platformSkus.length} lazada`);
  const byCategory = Map.groupBy(products, (p) => p.category);
  for (const c of CATEGORIES) console.log(`  ${c.slug.padEnd(18)} ${byCategory.get(c.slug)?.length ?? 0}`);
  if (warnings.length > 0) {
    console.log(`\nWarnings (${warnings.length}):`);
    for (const w of warnings) console.log(`  - ${w}`);
  }

  const tiers = planPriceTiers(
    bundleCsv,
    products.flatMap((p) =>
      p.variants.map((v) => {
        const base = v.specialPrice ?? v.price;
        return { sku: v.sku, baseCents: base === null ? null : Math.round(Number(base) * 100) };
      }),
    ),
  );
  console.log("");
  reportPriceTiers(tiers, args.includes("--verbose"));

  if (dryRun) {
    if (args.includes("--verbose")) {
      for (const p of products) {
        const links = p.listings.map((l) => `${l.platform}:${l.externalItemId}`).join(" ");
        console.log(`\n[${p.category}] ${p.name}\n  /${p.slug}  parent=${p.parentSku ?? "-"}  ${links}  imgs=${p.images.length}`);
        for (const v of p.variants) console.log(`    ${v.sku.padEnd(40)} ${String(v.variationName ?? "").padEnd(24)} RM${v.price ?? "?"}  stock=${v.stock ?? "?"}`);
      }
    }
    console.log("\nDry run: nothing written.");
    return;
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    await writeCatalog(prisma, products, platformSkus, tiers);
    console.log("\nCatalog imported.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
