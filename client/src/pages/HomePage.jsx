import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarHeart,
  CheckCircle2,
  CreditCard,
  MapPin,
  MessageCircle,
  Nfc,
  Package,
  Printer,
  Radio,
  ScanLine,
  Smartphone,
  Star,
  Store,
  Truck,
  UtensilsCrossed,
  Warehouse,
  Wifi,
} from "lucide-react";
import { Link } from "react-router-dom";
import { ErrorState } from "@/components/ErrorState";
import { ProductCard, ProductCardSkeleton, ProductGrid } from "@/components/ProductCard";
import { FreeShippingBanner } from "@/components/PromoBanners";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchCategories, fetchProducts } from "@/lib/api";
import { useSiteInfo, whatsappLink } from "@/lib/site";

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

const USE_CASES = [
  {
    icon: UtensilsCrossed,
    title: "Restaurants & retail",
    body: "Tap-to-review standees that send customers straight to your Google review page.",
    to: "/products?category=review-social-nfc",
  },
  {
    icon: Building2,
    title: "Offices & condos",
    body: "RFID access cards and key fobs for doors, lifts, lockers and attendance.",
    to: "/products?category=rfid-cards",
  },
  {
    icon: CalendarHeart,
    title: "Events & marketing",
    body: "NFC stickers and cards that open a link, menu, Wi-Fi login or social profile.",
    to: "/products?category=nfc-tags",
  },
  {
    icon: Warehouse,
    title: "Warehouses & assets",
    body: "UHF RFID labels and readers for stock counts and asset tracking.",
    to: "/products?category=uhf-rfid-tags",
  },
];

const PERKS = [
  { icon: Store, title: "Ready stock in KL", body: "Most orders ship the next working day." },
  { icon: BadgeCheck, title: "Tested chips", body: "Genuine NXP NTAG, MIFARE and Impinj inlays." },
  { icon: Smartphone, title: "Help programming", body: "Not sure which chip? We'll point you to the right one." },
  { icon: Truck, title: "Ships nationwide", body: "One flat shipping rate anywhere in Malaysia, Sabah and Sarawak included." },
];

function useFeatured() {
  return useQuery({
    queryKey: ["products", { pageSize: 8 }],
    queryFn: () => fetchProducts({ pageSize: 8 }),
  });
}

