import { adminRequest } from "./http";

export function listProducts() {
  return adminRequest("/api/admin/products");
}

export function getProduct(id) {
  return adminRequest(`/api/admin/products/${id}`);
}

export function saveProduct(product) {
  return product.id
    ? adminRequest(`/api/admin/products/${product.id}`, { method: "PUT", body: product })
    : adminRequest("/api/admin/products", { method: "POST", body: product });
}

export function deleteProduct(id) {
  return adminRequest(`/api/admin/products/${id}`, { method: "DELETE" });
}

export function listCategories() {
  return adminRequest("/api/categories");
}

const API_BASE = import.meta.env.VITE_API_URL ?? "";

/**
 * Uploads a photo or video file; resolves to { url, size }.
 * Uses XHR rather than fetch so large videos can report progress (0–1) through onProgress.
 */
export function uploadFile(kind, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/api/admin/uploads?kind=${kind}&name=${encodeURIComponent(file.name)}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // e.g. an HTML error page from the host's proxy
      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.url) resolve(data);
      else reject(new Error(data?.error ?? (xhr.status === 413 ? "File too large for the server" : `Upload failed (${xhr.status || "network error"})`)));
    };
    xhr.onerror = () => reject(new Error("Upload failed: network error"));
    xhr.send(file);
  });
}

/** Downloads the product information Excel sheet, pre-filled from the database. */
export async function downloadInfoSheet() {
  const res = await fetch(`${API_BASE}/api/admin/product-info/export`, { credentials: "include" });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "wyr-product-info.xlsx";
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Uploads a filled-in sheet. apply=false only previews; apply=true saves. */
export async function importInfoSheet(file, apply) {
  const res = await fetch(`${API_BASE}/api/admin/product-info/import${apply ? "?apply=1" : ""}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/octet-stream" },
    body: file,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok && !data?.errors) throw new Error(data?.error ?? `Upload failed (${res.status})`);
  return data;
}
