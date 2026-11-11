import { Router } from "express";
import { prisma } from "../db.js";
import { displayNameOf } from "../display-name.js";
import { bulkQuote, priceLadder, quickQtys } from "../pricing.js";
import { soldByProduct } from "../sold.js";
import { minQtyFor, sellableQty as inventorySellable } from "../stock.js";

export const productsRouter = Router();

const MAX_PAGE_SIZE = 100;

const listInclude = {
  category: { select: { name: true, slug: true } },
  variants: { include: { inventory: true } },
  images: { where: { variantId: null }, orderBy: { sortOrder: "asc" }, take: 1 },
  marketplaceListings: true,
};

export const detailInclude = {
  category: { select: { name: true, slug: true } },
  variants: { include: { inventory: true, priceTiers: true }, orderBy: { id: "asc" } },
  images: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
  marketplaceListings: true,
};

const toNumber = (d) => (d === null ? null : d.toNumber());

// What the site can promise: on-hand minus open reservations and the safety buffer.
// null = no stock data for this variant (e.g. Lazada-only products before BigSeller sync).
function sellableQty(v) {
  return inventorySellable(v.inventory);
}

function variantMinQty(v) {
  const base = v.specialPrice ?? v.price;
  return minQtyFor(base == null ? null : Math.round(base.toNumber() * 100));
}

function effectivePrice(v) {
  return toNumber(v.specialPrice ?? v.price);
}

function priceRange(variants) {
  const prices = variants.map(effectivePrice).filter((p) => p !== null);
  if (prices.length === 0) return { minPrice: null, maxPrice: null };
  return { minPrice: Math.min(...prices), maxPrice: Math.max(...prices) };
}

function serializeListings(p) {
  return p.marketplaceListings.map((l) => ({
    platform: l.platform,
    url: l.url,
    externalItemId: l.externalItemId,
  }));
}

function serializeSummary(p, sold) {
  return {
    sold,
    id: p.id,
    slug: p.slug,
    name: p.name,
    displayName: displayNameOf(p),
    category: p.category,
    image: p.images[0]?.url ?? null,
    ...priceRange(p.variants),
    variantCount: p.variants.length,
    inStock: p.variants.some((v) => effectivePrice(v) != null && (sellableQty(v) ?? 0) >= variantMinQty(v)),
    marketplaces: serializeListings(p),
  };
}

export function serializeDetail(p, sold = 0) {
  return {
    sold,
    id: p.id,
    slug: p.slug,
    name: p.name,
    displayName: displayNameOf(p),
    parentSku: p.parentSku,
    description: p.description,
    productType: p.productType,
    category: p.category,
    ...priceRange(p.variants),
    images: p.images.map((i) => ({ url: i.url, variantId: i.variantId })),
    variants: p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      name: v.variationName,
      price: toNumber(v.price),
      specialPrice: toNumber(v.specialPrice),
      stock: sellableQty(v),
      minQty: variantMinQty(v),
      // Per-piece price by quantity, starting with the 1+ row; empty if the variant has no price.
      tiers: (priceLadder(v) ?? []).map((t) => ({ minQty: t.minQty, unitPrice: t.unitPriceCents / 100 })),
      quickQtys: quickQtys(v.quickQtys),
    })),
    bulkQuote: bulkQuote(),
    marketplaces: serializeListings(p),
  };
}

function firstString(value) {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" ? v.trim() : "";
}

