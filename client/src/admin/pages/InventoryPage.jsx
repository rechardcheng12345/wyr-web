import { AlertTriangle, ArrowDown, ArrowUp, Boxes, CheckCircle2, Clock, Download, History, ImageOff, Lock, Pencil, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Pagination, usePagination } from "@/components/Pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DataTable } from "../components/DataTable";
import { Select } from "../components/FormField";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { SkuMappingTab } from "../components/SkuMappingTab";
import { formatNumber } from "../format";
import { listMovements, loadInventory } from "../services/inventoryService";

const CHANNELS = [
  { key: "website", label: "Website" },
  { key: "shopee", label: "Shopee" },
  { key: "lazada", label: "Lazada" },
  { key: "tiktok", label: "TikTok" },
];

const SYNC_BADGES = {
  ok: { label: "In sync", className: "bg-emerald-50 text-emerald-800" },
  stale: { label: "Stale", className: "bg-amber-100 text-amber-900" },
  never: { label: "Never synced", className: "bg-slate-100 text-slate-700" },
  untracked: { label: "No stock record", className: "bg-red-100 text-red-800" },
};

const REASONS = {
  sale: "Website order",
  marketplace: "Marketplace order",
  restock: "Purchase order received",
  adjust: "Manual edit",
  stock_count: "Stock count",
  delivery_order: "Delivery order",
  do_void: "Delivery order voided",
  import: "Import",
  cancel: "Order cancelled",
};

