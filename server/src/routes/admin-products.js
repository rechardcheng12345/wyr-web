import { Router } from "express";
import { requireAdmin } from "../auth.js";
import { cleanTitle } from "../display-name.js";
import { prisma } from "../db.js";
import { DIMENSIONS, INFO_FIELDS, parseCm, parseFaqs, parseInfo, parseVideos } from "../product-info.js";
import { logStockMovement } from "../stock.js";

export const adminProductsRouter = Router();
adminProductsRouter.use(requireAdmin);

const MAX_IMAGES = 20;
const MAX_VARIANTS = 50;
const PLATFORMS = ["shopee", "lazada"];

class ValidationError extends Error {
  constructor(message, fields = {}, status = 400) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

const toNumber = (d) => (d == null ? null : d.toNumber());

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

function str(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function optionalMoney(value, field, fields) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 99_999_999) {
    fields[field] = "Enter an amount of 0 or more";
    return null;
  }
  return Math.round(n * 100) / 100;
}

function optionalInt(value, field, fields, { min = 0 } = {}) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) {
    fields[field] = `Whole number, ${min} or more`;
    return null;
  }
  return n;
}

function isUrl(value) {
  if (value.startsWith("/")) return true;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function parseInput(body) {
  const fields = {};
  const name = str(body?.name, 255);
  if (!name) fields.name = "Required";

  const slug = slugify(str(body?.slug, 255) || name);
  if (name && !slug) fields.slug = "Use letters or numbers";

  let categoryId = null;
  if (body?.categoryId !== "" && body?.categoryId != null) {
    categoryId = Number(body.categoryId);
    if (!Number.isInteger(categoryId)) fields.categoryId = "Pick a category";
  }

  const images = (Array.isArray(body?.images) ? body.images : []).map((u) => str(u, 500)).filter(Boolean);
  if (images.length > MAX_IMAGES) fields.images = `At most ${MAX_IMAGES} images`;
  images.forEach((u, i) => {
    if (!isUrl(u)) fields[`images.${i}`] = "Not a valid link (https://… or /images/…)";
  });

  const rawVariants = Array.isArray(body?.variants) ? body.variants : [];
  if (rawVariants.length === 0) fields.variants = "Add at least one variant";
  if (rawVariants.length > MAX_VARIANTS) fields.variants = `At most ${MAX_VARIANTS} variants`;
  const variants = rawVariants.slice(0, MAX_VARIANTS).map((v, i) => {
    const sku = str(v?.sku, 80);
    if (!sku) fields[`variants.${i}.sku`] = "Required";
    const price = optionalMoney(v?.price, `variants.${i}.price`, fields);
    if (price == null && !fields[`variants.${i}.price`]) fields[`variants.${i}.price`] = "Required";
    const specialPrice = optionalMoney(v?.specialPrice, `variants.${i}.specialPrice`, fields);
    if (price != null && specialPrice != null && specialPrice >= price) fields[`variants.${i}.specialPrice`] = "Must be lower than the price";
    return {
      id: Number.isInteger(v?.id) ? v.id : null,
      sku,
      variationName: str(v?.name, 150) || null,
      price,
      specialPrice,
      weightG: optionalInt(v?.weightG, `variants.${i}.weightG`, fields),
      ...Object.fromEntries(DIMENSIONS.map((d) => [d, parseCm(v?.[d], `variants.${i}.${d}`, fields)])),
      stock: optionalInt(v?.stock, `variants.${i}.stock`, fields) ?? 0,
    };
  });
  const seen = new Map();
  variants.forEach((v, i) => {
    const key = v.sku.toLowerCase();
    if (!key) return;
    if (seen.has(key)) fields[`variants.${i}.sku`] = "Duplicate SKU in this product";
    seen.set(key, i);
  });

  const marketplaces = {};
  for (const p of PLATFORMS) {
    const url = str(body?.marketplaces?.[p], 500);
    if (url && !isUrl(url)) fields[`marketplaces.${p}`] = "Not a valid link";
    marketplaces[p] = url || null;
  }

  const info = parseInfo(body, fields);
  const faqs = parseFaqs(body?.faqs, fields);
  const videos = parseVideos(body?.videos, fields);

  if (Object.keys(fields).length) throw new ValidationError("Please fix the highlighted fields", fields);

  return {
    product: {
      name,
      displayName: str(body?.displayName, 255) || null,
      slug,
      categoryId,
      parentSku: str(body?.parentSku, 80) || null,
      description: typeof body?.description === "string" ? body.description.trim().slice(0, 60_000) || null : null,
      isActive: body?.isActive !== false,
      ...info,
    },
    images,
    faqs,
    videos,
    variants,
    marketplaces,
  };
}

async function checkConflicts(tx, input, productId) {
  const fields = {};
  const notThis = productId ? { NOT: { id: productId } } : {};

  if (await tx.product.findFirst({ where: { slug: input.product.slug, ...notThis }, select: { id: true } })) {
    fields.slug = "Another product already uses this URL";
  }
  if (input.product.parentSku && (await tx.product.findFirst({ where: { parentSku: input.product.parentSku, ...notThis }, select: { id: true } }))) {
    fields.parentSku = "Another product already uses this parent SKU";
  }
  if (input.product.categoryId != null && !(await tx.category.findUnique({ where: { id: input.product.categoryId }, select: { id: true } }))) {
    fields.categoryId = "Category not found";
  }
  const taken = await tx.productVariant.findMany({
    where: { sku: { in: input.variants.map((v) => v.sku) }, ...(productId ? { productId: { not: productId } } : {}) },
    select: { sku: true },
  });
  const takenSet = new Set(taken.map((t) => t.sku.toLowerCase()));
  input.variants.forEach((v, i) => {
    if (takenSet.has(v.sku.toLowerCase())) fields[`variants.${i}.sku`] = "SKU used by another product";
  });

  if (Object.keys(fields).length) throw new ValidationError("Please fix the highlighted fields", fields, 409);
}

async function variantsWithOrders(tx, variantIds) {
  if (variantIds.length === 0) return new Set();
  const rows = await tx.orderItem.findMany({ where: { variantId: { in: variantIds } }, select: { variantId: true }, distinct: ["variantId"] });
  return new Set(rows.map((r) => r.variantId));
}

async function deleteVariants(tx, variantIds) {
  if (variantIds.length === 0) return;
  const where = { variantId: { in: variantIds } };
  await tx.inventory.deleteMany({ where });
  await tx.priceTier.deleteMany({ where });
  await tx.platformSku.deleteMany({ where });
  await tx.productImage.deleteMany({ where });
  await tx.productVariant.deleteMany({ where: { id: { in: variantIds } } });
}

async function writeChildren(tx, productId, input, existingVariantIds) {
  await tx.productImage.deleteMany({ where: { productId, variantId: null } });
  if (input.images.length) {
    await tx.productImage.createMany({ data: input.images.map((url, i) => ({ productId, url, sortOrder: i })) });
  }
  await tx.productFaq.deleteMany({ where: { productId } });
  if (input.faqs.length) await tx.productFaq.createMany({ data: input.faqs.map((f, i) => ({ productId, ...f, sortOrder: i })) });
  await tx.productVideo.deleteMany({ where: { productId } });
  if (input.videos.length) await tx.productVideo.createMany({ data: input.videos.map((v, i) => ({ productId, ...v, sortOrder: i })) });

  for (const p of PLATFORMS) {
    const url = input.marketplaces[p];
    if (url) {
      await tx.marketplaceListing.upsert({
        where: { productId_platform: { productId, platform: p } },
        create: { productId, platform: p, url },
        update: { url },
      });
    } else {
      await tx.marketplaceListing.deleteMany({ where: { productId, platform: p } });
    }
  }

  for (const v of input.variants) {
    const data = { sku: v.sku, variationName: v.variationName, price: v.price, specialPrice: v.specialPrice, weightG: v.weightG, lengthCm: v.lengthCm, widthCm: v.widthCm, heightCm: v.heightCm };
    let variantId = v.id;
    if (variantId && existingVariantIds.has(variantId)) {
      await tx.productVariant.update({ where: { id: variantId }, data });
    } else {
      variantId = (await tx.productVariant.create({ data: { ...data, productId } })).id;
    }
    const before = await tx.inventory.findUnique({ where: { variantId }, select: { available: true } });
    await tx.inventory.upsert({
      where: { variantId },
      create: { variantId, available: v.stock },
      update: { available: v.stock },
    });
    await logStockMovement(tx, { variantId, delta: v.stock - (before?.available ?? 0), reason: "adjust", note: "admin product edit" });
  }
}

const TX_OPTIONS = { timeout: 20_000 };

function serializeRow(p) {
  const prices = p.variants.map((v) => toNumber(v.specialPrice ?? v.price)).filter((n) => n != null);
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    isActive: p.isActive !== false,
    category: p.category,
    image: p.images[0]?.url ?? null,
    variantCount: p.variants.length,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    stock: p.variants.reduce((s, v) => s + (v.inventory?.available ?? 0), 0),
    createdAt: p.createdAt,
  };
}

