import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { tierFor, type PriceTier } from "@/lib/pricing";

/** What the cart remembers per line. Price and stock are for display only; the server re-prices at checkout. */
export interface CartItem {
  variantId: number;
  qty: number;
  productSlug: string;
  productName: string;
  variantName: string | null;
  sku: string;
  image: string | null;
  /** 1+ price; with `tiers`, the per-piece price depends on qty (see itemUnitPrice). */
  unitPrice: number;
  /** Per-piece price tiers when last seen (absent in carts saved before tiered pricing). */
  tiers?: PriceTier[];
  /** Sellable stock when last seen; caps the quantity picker. */
  stock: number;
}

/** Display estimate of the per-piece price at the item's quantity, until the server quote arrives. */
export function itemUnitPrice(item: CartItem) {
  return (item.tiers && tierFor(item.tiers, item.qty)?.unitPrice) ?? item.unitPrice;
}

interface CartContextValue {
  items: CartItem[];
  count: number;
  /** Adds qty (capped at stock). Returns how many were actually added. */
  add: (item: Omit<CartItem, "qty">, qty: number) => number;
  setQty: (variantId: number, qty: number) => void;
  remove: (variantId: number) => void;
  clear: () => void;
  /** Refreshes stored price/stock from a server quote. */
  sync: (updates: { variantId: number; unitPrice: number; tiers: PriceTier[]; stock: number }[]) => void;
}

const STORAGE_KEY = "wyr.cart.v1";
const CartContext = createContext<CartContextValue | null>(null);

function load(): CartItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((i) => Number.isInteger(i?.variantId) && Number.isInteger(i?.qty) && i.qty > 0) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage blocked (private mode quota): the cart still works for this visit.
    }
  }, [items]);

  // Keep tabs in step.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setItems(load());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback<CartContextValue["add"]>(
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

  const setQty = useCallback((variantId: number, qty: number) => {
    setItems((prev) => prev.map((i) => (i.variantId === variantId ? { ...i, qty: Math.max(1, Math.min(qty, Math.max(i.stock, 1))) } : i)));
  }, []);

  const remove = useCallback((variantId: number) => setItems((prev) => prev.filter((i) => i.variantId !== variantId)), []);
  const clear = useCallback(() => setItems([]), []);

  const sync = useCallback<CartContextValue["sync"]>((updates) => {
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
