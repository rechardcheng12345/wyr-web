import { displayNameOf } from "./display-name.js";
import { invoiceFileName, loadInvoiceOrder, renderOrderInvoice } from "./invoice-pdf.js";
import { sendMail } from "./mailer.js";
import { getSetting } from "./settings.js";

const TRACKING_MY = {
  "J&T Express": "jt",
  "Pos Laju": "poslaju",
  "Ninja Van": "ninja-van",
  "DHL eCommerce": "dhl-ecommerce",
  "City-Link Express": "citylink",
  "SPX Express": "spx",
  "Flash Express": "flash",
  GDex: "gdex",
};

const amount = new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rm = (d) => `RM ${amount.format(Number(d ?? 0))}`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function orderLink(order) {
  const base = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  return base ? `${base}/orders/${encodeURIComponent(order.orderNo)}` : null;
}

function layout({ title, intro, body, order }) {
  const company = getSetting("company_name") ?? "WYR Technology";
  const link = orderLink(order);
  const phone = getSetting("company_phone");
  return `<!DOCTYPE html><html><body style="margin:0;background:#f3f5f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#1560a8;color:#ffffff;padding:18px 24px;font-size:18px;font-weight:bold">${esc(company)}</td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 8px;font-size:20px">${esc(title)}</h1>
<p style="margin:0 0 16px;line-height:1.5">${intro}</p>
${body}
${link ? `<p style="margin:24px 0 0"><a href="${esc(link)}" style="display:inline-block;background:#1560a8;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold">View your order</a></p>` : ""}
<p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.5">Questions? Just reply to this email${phone ? ` or WhatsApp us at ${esc(phone)}` : ""}.</p>
</td></tr></table>
<p style="font-size:12px;color:#9ca3af;margin:12px 0 0">Order ${esc(order.orderNo)} · ${esc(company)}</p>
</td></tr></table></body></html>`;
}

function itemsTable(order) {
  const rows = order.items
    .map((i) => {
      const name = i.variant ? displayNameOf(i.variant.product) : "Item";
      const variant = i.variant?.variationName ? `<br><span style="color:#6b7280;font-size:13px">${esc(i.variant.variationName)}</span>` : "";
      return `<tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb">${esc(name)}${variant}</td><td style="padding:8px 0 8px 12px;border-bottom:1px solid #e5e7eb;white-space:nowrap;text-align:right;vertical-align:top">${i.qty} × ${rm(i.unitPrice)}</td></tr>`;
    })
    .join("");
  const line = (k, v, style = "") => `<tr><td style="padding:4px 0;${style}">${k}</td><td style="padding:4px 0;text-align:right;${style}">${v}</td></tr>`;
  const totals = [
    line("Subtotal", rm(order.subtotal)),
    Number(order.discount) > 0 ? line(`Voucher ${esc(order.voucherCode ?? "")}`, `- ${rm(order.discount)}`, "color:#047857") : "",
    line("Shipping", rm(order.shippingFee)),
    line("Total", rm(order.total), "font-weight:bold;font-size:16px;border-top:1px solid #d1d5db;padding-top:8px"),
  ].join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">${rows}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin-top:8px">${totals}</table>`;
}

function addressBlock(order) {
  const lines = [order.shipName, order.companyName, order.shipAddress, [order.shipPostcode, order.shipCity].filter(Boolean).join(" "), order.shipState, order.shipPhone].filter(Boolean);
  return `<p style="margin:16px 0 0;font-size:14px;line-height:1.5"><strong>Shipping to</strong><br>${lines.map(esc).join("<br>")}</p>`;
}

export async function sendOrderConfirmedEmail(orderId) {
  const order = await loadInvoiceOrder({ id: orderId });
  if (!order?.email) return false;
  const pdf = await renderOrderInvoice(order);
  const html = layout({
    title: "Thank you! Your order is confirmed.",
    intro: `We've received your payment for order <strong>${esc(order.orderNo)}</strong>. We'll pack it and email you the tracking number once it ships. Your invoice is attached.`,
    body: itemsTable(order) + addressBlock(order),
    order,
  });
  const text = `Thank you! We've received your payment for order ${order.orderNo} (total ${rm(order.total)}). We'll email you the tracking number once it ships. Your invoice is attached.${orderLink(order) ? `\n\nView your order: ${orderLink(order)}` : ""}`;
  return sendMail({
    to: order.email,
    subject: `Order ${order.orderNo} confirmed`,
    html,
    text,
    attachments: [{ filename: invoiceFileName(order), content: pdf, contentType: "application/pdf" }],
  });
}

export async function sendOrderShippedEmail(orderId) {
  const order = await loadInvoiceOrder({ id: orderId });
  if (!order?.email || order.status !== "shipped") return false;
  const pickup = order.courier === "Self pickup";
  const slug = TRACKING_MY[order.courier];
  const trackUrl = slug && order.trackingNo ? `https://www.tracking.my/${slug}/${encodeURIComponent(order.trackingNo)}` : null;
  const tracking = pickup
    ? ""
    : `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;background:#f0f7ff;border-radius:8px;padding:12px 14px">Courier: <strong>${esc(order.courier)}</strong>${
        order.trackingNo ? `<br>Tracking number: <strong>${esc(order.trackingNo)}</strong>` : ""
      }${trackUrl ? `<br><a href="${esc(trackUrl)}" style="color:#1560a8">Track your parcel</a>` : ""}</p>`;
  const html = layout({
    title: pickup ? "Your order is ready for pickup" : "Your order is on its way",
    intro: pickup ? `Order <strong>${esc(order.orderNo)}</strong> is packed and ready for pickup.` : `Good news! Order <strong>${esc(order.orderNo)}</strong> has been handed to the courier.`,
    body: tracking + itemsTable(order) + (pickup ? "" : addressBlock(order)),
    order,
  });
  const text = pickup
    ? `Order ${order.orderNo} is ready for pickup.`
    : `Order ${order.orderNo} has shipped with ${order.courier}${order.trackingNo ? `, tracking number ${order.trackingNo}` : ""}.${trackUrl ? `\nTrack it: ${trackUrl}` : ""}`;
  return sendMail({ to: order.email, subject: pickup ? `Order ${order.orderNo} is ready for pickup` : `Order ${order.orderNo} has shipped`, html, text });
}
