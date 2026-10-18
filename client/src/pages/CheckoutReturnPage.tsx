import { Navigate, useSearchParams } from "react-router-dom";
import { NotFoundPage } from "./NotFoundPage";

/**
 * ToyyibPay sends the buyer back here with ?status_id=&billcode=&order_id=. Those params are only a hint
 * for what to show while we wait; the order page shows the status the server got from the callback.
 */
export function CheckoutReturnPage() {
  const [params] = useSearchParams();
  const orderNo = params.get("order_id");
  if (!orderNo) return <NotFoundPage />;
  const statusId = params.get("status_id");
  return <Navigate to={`/orders/${encodeURIComponent(orderNo)}${statusId ? `?payment=${encodeURIComponent(statusId)}` : ""}`} replace />;
}
