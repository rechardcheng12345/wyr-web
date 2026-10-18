import { ExternalLink } from "lucide-react";
import type { MarketplaceLink, Platform } from "@/lib/api";
import { cn } from "@/lib/utils";

const PLATFORMS: Partial<Record<Platform, { label: string; className: string }>> = {
  shopee: { label: "Shopee", className: "text-shopee hover:bg-shopee/5" },
  lazada: { label: "Lazada", className: "text-lazada hover:bg-lazada/5" },
};

/** Secondary to the site's own checkout: links out to the same product on each marketplace. */
export function MarketplaceStrip({ links, className }: { links: MarketplaceLink[]; className?: string }) {
  const available = links.filter((l) => l.url && PLATFORMS[l.platform]);
  if (available.length === 0) return null;

  return (
    <section aria-label="Also on marketplaces" className={cn("rounded-xl border p-4", className)}>
      <p className="text-sm font-medium">Also on</p>
      <p className="text-muted-foreground mt-0.5 text-xs">Prefer your marketplace vouchers and coins? Same product, same stock.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {available.map((l) => {
          const p = PLATFORMS[l.platform]!;
          return (
            <a
              key={l.platform}
              href={l.url!}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "bg-background inline-flex h-10 items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold transition-colors",
                "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
                p.className,
              )}
            >
              {p.label}
              <ExternalLink className="size-4 opacity-80" />
            </a>
          );
        })}
      </div>
    </section>
  );
}