function serializeForEdit(p) {
  const listing = (platform) => p.marketplaceListings.find((l) => l.platform === platform)?.url ?? "";
  return {
    id: p.id,
    name: p.name,
    displayName: p.displayName ?? "",
    autoDisplayName: cleanTitle(p.name),
    slug: p.slug ?? "",
    categoryId: p.categoryId,
    parentSku: p.parentSku ?? "",
    description: p.description ?? "",
    isActive: p.isActive !== false,
    ...Object.fromEntries(INFO_FIELDS.map((f) => [f.key, p[f.key] ?? ""])),
    images: p.images.map((i) => i.url).filter(Boolean),
    faqs: p.faqs.map((f) => ({ question: f.question, answer: f.answer })),
    videos: p.videos.map((v) => ({ url: v.url, title: v.title ?? "" })),
    variants: p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      name: v.variationName ?? "",
      price: toNumber(v.price),
      specialPrice: toNumber(v.specialPrice),
      weightG: v.weightG,
      lengthCm: toNumber(v.lengthCm),
      widthCm: toNumber(v.widthCm),
      heightCm: toNumber(v.heightCm),
      stock: v.inventory?.available ?? 0,
      reserved: v.inventory?.reserved ?? 0,
      hasPriceTiers: v._count.priceTiers > 0,
    })),
    marketplaces: Object.fromEntries(PLATFORMS.map((pl) => [pl, listing(pl)])),
  };
}

