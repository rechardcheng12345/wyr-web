import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

Object.assign(process.env, {
  DB_HOST: process.env.DB_HOST ?? "127.0.0.1",
  DB_PORT: process.env.DB_PORT ?? "3307",
  DB_USER: process.env.DB_USER ?? "root",
  DB_PASSWORD: process.env.DB_PASSWORD ?? "rootroot",
  DB_NAME: process.env.DB_NAME ?? "wyr_website",
});
if (process.env.DB_HOST !== "127.0.0.1" && process.env.DB_HOST !== "localhost") {
  console.error("Refusing to run against a non-local database.");
  process.exit(2);
}

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../server/src");
await import(`${src}/env.js`);
const { prisma } = await import(`${src}/db.js`);
const { loadSettings } = await import(`${src}/settings.js`);
const { createPendingOrder, toCents } = await import(`${src}/orders.js`);
const { handlePaymentCallback, setGatewayForTests } = await import(`${src}/payments/index.js`);
const { ensureSeedVouchers } = await import(`${src}/vouchers.js`);

await loadSettings();
await ensureSeedVouchers();

const SKU = "nfcntag215";
const QTY = 10;
const variant = await prisma.productVariant.findUnique({ where: { sku: SKU }, include: { inventory: true } });
assert.ok(variant?.inventory, `${SKU} needs an inventory row`);
const before = { ...variant.inventory };
const voucherBefore = await prisma.voucher.findUnique({ where: { code: "WELCOME5" } });

let failures = 0;
async function step(label, fn) {
  try {
    await fn();
    console.log(`PASS  ${label}`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${label}\n      ${err.message}`);
  }
}

const buyer = {
  name: "Callback Test",
  email: "brief6.callback@example.com",
  phone: "0123456789",
  addressLine: "1 Jalan Test",
  postcode: "50450",
  city: "Kuala Lumpur",
  state: "Selangor",
};

let order;
let gatewayCalls = 0;
try {
  order = await createPendingOrder([{ variantId: variant.id, qty: QTY }], buyer, { voucherCode: "WELCOME5", note: "write https://example.com", companyName: "Test Sdn Bhd" });
  const billCode = `test${order.id}${Date.now().toString(36)}`;
  await prisma.payment.create({ data: { orderId: order.id, provider: "testgw", providerRef: billCode, amount: order.total, status: "pending" } });
  setGatewayForTests({
    provider: "testgw",
    secretKey: "test-secret",
    async getBillTransactions(code) {
      gatewayCalls++;
      assert.equal(code, billCode);
      return [{ status: "1", amountCents: toCents(order.total), channel: "FPX (test)", externalRef: order.orderNo, raw: { test: true } }];
    },
  });

  await step("order created with reservation, voucher, note, company", async () => {
    const inv = await prisma.inventory.findUnique({ where: { variantId: variant.id } });
    assert.equal(inv.reserved, before.reserved + QTY);
    assert.equal(inv.available, before.available);
    assert.equal(order.voucherCode, "WELCOME5");
    assert.equal(toCents(order.subtotal), 1300);
    assert.equal(toCents(order.discount), 65);
    assert.equal(toCents(order.total), 1300 - 65 + 800);
    assert.equal(order.companyName, "Test Sdn Bhd");
  });

  const first = await handlePaymentCallback({ billcode: billCode });
  await step("first callback marks the order paid", async () => {
    assert.deepEqual(first, { ok: true, outcome: "paid" });
    const o = await prisma.order.findUnique({ where: { id: order.id } });
    assert.equal(o.status, "paid");
  });

  await step("stock decremented once and reservation released", async () => {
    const inv = await prisma.inventory.findUnique({ where: { variantId: variant.id } });
    assert.equal(inv.available, before.available - QTY);
    assert.equal(inv.reserved, before.reserved);
  });

  await step("one stock_movements row (sale, -qty, order id)", async () => {
    const rows = await prisma.stockMovement.findMany({ where: { orderId: order.id } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].delta, -QTY);
    assert.equal(rows[0].reason, "sale");
    assert.equal(rows[0].variantId, variant.id);
  });

  await step("voucher used_count incremented once", async () => {
    const v = await prisma.voucher.findUnique({ where: { code: "WELCOME5" } });
    assert.equal(v.usedCount, voucherBefore.usedCount + 1);
  });

  const repeats = await Promise.all([1, 2, 3].map(() => handlePaymentCallback({ billcode: billCode })));
  const again = await handlePaymentCallback({ billcode: billCode });
  await step("repeated (incl. concurrent) callbacks are no-ops", async () => {
    for (const r of [...repeats, again]) assert.equal(r.ok, true);
    assert.ok([...repeats, again].every((r) => r.outcome === "already_paid"), JSON.stringify([...repeats, again]));
    const inv = await prisma.inventory.findUnique({ where: { variantId: variant.id } });
    assert.equal(inv.available, before.available - QTY);
    assert.equal(inv.reserved, before.reserved);
    assert.equal(await prisma.stockMovement.count({ where: { orderId: order.id } }), 1);
    const v = await prisma.voucher.findUnique({ where: { code: "WELCOME5" } });
    assert.equal(v.usedCount, voucherBefore.usedCount + 1);
  });

  await step("admin 'Export paid orders CSV for BigSeller' includes the paid order", async () => {
    const API = process.env.API_URL ?? "http://localhost:4000";
    const login = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: process.env.ADMIN_USERNAME ?? "admin", password: process.env.ADMIN_PASSWORD ?? "admin123" }),
    });
    assert.equal(login.status, 200, "admin login (dev server on :4000 must be running)");
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
    const res = await fetch(`${API}/api/admin/orders/export.csv?from=${today}&to=${today}`, { headers: { cookie } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/csv/);
    const lines = (await res.text()).replace(/^\uFEFF/, "").trim().split("\r\n");
    assert.equal(lines[0], "order_no,date,customer,phone,address,state,sku,qty,unit_price,line_total,shipping,voucher,total,note,company");
    const row = lines.find((l) => l.startsWith(order.orderNo));
    assert.ok(row, "paid order row present");
    assert.match(row, new RegExp(`,${SKU},${QTY},1\\.30,13\\.00,8\\.00,WELCOME5 \\(-0\\.65\\),20\\.35,write https://example\\.com,Test Sdn Bhd$`));
    const unauth = await fetch(`${API}/api/admin/orders/export.csv`);
    assert.equal(unauth.status, 401);
  });

  await step("unknown bill is rejected", async () => {
    const r = await handlePaymentCallback({ billcode: "nope-does-not-exist" });
    assert.equal(r.ok, false);
    assert.equal(r.status, 404);
  });
} finally {
  if (order) {
    await prisma.$transaction(async (tx) => {
      await tx.stockMovement.deleteMany({ where: { orderId: order.id } });
      await tx.payment.deleteMany({ where: { orderId: order.id } });
      await tx.orderItem.deleteMany({ where: { orderId: order.id } });
      await tx.order.delete({ where: { id: order.id } });
      await tx.inventory.update({ where: { variantId: variant.id }, data: { available: before.available, reserved: before.reserved } });
      await tx.voucher.update({ where: { code: "WELCOME5" }, data: { usedCount: voucherBefore.usedCount } });
    });
  }
  await prisma.$disconnect();
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`} (gateway verification called ${gatewayCalls}x, cleaned up)`);
process.exit(failures === 0 ? 0 : 1);
