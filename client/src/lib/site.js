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
  const rm = (v) => `RM${v.toFixed(2)}`;
  if (shipping.westRm === shipping.eastRm) return `Shipping: ${rm(shipping.westRm)} flat rate anywhere in Malaysia`;
  return `Shipping: ${rm(shipping.westRm)} West Malaysia / ${rm(shipping.eastRm)} East Malaysia`;
}

const DEFAULT_TITLE = "WYR Technology · NFC & RFID hardware";
const DEFAULT_DESCRIPTION = "WYR Technology: NFC tags, RFID cards, readers and tap-to-review standees. Ready stock in Kuala Lumpur.";

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
    document.title = title;
    if (description) setMetaDescription(description);
    // Reset to the site defaults, not the previous value: the server injects the landing
    // page's own title (server/src/seo.js), which would otherwise stick to other pages.
    return () => {
      document.title = DEFAULT_TITLE;
      setMetaDescription(DEFAULT_DESCRIPTION);
    };
  }, [title, description]);
}

export function whatsappLink(number, text) {
  if (!number) return null;
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