const editInclude = {
  images: { where: { variantId: null }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
  variants: { include: { inventory: true, _count: { select: { priceTiers: true } } }, orderBy: { id: "asc" } },
  marketplaceListings: true,
  faqs: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
  videos: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
};

function sendError(res, err) {
  if (err instanceof ValidationError) {
    res.status(err.status).json({ error: err.message, fields: err.fields });
    return true;
  }
  if (err?.code === "P2002") {
    res.status(409).json({ error: "A product with the same URL or SKU already exists" });
    return true;
  }
  return false;
}

adminProductsRouter.get("/", async (_req, res) => {
  const products = await prisma.product.findMany({
    include: {
      category: { select: { id: true, name: true, slug: true } },
      variants: { include: { inventory: true } },
      images: { where: { variantId: null }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: 1 },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  res.json(products.map(serializeRow));
});

adminProductsRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const product = Number.isInteger(id) ? await prisma.product.findUnique({ where: { id }, include: editInclude }) : null;
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json(serializeForEdit(product));
});

adminProductsRouter.post("/", async (req, res, next) => {
  try {
    const input = parseInput(req.body);
    const id = await prisma.$transaction(async (tx) => {
      await checkConflicts(tx, input, null);
      const store = await tx.store.findFirst({ orderBy: { id: "asc" }, select: { id: true } });
      if (!store) throw new ValidationError("No store set up in the database");
      const product = await tx.product.create({ data: { ...input.product, storeId: store.id } });
      await writeChildren(tx, product.id, input, new Set());
      return product.id;
    }, TX_OPTIONS);
    const product = await prisma.product.findUnique({ where: { id }, include: editInclude });
    res.status(201).json(serializeForEdit(product));
  } catch (err) {
    if (!sendError(res, err)) next(err);
  }
});

adminProductsRouter.put("/:id", async (req, res, next) => {
  const id = Number(req.params.id);
  try {
    const input = parseInput(req.body);
    await prisma.$transaction(async (tx) => {
      const existing = Number.isInteger(id)
        ? await tx.product.findUnique({ where: { id }, include: { variants: { select: { id: true, sku: true } } } })
        : null;
      if (!existing) throw new ValidationError("Product not found", {}, 404);
      await checkConflicts(tx, input, id);

      const existingIds = new Set(existing.variants.map((v) => v.id));
      const keptIds = new Set(input.variants.map((v) => v.id).filter((vid) => existingIds.has(vid)));
      const removed = existing.variants.filter((v) => !keptIds.has(v.id));
      const ordered = await variantsWithOrders(tx, removed.map((v) => v.id));
      if (ordered.size) {
        const skus = removed.filter((v) => ordered.has(v.id)).map((v) => v.sku);
        throw new ValidationError(`Can't remove variant ${skus.join(", ")}: it appears in customer orders.`, {}, 409);
      }
      await deleteVariants(tx, removed.map((v) => v.id));

      await tx.product.update({ where: { id }, data: input.product });
      await writeChildren(tx, id, input, existingIds);
    }, TX_OPTIONS);
    const product = await prisma.product.findUnique({ where: { id }, include: editInclude });
    res.json(serializeForEdit(product));
  } catch (err) {
    if (!sendError(res, err)) next(err);
  }
});

adminProductsRouter.delete("/:id", async (req, res, next) => {
  const id = Number(req.params.id);
  try {
    await prisma.$transaction(async (tx) => {
      const existing = Number.isInteger(id)
        ? await tx.product.findUnique({ where: { id }, include: { variants: { select: { id: true } } } })
        : null;
      if (!existing) throw new ValidationError("Product not found", {}, 404);
      const variantIds = existing.variants.map((v) => v.id);
      if ((await variantsWithOrders(tx, variantIds)).size) {
        throw new ValidationError("This product has customer orders, so it can't be deleted. Hide it from the shop instead.", {}, 409);
      }
      await deleteVariants(tx, variantIds);
      await tx.productImage.deleteMany({ where: { productId: id } });
      await tx.marketplaceListing.deleteMany({ where: { productId: id } });
      await tx.product.delete({ where: { id } });
    }, TX_OPTIONS);
    res.json({ ok: true });
  } catch (err) {
    if (!sendError(res, err)) next(err);
  }
});
