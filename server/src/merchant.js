// What Google (Search structured data and the Merchant Center feed) is told about offers,
// shipping and the business. Kept in one place so the product page JSON-LD and
// /merchant-feed.xml always agree.
import { getSetting } from "./settings.js";
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

/** Variant page URL: the product page with that variant preselected. */
export function variantUrl(productUrl, variant) {
  return `${productUrl}?variant=${variant.id}`;
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
    },
    {
      "@type": "OfferShippingDetails",
      shippingRate: rate(free ? 0 : eastCents),
      shippingDestination: { "@type": "DefinedRegion", addressCountry: "MY", postalCodeRange: EAST_POSTCODES },
    },
  ];
}

/** Store details for search: Malaysia-only online shop based in Kuala Lumpur (no street address published). */
export function businessJsonLd(origin) {
  const whatsapp = getSetting("whatsappNumber").replace(/\D/g, "");
  const shopee = getSetting("shopeeUrl");
  return {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    name: BUSINESS_NAME,
    url: `${origin}/`,
    logo: `${origin}/images/wyr-logo-mark.png`,
    description: "NFC tags, RFID cards, readers and tap-to-review standees. Ready stock in Kuala Lumpur, shipped across Malaysia.",
    address: { "@type": "PostalAddress", addressLocality: "Kuala Lumpur", addressCountry: "MY" },
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
