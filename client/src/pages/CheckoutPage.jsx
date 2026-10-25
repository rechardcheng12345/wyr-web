import { useMutation } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ProductImage } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { cents, checkVoucher, MALAYSIAN_STATES, placeOrder, rememberOrderEmail } from "@/lib/checkout";
import { cn, formatPrice } from "@/lib/utils";
import { lineProblem, linePricing, minimumOrderMessage, quoteIsCurrent, useCartQuote } from "./CartPage";

const EMPTY = { name: "", email: "", phone: "", addressLine: "", postcode: "", city: "", state: "", companyName: "" };

function shippingRangeText(range) {
  if (!range) return null;
  if (range.freeShippingShortfallCents === 0) return "Free";
  const west = cents(range.westCents);
  const east = cents(range.eastCents);
  return west === east ? formatPrice(west) : `RM ${west}–${east}`;
}
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
  const [note, setNote] = useState("");
  const [voucherInput, setVoucherInput] = useState("");
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherError, setVoucherError] = useState("");
  const { data: quote, refetch } = useCartQuote(buyer.state, voucherCode);
  const refs = cart.items.map((i) => ({ variantId: i.variantId, qty: i.qty }));

  const voucher = useMutation({
    mutationFn: (code) => checkVoucher(code, refs),
    onSuccess: (res) => {
      setVoucherCode(res.code);
      setVoucherInput(res.code);
      setVoucherError("");
    },
    onError: (err) => {
      setVoucherCode("");
      setVoucherError(err instanceof ApiError ? err.message : "Couldn't check that code. Please try again.");
    },
  });

  const order = useMutation({
    mutationFn: () => {
      const { companyName, ...address } = buyer;
      return placeOrder(refs, address, { companyName, note, voucherCode: voucherCode || undefined });
    },
    onSuccess: ({ orderNo, paymentUrl }) => {
      rememberOrderEmail(orderNo, buyer.email.trim().toLowerCase());
      cart.clear();
      window.location.assign(paymentUrl);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        if (err.body?.fields) setFieldErrors(err.body.fields);
        if (err.body?.fields?.voucherCode) {
          setVoucherCode("");
          setVoucherError(err.body.fields.voucherCode);
        }
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
  const discount = quote?.discountCents ? cents(quote.discountCents) : 0;
  const appliedVoucher = quote?.voucher?.valid ? quote.voucher : null;
  const lostVoucher = voucherCode && quote?.voucher && !quote.voucher.valid ? quote.voucher.error : null;
  const minimumMessage = quoteIsCurrent(quote, cart.items) ? minimumOrderMessage(quote) : null;
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
              <Field label="Company name (optional)" error={fieldErrors.companyName} className="sm:col-span-2">
                <Input name="companyName" autoComplete="organization" value={buyer.companyName} onChange={set("companyName")} maxLength={150} />
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

          <fieldset className="rounded-xl border p-5">
            <legend className="px-1 font-semibold">Order note (optional)</legend>
            <Field label="Note for us" error={fieldErrors.note}>
              <textarea
                name="note"
                rows={3}
                maxLength={2000}
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  setFieldErrors((f) => ({ ...f, note: undefined }));
                }}
                placeholder="NFC programming instructions, e.g. link to write on the tags"
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm"
              />
            </Field>
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
          <div className="mt-5 border-t pt-4">
            <label htmlFor="voucher" className="text-sm font-medium">
              Voucher code
            </label>
            <div className="mt-1.5 flex gap-2">
              <Input
                id="voucher"
                value={voucherInput}
                onChange={(e) => {
                  setVoucherInput(e.target.value.toUpperCase());
                  setVoucherError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (voucherInput.trim()) voucher.mutate(voucherInput.trim());
                  }
                }}
                placeholder="e.g. WELCOME5"
                className="min-w-0 flex-1 uppercase"
                data-testid="voucher-input"
              />
              {appliedVoucher && voucherCode === voucherInput.trim() ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setVoucherCode("");
                    setVoucherInput("");
                  }}
                >
                  Remove
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={!voucherInput.trim() || voucher.isPending}
                  onClick={() => voucher.mutate(voucherInput.trim())}
                  data-testid="voucher-apply"
                >
                  Apply
                </Button>
              )}
            </div>
            {(voucherError || lostVoucher) && <p className="text-destructive mt-1.5 text-xs" data-testid="voucher-error">{voucherError || lostVoucher}</p>}
            {appliedVoucher && (
              <p className="mt-1.5 text-xs font-medium text-emerald-700">
                {appliedVoucher.code} applied: {appliedVoucher.description}
              </p>
            )}
          </div>
          <dl className="mt-5 space-y-2 border-t pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd data-testid="checkout-subtotal">{formatPrice(subtotal)}</dd>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <dt>Voucher {appliedVoucher?.code}</dt>
                <dd data-testid="checkout-discount">−{formatPrice(discount)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Shipping{buyer.state && ` (${eastMalaysia ? "East" : "Peninsular"} Malaysia)`}</dt>
              <dd data-testid="checkout-shipping" className="text-right">
                {shipping != null ? (
                  shipping === 0 ? "Free" : formatPrice(shipping)
                ) : (
                  <span className="text-muted-foreground">{shippingRangeText(quote?.shippingRange) ?? "Choose a state"}</span>
                )}
              </dd>
            </div>
            <div className="flex justify-between border-t pt-3 text-base font-semibold">
              <dt>Total</dt>
              <dd data-testid="checkout-total">{formatPrice(total)}</dd>
            </div>
          </dl>

          {minimumMessage && (
            <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900" role="status" data-testid="min-order-message">
              {minimumMessage}.{" "}
              <Link to="/cart" className="underline">
                Back to cart
              </Link>
            </p>
          )}
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
          <Button type="submit" size="lg" className="mt-5 w-full" disabled={order.isPending || order.isSuccess || quote?.ok === false || !!minimumMessage} data-testid="place-order">
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
