// End-to-end test of the mock checkout flow (Task 4). Needs the dev servers running with PAYMENT_MODE=mock.
//
// Usage: node _handoff/checkout-e2e.mjs <puppeteerDir> <shotsDir> [clientUrl=http://localhost:5175] [apiUrl=http://localhost:4100]
//   puppeteerDir: a folder with puppeteer-core installed, e.g. `npm i --prefix .scratch/browser puppeteer-core@24`
//
// Browser: product page -> add to cart (qty capped by stock) -> cart -> checkout form -> mock ToyyibPay page
//          -> "Mark paid" -> return URL -> confirmation page. Screenshots go to <shotsDir>.
// API/DB:  server ignores client prices, stock reserved on checkout and decremented on payment, forged callbacks
//          rejected, replayed callbacks are no-ops, failed payment keeps the order payable, over-stock rejected,
//          concurrent checkouts can't oversell, expired orders are cancelled and release their stock.
// Cleanup: every order with an @example.com email is reversed (stock restored) and deleted at the end,
//          so the catalog import (which refuses to run once orders exist) keeps working.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [puppeteerDir, shotsDir, CLIENT = "http://localhost:5175", API = "http://localhost:4100"] = process.argv.slice(2);
if (!puppeteerDir || !shotsDir) {
  console.error("Usage: node _handoff/checkout-e2e.mjs <puppeteerDir> <shotsDir> [clientUrl] [apiUrl]");
  process.exit(2);
}

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../server");
const serverRequire = createRequire(path.join(serverDir, "package.json"));
serverRequire("dotenv").config({ path: path.join(serverDir, ".env") });
const { PrismaClient } = serverRequire("@prisma/client");
const puppeteer = createRequire(path.join(path.resolve(puppeteerDir), "x.js"))("puppeteer-core");
const prisma = new PrismaClient();

