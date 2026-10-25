import { Loader2 } from "lucide-react";
import { Navigate, useLocation } from "react-router-dom";
import { useCustomer } from "@/lib/account";

export function RequireCustomer({ children }) {
  const { customer, isPending } = useCustomer();
  const location = useLocation();
  if (isPending) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }
  if (!customer) return <Navigate to={`/account/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return children;
}
