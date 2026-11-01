export const DISCONTINUED_PRODUCTS = [
  {
    label: "WYUAN UHF/VHF RFID USB reader/writer",
    skus: ["VHFReader", "VHFWriter"],
    nameContains: "WYUAN",
  },
];

const lower = (s) => s.toLowerCase();

export function matchesDiscontinued(entry, name, skus) {
  const skuSet = new Set(skus.map(lower));
  return lower(name ?? "").includes(lower(entry.nameContains)) || entry.skus.some((s) => skuSet.has(lower(s)));
}

export function discontinuedEntry(name, skus) {
  return DISCONTINUED_PRODUCTS.find((d) => matchesDiscontinued(d, name, skus));
}
