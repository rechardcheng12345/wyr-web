import { ApiError } from "@/lib/api";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

let onUnauthorized = null;

/** Called with no arguments whenever an admin API call returns 401 (session expired). */
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export async function adminRequest(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    if (res.status === 401 && !path.startsWith("/api/auth/")) onUnauthorized?.();
    throw new ApiError(res.status, data?.error ?? res.statusText, data);
  }
  return res.json();
}
