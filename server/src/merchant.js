// What Google (Search structured data and the Merchant Center feed) is told about offers,
// shipping and the business. Kept in one place so the product page JSON-LD and
// /merchant-feed.xml always agree.
import { getDayRange, getSetting } from "./settings.js";
import { shippingSummary } from "./shipping.js";

export const BUSINESS_NAME = "WYR Technology";

// East Malaysia postcodes (Labuan 87, Sabah 88-91, Sarawak 93-98); everything else ships at the West rate.
const EAST_POSTCODES = [
  { postalCodeBegin: "87000", postalCodeEnd: "87999" },
  { postalCodeBegin: "88000", postalCodeEnd: "91999" },
  { postalCodeBegin: "93000", postalCodeEnd: "98999" },
];

/**
 * One sellable offer per variant. Variants that need a minimum quantity (low-price items)
 * are offered as a pack of that many, since a single piece can't be bought at that price.
 */
export function variantOffer(variant) {
  if (!variant.tiers.length) return null;
  const packQty = Math.max(1, variant.minQty ?? 1);
  const unitPrice = variant.tiers[0].unitPrice;
  return {
    unitPrice,
    packQty,
    packPrice: Math.round(unitPrice * packQty * 100) / 100,
    inStock: variant.stock != null && variant.stock >= packQty,
  };
}

// Marketplace boilerplate in descriptions imported from Shopee: Google treats store banners,
// links and emoji as promotional text, so the feed and structured data leave them out.
const BANNERS = [
  /welcome to wyr technology[.!]?/gi,
  /ready stock\s*(?:&|and)\s*shipping\s*:?/gi,
  /follow (?:our|us)\b[^.!\n]*[.!]?/gi,
  /ready stock\s*(?:&|and|\|)\s*ship(?:ping)?\s+from\s+kl\b[.!]?/gi,
  /(?:all products are )?ready stock(?: is)?(?: available)?(?: in kl)?(?: and available for immediate shipment)?[.!]?/gi,
  /same[- ]day shipping[^.!\n]*[.!]?/gi,
  /ship(?:ping)? from kl\b[.!]?/gi,
  /fast processing and delivery[.!]?/gi,
  /why buy from us\??/gi,
];
const PICTOGRAPHS = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍]/gu;

/** A product description with Shopee links, hashtags, emoji and store banners removed. */
export function googleDescription(text) {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      let l = line
        .replace(/https?:\/\/\S+/gi, "")
        .replace(/(?:^|\s)#[\p{L}\p{N}_.]+/gu, " ")
        .replace(PICTOGRAPHS, "")
        .replace(/【([^】\n]*)】/g, "$1: ");
      for (const re of BANNERS) l = l.replace(re, "");
      return l.replace(/\s+/g, " ").replace(/^[\s:|,.&-]+/, "").replace(/\s*:\s*:/g, ":").trim();
    })
    // Drop lines left empty, or left as just the heading of what was removed (e.g. "Ready Stock & Shipping:").
    .filter((l) => /[\p{L}\p{N}]/u.test(l) && !/^ready stock\b[^.]{0,30}:?$/i.test(l))
    .join("\n");
}

/** Variant page URL: the product page with that variant preselected. */
export function variantUrl(productUrl, variant) {
  return `${productUrl}?variant=${variant.id}`;
}

/**
 * Who the seller is and the store's shipping/returns terms, shown on the Contact and policy
 * pages (via /api/site) and used in the structured data below, so the two never disagree.
 */
export function storeInfo() {
  return {
    business: {
      name: getSetting("company_name"),
      regNo: getSetting("company_reg_no") || null,
      address: getSetting("public_address"),
      phone: getSetting("company_phone") || null,
      email: getSetting("company_email") || null,
      hours: getSetting("business_hours") || null,
    },
    policies: {
      dispatchCutoffHour: getSetting("dispatch_cutoff_hour"),
      deliveryWestDays: getDayRange("delivery_west_days"),
      deliveryEastDays: getDayRange("delivery_east_days"),
      couriers: getSetting("couriers") || null,
      returnDays: getSetting("return_days"),
      refundDays: getSetting("refund_days"),
    },
  };
}

const WORKING_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((d) => `https://schema.org/${d}`);
const days = ([minValue, maxValue]) => ({ "@type": "QuantitativeValue", minValue, maxValue, unitCode: "DAY" });

/** Same day before the cut-off, else next working day; then the courier's range. */
function deliveryTimeJsonLd(range) {
  const hour = String(getSetting("dispatch_cutoff_hour")).padStart(2, "0");
  return {
    "@type": "ShippingDeliveryTime",
    handlingTime: days([0, 1]),
    transitTime: days(range),
    cutoffTime: `${hour}:00:00+08:00`,
    businessDays: { "@type": "OpeningHoursSpecification", dayOfWeek: WORKING_DAYS },
  };
}

function rate(cents) {
  return { "@type": "MonetaryAmount", value: (cents / 100).toFixed(2), currency: "MYR" };
}

/** schema.org OfferShippingDetails for Malaysia: West rate by default, East rate for East Malaysian postcodes. */
export function shippingDetailsJsonLd(priceCents) {
  const { westCents, eastCents, freeThresholdCents } = shippingSummary();
  const free = freeThresholdCents != null && priceCents >= freeThresholdCents;
  return [
    {
      "@type": "OfferShippingDetails",
      shippingRate: rate(free ? 0 : westCents),
      shippingDestination: { "@type": "DefinedRegion", addressCountry: "MY" },
      deliveryTime: deliveryTimeJsonLd(getDayRange("delivery_west_days")),
    },
    {
      "@type": "OfferShippingDetails",
      shippingRate: rate(free ? 0 : eastCents),
      shippingDestination: { "@type": "DefinedRegion", addressCountry: "MY", postalCodeRange: EAST_POSTCODES },
      deliveryTime: deliveryTimeJsonLd(getDayRange("delivery_east_days")),
    },
  ];
}

/** Store details for search: Malaysia-only online shop based in Kuala Lumpur, with the contacts the site shows. */
export function businessJsonLd(origin) {
  const whatsapp = getSetting("whatsappNumber").replace(/\D/g, "");
  const shopee = getSetting("shopeeUrl");
  const { business } = storeInfo();
  return {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    name: BUSINESS_NAME,
    url: `${origin}/`,
    logo: `${origin}/images/wyr-logo-mark.png`,
    description: "NFC tags, RFID cards, readers and tap-to-review standees. Ready stock in Kuala Lumpur, shipped across Malaysia.",
    ...(business.regNo && { legalName: business.name, identifier: business.regNo }),
    address: { "@type": "PostalAddress", addressLocality: "Kuala Lumpur", addressCountry: "MY" },
    ...(business.email && { email: business.email }),
    areaServed: { "@type": "Country", name: "Malaysia" },
    currenciesAccepted: "MYR",
    ...(whatsapp && {
      contactPoint: { "@type": "ContactPoint", contactType: "customer service", telephone: `+${whatsapp}`, areaServed: "MY" },
    }),
    ...(shopee && { sameAs: [shopee] }),
  };
}

export function websiteJsonLd(origin) {
  return { "@context": "https://schema.org", "@type": "WebSite", name: BUSINESS_NAME, alternateName: "WYR Gadget", url: `${origin}/` };
}