const TEST_EMAIL = "e2e.buyer@example.com";
const BUYER = {
  name: "E2E Test Buyer",
  email: TEST_EMAIL,
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

async function api(method, p, body, form) {
  const res = await fetch(`${API}${p}`, {
    method,
    redirect: "manual",
    headers: form ? { "Content-Type": "application/x-www-form-urlencoded" } : body ? { "Content-Type": "application/json" } : {},
    body: form ? new URLSearchParams(form) : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, location: res.headers.get("location") };
}

const inv = (variantId) => prisma.inventory.findUnique({ where: { variantId } });
const sellable = (i) => i.available - i.reserved - i.safetyBuffer;

async function waitFor(fn, timeoutMs, label) {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
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

// ---------------------------------------------------------------------------
console.log(`client ${CLIENT}, api ${API}`);
const leftover = await cleanup();
if (leftover) console.log(`(removed ${leftover} leftover test order(s) from earlier runs)`);

// Pick test variants from live data: one with plenty of stock, one with little (for the oversell race).
const list = (await api("GET", "/api/products?pageSize=100")).json.items;
let main = null;
let scarce = null;
for (const p of list) {
  const d = (await api("GET", `/api/products/${p.slug}`)).json;
  for (const v of d.variants) {
    if (!main && v.stock >= 5 && (v.specialPrice ?? v.price) > 0) main = { product: d, variant: v };
    else if (!scarce && v.stock >= 2 && v.stock <= 5 && (v.specialPrice ?? v.price) > 0) scarce = { product: d, variant: v };
  }
  if (main && scarce) break;
}
if (!main || !scarce) throw new Error("No suitable variants with stock found");
const mv = main.variant;
console.log(`main variant: ${mv.sku} (${main.product.slug}), sellable ${mv.stock}; scarce variant: ${scarce.variant.sku}, sellable ${scarce.variant.stock}`);
const before = await inv(mv.id);

// ---------------------------------------------------------------------------
// Browser flow
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
page.on("response", (r) => {
  if (r.status() >= 400) console.log(`[http ${r.status()}] ${r.url()}`);
});
const shot = (name) => page.screenshot({ path: path.join(shotsDir, `${name}.png`), fullPage: true });

await page.goto(`${CLIENT}/products/${main.product.slug}`, { waitUntil: "networkidle0" });
await page.evaluate(() => localStorage.removeItem("wyr.cart.v1"));
await page.reload({ waitUntil: "networkidle0" });

if (main.product.variants.length > 1) {
  const label = mv.name ?? mv.sku;
  const clicked = await page.evaluate((label) => {
    const b = [...document.querySelectorAll("button[aria-pressed]")].find((x) => x.textContent.trim() === label);
    b?.click();
    return !!b;
  }, label);
  check(clicked, `select variant "${label}"`);
}
await page.waitForSelector('[data-testid="add-to-cart"]');

// Quantity is capped at stock: typing a huge number clamps to the sellable quantity.
await page.click('input[aria-label="Quantity"]', { count: 3 });
await page.keyboard.type("99999");
const capped = await page.$eval('input[aria-label="Quantity"]', (el) => Number(el.value));
check(capped === mv.stock, "quantity input capped at available stock", { capped, stock: mv.stock });

// Now pick 2.
await page.click('input[aria-label="Quantity"]', { count: 3 });
await page.keyboard.type("2");
await page.click('[data-testid="add-to-cart"]');
await page.waitForFunction(() => document.querySelector('[data-testid="header-cart"]')?.textContent.trim() === "2");
check(true, "header cart count shows 2");
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("wyr.cart.v1")));
check(stored.length === 1 && stored[0].variantId === mv.id && stored[0].qty === 2, "cart persisted in localStorage", stored);
await shot("checkout_1_product");

// Cart page (survives a reload: localStorage)
await page.goto(`${CLIENT}/cart`, { waitUntil: "networkidle0" });
await page.reload({ waitUntil: "networkidle0" });
await page.waitForSelector('[data-testid="go-checkout"] a, a[data-testid="go-checkout"]');
const unit = mv.specialPrice ?? mv.price;
const cartSubtotal = await page.$eval('[data-testid="cart-subtotal"]', (el) => el.textContent);
check(cartSubtotal.replace(/\s/g, "").includes((unit * 2).toFixed(2)), "cart subtotal = 2 × unit price", { cartSubtotal, unit });
await shot("cart");

// Checkout
await page.click('[data-testid="go-checkout"]');
await page.waitForSelector('input[name="name"]');
await page.evaluate(() => localStorage.removeItem("wyr.checkoutBuyer.v1"));
for (const [field, value] of Object.entries(BUYER)) {
  if (field === "state") await page.select('select[name="state"]', value);
  else {
    await page.click(`input[name="${field}"]`, { count: 3 });
    await page.keyboard.type(value);
  }
}
const wm = Number(process.env.SHIPPING_FLAT_WM ?? 8);
const expectedTotal = unit * 2 + wm;
await page.waitForFunction(
  (t) => document.querySelector('[data-testid="checkout-total"]')?.textContent.replace(/\s/g, "").includes(t),
  { timeout: 10000 },
  expectedTotal.toFixed(2),
);
check(true, `checkout total = subtotal + RM${wm} Peninsular shipping`, { expectedTotal });

// East Malaysia rate switches with the state.
await page.select('select[name="state"]', "Sabah");
const em = Number(process.env.SHIPPING_FLAT_EM ?? 15);
await page.waitForFunction(
  (t) => document.querySelector('[data-testid="checkout-shipping"]')?.textContent.replace(/\s/g, "").includes(t),
  { timeout: 10000 },
  em.toFixed(2),
);
check(true, `Sabah shipping = RM${em}`);
await page.select('select[name="state"]', BUYER.state);
await page.waitForFunction(
  (t) => document.querySelector('[data-testid="checkout-total"]')?.textContent.replace(/\s/g, "").includes(t),
  { timeout: 10000 },
  expectedTotal.toFixed(2),
);
await shot("checkout");

await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click('[data-testid="place-order"]')]);
check(page.url().includes("/api/payments/mock/"), "redirected to the (mock) payment page", page.url());
const order = await prisma.order.findFirst({ where: { email: TEST_EMAIL }, orderBy: { id: "desc" }, include: { items: true, payments: true } });
check(order?.status === "pending_payment", "order created as pending_payment", order?.orderNo);
check(order && Number(order.total) === expectedTotal, "order total computed server-side", order && Number(order.total));
const afterCheckout = await inv(mv.id);
check(afterCheckout.reserved === before.reserved + 2 && afterCheckout.available === before.available, "stock reserved (+2), available unchanged", {
  before,
  afterCheckout,
});
const cartAfter = await page.evaluate(() => localStorage.getItem("wyr.cart.v1"));
check(cartAfter === null || cartAfter === "[]", "cart cleared after placing the order");
await shot("checkout_2_mock_payment");

