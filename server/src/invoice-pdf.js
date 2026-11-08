import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { prisma } from "./db.js";
import { displayNameOf } from "./display-name.js";
import { getSetting } from "./settings.js";

const LOGO = fileURLToPath(new URL("../../client/public/images/logo_background_removed.png", import.meta.url));
const INVOICED_STATUSES = ["paid", "sent_to_bigseller", "shipped", "completed"];

const INCLUDE = {
  items: { include: { variant: { include: { product: { select: { name: true, displayName: true } } } } }, orderBy: { id: "asc" } },
  payments: { where: { status: "paid" }, orderBy: { id: "desc" }, take: 1 },
};

export function loadInvoiceOrder(where) {
  return prisma.order.findUnique({ where, include: INCLUDE });
}

export const hasInvoice = (order) => !!order?.paidAt && INVOICED_STATUSES.includes(order.status);

export const invoiceFileName = (order) => `Invoice-${order.orderNo}.pdf`;

const amount = new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rm = (d) => `RM ${amount.format(Number(d ?? 0))}`;
const plain = (d) => amount.format(Number(d ?? 0));
const myDate = (d) => (d ? new Date(d).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }) : "");

export function renderOrderInvoice(order) {
  const doc = new PDFDocument({ size: "A4", margin: 40, info: { Title: `Invoice ${order.orderNo}`, Author: getSetting("company_name") ?? "" } });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const bottom = doc.page.height - doc.page.margins.bottom;
  const grey = "#555555";
  const navy = "#1e3a8a";

  let y = doc.page.margins.top;
  if (existsSync(LOGO)) {
    doc.image(LOGO, left, y, { height: 48 });
    y += 54;
  }
  const companyName = getSetting("company_name") ?? "";
  doc.font("Helvetica-Bold").fontSize(14).fillColor(navy).text(companyName.toUpperCase(), left, y, { width: 300 });
  y = doc.y;
  doc.font("Helvetica").fontSize(9).fillColor(grey);
  const regNo = getSetting("company_reg_no");
  const lines = [regNo && `(${regNo})`, getSetting("company_address"), getSetting("company_phone") && `Phone: ${getSetting("company_phone")}`, getSetting("company_email") && `Email: ${getSetting("company_email")}`].filter(Boolean);
  doc.text(lines.join("\n"), left, y + 2, { width: 300 });
  const companyBottom = doc.y;

  const payment = order.payments[0] ?? null;
  doc.font("Helvetica").fontSize(24).fillColor("#666666").text("Invoice", left, doc.page.margins.top, { width, align: "right" });
  const meta = [
    ["Invoice #", order.orderNo],
    ["Invoice date", myDate(order.paidAt)],
    ["Order date", myDate(order.createdAt)],
    ["Payment", payment?.method ? `${payment.method}` : "Online payment"],
  ];
  let my = doc.y + 6;
  for (const [k, v] of meta) {
    doc.font("Helvetica").fontSize(9.5).fillColor(grey).text(`${k}:`, right - 230, my, { width: 100, align: "right" });
    doc.font("Helvetica-Bold").fillColor("#000000").text(v, right - 125, my, { width: 125, align: "right" });
    my += 15;
  }

  y = Math.max(companyBottom, my) + 22;
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#000000").text("Bill To:", left, y);
  const billTo = [
    order.companyName,
    order.shipName,
    order.shipAddress,
    [order.shipPostcode, order.shipCity].filter(Boolean).join(" "),
    order.shipState,
    order.shipPhone,
    order.email,
  ].filter(Boolean);
  doc.font("Helvetica").fontSize(10).text(billTo.join("\n"), left, doc.y + 2, { width: 280 });
  const billBottom = doc.y;

  doc.save().rotate(-15, { origin: [right - 70, y + 30] });
  doc.roundedRect(right - 120, y + 12, 100, 36, 4).lineWidth(2.5).strokeColor("#15803d").stroke();
  doc.font("Helvetica-Bold").fontSize(20).fillColor("#15803d").text("PAID", right - 120, y + 21, { width: 100, align: "center" });
  doc.restore();

  y = Math.max(billBottom, y + 60) + 18;
  const cols = [
    { label: "No", w: 28, align: "center" },
    { label: "Description", w: width - 28 - 45 - 85 - 90, align: "left" },
    { label: "Qty", w: 45, align: "center" },
    { label: "Unit price (RM)", w: 85, align: "right" },
    { label: "Amount (RM)", w: 90, align: "right" },
  ];
  const pad = 5;

  function drawRow(values, { header = false } = {}) {
    doc.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(header ? 8.5 : 9.5);
    const heights = values.map((v, i) => doc.heightOfString(String(v), { width: cols[i].w - pad * 2 }));
    const h = Math.max(...heights) + pad * 2;
    if (y + h > bottom) {
      doc.addPage();
      y = doc.page.margins.top;
      if (!header) drawRow(cols.map((c) => c.label.toUpperCase()), { header: true });
    }
    if (header) {
      doc.rect(left, y, width, h).fill("#e5e5e5");
      doc.moveTo(left, y).lineTo(right, y).lineWidth(1.5).strokeColor("#333333").stroke();
    }
    doc.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(header ? 8.5 : 9.5);
    let x = left;
    values.forEach((v, i) => {
      doc.fillColor("#000000").text(String(v), x + pad, y + pad, { width: cols[i].w - pad * 2, align: cols[i].align });
      x += cols[i].w;
    });
    y += h;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(header ? 1.5 : 0.5).strokeColor(header ? "#333333" : "#bbbbbb").stroke();
  }

  drawRow(cols.map((c) => c.label.toUpperCase()), { header: true });
  order.items.forEach((item, i) => {
    const v = item.variant;
    const name = v ? displayNameOf(v.product) : "Item";
    const detail = [v?.variationName, v?.sku && `SKU: ${v.sku}`].filter(Boolean).join(" · ");
    const unit = Number(item.unitPrice ?? 0);
    drawRow([i + 1, detail ? `${name}\n${detail}` : name, item.qty ?? 0, plain(unit), plain(unit * (item.qty ?? 0))]);
  });

  const totals = [
    ["Subtotal", rm(order.subtotal)],
    ...(Number(order.discount) > 0 ? [[`Voucher${order.voucherCode ? ` (${order.voucherCode})` : ""}`, `- ${rm(order.discount)}`]] : []),
    ["Shipping", rm(order.shippingFee)],
  ];
  const tw = 230;
  const tx = right - tw;
  if (y + 20 * (totals.length + 2) > bottom) {
    doc.addPage();
    y = doc.page.margins.top;
  }
  y += 8;
  for (const [k, v] of totals) {
    doc.font("Helvetica").fontSize(9.5).fillColor("#000000").text(k.toUpperCase(), tx + pad, y + 4, { width: 130 });
    doc.text(v, tx, y + 4, { width: tw - pad, align: "right" });
    y += 18;
    doc.moveTo(tx, y).lineTo(right, y).lineWidth(0.5).strokeColor("#bbbbbb").stroke();
  }
  doc.rect(tx, y, tw, 22).fill("#e5e5e5");
  doc.moveTo(tx, y).lineTo(right, y).moveTo(tx, y + 22).lineTo(right, y + 22).lineWidth(1.5).strokeColor("#333333").stroke();
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor("#000000").text("TOTAL", tx + pad, y + 6, { width: 130 });
  doc.text(rm(order.total), tx, y + 6, { width: tw - pad, align: "right" });
  y += 22;
  doc.font("Helvetica").fontSize(9).fillColor(grey).text(`Paid on ${myDate(order.paidAt)}${payment?.providerRef ? ` · Ref ${payment.providerRef}` : ""}`, tx, y + 6, { width: tw - pad, align: "right" });
  y = doc.y + 24;

  const phone = getSetting("company_phone");
  const email = getSetting("company_email");
  const contact = `If you have any questions concerning this invoice, contact us${phone ? ` at ${phone}` : ""}${email ? `${phone ? " or" : " at"} ${email}` : ""}.`;
  const footer = getSetting("invoice_footer");
  const tailHeight = 80 + (footer ? doc.heightOfString(footer, { width }) : 0);
  if (y + tailHeight > bottom) {
    doc.addPage();
    y = doc.page.margins.top;
  }
  doc.font("Helvetica").fontSize(9).fillColor(grey).text(contact, left, y, { width });
  doc.font("Helvetica-BoldOblique").fontSize(10.5).fillColor("#000000").text("THANK YOU FOR YOUR BUSINESS!", left, doc.y + 18, { width, align: "center" });
  if (footer) doc.font("Helvetica").fontSize(8.5).fillColor(grey).text(footer, left, doc.y + 14, { width, align: "center" });

  doc.end();
  return done;
}
