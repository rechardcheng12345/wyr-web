// All shipping maths lives here so EasyParcel rates can replace the flat rates in one place.
// Rates come from server/.env: SHIPPING_FLAT_WM (Peninsular) and SHIPPING_FLAT_EM (Sabah, Sarawak, Labuan), in RM.

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

function rateCents(name: string, fallbackRm: number) {
  const raw = process.env[name];
  const rm = raw === undefined || raw.trim() === "" ? fallbackRm : Number(raw);
  if (!Number.isFinite(rm) || rm < 0) throw new Error(`${name} must be a non-negative number of ringgit, got "${raw}"`);
  return Math.round(rm * 100);
}

export interface ShippingQuote {
  feeCents: number;
  zone: "west" | "east";
  method: "flat";
}

/** Shipping for one parcel to `state`. Items are passed for when rates depend on weight (EasyParcel). */
export function quoteShipping(state: MalaysianState, _items: { variantId: number; qty: number; weightG: number | null }[]): ShippingQuote {
  const zone = EAST_MALAYSIA.has(state) ? "east" : "west";
  const feeCents = zone === "east" ? rateCents("SHIPPING_FLAT_EM", 15) : rateCents("SHIPPING_FLAT_WM", 8);
  return { feeCents, zone, method: "flat" };
}
