import { AlertTriangle, Boxes, Clock, ImageOff, Lock, Pencil, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DataTable } from "../components/DataTable";
import { Select } from "../components/FormField";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { formatNumber } from "../format";
import { listStock } from "../services/inventoryService";

function ProductCell({ row }) {
  return (
    <div className="flex items-center gap-3">
      {row.image ? (
        <img src={row.image} alt="" referrerPolicy="no-referrer" className="size-10 shrink-0 rounded-md border object-cover" />
      ) : (
        <div className="bg-muted text-muted-foreground grid size-10 shrink-0 place-items-center rounded-md">
          <ImageOff className="size-4" />
        </div>
      )}
      <div className="min-w-0">
        <p className="line-clamp-1 font-medium">{row.productName}</p>
        <p className="text-muted-foreground truncate text-xs">
          {[row.variantName, `SKU ${row.sku}`].filter(Boolean).join(" · ")}
          {!row.productActive && <span className="ml-1.5 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-600">Hidden</span>}
        </p>
      </div>
    </div>
  );
}

const editAction = {
  key: "actions",
  header: "",
  align: "right",
  render: (r) => (
    <Button variant="ghost" size="icon" asChild>
      <Link to={`/system/products/${r.productId}`} aria-label="Edit product" title="Edit product">
        <Pencil />
      </Link>
    </Button>
  ),
};

export function InventoryPage() {
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [outOnly, setOutOnly] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      setRows(await listStock());
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const categories = useMemo(() => {
    const map = new Map();
    for (const r of rows) if (r.category) map.set(r.category.id, r.category.name);
    return [...map].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!q || r.productName.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q) || r.variantName?.toLowerCase().includes(q)) &&
        (!categoryId || String(r.category?.id) === categoryId) &&
        (!outOnly || r.sellable === 0),
    );
  }, [rows, search, categoryId, outOnly]);

  const lockedRows = useMemo(() => filtered.filter((r) => r.lockedToShip > 0).sort((a, b) => b.lockedToShip - a.lockedToShip), [filtered]);

  const totals = useMemo(() => {
    const orders = new Set();
    let onShelf = 0;
    let locked = 0;
    let held = 0;
    let out = 0;
    for (const r of rows) {
      onShelf += r.onShelf;
      locked += r.lockedToShip;
      held += r.reserved;
      if (r.sellable === 0) out++;
      for (const o of r.lockedOrders) orders.add(o.orderNo);
    }
    return { onShelf, locked, held, out, lockedSkus: rows.filter((r) => r.lockedToShip > 0).length, orders: orders.size };
  }, [rows]);

  const stockColumns = [
    { key: "product", header: "Product", className: "min-w-64 max-w-sm", render: (r) => <ProductCell row={r} /> },
    { key: "onShelf", header: "On shelf", align: "right", render: (r) => formatNumber(r.onShelf) },
    {
      key: "lockedToShip",
      header: "Locked (to ship)",
      align: "right",
      render: (r) => (r.lockedToShip ? <span className="font-semibold text-amber-700">{formatNumber(r.lockedToShip)}</span> : <span className="text-muted-foreground">0</span>),
    },
    {
      key: "reserved",
      header: "Held (unpaid)",
      align: "right",
      render: (r) => (r.reserved ? formatNumber(r.reserved) : <span className="text-muted-foreground">0</span>),
    },
    {
      key: "sellable",
      header: "Sellable on shop",
      align: "right",
      render: (r) =>
        r.sellable === 0 ? (
          <span className="inline-flex items-center gap-1 font-semibold text-red-700">
            <AlertTriangle className="size-3.5" />0
          </span>
        ) : (
          <span className="font-medium">{formatNumber(r.sellable)}</span>
        ),
    },
    editAction,
  ];

  const lockedColumns = [
    { key: "product", header: "Product", className: "min-w-64 max-w-sm", render: (r) => <ProductCell row={r} /> },
    {
      key: "lockedToShip",
      header: "Locked qty",
      align: "right",
      render: (r) => <span className="text-base font-bold text-amber-700 tabular-nums">{formatNumber(r.lockedToShip)}</span>,
    },
    {
      key: "orders",
      header: "Waiting in orders",
      className: "min-w-56",
      render: (r) => (
        <div className="flex flex-wrap gap-1.5">
          {r.lockedOrders.map((o) => (
            <Link
              key={o.orderNo}
              to="/system/orders/pending"
              className="rounded-md border bg-amber-50 px-2 py-0.5 font-mono text-xs text-amber-900 hover:border-amber-300"
              title={o.paidAt ? `Paid ${new Date(o.paidAt).toLocaleString("en-MY")}` : undefined}
            >
              {o.orderNo} <span className="font-sans font-semibold">×{o.qty}</span>
            </Link>
          ))}
        </div>
      ),
    },
    { key: "onShelf", header: "On shelf now", align: "right", render: (r) => formatNumber(r.onShelf) },
    { key: "available", header: "Left after shipping", align: "right", render: (r) => <span className={cn("font-medium", r.available <= 0 && "text-red-700")}>{formatNumber(r.available)}</span> },
    editAction,
  ];

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Live stock for every product variant. Edit stock levels on the product's page."
        actions={
          <Button variant="outline" onClick={load} disabled={isLoading}>
            <RefreshCw className={cn(isLoading && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pieces on shelf" icon={Boxes} value={formatNumber(totals.onShelf)} hint={`${rows.length} SKUs`} />
        <StatCard label="Locked for orders to ship" icon={Lock} value={formatNumber(totals.locked)} hint={`${totals.lockedSkus} SKUs · ${totals.orders} order${totals.orders === 1 ? "" : "s"}`} />
        <StatCard label="Held by unpaid orders" icon={Clock} value={formatNumber(totals.held)} hint="Released if not paid in 30 min" />
        <StatCard label="Out of stock on shop" icon={AlertTriangle} value={formatNumber(totals.out)} hint="SKUs with 0 sellable" />
      </div>

      <div className="mb-4 flex gap-1 border-b">
        {[
          { key: "all", label: "All stock", count: null },
          { key: "locked", label: "Locked for orders", count: totals.lockedSkus },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              tab === t.key ? "border-primary text-foreground" : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {t.label}
            {t.count > 0 && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 tabular-nums">{t.count}</span>}
          </button>
        ))}
      </div>

      {error && <p className="text-destructive mb-4 rounded-md bg-red-50 px-3 py-2 text-sm">Could not load stock: {error}</p>}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input placeholder="Search product or SKU" value={search} onChange={(e) => setSearch(e.target.value)} className="bg-white pl-9" />
        </div>
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="bg-white sm:w-56">
          <option value="">All categories</option>
          {categories.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
        {tab === "all" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={outOnly} onChange={(e) => setOutOnly(e.target.checked)} className="accent-primary size-4" />
            Out of stock only
          </label>
        )}
      </div>

      {tab === "all" ? (
        <DataTable columns={stockColumns} rows={filtered} rowKey={(r) => r.variantId} isLoading={isLoading} rowClassName={(r) => (r.sellable === 0 ? "bg-red-50/50" : undefined)} />
      ) : (
        <>
          <p className="text-muted-foreground mb-3 text-sm">
            Stock in paid orders that haven't shipped yet. These pieces are still on your shelf but already sold, so they no longer count as available. They leave the
            list when you mark the order shipped.
          </p>
          <DataTable
            columns={lockedColumns}
            rows={lockedRows}
            rowKey={(r) => r.variantId}
            isLoading={isLoading}
            emptyMessage="No stock is locked: every paid order has shipped."
          />
        </>
      )}
    </>
  );
}
