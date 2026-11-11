import {
  BANK_INFO,
  BUSINESS_HOURS,
  COURIERS,
  DELIVERY_EAST_DAYS,
  DELIVERY_WEST_DAYS,
  DISPATCH_CUTOFF_HOUR,
  BULK_QUOTE_MIN_QTY,
  COMPANY_ADDRESS,
  COMPANY_EMAIL,
  COMPANY_NAME,
  COMPANY_PHONE,
  DOCUMENT_PREPARED_BY,
  INVOICE_FOOTER,
  QUOTATION_TERMS,
  QUOTATION_VALID_DAYS,
  FREE_SHIPPING_THRESHOLD_RM,
  LOW_PRICE_MIN_QTY,
  LOW_PRICE_THRESHOLD_RM,
  MIN_ORDER_SUBTOTAL_RM,
  PUBLIC_ADDRESS,
  REFUND_DAYS,
  RETURN_DAYS,
  STOCK_SAFETY_BUFFER,
  WELCOME_VOUCHER_CODE,
  ORDER_HOLD_MINUTES,
  SHIPPING_FLAT_EM_RM,
  SHIPPING_FLAT_WM_RM,
  SHOPEE_SHOP_URL,
  TOYYIBPAY_DUITNOW_QR,
  TOYYIBPAY_PAYMENT_CHANNEL,
  WHATSAPP_NUMBER,
} from "./constants.js";
import { prisma } from "./db.js";

function money(raw) {
  const n = Number(raw);
  if (raw === "" || raw == null || !Number.isFinite(n) || n < 0 || n > 10_000) throw new Error("Enter an amount between 0 and 10,000");
  return Math.round(n * 100) / 100;
}

function optionalMoney(raw) {
  if (raw === "" || raw == null) return null;
  return money(raw);
}

function voucherCode(raw) {
  const v = String(raw ?? "").trim().toUpperCase();
  if (v && !/^[A-Z0-9_-]{1,40}$/.test(v)) throw new Error("Letters, digits, - and _ only (max 40)");
  return v;
}

function text(max, { required = false } = {}) {
  return (raw) => {
    const v = String(raw ?? "").replace(/\r\n/g, "\n").trim();
    if (required && !v) throw new Error("Required");
    if (v.length > max) throw new Error(`At most ${max} characters`);
    return v;
  };
}

function intBetween(min, max) {
  return (raw) => {
    const n = Number(raw);
    if (raw === "" || raw == null || !Number.isInteger(n) || n < min || n > max) throw new Error(`Whole number from ${min} to ${max}`);
    return n;
  };
}

function phone(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) throw new Error("Phone number with country code, e.g. 60123456789");
  return digits;
}

function url(raw) {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
    return v.slice(0, 500);
  } catch {
    throw new Error("Enter a full link starting with https://");
  }
}

function oneOf(options) {
  return (raw) => {
    const v = String(raw ?? "");
    if (!options.some((o) => o.value === v)) throw new Error("Pick one of the options");
    return v;
  };
}

/** A working-day range, saved as "2-4" ("3" means 3-3). Read it with getDayRange(). */
function dayRange(raw) {
  const m = String(raw ?? "").trim().match(/^(\d{1,2})\s*(?:[-–]\s*(\d{1,2}))?$/);
  const min = m ? Number(m[1]) : NaN;
  const max = m ? Number(m[2] ?? m[1]) : NaN;
  if (!m || min < 0 || max < min || max > 60) throw new Error("A range of working days, e.g. 2-4");
  return `${min}-${max}`;
}

const CHANNELS = [
  { value: "0", label: "FPX online banking only" },
  { value: "1", label: "Credit / debit card only" },
  { value: "2", label: "FPX and card (card must be enabled on your ToyyibPay account)" },
];

const DUITNOW_QR = [
  { value: "off", label: "Off" },
  { value: "0", label: "On, shop pays the DuitNow fee" },
  { value: "1", label: "On, customer pays the DuitNow fee" },
];