function positiveInt(value, fallback) {
  const n = Number.parseInt(firstString(value), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const SORTS = new Set(["relevance", "popular", "price_asc", "price_desc", "newest"]);
const MAX_SEARCH_POOL = 2000;

const searchInclude = { ...listInclude, variants: { include: { inventory: true } } };

const fold = (v) => String(v ?? "").toLowerCase();
const wordsOf = (v) => fold(v).split(/[^a-z0-9]+/).filter(Boolean);

function withinOneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function searchFields(p) {
  const title = `${fold(p.name)} ${fold(p.displayName)}`;
  const skus = `${fold(p.parentSku)} ${p.variants.map((v) => `${fold(v.sku)} ${fold(v.variationName)}`).join(" ")}`;
  const extra = `${fold(p.category?.name)} ${fold(p.keywords)} ${fold(p.brand)} ${fold(p.model)}`;
  const body = `${fold(p.description)} ${fold(p.specs)} ${fold(p.compatibility)}`;
  return { title, skus, extra, body, titleWords: wordsOf(`${title} ${extra}`) };
}

function scoreProduct(fields, tokens, fuzzy) {
  let score = 0;
  for (const t of tokens) {
    if (fields.title.includes(t)) score += 10;
    else if (fields.skus.includes(t)) score += 8;
    else if (fields.extra.includes(t)) score += 5;
    else if (fields.body.includes(t)) score += 2;
    else if (fuzzy && t.length >= 4 && fields.titleWords.some((w) => w.length >= 4 && withinOneEdit(w, t))) score += 1;
    else return 0;
  }
  return score;
}

function searchProducts(products, q) {
  const tokens = [...new Set(wordsOf(q))].slice(0, 8);
  const phrase = fold(q).trim();
  if (tokens.length === 0) {
    return { matches: phrase ? products.filter((p) => searchFields(p).skus.includes(phrase) || searchFields(p).title.includes(phrase)).map((p) => ({ p, score: 1 })) : [], fuzzy: false };
  }
  const indexed = products.map((p) => ({ p, fields: searchFields(p) }));
  let matches = indexed.map(({ p, fields }) => ({ p, score: scoreProduct(fields, tokens, false), fields })).filter((m) => m.score > 0);
  let fuzzy = false;
  if (matches.length === 0) {
    matches = indexed.map(({ p, fields }) => ({ p, score: scoreProduct(fields, tokens, true), fields })).filter((m) => m.score > 0);
    fuzzy = matches.length > 0;
  }
  for (const m of matches) if (phrase.includes(" ") && m.fields.title.includes(phrase)) m.score += 5;
  return { matches, fuzzy };
}

// GET /api/products?category=<slug>&q=<search>&sort=relevance|popular|price_asc|price_desc|newest&page=1&pageSize=24
productsRouter.get("/", async (req, res) => {
  const category = firstString(req.query.category);
  const q = firstString(req.query.q).slice(0, 100);
  const page = positiveInt(req.query.page, 1);
  const pageSize = Math.min(positiveInt(req.query.pageSize, 24), MAX_PAGE_SIZE);
  const requested = firstString(req.query.sort);
  const sort = SORTS.has(requested) ? requested : q ? "relevance" : "featured";

  const [pool, sold] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true, ...(category && { category: { slug: category } }) },
      include: searchInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: MAX_SEARCH_POOL,
    }),
    soldByProduct(),
  ]);

  let fuzzy = false;
  let rows = pool.map((p) => ({ p, score: 0 }));
  if (q) ({ matches: rows, fuzzy } = searchProducts(pool, q));

  const minPrice = (p) => priceRange(p.variants).minPrice;
  const byPrice = (dir) => (a, b) => {
    const pa = minPrice(a.p);
    const pb = minPrice(b.p);
    if (pa == null || pb == null) return (pa == null) - (pb == null);
    return dir * (pa - pb);
  };
  const sorters = {
    relevance: (a, b) => b.score - a.score || sold(b.p.id) - sold(a.p.id),
    popular: (a, b) => sold(b.p.id) - sold(a.p.id),
    price_asc: byPrice(1),
    price_desc: byPrice(-1),
    newest: (a, b) => (b.p.createdAt?.getTime() ?? 0) - (a.p.createdAt?.getTime() ?? 0) || b.p.id - a.p.id,
  };
  if (sorters[sort]) rows = [...rows].sort(sorters[sort]);

  const total = rows.length;
  const items = rows.slice((page - 1) * pageSize, page * pageSize).map(({ p }) => serializeSummary(p, sold(p.id)));
  res.json({ items, total, page, pageSize, sort, fuzzy });
});

// GET /api/products/:slug
productsRouter.get("/:slug", async (req, res) => {
  const product = await prisma.product.findFirst({
    where: { slug: req.params.slug, isActive: true },
    include: detailInclude,
  });
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json(serializeDetail(product, (await soldByProduct())(product.id)));
});
