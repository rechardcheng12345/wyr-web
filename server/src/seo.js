// Search-engine support for the production SPA: robots.txt, sitemap.xml, a www -> apex
// redirect, and per-URL <head> tags (title, description, canonical, Open Graph, Product
// JSON-LD) injected into client/dist/index.html so crawlers that don't run JavaScript
// still see the right page. Unknown URLs and products get a real 404 status.
import fs from "node:fs";
import path from "node:path";
import { prisma } from "./db.js";
import { BUSINESS_NAME, businessJsonLd, shippingDetailsJsonLd, variantOffer, variantUrl, websiteJsonLd } from "./merchant.js";
import { detailInclude, serializeDetail } from "./routes/products.js";

const SITE_NAME = BUSINESS_NAME;
const DEFAULT_TITLE = "WYR Technology · NFC & RFID hardware";
const DEFAULT_DESCRIPTION = "WYR Technology: NFC tags, RFID cards, readers and tap-to-review standees. Ready stock in Kuala Lumpur.";
const DEFAULT_IMAGE = "/images/logo.jpeg";

// Public pages worth indexing (path -> title, description).
const STATIC_PAGES = {
  "/": { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION },
  "/products": {
    title: "Shop NFC tags, RFID cards & readers · WYR Technology",
    description: "Browse NFC stickers, NTAG213/215/216 tags, RFID and DESFire cards, readers and tap-to-review standees. Ready stock in Malaysia, ships from Kuala Lumpur.",
  },
  "/about": {
    title: "About us · WYR Technology",
    description: "WYR Technology makes NFC and RFID easy to buy in Malaysia: genuine chips, ready stock in Kuala Lumpur and help choosing the right tag.",
  },
  "/contact": {
    title: "Contact us · WYR Technology",
    description: "Questions about NFC tags, RFID cards or bulk orders? Contact WYR Technology by WhatsApp or email.",
  },
  "/eink-converter": {
    title: "E-ink card image converter · WYR Technology",
    description: "Convert any photo into a 200 × 300 black, white, red and yellow picture that the e-ink NFC card accepts, ready to write with the NETME app on iPhone.",
  },
};

// Real pages that shouldn't appear in search results (carts, accounts, order status).
const PRIVATE_PAGES = [/^\/cart$/, /^\/checkout(\/return)?$/, /^\/orders\/[^/]+$/, /^\/track$/, /^\/account(\/(login|register|orders))?$/];

const ROBOTS_DISALLOW = ["/system", "/api/", "/cart", "/checkout", "/account", "/orders/", "/track"];

// Canonical origin: PUBLIC_BASE_URL in production (it is required for payments anyway).
function siteOrigin(req) {
  const env = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  return env || `${req.protocol}://${req.get("host")}`;
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const absolute = (origin, url) => (/^https?:\/\//i.test(url) ? url : `${origin}${url.startsWith("/") ? "" : "/"}${url}`);

function truncate(text, max = 160) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 3).replace(/\s+\S*$/, "")}…`;
}

// Mirrors metaDescription() in client/src/pages/ProductDetailPage.jsx.
function productDescription(product, name) {
  const price = product.minPrice != null ? ` from RM${product.minPrice.toFixed(2)}` : "";
  const text = String(product.description ?? "").replace(/\s+/g, " ").trim();
  if (!text) return `${name}${price}. Ready stock in Malaysia, ships from Kuala Lumpur.`;
  return truncate(`${name}${price}. ${text}`);
}

function productJsonLd(product, raw, origin, url) {
  const seller = { "@type": "Organization", name: SITE_NAME };
  // One Offer per variant (Google merchant listings don't accept AggregateOffer). The price is
  // per piece, as the page shows it; variants with a minimum quantity say so in eligibleQuantity.
  const offers = product.variants.flatMap((v) => {
    const o = variantOffer(v);
    if (!o) return [];
    return [
      {
        "@type": "Offer",
        url: variantUrl(url, v),
        sku: v.sku,
        ...(v.name && { name: v.name }),
        priceCurrency: "MYR",
        price: o.unitPrice.toFixed(2),
        ...(o.packQty > 1 && { eligibleQuantity: { "@type": "QuantitativeValue", minValue: o.packQty, unitCode: "C62" } }),
        availability: `https://schema.org/${o.inStock ? "InStock" : "OutOfStock"}`,
        itemCondition: "https://schema.org/NewCondition",
        shippingDetails: shippingDetailsJsonLd(Math.round(o.packPrice * 100)),
        seller,
      },
    ];
  });
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.displayName ?? product.name,
    description: truncate(product.description || product.name, 5000),
    image: product.images.map((i) => absolute(origin, i.url)).slice(0, 10),
    sku: product.parentSku ?? product.variants[0]?.sku,
    ...(raw.brand && { brand: { "@type": "Brand", name: raw.brand } }),
    ...(raw.model && { model: raw.model }),
    ...(product.category?.name && { category: product.category.name }),
    url,
    ...(offers.length && { offers }),
  };
}

