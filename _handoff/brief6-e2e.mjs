import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [puppeteerDir = "/tmp/wyr-browser", shotsDir = path.join(here, "shots"), CLIENT = "http://localhost:5173"] = process.argv.slice(2);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

Object.assign(process.env, {
  DB_HOST: process.env.DB_HOST ?? "127.0.0.1",
  DB_PORT: process.env.DB_PORT ?? "3307",
  DB_USER: process.env.DB_USER ?? "root",
  DB_PASSWORD: process.env.DB_PASSWORD ?? "rootroot",
  DB_NAME: process.env.DB_NAME ?? "wyr_website",
});
if (!["127.0.0.1", "localhost"].includes(process.env.DB_HOST)) {
  console.error("Refusing to run against a non-local database.");
  process.exit(2);
}

const src = path.resolve(here, "../server/src");
await import(`${src}/env.js`);
const { prisma } = await import(`${src}/db.js`);
const settings = await import(`${src}/settings.js`);
const { createPendingOrder, priceCart, CheckoutError, toCents } = await import(`${src}/orders.js`);
const puppeteer = createRequire(path.join(path.resolve(puppeteerDir), "x.js"))("puppeteer-core");
await settings.loadSettings();
fs.mkdirSync(shotsDir, { recursive: true });

let failures = 0;
function check(ok, label, extra) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra !== undefined ? `  ${JSON.stringify(extra)}` : ""}`);
  if (!ok) failures++;
}

const variants = Object.fromEntries(
  (
    await prisma.productVariant.findMany({
      where: { sku: { in: ["black_nfcntag215", "black_nfcntag213", "RFIDTag9640WetInlay", "nfcntag215"] } },
      include: { product: { select: { slug: true } }, inventory: true },
    })
  ).map((v) => [v.sku, v]),
);
const black215 = variants.black_nfcntag215;
const black213 = variants.black_nfcntag213;
const wet9640 = variants.RFIDTag9640WetInlay;

const BUYER = { name: "Brief6 E2E", email: "brief6.e2e@example.com", phone: "0123456789", addressLine: "1 Jalan Test", postcode: "50450", city: "Kuala Lumpur", state: "Selangor" };
const created = [];

async function expectReject(label, items, re) {
  try {
    const o = await createPendingOrder(items, BUYER);
    created.push(o.id);
    check(false, label, "order was created");
  } catch (err) {
    check(err instanceof CheckoutError && re.test(err.message), label, err.message);
  }
}

async function cleanupOrders() {
  for (const id of created) {
    const o = await prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!o) continue;
    await prisma.$transaction(async (tx) => {
      if (o.status === "pending_payment") {
        for (const it of o.items) await tx.$executeRaw`UPDATE inventory SET reserved = GREATEST(reserved - ${it.qty}, 0) WHERE variant_id = ${it.variantId}`;
      }
      await tx.stockMovement.deleteMany({ where: { orderId: id } });
      await tx.payment.deleteMany({ where: { orderId: id } });
      await tx.orderItem.deleteMany({ where: { orderId: id } });
      await tx.order.delete({ where: { id } });
    });
  }
}

console.log("— Server-side rules");
try {
  await expectReject("server rejects black NTAG215 x2 (below min 3 pcs)", [{ variantId: black215.id, qty: 2 }], /minimum of 3/i);
  await expectReject("server rejects black NTAG215 x5 = RM6.50 (below RM10 minimum)", [{ variantId: black215.id, qty: 5 }], /Minimum order RM10\.00: add RM3\.50 more/);
  await expectReject("server rejects out-of-stock black NTAG213", [{ variantId: black213.id, qty: 3 }], /no longer available/i);
  await expectReject("server rejects qty above available (9640 x 999)", [{ variantId: wet9640.id, qty: 999 }], /no longer available/i);

  const { lines: l5 } = await priceCart([{ variantId: black215.id, qty: 5 }]);
  check(l5[0].unitPriceCents === 130 && l5[0].lineTotalCents === 650, "black NTAG215 x5 priced at its ladder (no 5+ tier: RM1.30 x 5 = RM6.50)", l5[0].lineTotalCents);

  const o8 = await createPendingOrder([{ variantId: black215.id, qty: 8 }], BUYER);
  created.push(o8.id);
  check(toCents(o8.subtotal) === 1040 && toCents(o8.total) === 1040 + 800, "server order total black NTAG215 x8 = RM10.40 + RM8 shipping", toCents(o8.total));

  const o10 = await createPendingOrder([{ variantId: wet9640.id, qty: 10 }], BUYER, { voucherCode: "WELCOME5" });
  created.push(o10.id);
  check(
    o10.items[0].unitPrice.toNumber() === 1.5 && toCents(o10.subtotal) === 1500 && toCents(o10.discount) === 75 && toCents(o10.total) === 1500 - 75 + 800,
    "server order 9640 x10 uses 10+ tier RM1.50, WELCOME5 -RM0.75, total RM22.25",
    toCents(o10.total),
  );

  const sell = (await priceCart([{ variantId: wet9640.id, qty: 1 }])).lines[0].stock;
  const row = await prisma.setting.findUnique({ where: { key: "stock_safety_buffer" } });
  await settings.saveSettings({ stock_safety_buffer: 5 });
  const sellBuffered = (await priceCart([{ variantId: wet9640.id, qty: 1 }])).lines[0].stock;
  if (row) await settings.saveSettings({ stock_safety_buffer: JSON.parse(row.value) });
  else {
    await prisma.setting.delete({ where: { key: "stock_safety_buffer" } });
    await settings.loadSettings();
  }
  const inv = await prisma.inventory.findUnique({ where: { variantId: wet9640.id } });
  check(sellBuffered === Math.max(0, inv.available - inv.reserved - Math.max(inv.safetyBuffer, 5)) && sellBuffered < sell, "stock_safety_buffer=5 lowers sellable qty server-side", { sell, sellBuffered });
} finally {
  await cleanupOrders();
}

console.log("— Free-shipping threshold (via admin settings API on the dev server)");
{
  const API = CLIENT.replace(/:\d+$/, ":4000");
  const login = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: process.env.ADMIN_USERNAME ?? "admin", password: process.env.ADMIN_PASSWORD ?? "admin123" }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  const put = (values) => fetch(`${API}/api/admin/settings`, { method: "PUT", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ values }) });
  const quote = async (qty) =>
    (await fetch(`${API}/api/checkout/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: [{ variantId: black215.id, qty }], state: "Selangor" }) })).json();
  const before = (await (await fetch(`${API}/api/admin/settings`, { headers: { cookie } })).json()).find((x) => x.key === "free_shipping_threshold");
  try {
    check((await put({ free_shipping_threshold: 12 })).status === 200, "admin can set free_shipping_threshold");
    const q8 = await quote(8);
    const q10 = await quote(10);
    check(q8.shippingRange.freeShippingShortfallCents === 160 && q8.shippingCents === 800, "RM10.40 cart: 'add RM1.60 more for free shipping', still RM8", q8.shippingRange);
    check(q10.shippingCents === 0 && q10.totalCents === 1300, "RM13.00 cart: shipping 0 server-side", { shipping: q10.shippingCents, total: q10.totalCents });
    const bad = await put({ min_order_subtotal: "abc" });
    check(bad.status === 400, "invalid min_order_subtotal rejected");
  } finally {
    await put({ free_shipping_threshold: before?.value ?? "" });
  }
  const after = await (await fetch(`${API}/api/site`)).json();
  check(after.shipping.freeThresholdRm === (before?.value ?? null), "free_shipping_threshold restored", after.shipping);
}

