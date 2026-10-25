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

/** Shipping for one parcel to `state`. Items are passed for when rates depend on weight (EasyParcel). */
export function quoteShipping(state, _items, subtotalCents = 0) {
  const zone = EAST_MALAYSIA.has(state) ? "east" : "west";
  const { freeThresholdCents } = shippingSummary();
  if (freeThresholdCents != null && subtotalCents >= freeThresholdCents) return { feeCents: 0, zone, method: "free" };
  const feeCents = Math.round(getSetting(zone === "east" ? "shippingEastRm" : "shippingWestRm") * 100);
  return { feeCents, zone, method: "flat" };
}

export function shippingSummary() {
  const free = getSetting("free_shipping_threshold");
  return {
    westCents: Math.round(getSetting("shippingWestRm") * 100),
    eastCents: Math.round(getSetting("shippingEastRm") * 100),
    freeThresholdCents: free == null ? null : Math.round(free * 100),
  };
}
