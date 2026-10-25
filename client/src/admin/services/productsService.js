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