function breadcrumbJsonLd(product, origin, url) {
  const items = [{ name: "Products", item: `${origin}/products` }];
  if (product.category?.slug) items.push({ name: product.category.name, item: `${origin}/products?category=${encodeURIComponent(product.category.slug)}` });
  items.push({ name: product.displayName ?? product.name, item: url });
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, ...it })),
  };
}

// Decides what the <head> of a given URL should say, and its HTTP status.
async function pageMeta(req, origin) {
  const p = req.path.length > 1 ? req.path.replace(/\/+$/, "") : "/";

  if (p === "/products" || STATIC_PAGES[p]) {
    const meta = { status: 200, ...STATIC_PAGES[p], canonical: `${origin}${p === "/" ? "/" : p}`, type: "website", jsonLd: [] };
    if (p === "/") meta.jsonLd.push(businessJsonLd(origin), websiteJsonLd(origin));
    if (p === "/about" || p === "/contact") meta.jsonLd.push(businessJsonLd(origin));
    // Category listings are their own pages; searches and page numbers fold into /products.
    const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
    if (p === "/products" && category) {
      const cat = await prisma.category.findUnique({ where: { slug: category }, select: { name: true, slug: true } });
      if (cat?.name) {
        meta.title = `${cat.name} · WYR Technology`;
        meta.description = `Shop ${cat.name} at WYR Technology. Ready stock in Malaysia, ships from Kuala Lumpur.`;
        meta.canonical = `${origin}/products?category=${encodeURIComponent(cat.slug)}`;
      }
    }
    return meta;
  }

  const productMatch = p.match(/^\/products\/([^/]+)$/);
  if (productMatch) {
    const slug = decodeURIComponent(productMatch[1]);
    const raw = await prisma.product.findFirst({ where: { slug, isActive: true }, include: detailInclude });
    if (!raw) return notFound();
    const product = serializeDetail(raw);
    const name = product.displayName ?? product.name;
    const url = `${origin}/products/${encodeURIComponent(raw.slug)}`;
    return {
      status: 200,
      title: `${name} · WYR Technology`,
      description: productDescription(product, name),
      canonical: url,
      type: "product",
      image: product.images[0]?.url,
      jsonLd: [productJsonLd(product, raw, origin, url), breadcrumbJsonLd(product, origin, url)],
    };
  }

  if (p === "/system" || p.startsWith("/system/")) return { status: 200, title: DEFAULT_TITLE, noindex: true, jsonLd: [] };
  if (PRIVATE_PAGES.some((re) => re.test(p))) return { status: 200, title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION, noindex: true, jsonLd: [] };
  return notFound();
}

function notFound() {
  return { status: 404, title: `Page not found · ${SITE_NAME}`, description: DEFAULT_DESCRIPTION, noindex: true, jsonLd: [] };
}

