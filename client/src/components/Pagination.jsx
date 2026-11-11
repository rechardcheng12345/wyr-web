import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export const PAGE_SIZES = [10, 25, 50, 100];

export function usePagination(rows, { defaultPageSize = 25 } = {}) {
  const [pageSize, setPageSizeState] = useState(defaultPageSize);
  const [requestedPage, setPage] = useState(1);
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, requestedPage), pageCount);
  const pageRows = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [rows, page, pageSize]);
  const setPageSize = (size) => {
    setPageSizeState(size);
    setPage(1);
  };
  return { pageRows, page, pageSize, pageCount, total, setPage, setPageSize };
}

function pageList(page, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (page >= pageCount - 2) [pageCount - 3, pageCount - 2, pageCount - 1].forEach((p) => pages.add(p));
  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const out = [];
  for (const p of sorted) {
    if (out.length && p - out[out.length - 1] > 1) out.push(`gap-${p}`);
    out.push(p);
  }
  return out;
}

const btn =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md border bg-white px-2 text-sm tabular-nums transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4";

export function Pagination({ page, pageSize, pageCount, total, setPage, setPageSize, pageSizes = PAGE_SIZES, label = "Rows", className }) {
  if (total === 0) return null;
  const sizes = pageSizes.includes(pageSize) ? pageSizes : [...pageSizes, pageSize].sort((a, b) => a - b);
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className={cn("flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between", className)} data-testid="pagination">
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2">
          {label} per page
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            aria-label={`${label} per page`}
            className="border-input text-foreground h-8 rounded-md border bg-white px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          >
            {sizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <span className="tabular-nums" data-testid="pagination-range">
          {from}–{to} of {total}
        </span>
      </div>
      {pageCount > 1 && (
        <nav className="flex flex-wrap items-center gap-1" aria-label="Pagination">
          <button type="button" className={btn} onClick={() => setPage(1)} disabled={page === 1} aria-label="First page">
            <ChevronsLeft />
          </button>
          <button type="button" className={btn} onClick={() => setPage(page - 1)} disabled={page === 1} aria-label="Previous page">
            <ChevronLeft />
          </button>
          {pageList(page, pageCount).map((p) =>
            typeof p === "number" ? (
              <button
                key={p}
                type="button"
                className={cn(btn, p === page && "border-primary bg-primary text-primary-foreground hover:bg-primary font-semibold")}
                onClick={() => setPage(p)}
                aria-label={`Page ${p}`}
                aria-current={p === page ? "page" : undefined}
              >
                {p}
              </button>
            ) : (
              <span key={p} className="text-muted-foreground px-1" aria-hidden="true">
                …
              </span>
            ),
          )}
          <button type="button" className={btn} onClick={() => setPage(page + 1)} disabled={page === pageCount} aria-label="Next page">
            <ChevronRight />
          </button>
          <button type="button" className={btn} onClick={() => setPage(pageCount)} disabled={page === pageCount} aria-label="Last page">
            <ChevronsRight />
          </button>
        </nav>
      )}
    </div>
  );
}
