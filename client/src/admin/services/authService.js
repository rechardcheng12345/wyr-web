import { adminRequest } from "./http";

export async function fetchMe() {
  const { user } = await adminRequest("/api/auth/me");
  return user;
}

export async function loginRequest(username, password) {
  const { user } = await adminRequest("/api/auth/login", { method: "POST", body: { username, password } });
  return user;
}

export function logoutRequest() {
  return adminRequest("/api/auth/logout", { method: "POST" });
}
