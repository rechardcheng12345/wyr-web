import { useQuery } from "@tanstack/react-query";
import { ChevronRight, MessageCircle, ShoppingCart, Truck } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorState } from "@/components/ErrorState";
import { MarketplaceStrip } from "@/components/MarketplaceStrip";
import { ProductImage } from "@/components/ProductCard";
import { QtyStepper } from "@/components/QtyStepper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, fetchProduct } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { lineTotal, savingPct, tierFor } from "@/lib/pricing";
import { shippingText, usePageMeta, useSiteInfo } from "@/lib/site";
import { cn, formatPrice, formatPriceRange } from "@/lib/utils";
import { NotFoundPage } from "./NotFoundPage";

export function ProductDetailPage() {
  const { slug = "" } = useParams();
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["product", slug],
    queryFn: () => fetchProduct(slug),
  });

  if (isError) {
    if (error instanceof ApiError && error.status === 404) return <NotFoundPage />;
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <ErrorState onRetry={() => refetch()} />
      </div>
    );
  }
  if (isPending) return <DetailSkeleton />;
  // Keyed so variant/image selection resets when navigating between products.
  return <ProductView key={data.id} product={data} />;
}

export function isVariantPurchasable(v) {
  return v.tiers.length > 0 && v.stock != null && v.stock >= (v.minQty ?? 1);
}

function metaDescription(product, name) {
  const text = (product.description ?? "").replace(/\s+/g, " ").trim();
  const price = product.minPrice != null ? ` From ${formatPrice(product.minPrice)}.` : "";
  const base = `${name}.${price} Ready stock in Malaysia, ships from Kuala Lumpur.`;
  return text ? `${base} ${text}`.slice(0, 160).replace(/\s+\S*$/, "") : base;
}

