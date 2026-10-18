// All shipping maths lives here so EasyParcel rates can replace the flat rates in one place.
// Rates come from constants.ts: SHIPPING_FLAT_WM_RM (Peninsular) and SHIPPING_FLAT_EM_RM (Sabah, Sarawak, Labuan).

import { SHIPPING_FLAT_EM_RM, SHIPPING_FLAT_WM_RM } from "./constants.js";

// Keep in sync with client/src/lib/checkout.ts.
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
] as const;

export type MalaysianState = (typeof MALAYSIAN_STATES)[number];

const EAST_MALAYSIA = new Set<MalaysianState>(["Sabah", "Sarawak", "W.P. Labuan"]);

export function isMalaysianState(value: string): value is MalaysianState {
  return (MALAYSIAN_STATES as readonly string[]).includes(value);
}


export interface ShippingQuote {
  feeCents: number;
  zone: "west" | "east";
  method: "flat";
}

/** Shipping for one parcel to `state`. Items are passed for when rates depend on weight (EasyParcel). */
export function quoteShipping(state: MalaysianState, _items: { variantId: number; qty: number; weightG: number | null }[]): ShippingQuote {
  const zone = EAST_MALAYSIA.has(state) ? "east" : "west";
  const feeCents = zone === "east" ? Math.round(SHIPPING_FLAT_EM_RM * 100) : Math.round(SHIPPING_FLAT_WM_RM * 100);
  return { feeCents, zone, method: "flat" };
}
