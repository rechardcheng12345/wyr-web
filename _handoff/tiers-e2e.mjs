// End-to-end test of per-piece tiered pricing (Task 5). Needs the dev servers running with PAYMENT_MODE=mock
// and the tiers from _handoff/bundle_items.csv imported (npm run import:tiers -w server).
//
// Usage: node _handoff/tiers-e2e.mjs <puppeteerDir> <shotsDir> [clientUrl=http://localhost:5175] [apiUrl=http://localhost:4100]
//
// API:     product detail carries tiers / quick qtys / bulk quote; the quote prices each quantity at its tier;
//          POST /api/checkout stores the tier price on the order (client-sent prices ignored); untiered unchanged.
// Browser: tier table, quick-pick buttons, live per-piece price + total, "Buy N, save X%", WhatsApp link from 50,
//          cart re-prices when the quantity changes, checkout shows the tier price. Screenshots go to <shotsDir>.
// Cleanup: test orders (@example.com) are reversed and deleted.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [puppeteerDir, shotsDir, CLIENT = "http://localhost:5175", API = "http://localhost:4100"] = process.argv.slice(2);
if (!puppeteerDir || !shotsDir) {
  console.error("Usage: node _handoff/tiers-e2e.mjs <puppeteerDir> <shotsDir> [clientUrl] [apiUrl]");
  process.exit(2);
}

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../server");
const serverRequire = createRequire(path.join(serverDir, "package.json"));
serverRequire("dotenv").config({ path: path.join(serverDir, ".env") });
const { PrismaClient } = serverRequire("@prisma/client");
const puppeteer = createRequire(path.join(path.resolve(puppeteerDir), "x.js"))("puppeteer-core");
const prisma = new PrismaClient();

const BUYER = {
  name: "E2E Tier Buyer",
  email: "e2e.tiers@example.com",
  phone: "012-345 6789",
  addressLine: "12 Jalan Ampang, Level 3",
  postcode: "50450",
  city: "Kuala Lumpur",
  state: "W.P. Kuala Lumpur",
};

let failures = 0;
function check(ok, label, extra) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra !== undefined ? `  ${JSON.stringify(extra)}` : ""}`);
  if (!ok) failures++;
}

async function api(method, p, body) {
  const res = await fetch(`${API}${p}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function cleanup() {
  const orders = await prisma.order.findMany({ where: { email: { endsWith: "@example.com" } }, include: { items: true } });
  for (const o of orders) {
    await prisma.$transaction(async (tx) => {
      for (const it of o.items) {
        if (o.status === "pending_payment") {
          await tx.$executeRaw`UPDATE inventory SET reserved = GREATEST(reserved - ${it.qty}, 0) WHERE variant_id = ${it.variantId}`;
        } else if (o.status !== "cancelled") {
          await tx.$executeRaw`UPDATE inventory SET available = available + ${it.qty} WHERE variant_id = ${it.variantId}`;
        }
      }
      await tx.payment.deleteMany({ where: { orderId: o.id } });
      await tx.orderItem.deleteMany({ where: { orderId: o.id } });
      await tx.order.delete({ where: { id: o.id } });
    });
  }
  return orders.length;
}

/** Product detail + variant for a SKU, via the public API. */
async function findVariant(sku) {
  const list = (await api("GET", `/api/products?q=${encodeURIComponent(sku)}`)).json.items;
  for (const p of list) {
    const d = (await api("GET", `/api/products/${p.slug}`)).json;
    const v = d.variants.find((x) => x.sku.toLowerCase() === sku.toLowerCase());
    if (v) return { product: d, variant: v };
  }
  throw new Error(`variant ${sku} not found`);
}

const near = (a, b) => Math.abs(a - b) < 0.001;
const rmText = (n) => n.toFixed(2);

// ---------------------------------------------------------------------------
console.log(`client ${CLIENT}, api ${API}`);
const leftover = await cleanup();
if (leftover) console.log(`(removed ${leftover} leftover test order(s))`);

// RFIDTag9640WetInlay: base RM2.00, 3+ RM1.66, 10+ RM1.50 (two tiers). nfc_ic_coin_card: base 0.90, 10+ 0.80.
const wet = await findVariant("RFIDTag9640WetInlay");
const coin = await findVariant("nfc_ic_coin_card");
const plain = await findVariant("nfcntag213"); // pack SKU whose tiers were all rejected: quick qtys, no tiers
const ntag216 = await findVariant("nfcntag216");

