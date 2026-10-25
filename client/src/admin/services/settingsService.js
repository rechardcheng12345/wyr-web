import { adminRequest } from "./http";

export function listSettings() {
  return adminRequest("/api/admin/settings");
}

export function saveSettings(values) {
  return adminRequest("/api/admin/settings", { method: "PUT", body: { values } });
}
