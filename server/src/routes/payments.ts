import express, { Router } from "express";
import { handlePaymentCallback, paymentMode } from "../payments/index.js";
import { mockPaymentRouter } from "../payments/mock.js";

export const paymentsRouter = Router();

// POST /api/payments/toyyibpay/callback: ToyyibPay's server-to-server notification (form-encoded).
paymentsRouter.post("/toyyibpay/callback", express.urlencoded({ extended: false }), async (req, res) => {
  const result = await handlePaymentCallback(req.body ?? {});
  if (!result.ok) {
    console.warn(`[payments] rejected callback: ${result.reason}`, req.body);
    res.status(result.status).type("text").send(result.reason);
    return;
  }
  res.type("text").send("OK");
});

// The fake payment page only exists in mock mode, so it can't be used to mark real orders paid.
if (paymentMode() === "mock") paymentsRouter.use("/mock", mockPaymentRouter);
