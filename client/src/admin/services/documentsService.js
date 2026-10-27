import { adminRequest } from "./http";

export function listDocuments(type) {
  return adminRequest(`/api/admin/documents?type=${type}&year=${new Date().getFullYear()}`);
}

export function saveDocument(doc) {
  return doc.id
    ? adminRequest(`/api/admin/documents/${doc.id}`, { method: "PUT", body: doc })
    : adminRequest("/api/admin/documents", { method: "POST", body: doc });
}

export function issueDocument(id) {
  return adminRequest(`/api/admin/documents/${id}/issue`, { method: "POST" });
}

export function voidDocument(id) {
  return adminRequest(`/api/admin/documents/${id}/void`, { method: "POST" });
}

/** `paidAt`: "YYYY-MM-DD", or null to mark unpaid. */
export function setInvoicePaid(id, paidAt) {
  return adminRequest(`/api/admin/documents/${id}/payment`, { method: "POST", body: { paidAt } });
}

export function deleteDocument(id) {
  return adminRequest(`/api/admin/documents/${id}`, { method: "DELETE" });
}
