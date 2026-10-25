// ToyyibPay API client. Docs: https://toyyibpay.com/apireference/
// Sandbox: TOYYIBPAY_BASE_URL=https://dev.toyyibpay.com, live: https://toyyibpay.com

import { getSetting } from "../settings.js";

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is not set (needed for PAYMENT_MODE=toyyibpay)`);
  return v;
}

// billName / billDescription: letters, digits, space and underscore only.
const billText = (s, max) => s.replace(/[^A-Za-z0-9 _]/g, "_").slice(0, max);

/** "17-12-2020 17:00:00" in Malaysia time, the format billExpiryDate wants. */
function toyyibDate(d) {
  const iso = new Date(d.getTime() + 8 * 3600_000).toISOString(); // UTC+8, no DST
  const [date, time] = [iso.slice(0, 10), iso.slice(11, 19)];
  const [y, m, day] = date.split("-");
  return `${day}-${m}-${y} ${time}`;
}

function parseRm(value) {
  const n = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

const str = (v) => (v === undefined || v === null || v === "" ? null : String(v));

export function normalizeTransaction(raw) {
  return {
    status: String(raw.billpaymentStatus ?? ""),
    amountCents: parseRm(raw.billpaymentAmount),
    channel: str(raw.billpaymentChannel),
    invoiceNo: str(raw.billpaymentInvoiceNo),
    externalRef: str(raw.billExternalReferenceNo),
    paidAt: str(raw.billPaymentDate),
    raw,
  };
}

export function toyyibPayGateway() {
  const baseUrl = requireEnv("TOYYIBPAY_BASE_URL").replace(/\/+$/, "");
  const secretKey = requireEnv("TOYYIBPAY_SECRET_KEY");
  const categoryCode = requireEnv("TOYYIBPAY_CATEGORY_CODE");
  // 0 = FPX, 1 = card, 2 = both (card must be enabled on the ToyyibPay account).
  const channel = () => getSetting("toyyibpayPaymentChannel");

  async function post(path, fields) {
    const res = await fetch(`${baseUrl}/index.php/api/${path}`, {
      method: "POST",
      body: new URLSearchParams(fields),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`ToyyibPay ${path}: HTTP ${res.status} ${text.slice(0, 200)}`);
    try {
      return JSON.parse(text);
    } catch {
      // Errors such as [KEY-DID-NOT-EXIST] come back as plain text with HTTP 200.
      throw new Error(`ToyyibPay ${path}: ${text.slice(0, 200)}`);
    }
  }

  return {
    provider: "toyyibpay",
    secretKey,
    async createBill(input) {
      const body = await post("createBill", {
        userSecretKey: secretKey,
        categoryCode,
        billName: billText(`WYR order ${input.orderNo}`, 30),
        billDescription: billText(`WYR Technology order ${input.orderNo}`, 100),
        billPriceSetting: "1",
        billPayorInfo: "1",
        billAmount: String(input.amountCents),
        billReturnUrl: input.returnUrl,
        billCallbackUrl: input.callbackUrl,
        billExternalReferenceNo: input.orderNo,
        billTo: input.buyerName,
        billEmail: input.buyerEmail,
        billPhone: input.buyerPhone,
        billPaymentChannel: channel(),
        billExpiryDate: toyyibDate(input.expiresAt),
      });
      const billCode = Array.isArray(body) ? body[0]?.BillCode : undefined;
      if (!billCode) throw new Error(`ToyyibPay createBill failed: ${JSON.stringify(body).slice(0, 300)}`);
      return { billCode, paymentUrl: `${baseUrl}/${billCode}` };
    },
    async getBillTransactions(billCode) {
      const body = await post("getBillTransactions", { billCode });
      // No transactions yet can come back as an empty array or a non-array message.
      return Array.isArray(body) ? body.map((t) => normalizeTransaction(t)) : [];
    },
  };
}