// --- API --------------------------------------------------------------------
check(
  JSON.stringify(wet.variant.tiers) === JSON.stringify([{ minQty: 1, unitPrice: 2 }, { minQty: 3, unitPrice: 1.66 }, { minQty: 10, unitPrice: 1.5 }]),
  "product API: 9640 wet inlay tiers",
  wet.variant.tiers,
);
check(JSON.stringify(wet.variant.quickQtys) === "[3,10]", "product API: quick qtys [3,10]", wet.variant.quickQtys);
check(JSON.stringify(coin.variant.tiers.map((t) => [t.minQty, t.unitPrice])) === "[[1,0.9],[10,0.8]]", "product API: coin card tiers", coin.variant.tiers);
check(plain.variant.tiers.length === 1 && plain.variant.quickQtys.join() === "3,5,10", "product API: rejected-tier SKU keeps quick qtys, base price only", plain.variant);
check(JSON.stringify(ntag216.variant.tiers.map((t) => [t.minQty, t.unitPrice])) === "[[1,1.5],[5,1.4],[10,1.3]]", "product API: NTAG216 tiers", ntag216.variant.tiers);
check(wet.product.bulkQuote.minQty === 50 && /^\d+$/.test(wet.product.bulkQuote.whatsappNumber ?? ""), "product API: bulk quote config", wet.product.bulkQuote);

const expectUnit = { 1: 2, 2: 2, 3: 1.66, 9: 1.66, 10: 1.5, 11: 1.5 };
for (const [qty, unit] of Object.entries(expectUnit)) {
  const q = (await api("POST", "/api/checkout/quote", { items: [{ variantId: wet.variant.id, qty: Number(qty) }] })).json;
  const l = q.lines[0];
  check(
    l.unitPriceCents === Math.round(unit * 100) && l.lineTotalCents === Math.round(unit * 100) * Number(qty) && l.baseUnitPriceCents === 200,
    `quote: ${qty} pcs -> RM${rmText(unit)}/pc`,
    { unit: l.unitPriceCents, total: l.lineTotalCents },
  );
}
const plainQuote = (await api("POST", "/api/checkout/quote", { items: [{ variantId: plain.variant.id, qty: 10 }] })).json.lines[0];
check(plainQuote.unitPriceCents === 90 && plainQuote.lineTotalCents === 900, "quote: untiered NTAG213 × 10 stays RM0.90/pc", plainQuote);

// Checkout prices from the server tier, whatever the client sends.
const placed = await api("POST", "/api/checkout", {
  items: [
    { variantId: coin.variant.id, qty: 10, price: 0.01, unitPrice: 0.01 },
    { variantId: wet.variant.id, qty: 3 },
  ],
  buyer: BUYER,
  total: 0.01,
});
check(placed.status === 201, "checkout: order placed", placed.status);
if (placed.status === 201) {
  const order = await prisma.order.findUnique({ where: { orderNo: placed.json.orderNo }, include: { items: { orderBy: { variantId: "asc" } } } });
  const byVariant = Object.fromEntries(order.items.map((i) => [i.variantId, i.unitPrice.toNumber()]));
  check(near(byVariant[coin.variant.id], 0.8) && near(byVariant[wet.variant.id], 1.66), "checkout: order items stored at tier prices", byVariant);
  check(near(order.subtotal.toNumber(), 8 + 4.98), "checkout: subtotal 10×0.80 + 3×1.66 = 12.98", order.subtotal.toNumber());
}
await cleanup();

// --- Browser ------------------------------------------------------------------
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--no-first-run", "--no-default-browser-check"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
page.on("pageerror", (e) => {
  console.log(`[pageerror] ${e.message}`);
  failures++;
});
const shot = (name, fullPage = true) => page.screenshot({ path: path.join(shotsDir, `${name}.png`), fullPage });
const text = (sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, " ").trim());
const clickButton = (label) =>
  page.evaluate((label) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.replace(/\s+/g, " ").trim().startsWith(label));
    b?.click();
    return !!b;
  }, label);
const waitText = (sel, needle) =>
  page.waitForFunction((sel, needle) => document.querySelector(sel)?.textContent.replace(/\s+/g, " ").includes(needle), { timeout: 5000 }, sel, needle);
async function selectVariant(v) {
  await page.evaluate((label) => {
    [...document.querySelectorAll("button[aria-pressed]")].find((x) => x.textContent.trim() === label)?.click();
  }, v.name ?? v.sku);
}

// NTAG product page (the brief's screenshot): NTAG216 has tiers but no stock right now, NTAG215 is in stock.
await page.goto(`${CLIENT}/products/${ntag216.product.slug}`, { waitUntil: "networkidle0" });
await page.evaluate(() => localStorage.removeItem("wyr.cart.v1"));
await page.reload({ waitUntil: "networkidle0" });
await selectVariant(ntag216.variant);
await page.waitForSelector('[data-testid="tier-table"]');
const ntagRows = await page.$$eval('[data-testid="tier-table"] tbody tr', (rows) =>
  rows.map((r) => [...r.cells].map((c) => c.textContent.replace(/\s+/g, " ").trim()).join(" | ").trim()),
);
check(
  JSON.stringify(ntagRows.slice(0, 3)) === JSON.stringify(["1–4 | RM 1.50 |", "5–9 | RM 1.40 | 7%", "10+ | RM 1.30 | 13%"]) && ntagRows[3]?.startsWith("50+ | Bulk"),
  "NTAG216: tier table 1–4 / 5–9 / 10+ / 50+ quote",
  ntagRows,
);
await shot("tiers_ntag216_product");
const ntag215 = ntag216.product.variants.find((v) => v.sku === "nfcntag215");
await selectVariant(ntag215);
await page.waitForSelector('[data-testid="quick-qtys"]');
check(!(await page.$('[data-testid="tier-table"]')), "NTAG215: no tier table (its pack tiers were not cheaper)");
await clickButton("10 pcs");
await waitText('[data-testid="live-price"]', "× 10");
check((await text('[data-testid="live-price"]')).includes("13.00"), "NTAG215: 10 pcs quick button, total RM13.00", await text('[data-testid="live-price"]'));
await shot("tiers_ntag_product");

