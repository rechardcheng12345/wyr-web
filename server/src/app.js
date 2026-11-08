import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express, { } from "express";
import { CORS_ORIGINS } from "./constants.js";
import { SERVER_ROOT } from "./env.js";
import { CheckoutError } from "./orders.js";
import { bulkQuote } from "./pricing.js";
import { merchantFeed } from "./merchant-feed.js";
import { createSeo, redirectWww } from "./seo.js";
import { getSetting } from "./settings.js";
import { shippingSummary } from "./shipping.js";
import { welcomeVoucher } from "./vouchers.js";
import { accountRouter } from "./routes/account.js";
import { adminClientsRouter } from "./routes/admin-clients.js";
import { adminCostingRouter } from "./routes/admin-costing.js";
import { adminDocumentsRouter } from "./routes/admin-documents.js";
import { adminInventoryRouter } from "./routes/admin-inventory.js";
import { adminOrdersRouter } from "./routes/admin-orders.js";
import { adminProductInfoRouter } from "./routes/admin-product-info.js";
import { adminProductsRouter } from "./routes/admin-products.js";
import { adminPurchasingRouter } from "./routes/admin-purchasing.js";
import { adminSalesRouter } from "./routes/admin-sales.js";
import { adminSettingsRouter } from "./routes/admin-settings.js";
import { adminUploadsRouter, UPLOAD_DIR, UPLOAD_URL } from "./routes/admin-uploads.js";
import { adminVouchersRouter } from "./routes/admin-vouchers.js";
import { authRouter } from "./routes/auth.js";
import { categoriesRouter } from "./routes/categories.js";
import { checkoutRouter } from "./routes/checkout.js";
import { ordersRouter } from "./routes/orders.js";
import { paymentsRouter } from "./routes/payments.js";
import { productsRouter } from "./routes/products.js";

const CLIENT_DIST = path.resolve(SERVER_ROOT, "../client/dist");

export function createApp() {
  const app = express();

  app.set("trust proxy", "loopback");
  if (!(process.env.NODE_ENV === "dev" || process.env.NODE_ENV === "development")) app.use(redirectWww);
  app.use(cors({ origin: CORS_ORIGINS }));
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/api/site", async (_req, res) => {
    const { whatsappNumber, minQty } = bulkQuote();
    const shipping = shippingSummary();
    res.json({
      whatsappNumber,
      bulkQuoteMinQty: minQty,
      shopeeUrl: getSetting("shopeeUrl") || null,
      shipping: { westRm: shipping.westCents / 100, eastRm: shipping.eastCents / 100, freeThresholdRm: shipping.freeThresholdCents == null ? null : shipping.freeThresholdCents / 100 },
      minOrderSubtotalRm: getSetting("min_order_subtotal"),
      lowPriceMinQty: getSetting("low_price_min_qty"),
      welcomeVoucher: await welcomeVoucher(),
    });
  });
  app.use("/api/auth", authRouter);
  app.use("/api/account", accountRouter);
  app.use("/api/admin/products", adminProductsRouter);
  app.use("/api/admin/product-info", adminProductInfoRouter);
  app.use("/api/admin/uploads", adminUploadsRouter);
  app.use("/api/admin/orders", adminOrdersRouter);
  app.use("/api/admin/inventory", adminInventoryRouter);
  app.use("/api/admin/purchasing", adminPurchasingRouter);
  app.use("/api/admin/sales", adminSalesRouter);
  app.use("/api/admin/costing", adminCostingRouter);
  app.use("/api/admin/settings", adminSettingsRouter);
  app.use("/api/admin/vouchers", adminVouchersRouter);
  app.use("/api/admin/documents", adminDocumentsRouter);
  app.use("/api/admin/clients", adminClientsRouter);
  app.use("/api/products", productsRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/checkout", checkoutRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/payments", paymentsRouter);

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Uploaded product photos and videos (both modes; Vite proxies /uploads in dev).
  app.use(UPLOAD_URL, express.static(UPLOAD_DIR, { maxAge: "30d", immutable: true }), (_req, res) => {
    res.status(404).end();
  });

  // Serve the built frontend from client/dist (production only).
  // In dev mode, the frontend runs separately via Vite, which proxies /api here.
  const isDev = process.env.NODE_ENV === "dev" || process.env.NODE_ENV === "development";
  if (!isDev) {
    if (fs.existsSync(CLIENT_DIST)) {
      const seo = createSeo(CLIENT_DIST);
      app.get("/robots.txt", seo.robots);
      app.get("/sitemap.xml", seo.sitemap);
      app.get("/merchant-feed.xml", merchantFeed);
      app.use("/system", (_req, res, next) => {
        res.set("X-Robots-Tag", "noindex, nofollow");
        next();
      });
      // index: false so "/" goes through renderPage and gets its head tags.
      app.use(
        express.static(CLIENT_DIST, {
          index: false,
          setHeaders(res, filePath) {
            // Vite puts a content hash in every /assets file name, so they never change.
            if (filePath.includes(`${path.sep}assets${path.sep}`)) res.set("Cache-Control", "public, max-age=31536000, immutable");
            else if (filePath.includes(`${path.sep}images${path.sep}`)) res.set("Cache-Control", "public, max-age=604800");
          },
        }),
      );
      // A missing hashed asset is a real 404, not the app shell.
      app.use("/assets", (_req, res) => {
        res.status(404).end();
      });
      // SPA fallback: index.html with per-URL title/meta/JSON-LD, and a 404 status for unknown pages.
      app.use(seo.renderPage);
    } else {
      console.warn(`[warn] frontend build not found at ${CLIENT_DIST}; run "npm run client:build" first`);
    }
  } else {
    console.log("[dev] skipping client/dist; frontend served by Vite on port 5173");
  }

  const onError = (err, _req, res, _next) => {
    if (err instanceof CheckoutError) {
      res.status(err.status).json({ error: err.message, ...(err.details) });
      return;
    }
    if (err?.type === "entity.parse.failed") {
      res.status(400).json({ error: "Invalid JSON" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  };
  app.use(onError);

  return app;
}
