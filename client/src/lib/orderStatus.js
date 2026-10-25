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

export function trackingUrl(courier, trackingNo) {
  const slug = TRACKING_MY[courier];
  return slug && trackingNo ? `https://www.tracking.my/${slug}/${encodeURIComponent(trackingNo)}` : null;
}

export const STATUS_LABELS = {
  pending_payment: "Awaiting payment",
  paid: "Paid, preparing",
  sent_to_bigseller: "Paid, preparing",
  shipped: "Shipped",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export const STATUS_TONES = {
  pending_payment: "bg-amber-50 text-amber-800 ring-amber-200",
  paid: "bg-blue-50 text-blue-800 ring-blue-200",
  sent_to_bigseller: "bg-blue-50 text-blue-800 ring-blue-200",
  shipped: "bg-violet-50 text-violet-800 ring-violet-200",
  completed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  cancelled: "bg-slate-100 text-slate-600 ring-slate-200",
  refunded: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function formatDateTime(value) {
  return value ? new Date(value).toLocaleString("en-MY", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : null;
}
