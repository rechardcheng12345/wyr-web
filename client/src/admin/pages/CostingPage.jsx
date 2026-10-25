import { History, Loader2, RotateCcw, Search, Tag, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FormField, Select } from "../components/FormField";
import { PageHeader } from "../components/PageHeader";
import { formatDate, formatNumber, formatRM } from "../format";
import { getItemCosting, listCostingItems } from "../services/costingService";

const EXTRA_FIELDS = [
  { key: "labor", label: "Labor" },
  { key: "shipping", label: "Shipping / freight" },
  { key: "duties", label: "Duties & taxes" },
  { key: "overhead", label: "Overhead" },
];

const INITIAL = { quantity: "100", goods: "", labor: "", shipping: "", duties: "", overhead: "", margin: "40" };

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

const rm4 = (n) => (n == null ? "—" : n < 1 ? `RM ${n.toFixed(4).replace(/0{1,2}$/, "")}` : formatRM(n));

function itemLabel(i) {
  return `${i.productName}${i.variantName ? ` — ${i.variantName}` : ""}`;
}

export function CostingPage() {
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [purchasedOnly, setPurchasedOnly] = useState(false);
  const [variantId, setVariantId] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(INITIAL);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    listCostingItems()
      .then(setItems)
      .catch((err) => setError(err.message))
      .finally(() => setItemsLoading(false));
  }, []);

  useEffect(() => {
    if (!variantId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setError("");
    getItemCosting(variantId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        const start = d.summary.avgUnitCost ?? d.summary.lastUnitCost;
        setForm((f) => ({ ...f, goods: start == null ? "" : String(start) }));
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setDetailLoading(false));
    return () => {
      cancelled = true;
    };
  }, [variantId]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(
      (i) => (!purchasedOnly || i.receivedQty > 0) && (!q || itemLabel(i).toLowerCase().includes(q) || i.sku.toLowerCase().includes(q) || String(i.variantId) === variantId),
    );
  }, [items, search, purchasedOnly, variantId]);

  const purchasedCount = items.filter((i) => i.receivedQty > 0).length;

  const quantity = Math.floor(toNum(form.quantity));
  const goods = toNum(form.goods);
  const extras = EXTRA_FIELDS.reduce((s, f) => s + toNum(form[f.key]), 0);
  const margin = toNum(form.margin);
  const marginValid = margin < 100;
  const unitCost = quantity > 0 ? goods + extras / quantity : goods;
  const sellingPrice = marginValid ? unitCost / (1 - margin / 100) : 0;
  const profitPerUnit = sellingPrice - unitCost;
  const markup = unitCost > 0 ? (profitPerUnit / unitCost) * 100 : 0;

  const shopPrice = detail ? (detail.variant.specialPrice ?? detail.variant.price) : null;
  const shopMargin = shopPrice ? ((shopPrice - unitCost) / shopPrice) * 100 : null;

  const s = detail?.summary;

  return (
    <>
      <PageHeader
        title="Costing Calculation"
        description="Pick an item to start from its average purchase price, then add your other costs to get the landed unit cost and a selling price."
        actions={
          <Button
            variant="outline"
            onClick={() => {
              setForm(INITIAL);
              setVariantId("");
              setSearch("");
            }}
          >
            <RotateCcw />
            Reset
          </Button>
        }
      />

      {error && <p className="text-destructive mb-4 rounded-md bg-red-50 px-3 py-2 text-sm">{error}</p>}

      <Card className="mb-6">
        <CardContent className="p-5">
          <h2 className="mb-3 font-semibold">Item</h2>
          <div className="grid gap-3 lg:grid-cols-[18rem_1fr_auto] lg:items-center">
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input placeholder="Search product or SKU" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex gap-2">
              <Select value={variantId} onChange={(e) => setVariantId(e.target.value)} disabled={itemsLoading} aria-label="Item">
                <option value="">{itemsLoading ? "Loading items…" : `No item (enter costs manually) · ${filteredItems.length} match`}</option>
                {filteredItems.map((i) => (
                  <option key={i.variantId} value={i.variantId}>
                    {itemLabel(i)} · {i.sku}
                    {i.avgUnitCost != null ? ` · avg ${rm4(i.avgUnitCost)}` : ""}
                  </option>
                ))}
              </Select>
              {variantId && (
                <Button variant="ghost" size="icon" onClick={() => setVariantId("")} aria-label="Clear item">
                  <X />
                </Button>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm whitespace-nowrap">
              <input type="checkbox" checked={purchasedOnly} onChange={(e) => setPurchasedOnly(e.target.checked)} className="accent-primary size-4" />
              Only items with purchases ({purchasedCount})
            </label>
          </div>
        </CardContent>
      </Card>

      {detailLoading && (
        <div className="mb-6 flex justify-center py-8">
          <Loader2 className="text-muted-foreground size-6 animate-spin" />
        </div>
      )}

      {detail && !detailLoading && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 font-semibold">
                  <History className="text-muted-foreground size-4" />
                  Purchase history
                </h2>
                <p className="text-muted-foreground mt-0.5 truncate text-sm">
                  {itemLabel(detail.variant)} · SKU {detail.variant.sku}
                </p>
              </div>
              <Link to={`/system/products/${detail.variant.productId}`} className="text-primary text-sm font-medium hover:underline">
                Shop price {shopPrice == null ? "not set" : formatRM(shopPrice)} · edit
              </Link>
            </div>

            {s.receivedQty === 0 ? (
              <p className="bg-muted/50 text-muted-foreground mt-4 rounded-lg px-4 py-3 text-sm">
                No received purchases for this item yet{s.onOrderQty ? ` (${formatNumber(s.onOrderQty)} on order)` : ""}. Enter the goods cost below, or{" "}
                <Link to="/system/purchasing" className="text-primary font-medium hover:underline">
                  record a purchase order
                </Link>{" "}
                and receive it.
              </p>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Average goods price" value={rm4(s.avgUnitCost)} hint={`Weighted over ${formatNumber(s.receivedQty)} pcs · ${s.poCount} PO${s.poCount === 1 ? "" : "s"}`} highlight />
                <Metric label="Last price paid" value={rm4(s.lastUnitCost)} hint={`${s.lastSupplier} · ${formatDate(s.lastDate)}`} />
                <Metric label="Lowest / highest" value={`${rm4(s.minUnitCost)} / ${rm4(s.maxUnitCost)}`} hint="Per piece" />
                <Metric label="Total spent" value={formatRM(s.totalSpend)} hint={s.onOrderQty ? `${formatNumber(s.onOrderQty)} more pcs on order` : "Received POs"} />
              </div>
            )}

            {detail.history.length > 0 && (
              <div className="mt-4 overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-muted-foreground text-left text-xs font-semibold tracking-wide uppercase">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">PO</th>
                      <th className="px-3 py-2">Supplier</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Unit cost</th>
                      <th className="px-3 py-2 text-right">Line total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {detail.history.map((h, i) => (
                      <tr key={`${h.poId}-${i}`} className={cn(h.status !== "received" && "text-muted-foreground")}>
                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(h.orderDate)}</td>
                        <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{h.poNumber}</td>
                        <td className="px-3 py-2">{h.supplier}</td>
                        <td className="px-3 py-2">
                          <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", h.status === "received" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700")}>
                            {h.status === "received" ? "Received" : "On order (not averaged)"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNumber(h.qty)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{rm4(h.unitCost)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatRM(h.qty * h.unitCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardContent className="p-5">
            <h2 className="mb-4 font-semibold">Costs</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Goods cost per piece (RM)" htmlFor="goods" className="sm:col-span-2">
                <Input id="goods" type="number" min="0" step="0.0001" inputMode="decimal" placeholder="0.00" value={form.goods} onChange={set("goods")} />
                {s && (s.avgUnitCost != null || s.lastUnitCost != null) && (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {s.avgUnitCost != null && (
                      <QuickFill active={toNum(form.goods) === s.avgUnitCost} onClick={() => setForm((f) => ({ ...f, goods: String(s.avgUnitCost) }))}>
                        Use average {rm4(s.avgUnitCost)}
                      </QuickFill>
                    )}
                    {s.lastUnitCost != null && (
                      <QuickFill active={toNum(form.goods) === s.lastUnitCost} onClick={() => setForm((f) => ({ ...f, goods: String(s.lastUnitCost) }))}>
                        Use last {rm4(s.lastUnitCost)}
                      </QuickFill>
                    )}
                  </div>
                )}
              </FormField>
              <FormField label="Quantity (pieces in this batch)" htmlFor="quantity" error={quantity > 0 ? undefined : "Enter at least 1"} className="sm:col-span-2">
                <Input id="quantity" type="number" min="1" step="1" value={form.quantity} onChange={set("quantity")} />
              </FormField>
              <p className="text-muted-foreground -mb-1 text-xs sm:col-span-2">Other costs for the whole batch (RM). They're spread across the quantity above.</p>
              {EXTRA_FIELDS.map((f) => (
                <FormField key={f.key} label={f.label} htmlFor={f.key}>
                  <Input id={f.key} type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={form[f.key]} onChange={set(f.key)} />
                </FormField>
              ))}
            </div>
            <div className="mt-6 border-t pt-5">
              <FormField label="Target margin (%)" htmlFor="margin" error={marginValid ? undefined : "Margin must be below 100%"} className="sm:max-w-xs">
                <Input id="margin" type="number" min="0" max="99.9" step="0.1" value={form.margin} onChange={set("margin")} />
              </FormField>
              <p className="text-muted-foreground mt-2 text-xs">Margin is profit as a share of the selling price: price = unit cost ÷ (1 − margin).</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardContent className="p-5">
              <p className="text-muted-foreground text-sm font-medium">Landed unit cost</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{rm4(unitCost)}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {rm4(goods)} goods + {formatRM(extras)} ÷ {formatNumber(quantity || 0)} pcs
              </p>
            </CardContent>
          </Card>
          <Card className="border-primary/30 bg-accent/40">
            <CardContent className="p-5">
              <p className="text-muted-foreground text-sm font-medium">Suggested selling price</p>
              <p className="text-primary mt-1 text-3xl font-bold tabular-nums">{rm4(sellingPrice)}</p>
              <p className="text-muted-foreground mt-1 text-xs">per piece at {margin}% margin</p>
            </CardContent>
          </Card>
          {detail && shopPrice != null && (
            <Card>
              <CardContent className="flex items-start gap-3 p-5">
                <Tag className="text-muted-foreground mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="text-muted-foreground text-sm font-medium">At your current shop price {formatRM(shopPrice)}</p>
                  <p className={cn("mt-1 text-xl font-bold tabular-nums", shopMargin < 0 ? "text-red-700" : shopMargin < margin ? "text-amber-700" : "text-emerald-700")}>
                    {shopMargin.toFixed(1)}% margin
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {formatRM(shopPrice - unitCost)} profit per piece
                    {shopMargin < margin && shopMargin >= 0 ? " · below your target" : ""}
                    {shopMargin < 0 ? " · selling at a loss" : ""}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="grid grid-cols-2 gap-4 p-5 text-sm">
              <div>
                <p className="text-muted-foreground">Profit / piece</p>
                <p className="mt-1 font-semibold tabular-nums">{rm4(profitPerUnit)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Markup on cost</p>
                <p className="mt-1 font-semibold tabular-nums">{markup.toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-muted-foreground">Batch revenue</p>
                <p className="mt-1 font-semibold tabular-nums">{formatRM(sellingPrice * quantity)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Batch profit</p>
                <p className="mt-1 font-semibold tabular-nums">{formatRM(profitPerUnit * quantity)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Metric({ label, value, hint, highlight }) {
  return (
    <div className={cn("rounded-lg border p-3", highlight && "border-primary/30 bg-accent/40")}>
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className={cn("mt-1 text-lg font-bold tabular-nums", highlight && "text-primary")}>{value}</p>
      <p className="text-muted-foreground truncate text-xs" title={hint}>
        {hint}
      </p>
    </div>
  );
}

function QuickFill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors", active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
    >
      {children}
    </button>
  );
}
