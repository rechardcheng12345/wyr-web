import { Router } from "express";
import { getCustomer } from "../customer-auth.js";
import { prisma } from "../db.js";
import { cancelUnpaidOrder, CheckoutError, createPendingOrder, parseBuyer, parseCartItems, parseOrderExtras, priceCart, quote } from "../orders.js";
import { startPayment } from "../payments/index.js";
import { isMalaysianState } from "../shipping.js";
import { applyVoucher, normalizeCode } from "../vouchers.js";

export const checkoutRouter = Router();

// POST /api/checkout/quote { items: [{variantId, qty}], state? }
// Current server prices, stock and (with a state) shipping, for the cart and checkout pages.
checkoutRouter.post("/quote", async (req, res) => {
  const items = parseCartItems(req.body?.items);
  const state = typeof req.body?.state === "string" && isMalaysianState(req.body.state) ? req.body.state : null;
  res.json(await quote(items, state, normalizeCode(req.body?.voucherCode) || null));
});

checkoutRouter.post("/voucher", async (req, res) => {
  const code = normalizeCode(req.body?.code);
  if (!code) throw new CheckoutError(400, "Enter a voucher code.");
  const items = parseCartItems(req.body?.items);
  const { subtotalCents } = await priceCart(items);
  const result = await applyVoucher(code, subtotalCents);
  if (!result.valid) throw new CheckoutError(400, result.error);
  res.json(result);
});

// POST /api/checkout { items: [{variantId, qty}], buyer: {name, email, phone, addressLine, postcode, city, state} }
// Prices come from the database, never from the request.
checkoutRouter.post("/", async (req, res) => {
  const items = parseCartItems(req.body?.items);
  const buyer = parseBuyer(req.body?.buyer);
  const extras = parseOrderExtras(req.body);
  const customer = await getCustomer(req);
  const order = await createPendingOrder(items, buyer, { ...extras, customerId: customer?.id ?? null });
  if (customer && !customer.addressLine) {
    await prisma.customer.update({
      where: { id: customer.id },
      data: { addressLine: buyer.addressLine, postcode: buyer.postcode, city: buyer.city, state: buyer.state, phone: customer.phone ?? buyer.phone },
    });
  }

  let paymentUrl;
  try {
    ({ paymentUrl } = await startPayment(order));
  } catch (err) {
    // No bill = the buyer can't pay, so don't hold their stock for 30 minutes.
    console.error(`[checkout] could not create payment for ${order.orderNo}:`, err);
    await cancelUnpaidOrder(order.id);
    throw new CheckoutError(502, "We couldn't start the payment. Nothing has been charged; please try again in a moment.");
  }
  res.status(201).json({ orderNo: order.orderNo, paymentUrl });
});
