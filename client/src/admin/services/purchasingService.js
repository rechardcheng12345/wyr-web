import { adminRequest } from "./http";

export function listPurchaseOrders() {
  return adminRequest("/api/admin/purchasing");
}

export function savePurchaseOrder(po) {
  return po.id
    ? adminRequest(`/api/admin/purchasing/${po.id}`, { method: "PUT", body: po })
    : adminRequest("/api/admin/purchasing", { method: "POST", body: po });
}

export function receivePurchaseOrder(id) {
  return adminRequest(`/api/admin/purchasing/${id}/receive`, { method: "POST" });
}

export function cancelPurchaseOrder(id) {
  return adminRequest(`/api/admin/purchasing/${id}/cancel`, { method: "POST" });
}

export function deletePurchaseOrder(id) {
  return adminRequest(`/api/admin/purchasing/${id}`, { method: "DELETE" });
}
