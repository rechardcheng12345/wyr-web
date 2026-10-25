// Checkout and order API. Response shapes mirror server/src/orders.js and server/src/routes/{checkout,orders}.js.
import { get, post } from "@/lib/api";

// Keep in sync with server/src/shipping.js.
export const MALAYSIAN_STATES = [
  "Johor",
  "Kedah",
  "Kelantan",
  "Melaka",
  "Negeri Sembilan",
  "Pahang",
  "Perak",
  "Perlis",
  "Pulau Pinang",
  "Sabah",
  "Sarawak",
  "Selangor",
  "Terengganu",
  "W.P. Kuala Lumpur",
  "W.P. Labuan",
  "W.P. Putrajaya",
];

export function fetchQuote(items, state, voucherCode) {
  return post("/api/checkout/quote", { items, state: state || undefined, voucherCode: voucherCode || undefined });
}

export function checkVoucher(code, items) {
  return post("/api/checkout/voucher", { code, items });
}

export function placeOrder(items, buyer, extras = {}) {
  return post("/api/checkout", { items, buyer, ...extras });
}

export function fetchOrder(orderNo, email) {
  return get(`/api/orders/${encodeURIComponent(orderNo)}?email=${encodeURIComponent(email)}`);
}

export function retryPayment(orderNo, email) {
  return post(`/api/orders/${encodeURIComponent(orderNo)}/pay`, { email });
}

export const cents = (c) => c / 100;

// Order lookups need the buyer's email; remember it on this device so the return page and
// confirmation work without asking again.
const ORDER_EMAILS_KEY = "wyr.orderEmails.v1";

export function rememberOrderEmail(orderNo, email) {
  try {
    const map = JSON.parse(localStorage.getItem(ORDER_EMAILS_KEY) ?? "{}");
    map[orderNo] = email;
    localStorage.setItem(ORDER_EMAILS_KEY, JSON.stringify(map));
  } catch {
    // Storage full or blocked: the buyer can still enter their email on the order page.
  }
}

export function recallOrderEmail(orderNo) {
  try {
    return JSON.parse(localStorage.getItem(ORDER_EMAILS_KEY) ?? "{}")[orderNo] ?? null;
  } catch {
    return null;
  }
}