function headTags(meta, origin) {
  const tags = [];
  if (meta.noindex) tags.push('<meta name="robots" content="noindex, nofollow" />');
  if (meta.canonical) {
    const image = absolute(origin, meta.image || DEFAULT_IMAGE);
    tags.push(
      `<link rel="canonical" href="${escapeHtml(meta.canonical)}" />`,
      `<meta property="og:site_name" content="${SITE_NAME}" />`,
      `<meta property="og:type" content="${meta.type === "product" ? "product" : "website"}" />`,
      `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
      `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
      `<meta property="og:url" content="${escapeHtml(meta.canonical)}" />`,
      `<meta property="og:image" content="${escapeHtml(image)}" />`,
      '<meta property="og:locale" content="en_MY" />',
      '<meta name="twitter:card" content="summary_large_image" />',
    );
  }
  for (const data of meta.jsonLd) {
    // Escape "<" so product text can never close the script tag.
    tags.push(`<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`);
  }
  return tags.join("\n    ");
}

// 301 www.<host> to <host> when PUBLIC_BASE_URL names the bare domain, so there is one copy of each page.
export function redirectWww(req, res, next) {
  const env = process.env.PUBLIC_BASE_URL?.trim();
  const host = req.get("host") ?? "";
  if (env && (req.method === "GET" || req.method === "HEAD") && host.toLowerCase().startsWith("www.")) {
    try {
      const canonical = new URL(env);
      if (canonical.host.toLowerCase() === host.slice(4).toLowerCase()) {
        res.redirect(301, `${canonical.origin}${req.originalUrl}`);
        return;
      }
    } catch {
      // Bad PUBLIC_BASE_URL: serve the page rather than break the site.
    }
  }
  next();
}

export function createSeo(clientDist) {
  const indexPath = path.join(clientDist, "index.html");
  let template = null;
  const loadTemplate = () => (template ??= fs.readFileSync(indexPath, "utf8"));

  function robots(req, res) {
    const origin = siteOrigin(req);
    const lines = ["User-agent: *", "Allow: /", ...ROBOTS_DISALLOW.map((d) => `Disallow: ${d}`), "", `Sitemap: ${origin}/sitemap.xml`, ""];
    res.type("text/plain").set("Cache-Control", "public, max-age=3600").send(lines.join("\n"));
  }

  async function sitemap(req, res, next) {
    try {
      const origin = siteOrigin(req);
      const [products, categories] = await Promise.all([
        prisma.product.findMany({ where: { isActive: true, slug: { not: null } }, select: { slug: true }, orderBy: { id: "asc" } }),
        prisma.category.findMany({ where: { slug: { not: null }, products: { some: { isActive: true } } }, select: { slug: true }, orderBy: { id: "asc" } }),
      ]);
      const urls = [
        ...Object.keys(STATIC_PAGES).map((p) => `${origin}${p}`),
        ...categories.map((c) => `${origin}/products?category=${encodeURIComponent(c.slug)}`),
        ...products.map((p) => `${origin}/products/${encodeURIComponent(p.slug)}`),
      ];
      const body = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urls.map((u) => `  <url><loc>${escapeHtml(u)}</loc></url>`),
        "</urlset>",
        "",
      ].join("\n");
      res.type("application/xml").set("Cache-Control", "public, max-age=3600").send(body);
    } catch (err) {
      next(err);
    }
  }

  // SPA fallback: index.html with this URL's head tags and the right status code.
  async function renderPage(req, res, next) {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    try {
      const origin = siteOrigin(req);
      let meta;
      try {
        meta = await pageMeta(req, origin);
      } catch (err) {
        // A database hiccup shouldn't take the shop down: fall back to the generic head.
        console.error("[seo] page meta failed:", err);
        meta = { status: 200, title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION, jsonLd: [] };
      }
      let html = loadTemplate()
        .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(meta.title ?? DEFAULT_TITLE)}</title>`)
        .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${escapeHtml(meta.description ?? DEFAULT_DESCRIPTION)}" />`);
      const tags = headTags(meta, origin);
      if (tags) html = html.replace(/\s*<\/head>/, `\n    ${tags}\n  </head>`);
      res.status(meta.status).type("html").set("Cache-Control", "no-cache");
      if (meta.noindex) res.set("X-Robots-Tag", "noindex, nofollow");
      res.send(html);
    } catch (err) {
      next(err);
    }
  }

  return { robots, sitemap, renderPage };
}
