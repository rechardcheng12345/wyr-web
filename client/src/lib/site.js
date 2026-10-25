import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";

export const LOGO_SRC = "/images/wyr-logo-mark.png";

export function useSiteInfo() {
  const { data } = useQuery({ queryKey: ["site"], queryFn: () => get("/api/site"), staleTime: Infinity });
  return data ?? { whatsappNumber: null, bulkQuoteMinQty: 50, shopeeUrl: null };
}

export function whatsappLink(number, text) {
  if (!number) return null;
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