export const SETTINGS = [
  {
    key: "shippingWestRm",
    group: "Shipping fees",
    label: "Peninsular Malaysia",
    help: "Flat fee per order for every state except Sabah, Sarawak and Labuan.",
    type: "money",
    defaultValue: SHIPPING_FLAT_WM_RM,
    parse: money,
  },
  {
    key: "shippingEastRm",
    group: "Shipping fees",
    label: "East Malaysia",
    help: "Flat fee per order to Sabah, Sarawak and W.P. Labuan.",
    type: "money",
    defaultValue: SHIPPING_FLAT_EM_RM,
    parse: money,
  },
  {
    key: "free_shipping_threshold",
    group: "Shipping fees",
    label: "Free shipping from (subtotal)",
    help: "Orders with a subtotal (before voucher) at or above this ship free. Leave empty to turn off.",
    type: "money",
    optional: true,
    defaultValue: FREE_SHIPPING_THRESHOLD_RM,
    parse: optionalMoney,
  },
  {
    key: "min_order_subtotal",
    group: "Checkout & payment",
    label: "Minimum order subtotal",
    help: "Checkout is blocked below this subtotal (before voucher discount).",
    type: "money",
    defaultValue: MIN_ORDER_SUBTOTAL_RM,
    parse: money,
  },
  {
    key: "low_price_threshold",
    group: "Checkout & payment",
    label: "Low-price item threshold (per piece)",
    help: "Items whose 1-piece price is below this have a minimum quantity per cart line.",
    type: "money",
    defaultValue: LOW_PRICE_THRESHOLD_RM,
    parse: money,
  },
  {
    key: "low_price_min_qty",
    group: "Checkout & payment",
    label: "Minimum pieces for low-price items",
    help: "Minimum quantity per cart line for items under the low-price threshold.",
    type: "int",
    defaultValue: LOW_PRICE_MIN_QTY,
    parse: intBetween(1, 1000),
  },
  {
    key: "welcome_voucher_code",
    group: "Checkout & payment",
    label: "Welcome voucher code",
    help: "Advertised on product pages as \"Buy direct: first order use code …\" while the voucher is active. Leave empty to hide.",
    type: "text",
    defaultValue: WELCOME_VOUCHER_CODE,
    parse: voucherCode,
  },
  {
    key: "stock_safety_buffer",
    group: "Stock",
    label: "Stock safety buffer (pieces)",
    help: "Held back from every variant so the site never sells the last pieces that marketplaces may also sell. Sellable = stock − reserved − buffer.",
    type: "int",
    defaultValue: STOCK_SAFETY_BUFFER,
    parse: intBetween(0, 100_000),
  },
  {
    key: "orderHoldMinutes",
    group: "Checkout & payment",
    label: "Unpaid order hold time (minutes)",
    help: "How long checkout reserves stock while the customer pays. After this the order is cancelled.",
    type: "int",
    defaultValue: ORDER_HOLD_MINUTES,
    parse: intBetween(5, 1440),
  },
  {
    key: "toyyibpayPaymentChannel",
    group: "Checkout & payment",
    label: "ToyyibPay payment methods",
    help: "Which payment methods customers see on the ToyyibPay page.",
    type: "select",
    options: CHANNELS,
    defaultValue: TOYYIBPAY_PAYMENT_CHANNEL,
    parse: oneOf(CHANNELS),
  },
  {
    key: "toyyibpayDuitNowQr",
    group: "Checkout & payment",
    label: "DuitNow QR",
    help: "Adds DuitNow QR to the ToyyibPay page, next to the methods above. Needs DuitNow QR activated on the ToyyibPay account.",
    type: "select",
    options: DUITNOW_QR,
    defaultValue: TOYYIBPAY_DUITNOW_QR,
    parse: oneOf(DUITNOW_QR),
  },
  {
    key: "bulkQuoteMinQty",
    group: "Sales & contact",
    label: "Bulk quote from (pieces)",
    help: "From this quantity, product pages and the home page offer a bulk quote on WhatsApp.",
    type: "int",
    defaultValue: BULK_QUOTE_MIN_QTY,
    parse: intBetween(1, 100_000),
  },
  {
    key: "whatsappNumber",
    group: "Sales & contact",
    label: "WhatsApp number",
    help: "Used by every WhatsApp button on the site. Country code first, e.g. 60125978873.",
    type: "phone",
    defaultValue: WHATSAPP_NUMBER,
    parse: phone,
  },
  {
    key: "shopeeUrl",
    group: "Sales & contact",
    label: "Shopee shop link",
    help: "Shown in the header, footer and Contact page. Leave empty to hide.",
    type: "url",
    defaultValue: SHOPEE_SHOP_URL,
    parse: url,
  },
  {
    key: "company_name",
    group: "Documents (quotation, invoice, DO)",
    label: "Company name",
    help: "Printed under the logo on quotations, invoices and delivery orders.",
    type: "text",
    defaultValue: COMPANY_NAME,
    parse: text(150, { required: true }),
  },
  {
    key: "company_reg_no",
    group: "Documents (quotation, invoice, DO)",
    label: "Registration no. (SSM)",
    help: "Printed after the company name on documents, and shown on the website footer, Contact and policy pages. Leave empty to hide.",
    type: "text",
    defaultValue: "",
    parse: text(60),
  },
  {
    key: "company_address",
    group: "Documents (quotation, invoice, DO)",
    label: "Company address",
    help: "One line per row, as it should appear on documents.",
    type: "textarea",
    defaultValue: COMPANY_ADDRESS,
    parse: text(500, { required: true }),
  },
  {
    key: "company_phone",
    group: "Documents (quotation, invoice, DO)",
    label: "Phone",
    help: "As printed on documents, e.g. 012-597 8873. Also shown on the website (Contact, footer, policies).",
    type: "text",
    defaultValue: COMPANY_PHONE,
    parse: text(40),
  },
  {
    key: "company_email",
    group: "Documents (quotation, invoice, DO)",
    label: "Email",
    help: "As printed on documents. Also shown on the website (Contact, footer, policies).",
    type: "text",
    defaultValue: COMPANY_EMAIL,
    parse: text(150),
  },
  {
    key: "bank_info",
    group: "Documents (quotation, invoice, DO)",
    label: "Bank information",
    help: "Printed on invoices under \"Bank information\", e.g. bank, account name and number.",
    type: "textarea",
    defaultValue: BANK_INFO,
    parse: text(500),
  },
  {
    key: "document_prepared_by",
    group: "Documents (quotation, invoice, DO)",
    label: "Prepared by",
    help: "Name printed on quotations.",
    type: "text",
    defaultValue: DOCUMENT_PREPARED_BY,
    parse: text(100),
  },
  {
    key: "quotation_valid_days",
    group: "Documents (quotation, invoice, DO)",
    label: "Quotation valid for (days)",
    help: "Sets the \"valid until\" date on new quotations. You can still change it per quotation.",
    type: "int",
    defaultValue: QUOTATION_VALID_DAYS,
    parse: intBetween(1, 365),
  },
  {
    key: "quotation_terms",
    group: "Documents (quotation, invoice, DO)",
    label: "Quotation terms",
    help: "Printed under the quotation total.",
    type: "textarea",
    defaultValue: QUOTATION_TERMS,
    parse: text(2000),
  },
  {
    key: "invoice_footer",
    group: "Documents (quotation, invoice, DO)",
    label: "Invoice footer",
    help: "Small print at the bottom of invoices. Leave empty to hide.",
    type: "textarea",
    defaultValue: INVOICE_FOOTER,
    parse: text(500),
  },
  {
    key: "public_address",
    group: "Store policies (website)",
    label: "Address shown on the website",
    help: "On the Contact, footer and policy pages. The full street address earns more trust (Google checks it); the area alone is fine too.",
    type: "textarea",
    defaultValue: PUBLIC_ADDRESS,
    parse: text(300, { required: true }),
  },
  {
    key: "business_hours",
    group: "Store policies (website)",
    label: "Business hours",
    help: "When customers can reach you, shown on the Contact and policy pages. Leave empty to hide.",
    type: "text",
    defaultValue: BUSINESS_HOURS,
    parse: text(150),
  },
  {
    key: "dispatch_cutoff_hour",
    group: "Store policies (website)",
    label: "Same-day dispatch cut-off (hour, 0-23)",
    help: "Orders paid before this hour on a working day (Monday to Friday) ship the same day; later ones the next working day. 15 = 3pm.",
    type: "int",
    defaultValue: DISPATCH_CUTOFF_HOUR,
    parse: intBetween(0, 23),
  },
  {
    key: "delivery_west_days",
    group: "Store policies (website)",
    label: "Delivery time, Peninsular Malaysia (working days)",
    help: "Courier time after dispatch, as a range: e.g. 2-4.",
    type: "text",
    defaultValue: DELIVERY_WEST_DAYS,
    parse: dayRange,
  },
  {
    key: "delivery_east_days",
    group: "Store policies (website)",
    label: "Delivery time, East Malaysia (working days)",
    help: "Courier time after dispatch to Sabah, Sarawak and Labuan, as a range: e.g. 3-7.",
    type: "text",
    defaultValue: DELIVERY_EAST_DAYS,
    parse: dayRange,
  },
  {
    key: "couriers",
    group: "Store policies (website)",
    label: "Couriers",
    help: "Named on the Shipping page, e.g. J&T Express, Pos Laju. Leave empty to hide.",
    type: "text",
    defaultValue: COURIERS,
    parse: text(150),
  },
  {
    key: "return_days",
    group: "Store policies (website)",
    label: "Report a problem within (days of delivery)",
    help: "Defective, damaged or wrong items reported within this many days are replaced or refunded.",
    type: "int",
    defaultValue: RETURN_DAYS,
    parse: intBetween(1, 60),
  },
  {
    key: "refund_days",
    group: "Store policies (website)",
    label: "Refund within (working days)",
    help: "How soon an approved refund is paid back.",
    type: "int",
    defaultValue: REFUND_DAYS,
    parse: intBetween(1, 60),
  },
];

