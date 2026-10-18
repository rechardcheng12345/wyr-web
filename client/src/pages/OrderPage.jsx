import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ErrorState } from "@/components/ErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { fetchOrder, recallOrderEmail, rememberOrderEmail, retryPayment } from "@/lib/checkout";
import { formatPrice } from "@/lib/utils";

// After returning from payment, poll this long for the server-side callback to land.
const POLL_MS = 2000;
const POLL_FOR_MS = 90_000;

export function OrderPage() {
  const { orderNo = "" } = useParams();
  const [email, setEmail] = useState(() => recallOrderEmail(orderNo));

  if (!email) return <OrderLookup orderNo={orderNo} onFound={setEmail} />;
  return <OrderView orderNo={orderNo} email={email} onWrongEmail={() => setEmail(null)} />;
}

function OrderView({ orderNo, email, onWrongEmail }) {
  const [params] = useSearchParams();
  const returnedStatus = params.get("payment"); // 1 success, 2 pending, 3 failed (a hint only)
  const [pollWindowOpen, setPollWindowOpen] = useState(!!returnedStatus);
  useEffect(() => {
    if (!pollWindowOpen) return;
    const t = setTimeout(() => setPollWindowOpen(false), POLL_FOR_MS);
    return () => clearTimeout(t);
  }, [pollWindowOpen]);

  const { data: order, isPending, isError, error, refetch } = useQuery({
    queryKey: ["order", orderNo, email],
    queryFn: () => fetchOrder(orderNo, email),
    refetchInterval: (q) => (q.state.data?.status === "pending_payment" && pollWindowOpen ? POLL_MS : false),
  });

  if (isError) {
    if (error instanceof ApiError && error.status === 404) {
      return (
        <Centered>
          <ErrorState message="We couldn't find this order with the saved email." onRetry={onWrongEmail} />
        </Centered>
      );
    }
    return (
      <Centered>
        <ErrorState onRetry={() => refetch()} />
      </Centered>
    );
  }
  if (isPending) {
    return (
      <Centered>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="mt-4 h-64 w-full" />
      </Centered>
    );
  }

  // A failed return (status 3) only needs one check, no waiting.
  const polling = order.status === "pending_payment" && pollWindowOpen && returnedStatus !== "3" && order.payment?.status !== "failed";
  return (
    <Centered>
      <StatusBanner order={order} returnedStatus={returnedStatus} polling={polling} />
      <OrderDetails order={order} />
    </Centered>
  );
}

