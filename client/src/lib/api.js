// Response shapes mirror server/src/routes/*.js.

export class ApiError extends Error {
  /** `body`: extra fields from the error response, e.g. `fields` for form errors. */
  constructor(status, message, body = null) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

const API_BASE = import.meta.env.VITE_API_URL ?? "";

async function request(path, init) {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.error ?? res.statusText, body);
  }
  return res.json();
}

export function get(path) {
  return request(path);
}

export function post(path, body) {
  return request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export function fetchProducts(query) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v) params.set(k, String(v));
  return get(`/api/products?${params}`);
}

export function fetchProduct(slug) {
  return get(`/api/products/${encodeURIComponent(slug)}`);
}

export function fetchCategories() {
  return get("/api/categories");
}
