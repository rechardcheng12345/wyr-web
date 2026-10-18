import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { CORS_ORIGINS } from "./constants.js";
import { SERVER_ROOT } from "./env.js";
import { CheckoutError } from "./orders.js";
import { categoriesRouter } from "./routes/categories.js";
import { checkoutRouter } from "./routes/checkout.js";
import { ordersRouter } from "./routes/orders.js";
import { paymentsRouter } from "./routes/payments.js";
import { productsRouter } from "./routes/products.js";

const CLIENT_DIST = path.resolve(SERVER_ROOT, "../client/dist");

export function createApp() {
  const app = express();

  app.use(cors({ origin: CORS_ORIGINS }));
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api/products", productsRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/checkout", checkoutRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/payments", paymentsRouter);

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Serve the built frontend from client/dist (production only).
  // In dev mode, the frontend runs separately via Vite, which proxies /api here.
  const isDev = process.env.NODE_ENV === "dev" || process.env.NODE_ENV === "development";
  if (!isDev) {
    if (fs.existsSync(CLIENT_DIST)) {
      app.use(express.static(CLIENT_DIST));
      // SPA fallback: any other GET gets index.html so client-side routes like /checkout/return work.
      app.use((req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        res.sendFile(path.join(CLIENT_DIST, "index.html"));
      });
    } else {
      console.warn(`[warn] frontend build not found at ${CLIENT_DIST}; run "npm run client:build" first`);
    }
  } else {
    console.log("[dev] skipping client/dist; frontend served by Vite on port 5173");
  }

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof CheckoutError) {
      res.status(err.status).json({ error: err.message, ...(err.details as object | undefined) });
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
