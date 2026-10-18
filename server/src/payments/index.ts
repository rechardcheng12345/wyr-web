import { createHash, timingSafeEqual } from "node:crypto";
import type { Order, Payment } from "@prisma/client";
import { prisma } from "../db.js";
import { settlePaidOrder, STOCK_TX, toCents } from "../orders.js";
import { mockGateway } from "./mock.js";
import { toyyibPayGateway, type PaymentGateway } from "./toyyibpay.js";

export type PaymentMode = "toyyibpay" | "mock";

export function paymentMode(): PaymentMode {
  const mode = (process.env.PAYMENT_MODE ?? "toyyibpay").trim();
  if (mode !== "toyyibpay" && mode !== "mock") throw new Error(`PAYMENT_MODE must be "toyyibpay" or "mock", got "${mode}"`);
  return mode;
}

let cached: PaymentGateway | null = null;
export function gateway() {
  cached ??= paymentMode() === "mock" ? mockGateway() : toyyibPayGateway();
  return cached;
}

export function publicBaseUrl() {
  const url = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  if (!url) throw new Error("PUBLIC_BASE_URL is not set");
  return url;
}

// ToyyibPay appends ?status_id=&billcode=&order_id= to the return URL.
export const returnUrl = () => `${publicBaseUrl()}/checkout/return`;
export const callbackUrl = () => `${publicBaseUrl()}/api/payments/toyyibpay/callback`;

/** Creates a bill for an unpaid order and records it as a pending payment. Returns where to send the buyer. */
export async function startPayment(order: Order) {
  const g = gateway();
  const amountCents = toCents(order.total)!;
  const { billCode, paymentUrl } = await g.createBill({
    orderNo: order.orderNo!,
    amountCents,
    buyerName: order.shipName ?? "",
    buyerEmail: order.email ?? "",
    buyerPhone: order.shipPhone ?? "",
    returnUrl: returnUrl(),
    callbackUrl: callbackUrl(),
    expiresAt: order.expiresAt ?? new Date(Date.now() + 30 * 60_000),
  });
  await prisma.payment.create({
    data: { orderId: order.id, provider: g.provider, providerRef: billCode, amount: order.total, status: "pending" },
  });
  return { billCode, paymentUrl };
}

function md5(s: string) {
  return createHash("md5").update(s).digest("hex");
}

/** Hash ToyyibPay puts on callbacks: MD5(userSecretKey + status + order_id + refno + "ok"). */
export function callbackHash(secretKey: string, body: { status?: string; order_id?: string; refno?: string }) {
  return md5(`${secretKey}${body.status ?? ""}${body.order_id ?? ""}${body.refno ?? ""}ok`);
}

function hashMatches(expected: string, received: string) {
  const a = Buffer.from(expected.toLowerCase());
  const b = Buffer.from(received.toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

export type CallbackResult =
  | { ok: true; outcome: "paid" | "paid_after_expiry" | "already_settled" | "already_paid" | "failed" | "pending" }
  | { ok: false; status: number; reason: string };

/**
 * The callback handler: the only code path that marks an order paid. Used by the ToyyibPay callback
 * route, the mock payment page, and the expiry job's last check before cancelling.
 *
 * The posted status is never trusted on its own: the bill's transactions are fetched from the
 * gateway (getBillTransactions) and the order is paid only for a successful transaction whose
 * reference and amount match the order. Safe to call any number of times.
 */
export async function handlePaymentCallback(body: Record<string, unknown>): Promise<CallbackResult> {
  const billCode = typeof body.billcode === "string" ? body.billcode.trim() : "";
  if (!billCode) return { ok: false, status: 400, reason: "missing billcode" };

  const payment = await prisma.payment.findUnique({ where: { providerRef: billCode }, include: { order: true } });
  if (!payment?.order) return { ok: false, status: 404, reason: `unknown bill ${billCode}` };

  const g = gateway();
  if (payment.provider !== g.provider) return { ok: false, status: 409, reason: `bill ${billCode} belongs to ${payment.provider}` };
  if (typeof body.hash === "string" && body.hash) {
    const fields = body as { status?: string; order_id?: string; refno?: string };
    if (!hashMatches(callbackHash(g.secretKey, fields), body.hash)) return { ok: false, status: 400, reason: "hash mismatch" };
  }

  return reconcilePayment({ ...payment, order: payment.order }, body);
}

async function reconcilePayment(payment: Payment & { order: Order }, callbackBody: Record<string, unknown>): Promise<CallbackResult> {
  if (payment.status === "paid") return { ok: true, outcome: "already_paid" };

  const transactions = await gateway().getBillTransactions(payment.providerRef!);
  const expectedCents = toCents(payment.amount);
  const success = transactions.find(
    (t) => t.status === "1" && t.amountCents === expectedCents && (t.externalRef === null || t.externalRef === payment.order.orderNo),
  );
  const raw = JSON.parse(JSON.stringify({ callback: callbackBody, transactions: transactions.map((t) => t.raw) }));

  if (success) {
    const outcome = await prisma.$transaction(async (tx) => {
      // Claim the payment first; a concurrent duplicate callback finds it already paid and stops.
      const { count } = await tx.payment.updateMany({
        where: { id: payment.id, status: { not: "paid" } },
        data: { status: "paid", method: success.channel?.slice(0, 30) ?? null, rawWebhook: raw },
      });
      if (count === 0) return "already_paid" as const;
      return settlePaidOrder(tx, payment.orderId!);
    }, STOCK_TX);
    if (outcome === "paid_after_expiry") {
      console.warn(`[payments] ${payment.order.orderNo} was paid after its reservation expired; stock may be oversold, check it.`);
    } else if (outcome === "already_settled") {
      console.warn(`[payments] ${payment.order.orderNo} was already paid via another bill; ${payment.providerRef} may need a refund.`);
    }
    return { ok: true, outcome };
  }

  if (transactions.some((t) => t.status === "1")) {
    console.warn(`[payments] ${payment.providerRef}: successful transaction does not match order ${payment.order.orderNo} amount/reference`);
  }
  const failed = transactions.length > 0 && transactions.every((t) => t.status === "3");
  if (failed) {
    await prisma.payment.updateMany({ where: { id: payment.id, status: "pending" }, data: { status: "failed", rawWebhook: raw } });
    return { ok: true, outcome: "failed" };
  }
  return { ok: true, outcome: "pending" };
}

/** Before an unpaid order is cancelled: catch payments whose callback never arrived. */
export async function reconcileOrderPayments(orderId: number) {
  // "failed" too: a buyer can retry on the same bill page after a failed attempt.
  const payments = await prisma.payment.findMany({ where: { orderId, status: { in: ["pending", "failed"] } }, include: { order: true } });
  for (const p of payments) {
    if (p.provider !== gateway().provider || !p.order) continue;
    await reconcilePayment({ ...p, order: p.order }, { source: "expiry-check" });
  }
}