const BY_KEY = new Map(SETTINGS.map((s) => [s.key, s]));
const saved = new Map();

export async function loadSettings() {
  const rows = await prisma.setting.findMany();
  saved.clear();
  for (const row of rows) {
    const def = BY_KEY.get(row.key);
    if (!def) continue;
    try {
      saved.set(row.key, { value: def.parse(JSON.parse(row.value)), updatedAt: row.updatedAt });
    } catch {
      console.warn(`[settings] ignoring invalid saved value for ${row.key}`);
    }
  }
}

export function getSetting(key) {
  const def = BY_KEY.get(key);
  if (!def) throw new Error(`Unknown setting ${key}`);
  return saved.has(key) ? saved.get(key).value : def.defaultValue;
}

/** A dayRange setting as [min, max]. */
export function getDayRange(key) {
  return getSetting(key).split("-").map(Number);
}

export function describeSettings() {
  return SETTINGS.map(({ parse: _p, ...def }) => ({
    ...def,
    value: getSetting(def.key),
    isDefault: !saved.has(def.key),
    updatedAt: saved.get(def.key)?.updatedAt ?? null,
  }));
}

export async function saveSettings(values) {
  const errors = {};
  const parsed = [];
  for (const [key, raw] of Object.entries(values ?? {})) {
    const def = BY_KEY.get(key);
    if (!def) {
      errors[key] = "Unknown setting";
      continue;
    }
    try {
      parsed.push([key, def.parse(raw)]);
    } catch (err) {
      errors[key] = err.message;
    }
  }
  if (Object.keys(errors).length) return { errors };
  await prisma.$transaction(
    parsed.map(([key, value]) =>
      prisma.setting.upsert({ where: { key }, create: { key, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } }),
    ),
  );
  await loadSettings();
  return { ok: true };
}
