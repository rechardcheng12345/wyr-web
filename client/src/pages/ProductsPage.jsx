import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ErrorState } from "@/components/ErrorState";
import { ProductCard, ProductCardSkeleton, ProductGrid } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchCategories, fetchProducts } from "@/lib/api";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 24;

export function ProductsPage() {
  const [params, setParams] = useSearchParams();
  const category = params.get("category") ?? "";
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);

  // Local input state, pushed to the URL after a short pause.
  const [search, setSearch] = useState(q);
  useEffect(() => setSearch(q), [q]);
  useEffect(() => {
    if (search.trim() === q) return;
    const t = setTimeout(() => update({ q: search.trim(), page: "" }), 300);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  function update(next) {
    setParams(
      (prev) => {
        const merged = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(next)) {
          if (v) merged.set(k, v);
          else merged.delete(k);
        }
        return merged;
      },
      { replace: "q" in next },
    );
  }

  const categories = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const products = useQuery({
    queryKey: ["products", { category, q, page }],
    queryFn: () => fetchProducts({ category, q, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const activeCategory = categories.data?.find((c) => c.slug === category);
  const totalPages = products.data ? Math.max(1, Math.ceil(products.data.total / PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{activeCategory?.name ?? "All products"}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {products.data ? `${products.data.total} product${products.data.total === 1 ? "" : "s"}` : " "}
            {q && <> matching “{q}”</>}
          </p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or SKU" className="pr-9 pl-9" aria-label="Search products" />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2" aria-label="Clear search">
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
        <CategoryChip active={!category} onClick={() => update({ category: "", page: "" })}>
          All
        </CategoryChip>
        {categories.data
          ?.filter((c) => c.productCount > 0 && c.slug)
          .map((c) => (
            <CategoryChip key={c.id} active={c.slug === category} onClick={() => update({ category: c.slug, page: "" })}>
              {c.name}
            </CategoryChip>
          ))}
      </div>

      <div className={cn("mt-8 transition-opacity", products.isPlaceholderData && "opacity-60")}>
        {products.isError ? (
          <ErrorState onRetry={() => products.refetch()} />
        ) : products.isPending ? (
          <ProductGrid>
            {Array.from({ length: 8 }, (_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </ProductGrid>
        ) : products.data.items.length === 0 ? (
          <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center">
            <p className="text-foreground font-medium">No products found</p>
            <p className="mt-1 text-sm">Try a different search or category.</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setParams({})}>
              Clear filters
            </Button>
          </div>
        ) : (
          <ProductGrid>
            {products.data.items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </ProductGrid>
        )}
      </div>

      {totalPages > 1 && (
        <nav className="mt-10 flex items-center justify-center gap-3" aria-label="Pagination">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>
            <ChevronLeft /> Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => update({ page: String(page + 1) })}>
            Next <ChevronRight />
          </Button>
        </nav>
      )}
    </div>
  );
}

function CategoryChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "focus-visible:ring-ring/50 rounded-full border px-3.5 py-1.5 text-sm transition-colors outline-none focus-visible:ring-[3px]",
        active ? "bg-foreground text-background border-foreground" : "bg-card hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
