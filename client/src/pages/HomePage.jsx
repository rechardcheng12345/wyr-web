import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BadgeCheck, CreditCard, MapPin, Nfc, Radio, ScanLine, Smartphone, Star, Store, Tag, Wifi, Printer, Package } from "lucide-react";
import { Link } from "react-router-dom";
import { ErrorState } from "@/components/ErrorState";
import { ProductCard, ProductCardSkeleton, ProductGrid } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchCategories, fetchProducts } from "@/lib/api";

const CATEGORY_ICONS = {
  "nfc-tags": Nfc,
  "rfid-cards": CreditCard,
  "uhf-rfid-tags": Radio,
  "readers-writers": ScanLine,
  "review-social-nfc": Star,
  "gps-trackers": MapPin,
  "card-printers": Printer,
  "smart-home": Wifi,
  others: Package,
};

const PERKS = [
  { icon: Store, title: "Ready stock in KL", body: "Most orders ship the next working day." },
  { icon: BadgeCheck, title: "Tested chips", body: "Genuine NXP NTAG, MIFARE and Impinj inlays." },
  { icon: Smartphone, title: "Help programming", body: "Not sure which chip? We'll point you to the right one." },
];

function Hero() {
  return (
    <section className="relative overflow-hidden border-b bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
        <div>
          <p className="bg-primary/10 text-primary inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium">
            <Tag className="size-3.5" /> NFC · RFID · UHF
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-balance md:text-5xl">Tap-ready NFC & RFID hardware, shipped from Kuala Lumpur</h1>
          <p className="text-muted-foreground mt-4 max-w-md text-lg">
            NTAG stickers, access cards, readers and tap-to-review standees for shops, offices and makers.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/products">
                Shop all products <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/products?category=review-social-nfc">Review standees</Link>
            </Button>
          </div>
        </div>
        <div className="relative hidden md:block" aria-hidden>
          <div className="mx-auto grid aspect-square max-w-sm place-items-center rounded-full bg-white shadow-xl ring-1 ring-blue-100">
            <div className="grid size-3/4 place-items-center rounded-full bg-blue-50 ring-1 ring-blue-100">
              <div className="bg-primary text-primary-foreground grid size-1/2 place-items-center rounded-3xl shadow-lg">
                <Nfc className="size-1/2" strokeWidth={1.5} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Categories() {
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {isPending
        ? Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
        : data
            .filter((c) => c.productCount > 0 && c.slug)
            .map((c) => {
              const Icon = CATEGORY_ICONS[c.slug] ?? Package;
              return (
                <Link
                  key={c.id}
                  to={`/products?category=${c.slug}`}
                  className="bg-card hover:border-primary/40 focus-visible:ring-ring/50 flex items-center gap-3 rounded-xl border p-4 transition-colors outline-none focus-visible:ring-[3px]"
                >
                  <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-lg">
                    <Icon className="size-5" />
                  </span>
                  <span>
                    <span className="block text-sm leading-tight font-medium">{c.name}</span>
                    <span className="text-muted-foreground text-xs">{c.productCount} products</span>
                  </span>
                </Link>
              );
            })}
    </div>
  );
}

function Featured() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["products", { pageSize: 8 }],
    queryFn: () => fetchProducts({ pageSize: 8 }),
  });
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  return (
    <ProductGrid>
      {isPending
        ? Array.from({ length: 8 }, (_, i) => <ProductCardSkeleton key={i} />)
        : data.items.map((p) => <ProductCard key={p.id} product={p} />)}
    </ProductGrid>
  );
}

export function HomePage() {
  return (
    <>
      <Hero />
      <section className="mx-auto max-w-6xl px-4 pt-10">
        <div className="grid gap-4 sm:grid-cols-3">
          {PERKS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-3">
              <Icon className="text-primary mt-0.5 size-5 shrink-0" />
              <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-muted-foreground text-sm">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 pt-14">
        <h2 className="text-2xl font-semibold tracking-tight">Shop by category</h2>
        <div className="mt-5">
          <Categories />
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 pt-14">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-tight">Featured products</h2>
          <Link to="/products" className="text-primary text-sm font-medium hover:underline">
            View all
          </Link>
        </div>
        <div className="mt-5">
          <Featured />
        </div>
      </section>
    </>
  );
}
