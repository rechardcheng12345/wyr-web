import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../db.js";
import { bulkQuote, priceLadder, quickQtys } from "../pricing.js";

export const productsRouter = Router();

const MAX_PAGE_SIZE = 100;

const listInclude = {
  category: { select: { name: true, slug: true } },
  variants: { include: { inventory: true } },
  images: { where: { variantId: null }, orderBy: { sortOrder: "asc" }, take: 1 },
  marketplaceListings: true,
} satisfies Prisma.ProductInclude;

const detailInclude = {
  category: { select: { name: true, slug: true } },
  variants: { include: { inventory: true, priceTiers: true }, orderBy: { id: "asc" } },
  images: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
  marketplaceListings: true,
} satisfies Prisma.ProductInclude;

type ListProduct = Prisma.ProductGetPayload<{ include: typeof listInclude }>;
type DetailProduct = Prisma.ProductGetPayload<{ include: typeof detailInclude }>;
type VariantWithInventory = ListProduct["variants"][number];

const toNumber = (d: Prisma.Decimal | null) => (d === null ? null : d.toNumber());

// What the site can promise: on-hand minus open reservations and the safety buffer.
// null = no stock data for this variant (e.g. Lazada-only products before BigSeller sync).
function sellableQty(v: VariantWithInventory) {
  if (!v.inventory) return null;
  const { available, reserved, safetyBuffer } = v.inventory;
  return Math.max(0, available - reserved - safetyBuffer);
}

function effectivePrice(v: VariantWithInventory) {
  return toNumber(v.specialPrice ?? v.price);
}

function priceRange(variants: VariantWithInventory[]) {
  const prices = variants.map(effectivePrice).filter((p): p is number => p !== null);
  if (prices.length === 0) return { minPrice: null, maxPrice: null };
  return { minPrice: Math.min(...prices), maxPrice: Math.max(...prices) };
}

function serializeListings(p: ListProduct | DetailProduct) {
  return p.marketplaceListings.map((l) => ({
    platform: l.platform,
    url: l.url,
    externalItemId: l.externalItemId,
  }));
}

function serializeSummary(p: ListProduct) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category,
    image: p.images[0]?.url ?? null,
    ...priceRange(p.variants),
    variantCount: p.variants.length,
    inStock: p.variants.some((v) => (sellableQty(v) ?? 0) > 0),
    marketplaces: serializeListings(p),
  };
}

function serializeDetail(p: DetailProduct) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
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
      // Per-piece price by quantity, starting with the 1+ row; empty if the variant has no price.
      tiers: (priceLadder(v) ?? []).map((t) => ({ minQty: t.minQty, unitPrice: t.unitPriceCents / 100 })),
      quickQtys: quickQtys(v.quickQtys),
    })),
    bulkQuote: bulkQuote(),
    marketplaces: serializeListings(p),
  };
}

function firstString(value: unknown) {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" ? v.trim() : "";
}

function positiveInt(value: unknown, fallback: number) {
  const n = Number.parseInt(firstString(value), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// GET /api/products?category=<slug>&q=<search>&page=1&pageSize=24
productsRouter.get("/", async (req, res) => {
  const category = firstString(req.query.category);
  const q = firstString(req.query.q).slice(0, 100);
  const page = positiveInt(req.query.page, 1);
  const pageSize = Math.min(positiveInt(req.query.pageSize, 24), MAX_PAGE_SIZE);

  // MySQL's default collation makes `contains` case-insensitive.
  const where: Prisma.ProductWhereInput = {
    isActive: true,
    ...(category && { category: { slug: category } }),
    ...(q && {
      OR: [
        { name: { contains: q } },
        { parentSku: { contains: q } },
        { variants: { some: { sku: { contains: q } } } },
        { variants: { some: { variationName: { contains: q } } } },
      ],
    }),
  };

  const [total, products] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: listInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  res.json({ items: products.map(serializeSummary), total, page, pageSize });
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
  res.json(serializeDetail(product));
});
