import { Router } from "express";
import { CheckoutError, findOrderForBuyer, serializeOrder } from "../orders.js";
import { startPayment } from "../payments/index.js";

export const ordersRouter = Router();

const NOT_FOUND = "No order found with that order number and email.";

function emailParam(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

// GET /api/orders/:orderNo?email=<buyer email>
ordersRouter.get("/:orderNo", async (req, res) => {
  const order = await findOrderForBuyer(req.params.orderNo, emailParam(req.query.email));
  if (!order) throw new CheckoutError(404, NOT_FOUND);
  res.json(serializeOrder(order));
});

// POST /api/orders/:orderNo/pay { email }: a new bill for an unpaid order (e.g. after a failed payment).
ordersRouter.post("/:orderNo/pay", async (req, res) => {
  const order = await findOrderForBuyer(req.params.orderNo, emailParam(req.body?.email));
  if (!order) throw new CheckoutError(404, NOT_FOUND);
  if (order.status !== "pending_payment" || (order.expiresAt && order.expiresAt <= new Date())) {
    throw new CheckoutError(409, "This order can no longer be paid. Please place a new order.");
  }
  const { paymentUrl } = await startPayment(order);
  res.json({ orderNo: order.orderNo, paymentUrl });
});
