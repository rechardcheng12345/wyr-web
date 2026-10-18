import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { tierFor } from "@/lib/pricing";

/** What the cart remembers per line. Price and stock are for display only; the server re-prices at checkout. */

/** Display estimate of the per-piece price at the item's quantity, until the server quote arrives. */
export function itemUnitPrice(item) {
  return (item.tiers && tierFor(item.tiers, item.qty)?.unitPrice) ?? item.unitPrice;
}

const STORAGE_KEY = "wyr.cart.v1";
const CartContext = createContext(null);

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((i) => Number.isInteger(i?.variantId) && Number.isInteger(i?.qty) && i.qty > 0) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage blocked (private mode quota): the cart still works for this visit.
    }
  }, [items]);

  // Keep tabs in step.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setItems(load());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback(
    (item, qty) => {
      const inCart = items.find((i) => i.variantId === item.variantId)?.qty ?? 0;
      const added = Math.max(0, Math.min(qty, item.stock - inCart));
      if (added === 0) return 0;
      setItems((prev) => {
        const existing = prev.find((i) => i.variantId === item.variantId);
        if (!existing) return [...prev, { ...item, qty: added }];
        return prev.map((i) => (i.variantId === item.variantId ? { ...i, ...item, qty: i.qty + added } : i));
      });
      return added;
    },
    [items],
  );

  const setQty = useCallback((variantId, qty) => {
    setItems((prev) => prev.map((i) => (i.variantId === variantId ? { ...i, qty: Math.max(1, Math.min(qty, Math.max(i.stock, 1))) } : i)));
  }, []);

  const remove = useCallback((variantId) => setItems((prev) => prev.filter((i) => i.variantId !== variantId)), []);
  const clear = useCallback(() => setItems([]), []);

  const sync = useCallback((updates) => {
    setItems((prev) => {
      let changed = false;
      const next = prev.map((i) => {
        const u = updates.find((x) => x.variantId === i.variantId);
        if (!u || (u.unitPrice === i.unitPrice && u.stock === i.stock && JSON.stringify(u.tiers) === JSON.stringify(i.tiers))) return i;
        changed = true;
        return { ...i, unitPrice: u.unitPrice, tiers: u.tiers, stock: u.stock };
      });
      return changed ? next : prev;
    });
  }, []);

  const value = useMemo(
    () => ({ items, count: items.reduce((n, i) => n + i.qty, 0), add, setQty, remove, clear, sync }),
    [items, add, setQty, remove, clear, sync],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
