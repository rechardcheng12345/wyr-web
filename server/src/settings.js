import {
  BULK_QUOTE_MIN_QTY,
  ORDER_HOLD_MINUTES,
  SHIPPING_FLAT_EM_RM,
  SHIPPING_FLAT_WM_RM,
  SHOPEE_SHOP_URL,
  TOYYIBPAY_PAYMENT_CHANNEL,
  WHATSAPP_NUMBER,
} from "./constants.js";
import { prisma } from "./db.js";

function money(raw) {
  const n = Number(raw);
  if (raw === "" || raw == null || !Number.isFinite(n) || n < 0 || n > 10_000) throw new Error("Enter an amount between 0 and 10,000");
  return Math.round(n * 100) / 100;
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

const CHANNELS = [
  { value: "0", label: "FPX online banking only" },
  { value: "1", label: "Credit / debit card only" },
  { value: "2", label: "FPX and card (card must be enabled on your ToyyibPay account)" },
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