await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click("#mock-pay")]);
await page.waitForSelector('[data-testid="order-status-paid"]', { timeout: 20000 });
check(page.url().includes(`/orders/${order.orderNo}`), "return URL lands on the order page", page.url());
await shot("confirmation");

const paidOrder = await prisma.order.findUnique({ where: { id: order.id }, include: { payments: true } });
check(paidOrder.status === "paid" && paidOrder.paidAt, "order marked paid by the callback handler");
check(paidOrder.payments.length === 1 && paidOrder.payments[0].status === "paid", "payment row paid", paidOrder.payments[0]?.status);
const afterPay = await inv(mv.id);
check(afterPay.available === before.available - 2 && afterPay.reserved === before.reserved, "stock decremented (available -2, reservation released)", {
  before,
  afterPay,
});
await browser.close();

// ---------------------------------------------------------------------------
// API checks
const lookup = await api("GET", `/api/orders/${order.orderNo}?email=${encodeURIComponent(TEST_EMAIL.toUpperCase())}`);
check(lookup.status === 200 && lookup.json.status === "paid", "GET /api/orders/:orderNo with email (case-insensitive)", lookup.json?.status);
const wrong = await api("GET", `/api/orders/${order.orderNo}?email=someone@else.com`);
check(wrong.status === 404, "wrong email -> 404", wrong.status);

const bill = paidOrder.payments[0].providerRef;
const replay = await api("POST", "/api/payments/toyyibpay/callback", null, { billcode: bill, status: "1", order_id: order.orderNo, refno: "X" });
check(replay.status === 200 && (await inv(mv.id)).available === afterPay.available, "replayed callback is a no-op", replay.text);
const forged = await api("POST", "/api/payments/toyyibpay/callback", null, { billcode: bill, status: "1", order_id: order.orderNo, refno: "X", hash: "deadbeef" });
check(forged.status === 400, "callback with a bad hash -> 400", forged.text);

// Client-sent prices are ignored.
const cheap = await api("POST", "/api/checkout", { items: [{ variantId: mv.id, qty: 1, price: 0.01, unitPrice: 0.01 }], buyer: { ...BUYER, email: "e2e.cheap@example.com" }, total: 0.01 });
const cheapOrder = await prisma.order.findUnique({ where: { orderNo: cheap.json?.orderNo ?? "" } });
check(cheap.status === 201 && Number(cheapOrder.subtotal) === unit, "client prices ignored (server price used)", { subtotal: cheapOrder && Number(cheapOrder.subtotal), unit });

