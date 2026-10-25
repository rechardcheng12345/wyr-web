import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get, patch, post } from "@/lib/api";

export const CUSTOMER_KEY = ["customer"];

async function fetchMe() {
  return (await get("/api/account/me")).customer;
}

export function useCustomer() {
  const { data, isPending } = useQuery({ queryKey: CUSTOMER_KEY, queryFn: fetchMe, staleTime: 5 * 60_000, retry: false });
  return { customer: data, isPending };
}

export function useSetCustomer() {
  const qc = useQueryClient();
  return (customer) => {
    qc.setQueryData(CUSTOMER_KEY, customer);
    qc.removeQueries({ queryKey: ["account-orders"] });
    qc.removeQueries({ queryKey: ["order"] });
  };
}

export const register = (body) => post("/api/account/register", body).then((r) => r.customer);
export const login = (email, password) => post("/api/account/login", { email, password }).then((r) => r.customer);
export const logout = () => post("/api/account/logout", {});
export const logoutEverywhere = () => post("/api/account/logout-everywhere", {});
export const updateProfile = (body) => patch("/api/account", body).then((r) => r.customer);
export const changePassword = (currentPassword, newPassword) => post("/api/account/password", { currentPassword, newPassword }).then((r) => r.customer);
export const fetchMyOrders = () => get("/api/account/orders");

export function safeNext(raw) {
  return typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/account/orders";
}
