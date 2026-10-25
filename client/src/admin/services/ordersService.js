import { adminRequest } from "./http";

export function listOrders(tab) {
  return adminRequest(`/api/admin/orders?tab=${encodeURIComponent(tab)}`);
}

export function getOrderCounts() {
  return adminRequest("/api/admin/orders/counts");
}

export function shipOrder(id, courier, trackingNo) {
  return adminRequest(`/api/admin/orders/${id}/ship`, { method: "POST", body: { courier, trackingNo } });
}

export function unshipOrder(id) {
  return adminRequest(`/api/admin/orders/${id}/unship`, { method: "POST" });
}

export function completeOrder(id) {
  return adminRequest(`/api/admin/orders/${id}/complete`, { method: "POST" });
}

export function exportPaidOrdersUrl(from, to) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return `${import.meta.env.VITE_API_URL ?? ""}/api/admin/orders/export.csv${qs ? `?${qs}` : ""}`;
}
