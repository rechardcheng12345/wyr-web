import { Check, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pagination, usePagination } from "@/components/Pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatNumber } from "../format";
import { createMapping, deleteMapping, listMappings, updateMapping } from "../services/inventoryService";
import { Select } from "./FormField";

const PLATFORM_LABELS = { shopee: "Shopee", lazada: "Lazada", tiktok: "TikTok" };

function VariantSelect({ variants, value, onChange, ...props }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="bg-white" {...props}>
      <option value="">Pick a product variant…</option>
      {variants.map((v) => (
        <option key={v.id} value={v.id}>
          {v.sku} · {[v.productName, v.name].filter(Boolean).join(" / ").slice(0, 80)}
        </option>
      ))}
    </Select>
  );
}

function MappingRow({ m, variants, onSaved, onError }) {
  const [variantId, setVariantId] = useState(String(m.variantId));
  const [packQty, setPackQty] = useState(String(m.packQty));
  const [busy, setBusy] = useState(false);
  const dirty = variantId !== String(m.variantId) || packQty !== String(m.packQty);

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
      await onSaved();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className={cn(m.needsReview && "bg-amber-50/70")} data-mapping={m.id}>
      <td className="px-4 py-2.5">{PLATFORM_LABELS[m.platform]}</td>
      <td className="px-4 py-2.5 font-mono text-xs break-all">
        {m.platformSku}
        {m.needsReview && <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-amber-900">Review</span>}
      </td>
      <td className="min-w-72 px-4 py-2.5">
        <VariantSelect variants={variants} value={variantId} onChange={setVariantId} aria-label="Product variant" />
      </td>
      <td className="px-4 py-2.5">
        <Input type="number" min="1" value={packQty} onChange={(e) => setPackQty(e.target.value)} className="w-20 bg-white" aria-label="Pack size" />
      </td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap">
        {(dirty || m.needsReview) && (
          <Button size="sm" disabled={busy || !variantId} onClick={() => run(() => updateMapping(m.id, { variantId: Number(variantId), packQty: Number(packQty) }))}>
            <Check />
            {dirty ? "Save" : "Confirm"}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          disabled={busy}
          aria-label="Delete mapping"
          title="Delete mapping"
          onClick={() => window.confirm(`Delete the mapping for ${m.platformSku}?`) && run(() => deleteMapping(m.id))}
        >
          <Trash2 />
        </Button>
      </td>
    </tr>
  );
}

function AddMapping({ platforms, variants, preset, onSaved, onError }) {
  const [form, setForm] = useState({ platform: "shopee", platformSku: "", variantId: "", packQty: "1" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (preset) setForm((f) => ({ ...f, platform: preset.platform, platformSku: preset.sku }));
  }, [preset]);
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await createMapping({ ...form, variantId: Number(form.variantId), packQty: Number(form.packQty) });
      setForm((f) => ({ ...f, platformSku: "", variantId: "", packQty: "1" }));
      await onSaved();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-card mb-6 grid gap-3 rounded-xl border p-4 md:grid-cols-[9rem_1fr_1.4fr_6rem_auto] md:items-end" data-testid="add-mapping">
      <label className="text-sm">
        <span className="mb-1 block font-medium">Platform</span>
        <Select value={form.platform} onChange={(e) => set("platform")(e.target.value)} className="bg-white" aria-label="Platform">
          {platforms.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABELS[p]}
            </option>
          ))}
        </Select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium">Marketplace SKU</span>
        <Input value={form.platformSku} onChange={(e) => set("platformSku")(e.target.value)} className="bg-white" aria-label="Marketplace SKU" required />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium">Is this product</span>
        <VariantSelect variants={variants} value={form.variantId} onChange={set("variantId")} aria-label="Product variant" required />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium">Pack size</span>
        <Input type="number" min="1" value={form.packQty} onChange={(e) => set("packQty")(e.target.value)} className="bg-white" aria-label="Pack size" />
      </label>
      <Button type="submit" disabled={busy}>
        <Plus />
        Add mapping
      </Button>
    </form>
  );
}