function ShopByNeed() {
  return (
    <div className="relative">
      <div className="bg-brand-orange/25 absolute -top-12 -right-10 size-56 rounded-full blur-3xl" aria-hidden />
      <div className="bg-brand-blue/40 absolute -bottom-12 -left-10 size-56 rounded-full blur-3xl" aria-hidden />
      <div className="relative">
        <p className="text-xs font-semibold tracking-[0.14em] text-slate-300 uppercase">Shop by need</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
          {USE_CASES.map(({ icon: Icon, title, body, to }) => (
            <Link
              key={title}
              to={to}
              className="group hover:ring-brand-orange/60 focus-visible:ring-brand-orange flex flex-col rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/15 backdrop-blur-sm transition-all outline-none hover:-translate-y-0.5 hover:bg-white/10 focus-visible:ring-2 sm:p-5"
            >
              <span className="bg-brand-orange/15 text-brand-orange group-hover:bg-brand-orange grid size-10 place-items-center rounded-xl transition-colors group-hover:text-white">
                <Icon className="size-5" />
              </span>
              <span className="mt-4 font-semibold leading-snug">{title}</span>
              <span className="mt-1.5 hidden flex-1 text-sm leading-relaxed text-slate-300 sm:block">{body}</span>
              <span className="text-brand-orange mt-3 inline-flex items-center gap-1 text-sm font-semibold">
                Browse <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function Hero({ whatsapp }) {
  return (
    <section className="bg-brand-navy relative overflow-hidden text-white">
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "24px 24px" }}
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 py-16 md:py-24 lg:grid-cols-2">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/15">
            <span className="bg-brand-orange size-1.5 rounded-full" />
            NFC · RFID · UHF supplier in Malaysia
          </p>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-balance sm:text-5xl lg:text-[3.4rem] lg:leading-[1.08]">
            Tap-ready <span className="text-brand-orange">NFC & RFID</span> hardware, shipped across Malaysia
          </h1>
          <p className="mt-5 max-w-lg text-lg text-slate-300">
            NTAG stickers, access cards, readers and tap-to-review standees for shops, offices and makers.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/products"
              className="bg-brand-orange hover:bg-brand-orange-deep inline-flex h-12 items-center gap-2 rounded-lg px-6 font-semibold text-white shadow-lg transition-colors"
            >
              Shop all products <ArrowRight className="size-4" />
            </Link>
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-12 items-center gap-2 rounded-lg px-6 font-semibold text-white ring-1 ring-white/30 transition-colors hover:bg-white/10"
              >
                <MessageCircle className="size-4" /> Get a bulk quote
              </a>
            )}
          </div>
          <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-300">
            {["Ready stock in KL", "Next working day dispatch", "Genuine NXP chips"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <CheckCircle2 className="text-brand-orange size-4" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <ShopByNeed />
      </div>
    </section>
  );
}

function SectionHeading({ eyebrow, title, action }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <p className="text-brand-orange-deep text-xs font-semibold tracking-[0.14em] uppercase">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function Categories() {
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {isPending
        ? Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        : data
            .filter((c) => c.productCount > 0 && c.slug)
            .map((c) => {
              const Icon = CATEGORY_ICONS[c.slug] ?? Package;
              return (
                <Link
                  key={c.id}
                  to={`/products?category=${c.slug}`}
                  className="group bg-card hover:border-brand-orange/50 focus-visible:ring-ring/50 flex flex-col justify-between gap-4 rounded-xl border p-4 transition-all outline-none hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-[3px]"
                >
                  <span className="bg-primary/10 text-primary group-hover:bg-brand-orange grid size-11 place-items-center rounded-lg transition-colors group-hover:text-white">
                    <Icon className="size-5" />
                  </span>
                  <span>
                    <span className="block text-sm leading-tight font-semibold">{c.name}</span>
                    <span className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                      {c.productCount} products
                      <ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                    </span>
                  </span>
                </Link>
              );
            })}
    </div>
  );
}

function Featured() {
  const { data, isPending, isError, refetch } = useFeatured();
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  return (
    <ProductGrid>
      {isPending
        ? Array.from({ length: 8 }, (_, i) => <ProductCardSkeleton key={i} />)
        : data.items.map((p) => <ProductCard key={p.id} product={p} />)}
    </ProductGrid>
  );
}

function Perks({ freeThresholdRm }) {
  return (
    <div className="bg-muted/50 grid gap-px overflow-hidden rounded-2xl border sm:grid-cols-2 lg:grid-cols-4">
      {PERKS.map(({ icon: Icon, title, body }) => (
        <div key={title} className="bg-card p-6">
          <span className="bg-brand-orange/10 text-brand-orange-deep grid size-10 place-items-center rounded-lg">
            <Icon className="size-5" />
          </span>
          <p className="mt-4 font-semibold">{title}</p>
          <p className="text-muted-foreground mt-1 text-sm">
            {body}
            {Icon === Truck && freeThresholdRm != null && ` Free shipping from RM${freeThresholdRm}.`}
          </p>
        </div>
      ))}
    </div>
  );
}

function BulkCta({ whatsapp, minQty }) {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-20">
      <div className="from-brand-blue to-brand-navy relative overflow-hidden rounded-3xl bg-gradient-to-br px-6 py-12 text-white sm:px-12">
        <div className="bg-brand-orange/40 absolute -top-16 -right-16 size-64 rounded-full blur-3xl" />
        <div className="relative flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Buying {minQty}+ pieces for your business?</h2>
            <p className="mt-3 text-slate-200">
              Tell us the chip, quantity and any printing or encoding you need. We'll reply with bulk pricing and lead time.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noreferrer"
                className="bg-brand-orange hover:bg-brand-orange-deep inline-flex h-12 items-center gap-2 rounded-lg px-6 font-semibold text-white shadow-lg transition-colors"
              >
                <MessageCircle className="size-4" /> WhatsApp us
              </a>
            )}
            <Link to="/contact" className="inline-flex h-12 items-center rounded-lg px-6 font-semibold ring-1 ring-white/40 transition-colors hover:bg-white/10">
              Other ways to reach us
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function HomePage() {
  const site = useSiteInfo();
  const whatsapp = whatsappLink(site.whatsappNumber, "Hi WYR Technology, I'd like a bulk quote for: ");

  return (
    <>
      <Hero whatsapp={whatsapp} />

      <section className="mx-auto max-w-6xl px-4 pt-16">
        <SectionHeading
          eyebrow="Featured"
          title="Popular products"
          action={
            <Link to="/products" className="text-primary inline-flex items-center gap-1 text-sm font-semibold hover:underline">
              View all <ArrowRight className="size-4" />
            </Link>
          }
        />
        <div className="mt-8">
          <Featured />
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 pt-16">
        <FreeShippingBanner />
      </div>

      <section className="mx-auto max-w-6xl px-4 pt-20">
        <SectionHeading eyebrow="Categories" title="Shop by category" />
        <div className="mt-8">
          <Categories />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-20">
        <SectionHeading eyebrow="Why WYR" title="Local stock, real support" />
        <div className="mt-8">
          <Perks freeThresholdRm={site.shipping?.freeThresholdRm} />
        </div>
      </section>

      <BulkCta whatsapp={whatsapp} minQty={site.bulkQuoteMinQty} />
    </>
  );
}
