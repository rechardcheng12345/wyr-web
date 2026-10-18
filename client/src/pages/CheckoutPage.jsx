import { useMutation } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ProductImage } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { cents, MALAYSIAN_STATES, placeOrder, rememberOrderEmail } from "@/lib/checkout";
import { cn, formatPrice } from "@/lib/utils";
import { lineProblem, linePricing, useCartQuote } from "./CartPage";

const EMPTY = { name: "", email: "", phone: "", addressLine: "", postcode: "", city: "", state: "" };
const BUYER_KEY = "wyr.checkoutBuyer.v1";

function loadBuyer() {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(BUYER_KEY) ?? "{}") };
  } catch {
    return EMPTY;
  }
}

export function CheckoutPage() {
  const cart = useCart();
  const [buyer, setBuyer] = useState(loadBuyer);
  const [fieldErrors, setFieldErrors] = useState({});
  const { data: quote, refetch } = useCartQuote(buyer.state);

  const order = useMutation({
    mutationFn: () =>
      placeOrder(
        cart.items.map((i) => ({ variantId: i.variantId, qty: i.qty })),
        buyer,
      ),
    onSuccess: ({ orderNo, paymentUrl }) => {
      rememberOrderEmail(orderNo, buyer.email.trim().toLowerCase());
      cart.clear();
      window.location.assign(paymentUrl);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        if (err.body?.fields) setFieldErrors(err.body.fields);
        if (err.status === 409) void refetch();
      }
    },
  });

  // After a successful order the cart is cleared while we redirect to the payment page; don't flash "empty".
  if (cart.items.length === 0 && !order.isSuccess) return <Navigate to="/cart" replace />;

  const set = (field) => (e) => {
    setBuyer((b) => ({ ...b, [field]: e.target.value }));
    setFieldErrors((f) => ({ ...f, [field]: undefined }));
  };

  function onSubmit(e) {
    e.preventDefault();
    try {
      localStorage.setItem(BUYER_KEY, JSON.stringify(buyer));
    } catch {
      // Not important: it only pre-fills the form next time.
    }
    order.mutate();
  }

  const subtotal = quote ? cents(quote.subtotalCents) : null;
  const shipping = quote?.shippingCents != null ? cents(quote.shippingCents) : null;
  const total = quote?.totalCents != null ? cents(quote.totalCents) : null;
  const eastMalaysia = ["Sabah", "Sarawak", "W.P. Labuan"].includes(buyer.state);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-muted-foreground text-sm">
        <Link to="/cart" className="hover:text-foreground">
          ← Back to cart
        </Link>
      </nav>
      <h1 className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">Checkout</h1>

      <form onSubmit={onSubmit} className="mt-6 grid gap-8 lg:grid-cols-[1fr_380px]" noValidate>
        <div className="space-y-8">
          <fieldset className="rounded-xl border p-5">
            <legend className="px-1 font-semibold">Contact</legend>
            <p className="text-muted-foreground text-sm">No account needed. We'll email your receipt and tracking number.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Full name" error={fieldErrors.name} className="sm:col-span-2">
                <Input name="name" autoComplete="name" value={buyer.name} onChange={set("name")} required />
              </Field>
              <Field label="Email" error={fieldErrors.email}>
                <Input name="email" type="email" autoComplete="email" value={buyer.email} onChange={set("email")} required />
              </Field>
              <Field label="Phone" error={fieldErrors.phone}>
                <Input name="phone" type="tel" autoComplete="tel" placeholder="012-345 6789" value={buyer.phone} onChange={set("phone")} required />
              </Field>
            </div>
          </fieldset>

          <fieldset className="rounded-xl border p-5">
            <legend className="px-1 font-semibold">Shipping address (Malaysia)</legend>
            <div className="mt-2 grid gap-4 sm:grid-cols-6">
              <Field label="Address" error={fieldErrors.addressLine} className="sm:col-span-6">
                <Input
                  name="addressLine"
                  autoComplete="street-address"
                  placeholder="Unit, building, street"
                  value={buyer.addressLine}
                  onChange={set("addressLine")}
                  required
                />
              </Field>
              <Field label="Postcode" error={fieldErrors.postcode} className="sm:col-span-2">
                <Input
                  name="postcode"
                  autoComplete="postal-code"
                  inputMode="numeric"
                  maxLength={5}
                  value={buyer.postcode}
                  onChange={set("postcode")}
                  required
                />
              </Field>
              <Field label="City" error={fieldErrors.city} className="sm:col-span-4">
                <Input name="city" autoComplete="address-level2" value={buyer.city} onChange={set("city")} required />
              </Field>
              <Field label="State" error={fieldErrors.state} className="sm:col-span-6">
                <select
                  name="state"
                  autoComplete="address-level1"
                  value={buyer.state}
                  onChange={set("state")}
                  required
                  className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm"
                >
                  <option value="" disabled>
                    Choose a state
                  </option>
                  {MALAYSIAN_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </fieldset>
        </div>

        <aside className="h-fit rounded-xl border p-5 lg:sticky lg:top-24">
          <h2 className="font-semibold">Order summary</h2>
          <ul className="mt-4 space-y-3">
            {cart.items.map((item) => {
              const line = quote?.lines.find((l) => l.variantId === item.variantId);
              const problem = lineProblem(line);
              const price = linePricing(item, line);
              return (
                <li key={item.variantId} className="flex gap-3 text-sm">
                  <div className="bg-card relative size-14 shrink-0 overflow-hidden rounded-md border">
                    <ProductImage src={item.image} alt="" className="size-full" />
                    <span className="bg-foreground text-background absolute top-0 right-0 rounded-bl-md px-1.5 text-[11px] font-semibold">{item.qty}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2">{item.productName}</p>
                    {item.variantName && <p className="text-muted-foreground text-xs">{item.variantName}</p>}
                    <p className="text-muted-foreground text-xs">
                      {item.qty} × {formatPrice(price.unit)}
                      {price.savePct > 0 && <span className="text-emerald-700"> (save {price.savePct}%)</span>}
                    </p>
                    {problem && <p className="text-destructive text-xs">{problem}</p>}
                  </div>
                  <p className="shrink-0 font-medium">{formatPrice(price.total)}</p>
                </li>
              );
            })}
          </ul>
          <dl className="mt-5 space-y-2 border-t pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd data-testid="checkout-subtotal">{formatPrice(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Shipping{buyer.state && ` (${eastMalaysia ? "East" : "Peninsular"} Malaysia)`}</dt>
              <dd data-testid="checkout-shipping">{shipping != null ? formatPrice(shipping) : <span className="text-muted-foreground">Choose a state</span>}</dd>
            </div>
            <div className="flex justify-between border-t pt-3 text-base font-semibold">
              <dt>Total</dt>
              <dd data-testid="checkout-total">{formatPrice(total)}</dd>
            </div>
          </dl>

          {order.isError && (
            <p className="text-destructive mt-4 text-sm" role="alert">
              {order.error instanceof ApiError ? order.error.message : "Something went wrong. Please try again."}
              {order.error instanceof ApiError && order.error.status === 409 && (
                <>
                  {" "}
                  <Link to="/cart" className="underline">
                    Update cart
                  </Link>
                </>
              )}
            </p>
          )}
          <Button type="submit" size="lg" className="mt-5 w-full" disabled={order.isPending || order.isSuccess || quote?.ok === false} data-testid="place-order">
            <Lock />
            {order.isPending || order.isSuccess ? "Taking you to payment…" : total != null ? `Pay ${formatPrice(total)}` : "Continue to payment"}
          </Button>
          <p className="text-muted-foreground mt-3 text-center text-xs">
            Secure payment by ToyyibPay. Your items are held for you while you pay.
          </p>
        </aside>
      </form>
    </div>
  );
}

function Field({ label, error, className, children }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-sm font-medium">{label}</span>
      {children}
      {error && <span className="text-destructive block text-xs">{error}</span>}
    </label>
  );
}