export function SkuMappingTab({ onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [preset, setPreset] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await listMappings());
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saved = useCallback(async () => {
    setError("");
    await load();
    onChanged?.();
  }, [load, onChanged]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.mappings.filter(
      (m) =>
        (!platform || m.platform === platform) &&
        (!reviewOnly || m.needsReview) &&
        (!q || m.platformSku.toLowerCase().includes(q) || m.variantSku.toLowerCase().includes(q) || m.productName.toLowerCase().includes(q)),
    );
  }, [data, search, platform, reviewOnly]);

  const paging = usePagination(rows);

  if (!data) return error ? <p className="text-destructive rounded-md bg-red-50 px-3 py-2 text-sm">{error}</p> : <p className="text-muted-foreground py-12 text-center text-sm">Loading…</p>;

  const reviewCount = data.mappings.filter((m) => m.needsReview).length;

  return (
    <>
      <p className="text-muted-foreground mb-4 text-sm">
        Each marketplace SKU has to point at one product variant, so an order on Shopee, Lazada or TikTok takes the right pieces off the shelf. A pack SKU (for example a pack of 3)
        counts as that many pieces. A marketplace SKU that is the same as our own SKU needs no mapping.
      </p>
      {error && <p className="text-destructive mb-4 rounded-md bg-red-50 px-3 py-2 text-sm">{error}</p>}

      {data.unmatched.length > 0 && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4" data-testid="unmatched">
          <p className="mb-2 text-sm font-semibold text-red-900">
            {data.unmatched.length} unknown SKU{data.unmatched.length === 1 ? "" : "s"} in marketplace orders: no stock was taken for these
          </p>
          <ul className="space-y-1.5 text-sm">
            {data.unmatched.map((u) => (
              <li key={`${u.platform}|${u.sku}`} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium">{PLATFORM_LABELS[u.platform]}</span>
                <span className="font-mono text-xs break-all">{u.sku}</span>
                <span className="text-muted-foreground text-xs">
                  {u.name ? `${u.name.slice(0, 60)} · ` : ""}
                  {u.orders} order line{u.orders === 1 ? "" : "s"}, {formatNumber(u.pieces)} sold · last {u.lastOrderNo}
                </span>
                <Button size="sm" variant="outline" className="bg-white" onClick={() => setPreset({ platform: u.platform, sku: u.sku })}>
                  Map this SKU
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AddMapping platforms={data.platforms} variants={data.variants} preset={preset} onSaved={saved} onError={setError} />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input placeholder="Search SKU or product" value={search} onChange={(e) => setSearch(e.target.value)} className="bg-white sm:max-w-xs" aria-label="Search mappings" />
        <Select value={platform} onChange={(e) => setPlatform(e.target.value)} className="bg-white sm:w-44" aria-label="Platform filter">
          <option value="">All platforms</option>
          {data.platforms.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABELS[p]}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={reviewOnly} onChange={(e) => setReviewOnly(e.target.checked)} className="accent-primary size-4" />
          To review only ({reviewCount})
        </label>
        <p className="text-muted-foreground text-sm sm:ml-auto" data-testid="mapping-count">
          {formatNumber(rows.length)} of {formatNumber(data.mappings.length)} mappings
        </p>
      </div>

      <div className="bg-card overflow-hidden rounded-xl border shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground text-left text-xs font-semibold tracking-wide uppercase">
              <tr>
                <th className="px-4 py-3">Platform</th>
                <th className="px-4 py-3">Marketplace SKU</th>
                <th className="px-4 py-3">Product variant</th>
                <th className="px-4 py-3">Pack size</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted-foreground px-4 py-12 text-center">
                    No mappings match.
                  </td>
                </tr>
              ) : (
                paging.pageRows.map((m) => <MappingRow key={`${m.id}-${m.variantId}-${m.packQty}-${m.needsReview}`} m={m} variants={data.variants} onSaved={saved} onError={setError} />)
              )}
            </tbody>
          </table>
        </div>
        <Pagination {...paging} className="border-t px-4 py-3" />
      </div>
    </>
  );
}