console.log("— Browser");
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const text = (sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, " ").trim()).catch(() => null);
const waitText = (sel, re, timeout = 8000) =>
  page.waitForFunction((s, r) => [...document.querySelectorAll(s)].some((el) => new RegExp(r).test(el.textContent)), { timeout }, sel, re.source).then(() => true).catch(() => false);
async function clickText(sel, re) {
  const ok = await page.evaluate((s, r) => {
    const el = [...document.querySelectorAll(s)].find((e) => new RegExp(r).test(e.textContent));
    if (el) el.click();
    return !!el;
  }, sel, re.source);
  if (!ok) throw new Error(`no ${sel} matching ${re}`);
}
let paymentRedirect = false;
await page.setRequestInterception(true);
page.on("request", (req) => {
  if (/toyyibpay\.com/.test(req.url()) || (req.method() === "POST" && /\/api\/checkout$/.test(req.url()))) {
    paymentRedirect = true;
    req.abort();
  } else req.continue();
});

try {
  await page.goto(`${CLIENT}/products`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${CLIENT}/products?pageSize=24`, { waitUntil: "networkidle0" });
  const badges = await page.$$eval('[data-testid="oos-badge"]', (els) => els.map((e) => e.textContent));
  check(badges.length > 0 && badges.every((b) => b === "Out of stock"), "catalogue cards show 'Out of stock' badge", badges.length);

  await page.goto(`${CLIENT}/products/${wet9640.product.slug}`, { waitUntil: "networkidle0" });
  await clickText('[data-testid="variant-option"]', /9640 Wet Inlay/);
  await page.waitForSelector('[data-testid="quick-qtys"]');
  const quick = await page.$$eval('[data-testid="quick-qtys"] button', (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
  check(quick.some((q) => /^3 pcs.*RM\s?1\.66\/pc · Save 17%/.test(q)) && quick.some((q) => /^10 pcs.*RM\s?1\.50\/pc · Save 25%/.test(q)), "9640 quick buttons show per-piece price + Save %", quick);
  check(!quick.some((q) => /^1 pc/.test(q)), "9640 (RM2.00 < RM3) hides the 1 pc button", quick);
  await page.screenshot({ path: path.join(shotsDir, "brief6-tier-buttons.png") });

  await page.goto(`${CLIENT}/products/${black215.product.slug}`, { waitUntil: "networkidle0" });
  const title = await page.title();
  const metaDesc = await page.$eval('meta[name="description"]', (m) => m.content);
  check(/^Black NFC NTAG 213\/215 Tag Sticker · WYR/.test(title) && metaDesc.startsWith("Black NFC NTAG"), "per-product <title> and meta description", { title, metaDesc });
  check((await text("h1")) === "Black NFC NTAG 213/215 Tag Sticker", "heading uses cleaned display name", await text("h1"));
  const oos = await page.$$eval('[data-testid="variant-option"]', (els) => els.map((e) => ({ t: e.textContent, disabled: e.disabled })));
  const oos213 = oos.find((o) => /213/.test(o.t));
  check(oos213?.disabled === true && /Out of stock/.test(oos213.t), "OOS variant (Ntag 213 Black) button disabled with label", oos213);
  check(/Shipping: RM8 West Malaysia \/ RM15 East Malaysia/.test((await text('[data-testid="shipping-note"]')) ?? ""), "product page shipping note", await text('[data-testid="shipping-note"]'));
  const order = await page.evaluate(() => {
    const desc = [...document.querySelectorAll("h2")].find((h) => h.textContent === "Description");
    const box = document.querySelector('[data-testid="marketplace-box"]');
    return desc && box ? !!(desc.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING) : null;
  });
  const boxText = (await text('[data-testid="marketplace-box"]')) ?? "";
  check(order === true && !/voucher|coins|same stock/i.test(boxText.replace(/Buy direct.*$/, "")) && /Buy direct: first order use code WELCOME5/.test(boxText), "marketplace box below description, no voucher/same-stock claim, WELCOME5 line", boxText);

  await clickText('[data-testid="variant-option"]', /215/);
  await page.waitForSelector('[data-testid="add-to-cart"]');
  const startQty = await page.$eval('input[aria-label="Quantity"]', (i) => i.value);
  const quick215 = await page.$$eval('[data-testid="quick-qtys"] button', (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
  check(startQty === "3" && (await text('[data-testid="min-qty-note"]')) === "Min. 3 pcs" && !quick215.includes("1 pc"), "low-price item starts at 3 with 'Min. 3 pcs', no 1 pc button", { startQty, quick215 });
  check(quick215.every((q) => !/Save/.test(q)), "untiered quick buttons show plain quantity", quick215);
  const decDisabled = await page.$eval('button[aria-label="Decrease quantity"]', (b) => b.disabled);
  check(decDisabled, "stepper can't go below 3");
  await page.click('[data-testid="quick-5"]');
  await page.click('[data-testid="add-to-cart"]');
  await waitText('[role="status"]', /Added 5/);

  await page.goto(`${CLIENT}/cart`, { waitUntil: "networkidle0" });
  await waitText('[data-testid="cart-subtotal"]', /6\.50/);
  check(/RM\s?6\.50/.test((await text('[data-testid="line-total"]')) ?? ""), "cart line black NTAG215 x5 = RM6.50 (matches ladder)", await text('[data-testid="line-total"]'));
  const minMsg = await text('[data-testid="min-order-message"]');
  const goDisabled = await page.$eval('[data-testid="go-checkout"]', (b) => b.disabled ?? b.getAttribute("disabled") !== null);
  check(minMsg === "Minimum order RM10 — add RM3.50 more" && goDisabled, "cart below RM10 blocked with message", { minMsg, goDisabled });
  check(/Shipping: RM8 West Malaysia \/ RM15 East Malaysia/.test((await text('[data-testid="cart-shipping-note"]')) ?? ""), "cart shipping note");
  await page.screenshot({ path: path.join(shotsDir, "brief6-cart-below-min.png") });

  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.reload({ waitUntil: "networkidle0" });
  const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  check(widths.scroll <= 390 && widths.body <= 390, "mobile cart 390x844 has no horizontal overflow", widths);
  await page.screenshot({ path: path.join(shotsDir, "brief6-cart-mobile.png"), fullPage: true });
  const saved = await page.evaluate(() => localStorage.getItem("wyr.cart.v1"));
  await page.evaluate((extra) => {
    const items = JSON.parse(localStorage.getItem("wyr.cart.v1"));
    localStorage.setItem("wyr.cart.v1", JSON.stringify([...items, ...extra]));
  }, [
    { variantId: wet9640.id, qty: 10, productSlug: wet9640.product.slug, productName: "UHF RFID Flexible Electronic Tag 860–960MHz | Soft Label for Assets Inventory & Logistics Supercalifragilisticexpialidocious_no_spaces_at_all_here", variantName: "9640 Wet Inlay", sku: wet9640.sku, image: null, unitPrice: 2, tiers: [], stock: 12, minQty: 3 },
  ]);
  await page.reload({ waitUntil: "networkidle0" });
  const widths2 = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, lines: document.querySelectorAll('[data-testid="cart-lines"] > li').length }));
  check(widths2.scroll <= 390 && widths2.lines === 2, "mobile cart with 2 lines incl. a long unbroken title: no overflow", widths2);
  await page.screenshot({ path: path.join(shotsDir, "brief6-cart-mobile-2lines.png"), fullPage: true });
  await page.evaluate((v) => localStorage.setItem("wyr.cart.v1", v), saved);
  await page.setViewport({ width: 1280, height: 900 });
  await page.reload({ waitUntil: "networkidle0" });

  await page.evaluate(() => {
    const input = document.querySelector('[data-testid="cart-lines"] input[aria-label="Quantity"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, "8");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await waitText('[data-testid="cart-subtotal"]', /10\.40/);
  await page.waitForFunction(() => !document.querySelector('[data-testid="min-order-message"]'), { timeout: 8000 }).catch(() => {});
  check(!(await page.$('[data-testid="min-order-message"]')), "cart at RM10.40 no longer blocked");

  await page.goto(`${CLIENT}/checkout`, { waitUntil: "networkidle0" });
  await waitText('[data-testid="checkout-shipping"]', /RM 8–15/);
  check((await text('[data-testid="checkout-shipping"]')) === "RM 8–15", "checkout shows RM 8–15 before a state is chosen", await text('[data-testid="checkout-shipping"]'));
  const placeholder = await page.$eval('textarea[name="note"]', (t) => t.placeholder);
  check(/NFC programming instructions/.test(placeholder) && !!(await page.$('input[name="companyName"]')), "order note textarea + company field present");
  await page.type('[data-testid="voucher-input"]', "welcome5");
  await page.click('[data-testid="voucher-apply"]');
  await waitText('[data-testid="checkout-discount"]', /0\.52/);
  check(/RM\s?0\.52/.test((await text('[data-testid="checkout-discount"]')) ?? ""), "WELCOME5 applies 5% (RM0.52 of RM10.40)", await text('[data-testid="checkout-discount"]'));
  await page.select('select[name="state"]', "Sabah");
  await waitText('[data-testid="checkout-total"]', /24\.88/);
  check(/RM\s?24\.88/.test((await text('[data-testid="checkout-total"]')) ?? ""), "Sabah total = 10.40 − 0.52 + 15.00 = RM24.88", await text('[data-testid="checkout-total"]'));
  await page.screenshot({ path: path.join(shotsDir, "brief6-checkout.png"), fullPage: true });
  await page.type('[data-testid="voucher-input"]', "ZZ");
  await page.click('[data-testid="voucher-apply"]');
  await waitText('[data-testid="voucher-error"]', /valid/);
  check(/isn't valid/.test((await text('[data-testid="voucher-error"]')) ?? ""), "invalid voucher shows an error", await text('[data-testid="voucher-error"]'));
  check(!paymentRedirect, "stopped before placing the order / ToyyibPay redirect");
} catch (err) {
  failures++;
  console.log(`FAIL  browser step threw: ${err.message}`);
  await page.screenshot({ path: path.join(shotsDir, "brief6-failure.png"), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  await prisma.$disconnect();
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
