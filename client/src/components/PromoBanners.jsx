import { ArrowRight, BadgePercent, PackageCheck, Truck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSiteInfo } from "@/lib/site";
import { cn } from "@/lib/utils";

const ROTATE_MS = 4500;

function rm(value) {
  return `RM${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

function useAnnouncements() {
  const site = useSiteInfo();
  const messages = [];
  const free = site.shipping?.freeThresholdRm;
  if (free != null) {
    messages.push({
      icon: Truck,
      text: (
        <>
          <strong className="font-semibold">Free shipping</strong> on orders {rm(free)} and above
        </>
      ),
      to: "/products",
      cta: "Shop now",
    });
  }
  if (site.welcomeVoucher) {
    messages.push({
      icon: BadgePercent,
      text: (
        <>
          New here? Use code <strong className="rounded bg-white/20 px-1.5 py-0.5 font-mono font-semibold tracking-wide">{site.welcomeVoucher.code}</strong> for{" "}
          {site.welcomeVoucher.description}
        </>
      ),
    });
  }
  messages.push({
    icon: PackageCheck,
    text: (
      <>
        <strong className="font-semibold">Ready stock</strong>, dispatched the next working day
        {site.shipping && site.shipping.westRm === site.shipping.eastRm && <> · flat {rm(site.shipping.westRm)} delivery</>}
      </>
    ),
  });
  return messages;
}

export function AnnouncementBar() {
  const messages = useAnnouncements();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || messages.length < 2 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % messages.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [paused, messages.length]);

  const active = index % messages.length;

  return (
    <div
      className="from-brand-orange-deep via-brand-orange to-brand-orange-deep relative bg-gradient-to-r text-white"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      data-testid="announcement-bar"
    >
      <div className="relative mx-auto grid h-9 max-w-6xl grid-cols-[minmax(0,1fr)] overflow-hidden px-4 text-xs sm:text-sm">
        {messages.map(({ icon: Icon, text, to, cta }, i) => (
          <div
            key={i}
            className={cn(
              "col-start-1 row-start-1 flex min-w-0 items-center justify-center gap-2 transition-all duration-500",
              i === active ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0",
            )}
            aria-hidden={i !== active}
          >
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{text}</span>
            {to && (
              <Link to={to} className="hidden shrink-0 items-center gap-1 font-semibold underline-offset-4 hover:underline sm:inline-flex" tabIndex={i === active ? 0 : -1}>
                {cta} <ArrowRight className="size-3.5" />
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function FreeShippingBanner() {
  const site = useSiteInfo();
  const free = site.shipping?.freeThresholdRm;
  if (free == null) return null;
  const flat = site.shipping.westRm === site.shipping.eastRm ? site.shipping.westRm : null;

  return (
    <section className="from-brand-orange to-brand-orange-deep relative overflow-hidden rounded-3xl bg-gradient-to-br text-white shadow-xl" data-testid="free-shipping-banner">
      <div
        className="absolute inset-0 opacity-15"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "20px 20px" }}
        aria-hidden
      />
      <div className="absolute -right-16 -bottom-24 size-80 rounded-full bg-white/10" aria-hidden />
      <div className="absolute top-6 right-40 size-24 rounded-full bg-white/10 max-md:hidden" aria-hidden />
      <div className="relative grid items-center gap-8 px-6 py-10 sm:px-10 md:grid-cols-[1fr_auto] md:py-12">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tracking-[0.12em] uppercase ring-1 ring-white/25">
            <Truck className="size-3.5" /> Delivery offer
          </p>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
            Free shipping on orders {rm(free)} and above
          </h2>
          <p className="mt-3 max-w-xl text-white/90">
            Anywhere in Malaysia, Sabah and Sarawak included.{flat != null && <> Below {rm(free)}, it's a flat {rm(flat)}.</>}
          </p>
          <Link
            to="/products"
            className="text-brand-orange-deep mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-white px-5 font-semibold shadow-lg transition-transform hover:-translate-y-0.5"
          >
            Start shopping <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="relative mx-auto grid size-40 place-items-center rounded-full bg-white/15 ring-1 ring-white/30 sm:size-48 max-md:hidden" aria-hidden>
          <div className="grid size-32 place-items-center rounded-full bg-white text-center shadow-2xl sm:size-36">
            <div>
              <Truck className="text-brand-orange mx-auto size-8" />
              <p className="text-brand-navy mt-1 text-2xl leading-none font-extrabold">FREE</p>
              <p className="text-brand-orange-deep mt-1 text-xs font-semibold">from {rm(free)}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