function StatusBanner({ order, returnedStatus, polling }) {
  const pay = useMutation({
    mutationFn: () => retryPayment(order.orderNo, order.email),
    onSuccess: ({ paymentUrl }) => window.location.assign(paymentUrl),
  });

  if (order.status !== "pending_payment" && order.status !== "cancelled") {
    return (
      <Banner tone="success" icon={<CheckCircle2 className="size-7" />} title="Thank you! Your order is confirmed." testId="order-status-paid">
        Payment received. We'll pack it and email the tracking number to <strong>{order.email}</strong>.
      </Banner>
    );
  }
  if (order.status === "cancelled") {
    return (
      <Banner tone="error" icon={<XCircle className="size-7" />} title="This order was cancelled" testId="order-status-cancelled">
        Payment wasn't completed in time, so the items were released. You can place a new order any time.
        <Button asChild className="mt-4">
          <Link to="/products">Shop again</Link>
        </Button>
      </Banner>
    );
  }

  const failed = order.payment?.status === "failed" || returnedStatus === "3";
  const retry = (
    <div className="mt-4">
      <Button onClick={() => pay.mutate()} disabled={pay.isPending} data-testid="retry-payment">
        {pay.isPending ? "Opening payment…" : `Pay ${formatPrice(order.total)}`}
      </Button>
      {pay.isError && <p className="text-destructive mt-2 text-sm">{pay.error.message}</p>}
      {order.expiresAt && (
        <p className="text-muted-foreground mt-2 text-xs">
          Your items are held until {new Date(order.expiresAt).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" })}.
        </p>
      )}
    </div>
  );

  if (failed) {
    return (
      <Banner tone="error" icon={<XCircle className="size-7" />} title="Payment didn't go through" testId="order-status-failed">
        Nothing was charged. You can try again with the same or another bank.
        {retry}
      </Banner>
    );
  }
  if (polling) {
    return (
      <Banner tone="neutral" icon={<Loader2 className="size-7 animate-spin" />} title="Confirming your payment…" testId="order-status-confirming">
        This usually takes a few seconds. Please keep this page open.
      </Banner>
    );
  }
  return (
    <Banner tone="neutral" icon={<Clock className="size-7" />} title="Waiting for payment" testId="order-status-pending">
      We haven't received a payment confirmation for this order yet. If you've just paid, refresh in a minute.
      {retry}
    </Banner>
  );
}

function OrderDetails({ order }) {
  const s = order.shipping;
  return (
    <div className="mt-6 grid gap-6 md:grid-cols-[1fr_260px]">
      <section className="rounded-xl border p-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-semibold">
            Order <span data-testid="order-no">{order.orderNo}</span>
          </h2>
          <p className="text-muted-foreground text-xs">{new Date(order.createdAt).toLocaleString("en-MY")}</p>
        </div>
        <ul className="mt-4 divide-y text-sm">
          {order.items.map((i) => (
            <li key={i.variantId} className="flex justify-between gap-4 py-3">
              <div className="min-w-0">
                {i.productSlug ? (
                  <Link to={`/products/${i.productSlug}`} className="line-clamp-2 hover:underline">
                    {i.productName}
                  </Link>
                ) : (
                  <p>{i.productName}</p>
                )}
                <p className="text-muted-foreground text-xs">
                  {i.variantName && `${i.variantName} · `}
                  {i.qty} × {formatPrice(i.unitPrice)}
                </p>
              </div>
              <p className="shrink-0 font-medium">{formatPrice(i.lineTotal)}</p>
            </li>
          ))}
        </ul>
        <dl className="mt-2 space-y-2 border-t pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd>{formatPrice(order.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Shipping</dt>
            <dd>{formatPrice(order.shippingFee)}</dd>
          </div>
          <div className="flex justify-between border-t pt-3 text-base font-semibold">
            <dt>Total</dt>
            <dd data-testid="order-total">{formatPrice(order.total)}</dd>
          </div>
        </dl>
      </section>
      <section className="h-fit rounded-xl border p-5 text-sm">
        <h2 className="font-semibold">Shipping to</h2>
        <address className="text-muted-foreground mt-3 leading-relaxed not-italic">
          {s.name}
          <br />
          {s.addressLine}
          <br />
          {s.postcode} {s.city}
          <br />
          {s.state}
          <br />
          {s.phone}
        </address>
        <p className="text-muted-foreground mt-4 text-xs">Keep your order number. You can look it up later with your email.</p>
      </section>
    </div>
  );
}

function OrderLookup({ orderNo, onFound }) {
  const [email, setEmail] = useState("");
  const lookup = useMutation({
    mutationFn: (e) => fetchOrder(orderNo, e),
    onSuccess: (_order, e) => {
      rememberOrderEmail(orderNo, e);
      onFound(e);
    },
  });
  function onSubmit(ev) {
    ev.preventDefault();
    lookup.mutate(email.trim().toLowerCase());
  }
  return (
    <div className="mx-auto max-w-sm px-4 py-20">
      <h1 className="text-2xl font-bold tracking-tight">Order {orderNo}</h1>
      <p className="text-muted-foreground mt-2 text-sm">Enter the email you used at checkout to see this order.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <Input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {lookup.isError && (
          <p className="text-destructive text-sm">{lookup.error instanceof ApiError ? lookup.error.message : "Something went wrong."}</p>
        )}
        <Button type="submit" className="w-full" disabled={lookup.isPending || !email.trim()}>
          View order
        </Button>
      </form>
    </div>
  );
}

function Centered({ children }) {
  return <div className="mx-auto max-w-4xl px-4 py-10">{children}</div>;
}

const TONES = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900 [&>svg]:text-emerald-600",
  error: "border-red-200 bg-red-50 text-red-900 [&>svg]:text-red-600",
  neutral: "bg-muted/50 [&>svg]:text-muted-foreground",
};

function Banner({ tone, icon, title, testId, children }) {
  return (
    <div className={`flex gap-4 rounded-xl border p-5 ${TONES[tone]}`} role="status" data-testid={testId}>
      {icon}
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        <div className="mt-1 text-sm">{children}</div>
      </div>
    </div>
  );
}
