import { displayNameOf } from "./display-name.js";
import { loadInvoiceOrder } from "./invoice-pdf.js";

const amount = new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rm = (d) => `RM ${amount.format(Number(d ?? 0))}`;

function topicUrl() {
  const topic = process.env.NTFY_NOTIFCATION_TOPIC?.trim();
  return topic ? `https://ntfy.sh/${encodeURIComponent(topic)}` : null;
}

function orderText(order, status) {
  const items = order.items.map((i) => {
    const name = i.variant ? displayNameOf(i.variant.product) : "Item";
    const variant = i.variant?.variationName ? ` (${i.variant.variationName})` : "";
    return `- ${i.qty} x ${name}${variant} @ ${rm(i.unitPrice)}`;
  });
  const lines = [
    `Order ${order.orderNo}`,
    `Total: ${rm(order.total)} (${status})`,
    "",
    ...items,
    "",
    `Subtotal: ${rm(order.subtotal)}`,
    ...(Number(order.discount) > 0 ? [`Voucher ${order.voucherCode ?? ""}: -${rm(order.discount)}`] : []),
    `Shipping: ${rm(order.shippingFee)}`,
    "",
    `Buyer: ${order.shipName ?? ""}${order.companyName ? ` (${order.companyName})` : ""}`,
    `Phone: ${order.shipPhone ?? ""}`,
    `Email: ${order.email ?? ""}`,
    `Ship to: ${[order.shipAddress, order.shipPostcode, order.shipCity, order.shipState].filter(Boolean).join(", ")}`,
    ...(order.note ? [`Note: ${order.note}`] : []),
  ];
  return lines.join("\n");
}

async function post(orderId, build) {
  const url = topicUrl();
  if (!url) return false;
  try {
    const order = await loadInvoiceOrder({ id: orderId });
    if (!order) return false;
    const { title, tags, priority, body } = build(order);
    const headers = { Title: title, Tags: tags };
    if (priority) headers.Priority = priority;
    const base = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
    if (base) headers.Click = `${base}/system/orders/pending`;
    const res = await fetch(url, { method: "POST", body, headers, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return true;
  } catch (err) {
    console.error(`[ntfy] notification for order ${orderId} failed: ${err.message}`);
    return false;
  }
}

/** Posts a new order to the ntfy topic. Never throws: a notification problem must not affect checkout. */
export function notifyOrderCreated(orderId) {
  return post(orderId, (order) => ({
    title: `New order ${order.orderNo} - ${rm(order.total)}`,
    tags: "shopping_cart",
    body: orderText(order, "awaiting payment"),
  }));
}

/** Posts a payment confirmation to the ntfy topic. Never throws. */
export function notifyOrderPaid(orderId, { afterExpiry = false } = {}) {
  return post(orderId, (order) => {
    const method = order.payments[0]?.method;
    const warning = afterExpiry ? "WARNING: paid after the stock hold expired. Check stock before packing.\n\n" : "";
    return {
      title: `Paid: ${order.orderNo} - ${rm(order.total)}`,
      tags: afterExpiry ? "warning,moneybag" : "white_check_mark,moneybag",
      priority: "high",
      body: `${warning}Payment received${method ? ` via ${method}` : ""}. Ready to pack.\n\n${orderText(order, "paid")}`,
    };
  });
}
