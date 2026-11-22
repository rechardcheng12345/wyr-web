// All shipping maths lives here so EasyParcel rates can replace the flat rates in one place.
// Rates come from constants.js: SHIPPING_FLAT_WM_RM (Peninsular) and SHIPPING_FLAT_EM_RM (Sabah, Sarawak, Labuan).

import { getSetting } from "./settings.js";

// Keep in sync with client/src/lib/checkout.js.
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

const EAST_MALAYSIA = new Set(["Sabah", "Sarawak", "W.P. Labuan"]);

export function isMalaysianState(value) {
  return MALAYSIAN_STATES.includes(value);
}

export function physicalItems(items) {
  return items.filter((i) => !i.digital);
}

export function shippingFeeFor(state, items, rates) {
  const zone = EAST_MALAYSIA.has(state) ? "east" : "west";
  const physical = physicalItems(items);
  if (physical.length === 0) return { feeCents: 0, zone, method: "digital" };
  if (rates.freeThresholdCents != null && physicalSubtotalCents(physical) >= rates.freeThresholdCents) return { feeCents: 0, zone, method: "free" };
  return { feeCents: zone === "east" ? rates.eastCents : rates.westCents, zone, method: "flat" };
}

/** Shipping for one parcel to `state`. Items are passed for when rates depend on weight (EasyParcel). */
export function quoteShipping(state, items) {
  return shippingFeeFor(state, items, shippingSummary());
}

export function physicalSubtotalCents(items) {
  return physicalItems(items).reduce((sum, i) => sum + (i.lineTotalCents ?? 0), 0);
}

export function shippingSummary() {
  const free = getSetting("free_shipping_threshold");
  return {
    westCents: Math.round(getSetting("shippingWestRm") * 100),
    eastCents: Math.round(getSetting("shippingEastRm") * 100),
    freeThresholdCents: free == null ? null : Math.round(free * 100),
  };
}
