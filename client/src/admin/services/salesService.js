import { adminRequest } from "./http";

export function getSalesSummary({ from, to }) {
  return adminRequest(`/api/admin/sales?from=${from}&to=${to}`);
}
