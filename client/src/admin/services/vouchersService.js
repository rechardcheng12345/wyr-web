import { adminRequest } from "./http";

export function listVouchers() {
  return adminRequest("/api/admin/vouchers");
}

export function saveVoucher(voucher) {
  return voucher.id
    ? adminRequest(`/api/admin/vouchers/${voucher.id}`, { method: "PUT", body: voucher })
    : adminRequest("/api/admin/vouchers", { method: "POST", body: voucher });
}
