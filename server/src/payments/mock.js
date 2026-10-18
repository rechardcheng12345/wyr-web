// PAYMENT_MODE=mock: a stand-in for ToyyibPay so the whole checkout can be tested locally.
// The fake payment page posts back here, and this calls the same callback handler ToyyibPay's
// server-to-server callback uses (with a correctly signed body), then redirects to the return URL.
import { randomBytes } from "node:crypto";
import express, { Router } from "express";
import { prisma } from "../db.js";
import { centsToRm, toCents } from "../orders.js";
import { callbackHash, gateway, handlePaymentCallback, publicBaseUrl, returnUrl } from "./index.js";

// Bill amounts and references are read from the payments table; only the buyer's clicks live here,
// so a server restart just forgets attempts (the bill goes back to "no transactions yet").
const attempts = new Map();

const MOCK_SECRET = "mock-secret";

export function mockGateway() {
  return {
    provider: "mock",
    secretKey: MOCK_SECRET,
    async createBill() {
      const billCode = `mock${randomBytes(4).toString("hex")}`;
      return { billCode, paymentUrl: `${publicBaseUrl()}/api/payments/mock/${billCode}` };
    },
    async getBillTransactions(billCode) {
      const payment = await prisma.payment.findUnique({ where: { providerRef: billCode }, include: { order: true } });
      if (!payment) return [];
      return (attempts.get(billCode) ?? []).map((a) => ({
        status: a.status,
        amountCents: toCents(payment.amount),
        channel: "FPX (mock)",
        invoiceNo: a.refNo,
        externalRef: payment.order?.orderNo ?? null,
        paidAt: a.at.toISOString(),
        raw: { mock: true, billpaymentStatus: a.status, billpaymentInvoiceNo: a.refNo },
      }));
    },
  };
}

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const mockPaymentRouter = Router();
mockPaymentRouter.use(express.urlencoded({ extended: false }));

mockPaymentRouter.get("/:billCode", async (req, res) => {
  const payment = await prisma.payment.findUnique({ where: { providerRef: req.params.billCode }, include: { order: true } });
  if (!payment?.order || payment.provider !== "mock") {
    res.status(404).send("Unknown mock bill");
    return;
  }
  const o = payment.order;
  const amount = centsToRm(toCents(payment.amount)).toFixed(2);
  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mock payment · ${escapeHtml(o.orderNo)}</title>
<style>
  body{font-family:system-ui,sans-serif;background:#f4f5f8;margin:0;display:grid;place-items:center;min-height:100vh;color:#1d2433}
  .card{background:#fff;border:1px solid #e2e5ec;border-radius:14px;padding:28px;width:min(420px,92vw);box-shadow:0 4px 20px #0001}
  .tag{display:inline-block;background:#fff4d6;color:#7a5600;font-size:12px;font-weight:600;padding:3px 8px;border-radius:6px}
  dl{display:grid;grid-template-columns:auto 1fr;gap:6px 16px;font-size:14px} dt{color:#667} dd{margin:0;text-align:right}
  .amt{font-size:28px;font-weight:700;margin:8px 0 16px}
  form{display:flex;gap:10px;margin-top:20px} button{flex:1;height:44px;border:0;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer}
  .pay{background:#1a7f37;color:#fff} .fail{background:#eee;color:#a40e26}
</style></head><body><div class="card">
  <span class="tag">PAYMENT_MODE=mock · no real money</span>
  <h1 style="font-size:18px;margin:14px 0 4px">ToyyibPay (mock)</h1>
  <div class="amt">RM ${amount}</div>
  <dl><dt>Order</dt><dd>${escapeHtml(o.orderNo)}</dd><dt>Bill</dt><dd>${escapeHtml(payment.providerRef)}</dd>
  <dt>Payer</dt><dd>${escapeHtml(o.shipName ?? "")}</dd><dt>Email</dt><dd>${escapeHtml(o.email ?? "")}</dd></dl>
  <form method="post"><button class="pay" name="result" value="paid" id="mock-pay">Mark paid</button>
  <button class="fail" name="result" value="failed" id="mock-fail">Mark failed</button></form>
</div></body></html>`);
});

mockPaymentRouter.post("/:billCode", async (req, res) => {
  const billCode = req.params.billCode;
  const payment = await prisma.payment.findUnique({ where: { providerRef: billCode }, include: { order: true } });
  if (!payment?.order || payment.provider !== "mock") {
    res.status(404).send("Unknown mock bill");
    return;
  }
  const status = req.body?.result === "paid" ? "1" : "3";
  const attempt = { status, refNo: `MOCK${randomBytes(5).toString("hex").toUpperCase()}`, at: new Date() };
  attempts.set(billCode, [...(attempts.get(billCode) ?? []), attempt]);

  // Same fields and signature ToyyibPay posts to billCallbackUrl.
  const body = {
    refno: attempt.refNo,
    status,
    reason: status === "1" ? "Approved" : "Declined by mock",
    billcode: billCode,
    order_id: payment.order.orderNo,
    amount: centsToRm(toCents(payment.amount)).toFixed(2),
    transaction_time: attempt.at.toISOString(),
  };
  const result = await handlePaymentCallback({ ...body, hash: callbackHash(gateway().secretKey, body) });
  console.log(`[mock payment] ${billCode} ${status === "1" ? "paid" : "failed"} ->`, result);

  const params = new URLSearchParams({ status_id: status, billcode: billCode, order_id: payment.order.orderNo });
  res.redirect(303, `${returnUrl()}?${params}`);
});
