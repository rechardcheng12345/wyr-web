import { adminRequest } from "./http";

export function loadInventory() {
  return adminRequest("/api/admin/inventory");
}

export async function listStock() {
  return (await loadInventory()).items;
}

export function listMovements(variantId) {
  return adminRequest(`/api/admin/inventory/${variantId}/movements`);
}

export function listMappings() {
  return adminRequest("/api/admin/inventory/mappings");
}

export function createMapping(body) {
  return adminRequest("/api/admin/inventory/mappings", { method: "POST", body });
}

export function updateMapping(id, body) {
  return adminRequest(`/api/admin/inventory/mappings/${id}`, { method: "PUT", body });
}

export function deleteMapping(id) {
  return adminRequest(`/api/admin/inventory/mappings/${id}`, { method: "DELETE" });
}