// Unpaid order whose callback says "failed": order stays payable, reservation kept.
const failBill = cheap.json.paymentUrl.split("/").pop();
const failRes = await api("POST", `/api/payments/mock/${failBill}`, null, { result: "failed" });
check(failRes.status === 303 && failRes.location.includes("status_id=3"), "mock failure redirects to return URL with status_id=3", failRes.location);
const afterFail = await prisma.order.findUnique({ where: { id: cheapOrder.id }, include: { payments: true } });
check(afterFail.status === "pending_payment" && afterFail.payments[0].status === "failed", "failed payment: order still pending, payment failed");
const fakePaid = await api("POST", "/api/payments/toyyibpay/callback", null, { billcode: failBill, status: "1", order_id: cheapOrder.orderNo, refno: "FAKE" });
check(
  fakePaid.status === 200 && (await prisma.order.findUnique({ where: { id: cheapOrder.id } })).status === "pending_payment",
  "callback claiming success without a real transaction does not mark paid",
);
const retry = await api("POST", `/api/orders/${cheapOrder.orderNo}/pay`, { email: "e2e.cheap@example.com" });
check(retry.status === 200 && retry.json.paymentUrl.includes("/api/payments/mock/"), "retry payment creates a new bill", retry.json);

// More than the stock -> 409, nothing reserved.
const sBefore = await inv(scarce.variant.id);
const tooMany = await api("POST", "/api/checkout", { items: [{ variantId: scarce.variant.id, qty: sellable(sBefore) + 1 }], buyer: { ...BUYER, email: "e2e.toomany@example.com" } });
check(tooMany.status === 409 && (await inv(scarce.variant.id)).reserved === sBefore.reserved, "over-stock checkout -> 409, nothing reserved", tooMany.json?.error);

// Race: sellable + 3 concurrent checkouts of 1 each; exactly `sellable` may succeed.
const n = sellable(sBefore);
const race = await Promise.all(
  Array.from({ length: n + 3 }, (_, i) =>
    api("POST", "/api/checkout", { items: [{ variantId: scarce.variant.id, qty: 1 }], buyer: { ...BUYER, email: `e2e.race${i}@example.com` } }),
  ),
);
const won = race.filter((r) => r.status === 201).length;
const sAfter = await inv(scarce.variant.id);
check(won === n && sellable(sAfter) === 0 && sAfter.reserved === sBefore.reserved + n, `concurrent checkouts: ${won}/${n + 3} succeeded, no oversell`, {
  statuses: race.map((r) => r.status),
  sAfter,
});

// Validation errors come back per field.
const bad = await api("POST", "/api/checkout", { items: [{ variantId: mv.id, qty: 1 }], buyer: { ...BUYER, postcode: "123", phone: "abc", state: "Narnia" } });
check(bad.status === 400 && bad.json.fields?.postcode && bad.json.fields?.phone && bad.json.fields?.state, "field validation errors", bad.json?.fields);

// Expiry: push the unpaid orders' hold into the past; the server job (every 60 s) must cancel them and release stock.
const unpaid = await prisma.order.findMany({ where: { email: { endsWith: "@example.com" }, status: "pending_payment" } });
await prisma.order.updateMany({ where: { id: { in: unpaid.map((o) => o.id) } }, data: { expiresAt: new Date(Date.now() - 60_000) } });
console.log(`waiting up to 75 s for the expiry job to cancel ${unpaid.length} unpaid order(s)…`);
await waitFor(
  async () => (await prisma.order.count({ where: { id: { in: unpaid.map((o) => o.id) }, status: "pending_payment" } })) === 0,
  75_000,
  "expiry job",
);
const sReleased = await inv(scarce.variant.id);
const mReleased = await inv(mv.id);
check(sReleased.reserved === sBefore.reserved && mReleased.reserved === before.reserved, "expired orders cancelled, reservations released", {
  scarce: sReleased,
  main: mReleased,
});

// ---------------------------------------------------------------------------
const removed = await cleanup();
const restored = await inv(mv.id);
check(restored.available === before.available && restored.reserved === before.reserved, `cleanup: ${removed} test orders removed, stock restored`, restored);
await prisma.$disconnect();
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