function ProductView({ product }) {
  const site = useSiteInfo();
  const name = product.displayName ?? product.name;
  usePageMeta(`${name} · WYR Technology`, metaDescription(product, name));
  const galleryImages = product.images.filter((i) => i.variantId === null);
  const [variantId, setVariantId] = useState(product.variants.length === 1 ? product.variants[0].id : null);
  const [imageUrl, setImageUrl] = useState(galleryImages[0]?.url ?? product.images[0]?.url ?? null);

  const variant = product.variants.find((v) => v.id === variantId) ?? null;

  function selectVariant(v) {
    if (!isVariantPurchasable(v)) return;
    setVariantId(v.id);
    const img = product.images.find((i) => i.variantId === v.id);
    if (img) setImageUrl(img.url);
  }

  const thumbs = galleryImages.length > 0 ? galleryImages : product.images;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-muted-foreground flex items-center gap-1 text-sm" aria-label="Breadcrumb">
        <Link to="/products" className="hover:text-foreground">
          Products
        </Link>
        {product.category?.slug && (
          <>
            <ChevronRight className="size-3.5" />
            <Link to={`/products?category=${product.category.slug}`} className="hover:text-foreground">
              {product.category.name}
            </Link>
          </>
        )}
      </nav>

      <div className="mt-6 grid gap-10 md:grid-cols-2">
        <div>
          <div className="bg-card aspect-square overflow-hidden rounded-xl border">
            <ProductImage src={imageUrl} alt={name} className="size-full" />
          </div>
          {thumbs.length > 1 && (
            <div className="mt-3 grid grid-cols-5 gap-2">
              {thumbs.slice(0, 10).map((img) => (
                <button
                  key={img.url}
                  type="button"
                  onClick={() => setImageUrl(img.url)}
                  className={cn(
                    "focus-visible:ring-ring/50 aspect-square overflow-hidden rounded-lg border-2 outline-none focus-visible:ring-[3px]",
                    img.url === imageUrl ? "border-primary" : "border-transparent hover:border-border",
                  )}
                  aria-label="Show image"
                >
                  <ProductImage src={img.url} alt="" className="size-full" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-2xl leading-tight font-bold tracking-tight md:text-3xl">{name}</h1>
            <div className="mt-3 flex items-baseline gap-3">
              <VariantPrice product={product} variant={variant} />
            </div>
            {variant && <StockNote stock={variant.stock} minQty={variant.minQty} />}
            {site.shipping && (
              <p className="text-muted-foreground mt-3 flex items-center gap-2 text-sm" data-testid="shipping-note">
                <Truck className="size-4 shrink-0" />
                <span>
                  {shippingText(site.shipping)}
                  {site.shipping.freeThresholdRm != null && <> · free from {formatPrice(site.shipping.freeThresholdRm)}</>}
                </span>
              </p>
            )}
          </div>

          {product.variants.length > 1 && (
            <div>
              <p className="text-sm font-medium">
                Option{variant?.name && <span className="text-muted-foreground font-normal">: {variant.name}</span>}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {product.variants.map((v) => {
                  const soldOut = !isVariantPurchasable(v);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => selectVariant(v)}
                      aria-pressed={v.id === variantId}
                      disabled={soldOut}
                      data-testid="variant-option"
                      data-oos={soldOut ? "true" : undefined}
                      className={cn(
                        "focus-visible:ring-ring/50 rounded-lg border px-3 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-[3px]",
                        v.id === variantId ? "border-primary bg-primary/5 text-primary font-medium" : "hover:bg-accent",
                        soldOut && "bg-muted/60 text-muted-foreground cursor-not-allowed border-dashed line-through decoration-1 hover:bg-muted/60",
                      )}
                    >
                      {v.name ?? v.sku}
                      {soldOut && <span className="block text-[11px] font-medium no-underline">Out of stock</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <AddToCart key={variant?.id ?? "none"} product={product} variant={variant} image={imageUrl} />

          {product.description && (
            <section className="border-t pt-6">
              <h2 className="text-lg font-semibold">Description</h2>
              <div className="text-muted-foreground mt-3 text-sm leading-relaxed whitespace-pre-line">{product.description}</div>
            </section>
          )}

          <MarketplaceStrip links={product.marketplaces} welcomeVoucher={site.welcomeVoucher} />
        </div>
      </div>
    </div>
  );
}

function AddToCart({ product, variant, image }) {
  const cart = useCart();
  const minQty = variant?.minQty ?? 1;
  const [qty, setQty] = useState(minQty);
  const [added, setAdded] = useState(null);

  const inCart = variant ? (cart.items.find((i) => i.variantId === variant.id)?.qty ?? 0) : 0;
  const tiers = variant?.tiers ?? [];
  const basePrice = tiers[0]?.unitPrice ?? null;
  // stock null = no stock data yet, so it can't be sold here (only on the marketplaces).
  const minAdd = Math.max(1, minQty - inCart);
  const room = Math.max(0, (variant?.stock ?? 0) - inCart);
  const canAdd = room >= minAdd ? room : 0;
  const purchasable = variant != null && isVariantPurchasable(variant);
  const clampedQty = Math.max(minAdd, Math.min(qty, Math.max(canAdd, minAdd)));
  // Tiers go by the line's total quantity, so price what this cart line will become.
  const lineQty = inCart + clampedQty;
  const unit = tierFor(tiers, lineQty)?.unitPrice ?? basePrice ?? 0;
  const savePct = basePrice != null ? savingPct(basePrice, unit) : 0;
  const nextTier = tiers.find((t) => t.minQty > lineQty && t.minQty - inCart <= canAdd);

  function onAdd() {
    if (!variant || basePrice == null) return;
    const n = cart.add(
      {
        variantId: variant.id,
        productSlug: product.slug,
        productName: product.name,
        variantName: variant.name,
        sku: variant.sku,
        image,
        unitPrice: basePrice,
        tiers,
        stock: variant.stock ?? 0,
        minQty,
      },
      clampedQty,
    );
    setAdded(n);
    setQty(minQty);
  }

  if (!variant) {
    return <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">Choose an option to add it to your cart.</p>;
  }

  const tierTable = tiers.length > 1 && <TierTable tiers={tiers} activeQty={purchasable ? lineQty : null} product={product} variant={variant} />;
  if (!purchasable) return tierTable || null;

  return (
    <div className="flex flex-col gap-4">
      {variant.quickQtys.length > 0 && (
        <div>
          <p className="text-sm font-medium">Quantity (pieces)</p>
          <div className="mt-2 flex flex-wrap gap-2" data-testid="quick-qtys">
            {[1, ...variant.quickQtys]
              .filter((q) => q >= minAdd)
              .map((q) => {
                const tierUnit = tierFor(tiers, inCart + q)?.unitPrice ?? basePrice;
                const pct = basePrice != null ? savingPct(basePrice, tierUnit) : 0;
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQty(q)}
                    disabled={q > canAdd}
                    aria-pressed={clampedQty === q}
                    data-testid={`quick-${q}`}
                    className={cn(
                      "focus-visible:ring-ring/50 min-w-16 rounded-lg border px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-[3px] disabled:opacity-40",
                      clampedQty === q ? "border-primary bg-primary/5 text-primary font-medium" : "hover:bg-accent",
                    )}
                  >
                    {q} pc{q === 1 ? "" : "s"}
                    {pct > 0 && (
                      <span className="block text-[11px] font-medium text-emerald-700" data-testid="quick-saving">
                        {formatPrice(tierUnit)}/pc · Save {pct}%
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        </div>
      )}
      {minQty > 1 && (
        <p className="text-muted-foreground -mt-2 text-xs" data-testid="min-qty-note">
          Min. {minQty} pcs
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <QtyStepper value={clampedQty} min={minAdd} max={Math.max(canAdd, minAdd)} onChange={setQty} disabled={canAdd === 0} />
        <Button size="lg" className="flex-1" onClick={onAdd} disabled={canAdd === 0} data-testid="add-to-cart">
          <ShoppingCart />
          Add to cart
        </Button>
      </div>

      {canAdd > 0 && (
        <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg px-4 py-3 text-sm" data-testid="live-price">
          <span>
            <span className="font-semibold">{formatPrice(unit)}</span>
            <span className="text-muted-foreground"> / pc × {clampedQty}</span>
            {savePct > 0 && <span className="ml-2 font-medium text-emerald-700">You save {savePct}%</span>}
          </span>
          <span>
            Total <span className="font-semibold">{formatPrice(lineTotal(unit, clampedQty))}</span>
          </span>
          {nextTier && basePrice != null && (
            <button
              type="button"
              className="text-primary w-full text-left text-sm font-medium underline-offset-4 hover:underline"
              onClick={() => setQty(nextTier.minQty - inCart)}
              data-testid="next-tier"
            >
              Buy {nextTier.minQty}, save {savingPct(basePrice, nextTier.unitPrice)}%
            </button>
          )}
          {inCart > 0 && tiers.length > 1 && (
            <span className="text-muted-foreground w-full text-xs">Priced together with the {inCart} already in your cart.</span>
          )}
        </div>
      )}

      {lineQty >= product.bulkQuote.minQty && <BulkQuoteLink product={product} variant={variant} qty={lineQty} prominent />}

      {tierTable}

      {canAdd === 0 && <p className="text-muted-foreground text-sm">You already have all {inCart} available in your cart.</p>}
      {added !== null && added > 0 && (
        <p className="text-sm text-emerald-700" role="status">
          Added {added} to your cart.{" "}
          <Link to="/cart" className="font-medium underline underline-offset-4">
            View cart ({cart.count})
          </Link>
        </p>
      )}
    </div>
  );
}

function TierTable({ tiers, activeQty, product, variant }) {
  const base = tiers[0].unitPrice;
  const active = activeQty != null ? tierFor(tiers, activeQty) : null;
  return (
    <div className="overflow-hidden rounded-lg border text-sm" data-testid="tier-table">
      <table className="w-full">
        <thead className="bg-muted/40 text-muted-foreground text-left text-xs">
          <tr>
            <th className="px-4 py-2 font-medium">Quantity</th>
            <th className="px-4 py-2 font-medium">Price per piece</th>
            <th className="px-4 py-2 text-right font-medium">You save</th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((t, i) => {
            const upTo = tiers[i + 1]?.minQty;
            return (
              <tr key={t.minQty} className={cn("border-t", t === active && "bg-primary/5 font-medium")}>
                <td className="px-4 py-2">{upTo == null ? `${t.minQty}+` : upTo - 1 === t.minQty ? t.minQty : `${t.minQty}–${upTo - 1}`}</td>
                <td className="px-4 py-2">{formatPrice(t.unitPrice)}</td>
                <td className="px-4 py-2 text-right text-emerald-700">{i === 0 ? "" : `${savingPct(base, t.unitPrice)}%`}</td>
              </tr>
            );
          })}
          {tiers[tiers.length - 1].minQty < product.bulkQuote.minQty && (
            <tr className="border-t">
              <td className="px-4 py-2">{product.bulkQuote.minQty}+</td>
              <td className="px-4 py-2" colSpan={2}>
                <BulkQuoteLink product={product} variant={variant} qty={product.bulkQuote.minQty} />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function BulkQuoteLink({ product, variant, qty, prominent }) {
  const { whatsappNumber } = product.bulkQuote;
  const label = "Bulk / business quote";
  if (!whatsappNumber) return prominent ? null : <span className="text-muted-foreground">{label}: contact us</span>;
  const text = `Hi WYR, I'd like a bulk quote for ${qty}+ pcs of ${product.name} (${variant.name ? `${variant.name}, ` : ""}SKU ${variant.sku}).`;
  const href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`;
  if (!prominent) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="text-primary font-medium underline-offset-4 hover:underline">
        {label} on WhatsApp
      </a>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 hover:bg-emerald-100"
      data-testid="bulk-quote"
    >
      <MessageCircle className="size-5 shrink-0" />
      <span>
        <span className="font-semibold">Buying {product.bulkQuote.minQty} or more?</span> Get a {label.toLowerCase()} on WhatsApp.
      </span>
    </a>
  );
}

function VariantPrice({ product, variant }) {
  if (!variant) {
    return <span className="text-2xl font-semibold">{formatPriceRange(product.minPrice, product.maxPrice)}</span>;
  }
  const onSale = variant.specialPrice != null && variant.price != null && variant.specialPrice < variant.price;
  const perPiece = variant.quickQtys.length > 0 || variant.tiers.length > 1;
  const lowest = variant.tiers.at(-1);
  return (
    <>
      <span className="text-2xl font-semibold">
        {formatPrice(onSale ? variant.specialPrice : variant.price)}
        {perPiece && <span className="text-muted-foreground text-base font-normal"> / pc</span>}
      </span>
      {onSale && <span className="text-muted-foreground text-base line-through">{formatPrice(variant.price)}</span>}
      {variant.tiers.length > 1 && lowest && (
        <span className="text-sm font-medium text-emerald-700">
          as low as {formatPrice(lowest.unitPrice)} / pc for {lowest.minQty}+
        </span>
      )}
    </>
  );
}

function StockNote({ stock, minQty = 1 }) {
  if (stock == null) return null;
  if (stock < minQty) return <Badge variant="muted" className="mt-3">Out of stock here, check the marketplaces</Badge>;
  return <Badge variant="success" className="mt-3">{stock < 10 ? `Only ${stock} left` : "In stock"}</Badge>;
}

function DetailSkeleton() {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-2">
      <Skeleton className="aspect-square rounded-xl" />
      <div className="space-y-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    </div>
  );
}
