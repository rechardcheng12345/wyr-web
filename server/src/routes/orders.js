import { Router } from "express";
import { getCustomer } from "../customer-auth.js";
import { CheckoutError, findOrderForBuyer, findOrderForCustomer, serializeOrder } from "../orders.js";
import { createLimiter } from "../rate-limit.js";
import { reconcileOrderPayments, startPayment } from "../payments/index.js";

export const ordersRouter = Router();

const NOT_FOUND = "No order found with that order number and email.";
const failedLookups = createLimiter({ windowMs: 10 * 60_000, max: 20 });

const RECHECK_MS = 5000;
const lastChecked = new Map();

async function recheckPayment(order) {
  if (order.status !== "pending_payment" || !order.payments.length) return false;
  const now = Date.now();
  if (now - (lastChecked.get(order.id) ?? 0) < RECHECK_MS) return false;
  lastChecked.set(order.id, now);
  for (const [id, at] of lastChecked) if (now - at > 60 * 60_000) lastChecked.delete(id);
  try {
    await reconcileOrderPayments(order.id);
    return true;
  } catch (err) {
    console.warn(`[payments] recheck for ${order.orderNo} failed: ${err.message}`);
    return false;
  }
}

function emailParam(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function findOrderForRequest(req, email) {
  if (failedLookups.blocked(req.ip)) throw new CheckoutError(429, "Too many lookups. Please wait a few minutes and try again.");
  const orderNo = req.params.orderNo;
  let order = email ? await findOrderForBuyer(orderNo, email) : null;
  if (!order) {
    const customer = await getCustomer(req);
    if (customer) order = await findOrderForCustomer(orderNo, customer.id);
  }
  if (!order) {
    failedLookups.hit(req.ip);
    throw new CheckoutError(404, NOT_FOUND);
  }
  return order;
}

// GET /api/orders/:orderNo?email=<buyer email>
ordersRouter.get("/:orderNo", async (req, res) => {
  let order = await findOrderForRequest(req, emailParam(req.query.email));
  if (await recheckPayment(order)) order = await findOrderForRequest(req, emailParam(req.query.email));
  res.json(serializeOrder(order));
});

// POST /api/orders/:orderNo/pay { email }: a new bill for an unpaid order (e.g. after a failed payment).
ordersRouter.post("/:orderNo/pay", async (req, res) => {
  const order = await findOrderForRequest(req, emailParam(req.body?.email));
  if (order.status !== "pending_payment" || (order.expiresAt && order.expiresAt <= new Date())) {
    throw new CheckoutError(409, "This order can no longer be paid. Please place a new order.");
  }
  const { paymentUrl } = await startPayment(order);
  res.json({ orderNo: order.orderNo, paymentUrl });
});
