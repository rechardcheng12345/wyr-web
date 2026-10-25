import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";

export const LOGO_SRC = "/images/wyr-logo-mark.png";

export function useSiteInfo() {
  const { data } = useQuery({ queryKey: ["site"], queryFn: () => get("/api/site"), staleTime: Infinity });
  return data ?? { whatsappNumber: null, bulkQuoteMinQty: 50, shopeeUrl: null, shipping: null, minOrderSubtotalRm: null, welcomeVoucher: null };
}

export function shippingText(shipping) {
  if (!shipping) return null;
  return `Shipping: RM${shipping.westRm} West Malaysia / RM${shipping.eastRm} East Malaysia`;
}

const DEFAULT_TITLE = "WYR Technology · NFC & RFID hardware";

function setMetaDescription(content) {
  let tag = document.querySelector('meta[name="description"]');
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("name", "description");
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

export function usePageMeta(title, description) {
  useEffect(() => {
    if (!title) return;
    const prevTitle = document.title;
    const prevDescription = document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
    document.title = title;
    if (description) setMetaDescription(description);
    return () => {
      document.title = prevTitle || DEFAULT_TITLE;
      setMetaDescription(prevDescription);
    };
  }, [title, description]);
}

export function whatsappLink(number, text) {
  if (!number) return null;
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
