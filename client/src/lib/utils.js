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

export function formatSold(n) {
  if (!n || n < 1) return "";
  if (n < 1000) return `${n} sold`;
  const k = Math.floor(n / 100) / 10;
  return `${k >= 100 ? Math.floor(k) : k}k+ sold`;
}
