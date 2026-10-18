import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ShoppingCart, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ProductImage } from "@/components/ProductCard";
import { QtyStepper } from "@/components/QtyStepper";
import { Button } from "@/components/ui/button";
import { itemUnitPrice, useCart, type CartItem } from "@/lib/cart";
import { cents, fetchQuote, type Quote, type QuoteLine } from "@/lib/checkout";
import { lineTotal, savingPct } from "@/lib/pricing";
import { formatPrice } from "@/lib/utils";

/** Server prices and stock for the current cart; also refreshes what the cart has stored. */
export function useCartQuote(state?: string) {
  const { items, sync } = useCart();
  const refs = items.map((i) => ({ variantId: i.variantId, qty: i.qty }));
  const query = useQuery({
    queryKey: ["quote", refs, state ?? null],
    queryFn: () => fetchQuote(refs, state),
    enabled: refs.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
  useEffect(() => {
    if (query.data) {
      sync(
        query.data.lines.map((l) => ({
          variantId: l.variantId,
          unitPrice: cents(l.baseUnitPriceCents),
          tiers: l.tiers.map((t) => ({ minQty: t.minQty, unitPrice: cents(t.unitPriceCents) })),
          stock: l.stock,
        })),
      );
    }
  }, [query.data, sync]);
  return query;
}

/** False while a quantity change is still being re-priced (the shown quote is for the old quantities). */
export function quoteIsCurrent(quote: Quote | undefined, items: CartItem[]) {
  return !!quote && quote.lines.length === items.length && items.every((i) => quote.lines.find((l) => l.variantId === i.variantId)?.qty === i.qty);
}

/** Per-piece price for a cart line: the server's when it's current, else the tier estimate. */
export function linePricing(item: CartItem, line: QuoteLine | undefined) {
  const fresh = line?.qty === item.qty;
  const unit = fresh ? cents(line.unitPriceCents) : itemUnitPrice(item);
  const base = line ? cents(line.baseUnitPriceCents) : item.unitPrice;
  return { unit, base, total: fresh ? cents(line.lineTotalCents) : lineTotal(unit, item.qty), savePct: savingPct(base, unit) };
}

/** "Buy 10+ for RM1.30 each": the next cheaper tier, if there's stock to reach it. */
function nextTierHint(item: CartItem) {
  const next = item.tiers?.find((t) => t.minQty > item.qty);
  if (!next || next.minQty > item.stock) return null;
  return `Buy ${next.minQty}+ for ${formatPrice(next.unitPrice)} each`;
}

export function lineProblem(line: QuoteLine | undefined) {
  if (!line?.problem) return null;
  if (line.problem === "unavailable") return "No longer available here. Please remove it.";
  return `Only ${line.stock} left. Please lower the quantity.`;
}

export function CartPage() {
  const cart = useCart();
  const { data: quote, isError, refetch } = useCartQuote();

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <ShoppingCart className="text-muted-foreground size-10" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Your cart is empty</h1>
        <p className="text-muted-foreground mt-3">Browse NFC tags, RFID cards and readers, and add what you need.</p>
        <Button asChild className="mt-8">
          <Link to="/products">Browse products</Link>
        </Button>
      </div>
    );
  }

  const current = quoteIsCurrent(quote, cart.items);
  const canCheckout = current && !!quote?.ok;
  const subtotal = quote && current
    ? cents(quote.subtotalCents)
    : cart.items.reduce((s, i) => s + linePricing(i, quote?.lines.find((l) => l.variantId === i.variantId)).total, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Your cart</h1>
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_340px]">
        <ul className="divide-y rounded-xl border" data-testid="cart-lines">
          {cart.items.map((item) => {
            const line = quote?.lines.find((l) => l.variantId === item.variantId);
            const problem = lineProblem(line);
            const price = linePricing(item, line);
            const hint = nextTierHint(item);
            return (
              <li key={item.variantId} className="flex gap-4 p-4">
                <Link to={`/products/${item.productSlug}`} className="bg-card size-20 shrink-0 overflow-hidden rounded-lg border">
                  <ProductImage src={item.image} alt="" className="size-full" />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <Link to={`/products/${item.productSlug}`} className="line-clamp-2 text-sm font-medium hover:underline">
                        {item.productName}
                      </Link>
                      {item.variantName && <p className="text-muted-foreground mt-0.5 text-sm">{item.variantName}</p>}
                    </div>
                    <p className="shrink-0 text-sm font-semibold" data-testid="line-total">{formatPrice(price.total)}</p>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <QtyStepper size="sm" value={item.qty} max={Math.max(item.stock, 1)} onChange={(q) => cart.setQty(item.variantId, q)} />
                      <span className="text-muted-foreground text-xs" data-testid="line-unit">
                        {formatPrice(price.unit)} each
                        {price.savePct > 0 && <span className="font-medium text-emerald-700"> · save {price.savePct}%</span>}
                      </span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => cart.remove(item.variantId)} aria-label={`Remove ${item.productName}`}>
                      <Trash2 />
                      Remove
                    </Button>
                  </div>
                  {hint && !problem && <p className="text-muted-foreground text-xs">{hint}</p>}
                  {problem && <p className="text-destructive text-sm">{problem}</p>}
                </div>
              </li>
            );
          })}
        </ul>

        <aside className="h-fit rounded-xl border p-5">
          <h2 className="font-semibold">Summary</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal ({cart.count} item{cart.count === 1 ? "" : "s"})</dt>
              <dd className="font-medium" data-testid="cart-subtotal">{formatPrice(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Shipping</dt>
              <dd className="text-muted-foreground">Calculated at checkout</dd>
            </div>
          </dl>
          {isError && (
            <p className="text-destructive mt-4 text-sm">
              Couldn't check current prices.{" "}
              <button type="button" className="underline" onClick={() => refetch()}>
                Try again
              </button>
            </p>
          )}
          <Button asChild={canCheckout} size="lg" className="mt-5 w-full" disabled={!canCheckout} data-testid="go-checkout">
            {canCheckout ? <Link to="/checkout">Checkout</Link> : <span>Checkout</span>}
          </Button>
          <Link to="/products" className="text-muted-foreground hover:text-foreground mt-3 block text-center text-sm">
            Continue shopping
          </Link>
        </aside>
      </div>
    </div>
  );
}
