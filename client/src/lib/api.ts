// Response shapes mirror server/src/routes/*.ts.
import type { PriceTier } from "@/lib/pricing";

export type Platform = "shopee" | "lazada" | "tiktok";

export interface MarketplaceLink {
  platform: Platform;
  url: string | null;
  externalItemId: string | null;
}

export interface CategoryRef {
  name: string | null;
  slug: string | null;
}

export interface Category {
  id: number;
  parentId: number | null;
  name: string | null;
  slug: string | null;
  productCount: number;
}

export interface ProductSummary {
  id: number;
  slug: string;
  name: string;
  category: CategoryRef | null;
  image: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  variantCount: number;
  inStock: boolean;
  marketplaces: MarketplaceLink[];
}

export interface ProductList {
  items: ProductSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Variant {
  id: number;
  sku: string;
  name: string | null;
  price: number | null;
  specialPrice: number | null;
  stock: number | null;
  /** Per-piece price by quantity; the first entry is the 1+ price. Empty if unpriced. */
  tiers: PriceTier[];
  /** Pack sizes for the quick-pick quantity buttons, e.g. [3, 5, 10]. */
  quickQtys: number[];
}

export interface ProductDetail {
  id: number;
  slug: string;
  name: string;
  parentSku: string | null;
  description: string | null;
  productType: "physical" | "digital";
  category: CategoryRef | null;
  minPrice: number | null;
  maxPrice: number | null;
  images: { url: string; variantId: number | null }[];
  variants: Variant[];
  marketplaces: MarketplaceLink[];
  /** From minQty pieces the page offers a bulk quote over WhatsApp (number null = not configured). */
  bulkQuote: { minQty: number; whatsappNumber: string | null };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Extra fields from the error response, e.g. `fields` for form errors. */
    public body: Record<string, unknown> | null = null,
  ) {
    super(message);
  }
}

const API_BASE = import.meta.env.VITE_API_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.error ?? res.statusText, body);
  }
  return res.json() as Promise<T>;
}

export function get<T>(path: string) {
  return request<T>(path);
}

export function post<T>(path: string, body: unknown) {
  return request<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export interface ProductQuery {
  category?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export function fetchProducts(query: ProductQuery) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v) params.set(k, String(v));
  return get<ProductList>(`/api/products?${params}`);
}

export function fetchProduct(slug: string) {
  return get<ProductDetail>(`/api/products/${encodeURIComponent(slug)}`);
}

export function fetchCategories() {
  return get<Category[]>("/api/categories");
}
