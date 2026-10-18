// Checkout and order API. Response shapes mirror server/src/orders.ts and server/src/routes/{checkout,orders}.ts.
import { get, post } from "@/lib/api";

// Keep in sync with server/src/shipping.ts.
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
] as const;

export interface CartLineRef {
  variantId: number;
  qty: number;
}

export interface QuoteLine {
  variantId: number;
  sku: string;
  productName: string;
  productSlug: string | null;
  variantName: string | null;
  image: string | null;
  qty: number;
  /** Per-piece price at this quantity (tiered). */
  unitPriceCents: number;
  /** Per-piece price for a single piece. */
  baseUnitPriceCents: number;
  lineTotalCents: number;
  tiers: { minQty: number; unitPriceCents: number }[];
  stock: number;
  problem: "unavailable" | "insufficient_stock" | null;
}

export interface Quote {
  lines: QuoteLine[];
  subtotalCents: number;
  shippingCents: number | null;
  totalCents: number | null;
  ok: boolean;
}

export interface Buyer {
  name: string;
  email: string;
  phone: string;
  addressLine: string;
  postcode: string;
  city: string;
  state: string;
}

export type OrderStatus = "pending_payment" | "paid" | "sent_to_bigseller" | "shipped" | "completed" | "cancelled" | "refunded";

export interface Order {
  orderNo: string;
  status: OrderStatus;
  createdAt: string;
  expiresAt: string | null;
  paidAt: string | null;
  email: string;
  items: {
    variantId: number;
    sku: string | null;
    productName: string | null;
    productSlug: string | null;
    variantName: string | null;
    qty: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  subtotal: number;
  shippingFee: number;
  total: number;
  shipping: { name: string; phone: string; addressLine: string; postcode: string; city: string; state: string };
  payment: { status: "pending" | "paid" | "failed"; method: string | null; provider: string } | null;
}

export function fetchQuote(items: CartLineRef[], state?: string) {
  return post<Quote>("/api/checkout/quote", { items, state: state || undefined });
}

export function placeOrder(items: CartLineRef[], buyer: Buyer) {
  return post<{ orderNo: string; paymentUrl: string }>("/api/checkout", { items, buyer });
}

export function fetchOrder(orderNo: string, email: string) {
  return get<Order>(`/api/orders/${encodeURIComponent(orderNo)}?email=${encodeURIComponent(email)}`);
}

export function retryPayment(orderNo: string, email: string) {
  return post<{ orderNo: string; paymentUrl: string }>(`/api/orders/${encodeURIComponent(orderNo)}/pay`, { email });
}

export const cents = (c: number) => c / 100;

// Order lookups need the buyer's email; remember it on this device so the return page and
// confirmation work without asking again.
const ORDER_EMAILS_KEY = "wyr.orderEmails.v1";

export function rememberOrderEmail(orderNo: string, email: string) {
  try {
    const map = JSON.parse(localStorage.getItem(ORDER_EMAILS_KEY) ?? "{}") as Record<string, string>;
    map[orderNo] = email;
    localStorage.setItem(ORDER_EMAILS_KEY, JSON.stringify(map));
  } catch {
    // Storage full or blocked: the buyer can still enter their email on the order page.
  }
}

export function recallOrderEmail(orderNo: string) {
  try {
    return (JSON.parse(localStorage.getItem(ORDER_EMAILS_KEY) ?? "{}") as Record<string, string>)[orderNo] ?? null;
  } catch {
    return null;
  }
}
