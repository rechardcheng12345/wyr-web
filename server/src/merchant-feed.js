// Google Merchant Center product feed (RSS 2.0 with the g: namespace) at /merchant-feed.xml.
// Add it in Merchant Center as a scheduled fetch so prices and stock refresh daily.
// One item per variant, grouped by product. Variants that need a minimum quantity are
// listed as a multipack of that size at the pack price, which is the least a buyer can pay.
import { prisma } from "./db.js";
import { variantOffer, variantUrl } from "./merchant.js";
import { detailInclude, serializeDetail } from "./routes/products.js";

const escapeXml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);

const absolute = (origin, url) => (/^https?:\/\//i.test(url) ? url : `${origin}${url.startsWith("/") ? "" : "/"}${url}`);

// Merchant Center limits: title 150 characters, description 5000.
const clip = (text, max) => {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
};

function itemXml(origin, raw, product, variant) {
  const offer = variantOffer(variant);
  if (!offer) return null;
  const productUrl = `${origin}/products/${encodeURIComponent(raw.slug)}`;
  const name = product.displayName ?? product.name;
  const variantName = variant.name && product.variants.length > 1 ? ` - ${variant.name}` : "";
  const pack = offer.packQty > 1 ? ` (Pack of ${offer.packQty})` : "";
  // Prefer the variant's own photo, then the product gallery.
  const variantImage = product.images.find((i) => i.variantId === variant.id)?.url;
  const gallery = product.images.filter((i) => i.variantId === null).map((i) => i.url);
  const images = [...new Set([variantImage, ...gallery, ...product.images.map((i) => i.url)].filter(Boolean))].map((u) => absolute(origin, u));
  if (!images.length) return null;

  const fields = [
    ["g:id", variant.sku],
    ...(product.variants.length > 1 ? [["g:item_group_id", raw.parentSku ?? `product-${raw.id}`]] : []),
    ["g:title", clip(`${name}${variantName}${pack}`, 150)],
    ["g:description", clip(product.description || name, 5000)],
    ["g:link", variantUrl(productUrl, variant)],
    ["g:image_link", images[0]],
    ...images.slice(1, 11).map((u) => ["g:additional_image_link", u]),
    ["g:availability", offer.inStock ? "in_stock" : "out_of_stock"],
    ["g:price", `${offer.packPrice.toFixed(2)} MYR`],
    ...(offer.packQty > 1 ? [["g:multipack", String(offer.packQty)]] : []),
    ["g:condition", "new"],
    ...(raw.brand ? [["g:brand", raw.brand]] : []),
    // No GTINs or manufacturer part numbers on file for these items.
    ["g:identifier_exists", "no"],
    ...(product.category?.name ? [["g:product_type", product.category.name]] : []),
    ...(variant.weightG ? [["g:shipping_weight", `${variant.weightG} g`]] : []),
  ];
  return `    <item>\n${fields.map(([k, v]) => `      <${k}>${escapeXml(v)}</${k}>`).join("\n")}\n    </item>`;
}

export async function merchantFeed(req, res, next) {
  try {
    const env = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
    const origin = env || `${req.protocol}://${req.get("host")}`;
    const products = await prisma.product.findMany({
      where: { isActive: true, slug: { not: null } },
      include: detailInclude,
      orderBy: { id: "asc" },
    });
    const items = [];
    for (const raw of products) {
      const product = serializeDetail(raw);
      for (const v of product.variants) {
        const weightG = raw.variants.find((rv) => rv.id === v.id)?.weightG ?? null;
        const xml = itemXml(origin, raw, product, { ...v, weightG });
        if (xml) items.push(xml);
      }
    }
    const body = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
      "  <channel>",
      "    <title>WYR Technology</title>",
      `    <link>${escapeXml(origin)}/</link>`,
      "    <description>NFC tags, RFID cards and readers, shipped across Malaysia.</description>",
      ...items,
      "  </channel>",
      "</rss>",
      "",
    ].join("\n");
    res.type("application/xml").set("Cache-Control", "public, max-age=3600").send(body);
  } catch (err) {
    next(err);
  }
}
