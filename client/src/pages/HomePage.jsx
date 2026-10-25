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
import { Skeleton } from "@/components/ui/skeleton";
import { fetchCategories, fetchProducts } from "@/lib/api";
import { useSiteInfo, whatsappLink } from "@/lib/site";
import { cn } from "@/lib/utils";

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
  { icon: Truck, title: "Ships nationwide", body: "Flat-rate shipping to Peninsular and East Malaysia." },
];

function useFeatured() {
  return useQuery({
    queryKey: ["products", { pageSize: 8 }],
    queryFn: () => fetchProducts({ pageSize: 8 }),
  });
}

function HeroCollage() {
  const { data } = useFeatured();
  const images = (data?.items ?? []).filter((p) => p.image).slice(0, 4);
  const tiles = images.length === 4 ? images : Array.from({ length: 4 }, () => null);

  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden>
      <div className="bg-brand-orange/30 absolute -top-10 -right-6 size-48 rounded-full blur-3xl" />
      <div className="bg-brand-blue/40 absolute -bottom-10 -left-6 size-56 rounded-full blur-3xl" />
      <div className="relative grid grid-cols-2 gap-4">
        {tiles.map((p, i) => (
          <div
            key={p?.id ?? i}
            className={cn(
              "overflow-hidden rounded-2xl bg-white/10 shadow-2xl ring-1 ring-white/15",
              i % 2 === 1 && "translate-y-8",
            )}
          >
            {p ? (
              <img src={p.image} alt="" referrerPolicy="no-referrer" className="aspect-square w-full object-cover" />
            ) : (
              <div className="aspect-square w-full animate-pulse bg-white/10" />
            )}
          </div>
        ))}
      </div>
      <div className="text-foreground absolute -bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-xl">
        <span className="bg-brand-orange grid size-7 place-items-center rounded-full text-white">
          <Nfc className="size-4" />
        </span>
        Tap. Done.
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
            Tap-ready <span className="text-brand-orange">NFC & RFID</span> hardware, shipped from Kuala Lumpur
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
        <div className="hidden lg:block">
          <HeroCollage />
        </div>
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

function UseCases() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {USE_CASES.map(({ icon: Icon, title, body, to }) => (
        <Link
          key={title}
          to={to}
          className="group bg-card focus-visible:ring-ring/50 relative flex flex-col overflow-hidden rounded-2xl border p-6 transition-shadow outline-none hover:shadow-lg focus-visible:ring-[3px]"
        >
          <div className="from-brand-blue to-brand-orange absolute inset-x-0 top-0 h-1 bg-gradient-to-r opacity-0 transition-opacity group-hover:opacity-100" />
          <Icon className="text-primary size-8" strokeWidth={1.5} />
          <h3 className="mt-5 font-semibold">{title}</h3>
          <p className="text-muted-foreground mt-2 flex-1 text-sm leading-relaxed">{body}</p>
          <span className="text-primary mt-5 inline-flex items-center gap-1 text-sm font-semibold">
            Browse <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      ))}
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

function Perks() {
  return (
    <div className="bg-muted/50 grid gap-px overflow-hidden rounded-2xl border sm:grid-cols-2 lg:grid-cols-4">
      {PERKS.map(({ icon: Icon, title, body }) => (
        <div key={title} className="bg-card p-6">
          <span className="bg-brand-orange/10 text-brand-orange-deep grid size-10 place-items-center rounded-lg">
            <Icon className="size-5" />
          </span>
          <p className="mt-4 font-semibold">{title}</p>
          <p className="text-muted-foreground mt-1 text-sm">{body}</p>
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
        <SectionHeading eyebrow="Categories" title="Shop by category" />
        <div className="mt-8">
          <Categories />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-20">
        <SectionHeading eyebrow="Solutions" title="What customers use our tags for" />
        <div className="mt-8">
          <UseCases />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-20">
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

      <section className="mx-auto max-w-6xl px-4 pt-20">
        <SectionHeading eyebrow="Why WYR" title="Local stock, real support" />
        <div className="mt-8">
          <Perks />
        </div>
      </section>

      <BulkCta whatsapp={whatsapp} minQty={site.bulkQuoteMinQty} />
    </>
  );
}
