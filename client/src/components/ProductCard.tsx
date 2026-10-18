import { ImageOff } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProductSummary } from "@/lib/api";
import { formatPrice } from "@/lib/utils";

export function ProductImage({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  if (!src) {
    return (
      <div className={`bg-muted text-muted-foreground grid place-items-center ${className ?? ""}`}>
        <ImageOff className="size-8" />
      </div>
    );
  }
  // Shopee CDN images; no-referrer avoids hotlink checks.
  return <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" className={`object-cover ${className ?? ""}`} />;
}

export function ProductCard({ product }: { product: ProductSummary }) {
  const { slug, name, image, minPrice, maxPrice, inStock, category, variantCount } = product;
  return (
    <Link to={`/products/${slug}`} className="group focus-visible:outline-none">
      <Card className="h-full overflow-hidden transition-shadow group-hover:shadow-md group-focus-visible:ring-ring/50 group-focus-visible:ring-[3px]">
        <div className="relative aspect-square overflow-hidden">
          <ProductImage src={image} alt={name} className="size-full transition-transform duration-300 group-hover:scale-[1.03]" />
          {!inStock && (
            <Badge variant="muted" className="absolute top-2 left-2 bg-white/90">
              Check marketplace
            </Badge>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1.5 p-3">
          {category?.name && <p className="text-muted-foreground text-xs">{category.name}</p>}
          <h3 className="line-clamp-2 text-sm leading-snug font-medium">{name}</h3>
          <p className="mt-auto pt-1 text-base font-semibold">
            {maxPrice != null && minPrice != null && maxPrice > minPrice && <span className="text-muted-foreground text-xs font-normal">from </span>}
            {formatPrice(minPrice)}
            {variantCount > 1 && <span className="text-muted-foreground ml-1.5 text-xs font-normal">· {variantCount} options</span>}
          </p>
        </div>
      </Card>
    </Link>
  );
}

export function ProductCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="aspect-square rounded-none" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-5 w-1/4" />
      </div>
    </Card>
  );
}

export function ProductGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{children}</div>;
}