// 9640 wet inlay: two tiers, interactive.
await page.goto(`${CLIENT}/products/${wet.product.slug}`, { waitUntil: "networkidle0" });
await selectVariant(wet.variant);
await page.waitForSelector('[data-testid="quick-qtys"]');
await clickButton("3 pcs");
await waitText('[data-testid="live-price"]', "× 3");
let live = await text('[data-testid="live-price"]');
check(live.includes("1.66") && live.includes("You save 17%") && live.includes("4.98") && live.includes("Buy 10, save 25%"), "3 pcs: RM1.66/pc, save 17%, total 4.98, next tier hint", live);
await page.click('[data-testid="next-tier"]');
await waitText('[data-testid="live-price"]', "× 10");
live = await text('[data-testid="live-price"]');
check(live.includes("1.50") && live.includes("You save 25%") && live.includes("15.00") && !live.includes("Buy "), "next-tier click -> 10 pcs at RM1.50, total 15.00", live);
const qtyBox = await page.$eval('input[aria-label="Quantity"]', (el) => Number(el.value));
check(qtyBox === 10, "quantity box follows the quick pick", qtyBox);
await shot("tiers_product_10pcs");
await page.click('[data-testid="add-to-cart"]');
await page.waitForFunction(() => document.querySelector('[data-testid="header-cart"]')?.textContent.trim() === "10");

// Cart: tier price, then re-priced as the quantity changes.
await page.goto(`${CLIENT}/cart`, { waitUntil: "networkidle0" });
await waitText('[data-testid="cart-subtotal"]', "15.00");
check((await text('[data-testid="line-unit"]')).includes("1.50"), "cart: 10 pcs at RM1.50 each", await text('[data-testid="line-unit"]'));
await page.click('input[aria-label="Quantity"]', { count: 3 });
await page.keyboard.type("2");
await waitText('[data-testid="cart-subtotal"]', "4.00");
check((await text('[data-testid="line-unit"]')).includes("2.00") && (await text('[data-testid="line-total"]')).includes("4.00"), "cart: qty 2 re-priced to RM2.00 each", await text('[data-testid="line-unit"]'));
await page.click('input[aria-label="Quantity"]', { count: 3 });
await page.keyboard.type("3");
await waitText('[data-testid="cart-subtotal"]', "4.98");
check((await text('[data-testid="line-unit"]')).includes("1.66"), "cart: qty 3 re-priced to RM1.66 each", await text('[data-testid="line-unit"]'));
await page.waitForSelector('a[data-testid="go-checkout"]');
await shot("tiers_cart");

// Checkout shows the tier price and the server subtotal.
await page.click('[data-testid="go-checkout"]');
await page.waitForSelector('input[name="name"]');
await waitText('[data-testid="checkout-subtotal"]', "4.98");
const summary = await text("aside");
check(summary.includes("3 × RM") && summary.includes("1.66") && summary.includes("save 17%"), "checkout: line shows 3 × RM1.66 (save 17%)", summary.slice(0, 200));

// Bulk quote: from 50 pieces a WhatsApp link appears (coin card has 548 in stock).
await page.goto(`${CLIENT}/products/${coin.product.slug}`, { waitUntil: "networkidle0" });
if (coin.product.variants.length > 1) await selectVariant(coin.variant);
await page.waitForSelector('[data-testid="add-to-cart"]');
check(!(await page.$('[data-testid="bulk-quote"]')), "bulk quote hidden below 50");
await page.click('input[aria-label="Quantity"]', { count: 3 });
await page.keyboard.type("50");
await page.waitForSelector('[data-testid="bulk-quote"]', { timeout: 5000 });
const href = await page.$eval('[data-testid="bulk-quote"]', (a) => a.href);
check(href.startsWith(`https://wa.me/${coin.product.bulkQuote.whatsappNumber}?text=`) && decodeURIComponent(href).includes("50+ pcs"), "bulk quote: WhatsApp link from 50 pcs", href);
await shot("tiers_bulk_quote");

await browser.close();
await cleanup();
await prisma.$disconnect();
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