const dateTime = (iso) => (iso ? new Date(iso).toLocaleString("en-MY", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

function ago(iso) {
  if (!iso) return "never";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins} min ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} days ago`;
}

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

function SyncBanner({ sync }) {
  if (!sync) return null;
  const tone = sync.negativeSkus > 0 ? "red" : sync.state === "ok" ? "green" : "amber";
  const tones = { red: "border-red-200 bg-red-50 text-red-900", green: "border-emerald-200 bg-emerald-50 text-emerald-900", amber: "border-amber-200 bg-amber-50 text-amber-900" };
  const Icon = tone === "green" ? CheckCircle2 : AlertTriangle;
  let headline;
  if (sync.negativeSkus > 0) headline = `${sync.negativeSkus} SKU${sync.negativeSkus === 1 ? " is" : "s are"} oversold: more pieces were sold than are on the shelf. Filter by "Oversold (below 0)" to see which.`;
  else if (sync.state === "never") headline = "Marketplace stock sync has never run. Website stock is not shared with Shopee, Lazada or TikTok yet.";
  else if (sync.state === "stale") headline = `Marketplace stock sync is stale: nothing has arrived for ${Math.round(sync.ageHours)} hours (limit ${sync.staleHours} h).`;
  else headline = `Marketplace stock sync is working. Last update ${ago(sync.lastSyncAt)}.`;
  return (
    <div className={cn("mb-6 rounded-xl border px-4 py-3 text-sm", tones[tone])} data-testid="sync-banner" data-state={sync.state}>
      <p className="flex items-start gap-2 font-medium">
        <Icon className="mt-0.5 size-4 shrink-0" />
        {headline}
      </p>
      <p className="mt-1 pl-6 text-xs opacity-90">
        {[
          `Last stock count: ${ago(sync.lastStockSyncAt)}`,
          `Last marketplace order: ${ago(sync.lastOrderSyncAt)}`,
          `${formatNumber(sync.marketplaceOrders)} marketplace orders received`,
          sync.unmatchedItems > 0 ? `${formatNumber(sync.unmatchedItems)} order lines with an unknown SKU (see SKU mapping)` : null,
          sync.negativeSkus > 0 ? `${sync.negativeSkus} SKU${sync.negativeSkus === 1 ? "" : "s"} oversold (stock below 0)` : null,
          sync.keyConfigured ? null : "SYNC_API_KEY is not set on the server, so the sync API is switched off",
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
  );
}

function HistoryModal({ variant, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const paging = usePagination(data?.movements ?? [], { defaultPageSize: 10 });
  useEffect(() => {
    if (!variant) return;
    setData(null);
    setError("");
    listMovements(variant.variantId).then(setData, (err) => setError(err.message));
  }, [variant]);

  return (
    <Modal open={Boolean(variant)} onClose={onClose} title="Stock history" className="max-w-3xl">
      {variant && (
        <p className="mb-3 text-sm">
          <span className="font-medium">{variant.productName}</span>
          <span className="text-muted-foreground"> · {[variant.variantName, `SKU ${variant.sku}`].filter(Boolean).join(" · ")}</span>
        </p>
      )}
      {error && <p className="text-destructive rounded-md bg-red-50 px-3 py-2 text-sm">{error}</p>}
      {!data && !error && <p className="text-muted-foreground py-8 text-center text-sm">Loading…</p>}
      {data && data.movements.length === 0 && <p className="text-muted-foreground py-8 text-center text-sm">No stock changes recorded for this SKU yet.</p>}
      {data && data.movements.length > 0 && (
        <table className="w-full text-sm" data-testid="history-table">
          <thead className="text-muted-foreground text-left text-xs font-semibold uppercase">
            <tr>
              <th className="py-2 pr-3">When</th>
              <th className="py-2 pr-3">What</th>
              <th className="py-2 pr-3">Reference</th>
              <th className="py-2 pr-3 text-right">Change</th>
              <th className="py-2 text-right">Stock after</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {paging.pageRows.map((m) => (
              <tr key={m.id}>
                <td className="py-2 pr-3 whitespace-nowrap">{dateTime(m.at)}</td>
                <td className="py-2 pr-3">{REASONS[m.reason] ?? m.reason}</td>
                <td className="text-muted-foreground py-2 pr-3 text-xs">{m.orderNo ?? m.marketplace ?? m.document ?? m.note ?? ""}</td>
                <td className={cn("py-2 pr-3 text-right font-semibold tabular-nums", m.delta < 0 ? "text-red-700" : "text-emerald-700")}>
                  {m.delta > 0 ? "+" : ""}
                  {formatNumber(m.delta)}
                </td>
                <td className="py-2 text-right tabular-nums">{formatNumber(m.after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data && data.movements.length > 0 && <Pagination {...paging} className="mt-3 border-t pt-3" />}
      {data && data.movements.length >= data.limit && <p className="text-muted-foreground mt-3 text-xs">Showing the latest {data.limit} changes.</p>}
    </Modal>
  );
}

function csvCell(value) {
  const s = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function exportCsv(rows, period) {
  const suffix = period === "30" ? "30" : "";
  const header = ["Product", "Variant", "SKU", "Category", "Hidden", "On shelf", "Locked (to ship)", "Held (unpaid)", "Safety buffer", "Sellable on shop", ...CHANNELS.map((c) => `Sold ${c.label}${period === "30" ? " (30 days)" : ""}`), "Sold total", "Sync status", "Last synced", "Shopee SKUs", "Lazada SKUs", "TikTok SKUs"];
  const lines = rows.map((r) =>
    [
      r.productName,
      r.variantName ?? "",
      r.sku,
      r.category?.name ?? "",
      r.productActive ? "" : "yes",
      r.tracked ? r.onShelf : "",
      r.lockedToShip,
      r.reserved,
      r.safetyBuffer,
      r.tracked ? r.sellable : "",
      ...CHANNELS.map((c) => r.sold[`${c.key}${suffix}`]),
      r.sold[`total${suffix}`],
      SYNC_BADGES[r.syncStatus].label,
      r.syncedAt ? new Date(r.syncedAt).toISOString() : "",
      r.mappings.shopee,
      r.mappings.lazada,
      r.mappings.tiktok,
    ]
      .map(csvCell)
      .join(","),
  );
  const blob = new Blob([`﻿${[header.map(csvCell).join(","), ...lines].join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const STOCK_FILTERS = {
  "": () => true,
  low: (r, low) => r.tracked && r.sellable > 0 && r.sellable <= low,
  out: (r) => r.sellable === 0,
  negative: (r) => r.available < 0,
};

const SYNC_FILTERS = {
  "": () => true,
  ok: (r) => r.syncStatus === "ok",
  stale: (r) => r.syncStatus === "stale",
  never: (r) => r.syncStatus === "never",
  untracked: (r) => r.syncStatus === "untracked",
  unmapped: (r) => r.mappings.shopee + r.mappings.lazada + r.mappings.tiktok === 0,
  review: (r) => r.mappings.needsReview > 0,
};

export function InventoryPage() {
  const [rows, setRows] = useState([]);
  const [sync, setSync] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [stockFilter, setStockFilter] = useState("");
  const [syncFilter, setSyncFilter] = useState("");
  const [lowAt, setLowAt] = useState(10);
  const [period, setPeriod] = useState("all");
  const [sort, setSort] = useState({ key: "product", dir: 1 });
  const [history, setHistory] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const data = await loadInventory();
      setRows(data.items);
      setSync(data.sync);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const suffix = period === "30" ? "30" : "";
  const soldOf = useCallback((r, channel) => r.sold[`${channel}${suffix}`], [suffix]);

  const categories = useMemo(() => {
    const map = new Map();
    for (const r of rows) if (r.category) map.set(r.category.id, r.category.name);
    return [...map].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const values = {
      product: (r) => r.productName.toLowerCase(),
      sku: (r) => r.sku.toLowerCase(),
      onShelf: (r) => r.onShelf,
      lockedToShip: (r) => r.lockedToShip,
      reserved: (r) => r.reserved,
      sellable: (r) => r.sellable,
      syncedAt: (r) => (r.syncedAt ? new Date(r.syncedAt).getTime() : 0),
      soldTotal: (r) => soldOf(r, "total"),
      ...Object.fromEntries(CHANNELS.map((c) => [`sold_${c.key}`, (r) => soldOf(r, c.key)])),
    };
    const value = values[sort.key] ?? values.product;
    return rows
      .filter(
        (r) =>
          (!q || r.productName.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q) || r.variantName?.toLowerCase().includes(q)) &&
          (!categoryId || String(r.category?.id) === categoryId) &&
          STOCK_FILTERS[stockFilter](r, lowAt) &&
          SYNC_FILTERS[syncFilter](r),
      )
      .sort((a, b) => {
        const va = value(a);
        const vb = value(b);
        const cmp = typeof va === "string" ? va.localeCompare(vb) : va - vb;
        return sort.dir * cmp || a.variantId - b.variantId;
      });
  }, [rows, search, categoryId, stockFilter, syncFilter, lowAt, sort, soldOf]);

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

  const sortHeader = (key, label) => (
    <button
      type="button"
      data-sort={key}
      onClick={() => setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: key === "product" || key === "sku" ? 1 : -1 }))}
      className="hover:text-foreground inline-flex items-center gap-1 uppercase"
    >
      {label}
      {sort.key === key && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
    </button>
  );

  const rowActions = {
    key: "actions",
    header: "",
    align: "right",
    render: (r) => (
      <div className="flex justify-end">
        <Button variant="ghost" size="icon" onClick={() => setHistory(r)} aria-label="Stock history" title="Stock history">
          <History />
        </Button>
        <Button variant="ghost" size="icon" asChild>
          <Link to={`/system/products/${r.productId}`} aria-label="Edit product" title="Edit product">
            <Pencil />
          </Link>
        </Button>
      </div>
    ),
  };

  const muted = (n) => (n ? formatNumber(n) : <span className="text-muted-foreground">0</span>);

  const stockColumns = [
    { key: "product", header: sortHeader("product", "Product"), className: "min-w-64 max-w-sm", render: (r) => <ProductCell row={r} /> },
    { key: "onShelf", header: sortHeader("onShelf", "On shelf"), align: "right", render: (r) => (r.tracked ? <span className={cn(r.onShelf < 0 && "font-semibold text-red-700")}>{formatNumber(r.onShelf)}</span> : <span className="text-muted-foreground">n/a</span>) },
    {
      key: "lockedToShip",
      header: sortHeader("lockedToShip", "Locked"),
      align: "right",
      render: (r) => (r.lockedToShip ? <span className="font-semibold text-amber-700">{formatNumber(r.lockedToShip)}</span> : <span className="text-muted-foreground">0</span>),
    },
    { key: "reserved", header: sortHeader("reserved", "Held"), align: "right", render: (r) => muted(r.reserved) },
    { key: "safetyBuffer", header: "Buffer", align: "right", render: (r) => muted(r.safetyBuffer) },
    {
      key: "sellable",
      header: sortHeader("sellable", "Sellable"),
      align: "right",
      render: (r) =>
        !r.tracked ? (
          <span className="text-muted-foreground">n/a</span>
        ) : r.sellable === 0 ? (
          <span className="inline-flex items-center gap-1 font-semibold text-red-700">
            <AlertTriangle className="size-3.5" />0
          </span>
        ) : (
          <span className="font-medium">{formatNumber(r.sellable)}</span>
        ),
    },
    ...CHANNELS.map((c) => ({ key: `sold_${c.key}`, header: sortHeader(`sold_${c.key}`, c.label), align: "right", render: (r) => muted(soldOf(r, c.key)) })),
    { key: "soldTotal", header: sortHeader("soldTotal", "Sold"), align: "right", render: (r) => <span className="font-medium">{formatNumber(soldOf(r, "total"))}</span> },
    {
      key: "sync",
      header: sortHeader("syncedAt", "Sync"),
      className: "whitespace-nowrap",
      render: (r) => (
        <div>
          <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", SYNC_BADGES[r.syncStatus].className)} data-sync={r.syncStatus}>
            {SYNC_BADGES[r.syncStatus].label}
          </span>
          {r.syncedAt && <p className="text-muted-foreground mt-0.5 text-[11px]" title={dateTime(r.syncedAt)}>{ago(r.syncedAt)}</p>}
          {r.mappings.needsReview > 0 && <p className="mt-0.5 text-[11px] font-medium text-amber-700">SKU mapping to review</p>}
        </div>
      ),
    },
    rowActions,
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
    rowActions,
  ];

  const tabs = [
    { key: "all", label: "All stock", count: null },
    { key: "locked", label: "Locked for orders", count: totals.lockedSkus },
    { key: "mapping", label: "SKU mapping", count: sync?.unmatchedItems ?? 0 },
  ];

  return (
    <>
      <PageHeader
        title="Inventory"
        description="One shelf for the website, Shopee, Lazada and TikTok. Edit stock levels on the product's page."
        actions={
          <div className="flex gap-2">
            {tab !== "mapping" && (
              <Button variant="outline" onClick={() => exportCsv(tab === "locked" ? lockedRows : filtered, period)} disabled={isLoading}>
                <Download />
                Export
              </Button>
            )}
            <Button variant="outline" onClick={load} disabled={isLoading}>
              <RefreshCw className={cn(isLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        }
      />

      <SyncBanner sync={sync} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pieces on shelf" icon={Boxes} value={formatNumber(totals.onShelf)} hint={`${rows.length} SKUs`} />
        <StatCard label="Locked for orders to ship" icon={Lock} value={formatNumber(totals.locked)} hint={`${totals.lockedSkus} SKUs · ${totals.orders} order${totals.orders === 1 ? "" : "s"}`} />
        <StatCard label="Held by unpaid orders" icon={Clock} value={formatNumber(totals.held)} hint="Released if not paid in time" />
        <StatCard label="Out of stock on shop" icon={AlertTriangle} value={formatNumber(totals.out)} hint="SKUs with 0 sellable" />
      </div>

      <div className="mb-4 flex gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            data-tab={t.key}
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

      {tab === "mapping" ? (
        <SkuMappingTab onChanged={load} />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
            <div className="relative lg:w-64">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input placeholder="Search product or SKU" value={search} onChange={(e) => setSearch(e.target.value)} className="bg-white pl-9" aria-label="Search product or SKU" />
            </div>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="bg-white lg:w-48" aria-label="Category">
              <option value="">All categories</option>
              {categories.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
            {tab === "all" && (
              <>
                <Select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)} className="bg-white lg:w-44" aria-label="Stock level">
                  <option value="">Any stock level</option>
                  <option value="low">Low stock</option>
                  <option value="out">Out of stock on shop</option>
                  <option value="negative">Oversold (below 0)</option>
                </Select>
                {stockFilter === "low" && (
                  <label className="flex items-center gap-2 text-sm">
                    at or below
                    <Input type="number" min="1" value={lowAt} onChange={(e) => setLowAt(Math.max(1, Number(e.target.value) || 1))} className="w-20 bg-white" aria-label="Low stock level" />
                  </label>
                )}
                <Select value={syncFilter} onChange={(e) => setSyncFilter(e.target.value)} className="bg-white lg:w-48" aria-label="Sync status">
                  <option value="">Any sync status</option>
                  <option value="ok">In sync</option>
                  <option value="stale">Stale</option>
                  <option value="never">Never synced</option>
                  <option value="untracked">No stock record</option>
                  <option value="unmapped">No marketplace SKU</option>
                  <option value="review">SKU mapping to review</option>
                </Select>
                <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="bg-white lg:w-40" aria-label="Sold period">
                  <option value="all">Sold: all time</option>
                  <option value="30">Sold: last 30 days</option>
                </Select>
              </>
            )}
            <p className="text-muted-foreground text-sm lg:ml-auto" data-testid="row-count">
              {formatNumber(tab === "locked" ? lockedRows.length : filtered.length)} of {formatNumber(rows.length)} SKUs
            </p>
          </div>

          {tab === "all" ? (
            <DataTable
              columns={stockColumns}
              rows={filtered}
              rowKey={(r) => r.variantId}
              isLoading={isLoading}
              rowClassName={(r) => (r.available < 0 ? "bg-red-100/60" : r.sellable === 0 ? "bg-red-50/50" : undefined)}
            />
          ) : (
            <>
              <p className="text-muted-foreground mb-3 text-sm">
                Stock in paid orders that haven't shipped yet. These pieces are still on your shelf but already sold, so they no longer count as available. They leave the
                list when you mark the order shipped.
              </p>
              <DataTable columns={lockedColumns} rows={lockedRows} rowKey={(r) => r.variantId} isLoading={isLoading} emptyMessage="No stock is locked: every paid order has shipped." />
            </>
          )}
          {tab === "all" && (
            <p className="text-muted-foreground mt-3 text-xs">
              On shelf = sellable stock plus pieces locked for paid website orders. Sellable = on shelf minus locked, held and the safety buffer. Sold columns count paid, shipped and
              completed orders; marketplace pack SKUs are counted in pieces.
            </p>
          )}
        </>
      )}

      <HistoryModal variant={history} onClose={() => setHistory(null)} />
    </>
  );
}
