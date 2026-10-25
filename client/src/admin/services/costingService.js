import { adminRequest } from "./http";

export function listCostingItems() {
  return adminRequest("/api/admin/costing");
}

export function getItemCosting(variantId) {
  return adminRequest(`/api/admin/costing/${variantId}`);
}
