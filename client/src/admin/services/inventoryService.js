import { adminRequest } from "./http";

export function listStock() {
  return adminRequest("/api/admin/inventory");
}
