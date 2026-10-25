const rm = new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" });
const num = new Intl.NumberFormat("en-MY");

export const formatRM = (n) => rm.format(Number.isFinite(n) ? n : 0);
export const formatNumber = (n) => num.format(n);
export const formatDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });

export function localISODate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
