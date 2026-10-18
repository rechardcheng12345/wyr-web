import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const rm = new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" });

export function formatPrice(value) {
  return value == null ? "—" : rm.format(value);
}

export function formatPriceRange(min, max) {
  if (min == null) return "—";
  return max != null && max > min ? `${formatPrice(min)} – ${formatPrice(max)}` : formatPrice(min);
}
