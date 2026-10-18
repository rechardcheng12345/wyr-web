import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const rm = new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" });

export function formatPrice(value: number | null | undefined) {
  return value == null ? "—" : rm.format(value);
}

export function formatPriceRange(min: number | null, max: number | null) {
  if (min == null) return "—";
  return max != null && max > min ? `${formatPrice(min)} – ${formatPrice(max)}` : formatPrice(min);
}
