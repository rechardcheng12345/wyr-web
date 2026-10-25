import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Package, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import { ErrorState } from "@/components/ErrorState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchMyOrders } from "@/lib/account";
import { formatDateTime, STATUS_LABELS, STATUS_TONES } from "@/lib/orderStatus";
import { cn, formatPrice } from "@/lib/utils";
import { AccountHeader } from "./AccountNav";

export function StatusPill({ status }) {
  return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", STATUS_TONES[status])}>{STATUS_LABELS[status] ?? status}</span>;
}

export function MyOrdersPage() {
  const { data: orders, isPending, isError, refetch } = useQuery({ queryKey: ["account-orders"], queryFn: fetchMyOrders, staleTime: 15_000 });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <title>My orders · WYR Technology</title>
      <AccountHeader title="My orders" />
      <div className="mt-6">
        {isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : isPending ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-xl border border-dashed px-6 py-14 text-center">
            <Package className="text-muted-foreground mx-auto size-10" />
            <p className="mt-4 font-semibold">No orders yet</p>
            <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">Orders you place while logged in show up here. Orders placed as a guest can be found with Track order.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link to="/products">Start shopping</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/track">Track a guest order</Link>
              </Button>
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {orders.map((o) => (
              <li key={o.orderNo}>
                <OrderRow order={o} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function OrderRow({ order: o }) {
  const first = o.items[0];
  const more = o.items.length - 1 + o.moreItems;
  return (
    <Link to={`/orders/${o.orderNo}`} className="bg-card hover:border-primary/40 group flex gap-3 rounded-xl border p-4 transition-colors sm:gap-4 sm:p-5" data-testid="account-order">
      <div className="bg-muted size-14 shrink-0 overflow-hidden rounded-lg sm:size-16">
        {first?.image ? <img src={first.image} alt="" className="size-full object-cover" loading="lazy" /> : <Package className="text-muted-foreground m-auto mt-5 size-6" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="font-semibold whitespace-nowrap">{o.orderNo}</p>
          <StatusPill status={o.status} />
        </div>
        <p className="text-muted-foreground mt-1 line-clamp-1 text-sm">
          {first ? `${first.name}${first.variantName ? ` (${first.variantName})` : ""} × ${first.qty}` : "No items"}
          {more > 0 && ` + ${more} more`}
        </p>
        <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 text-xs">
          <span>{formatDateTime(o.createdAt)}</span>
          <span>
            {o.itemCount} pc{o.itemCount === 1 ? "" : "s"}
          </span>
          {o.trackingNo && (
            <span className="inline-flex items-center gap-1">
              <Truck className="size-3.5" />
              {o.courier} {o.trackingNo}
            </span>
          )}
        </p>
        <p className="mt-2 font-semibold sm:hidden">{formatPrice(o.total)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <p className="hidden font-semibold sm:block">{formatPrice(o.total)}</p>
        <ChevronRight className="text-muted-foreground group-hover:text-foreground size-4" />
      </div>
    </Link>
  );
}
