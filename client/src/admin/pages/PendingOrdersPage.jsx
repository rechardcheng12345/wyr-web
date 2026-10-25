import { Building2, Check, CheckCheck, Copy, Download, ImageOff, Loader2, MapPin, PackageCheck, Phone, RefreshCw, StickyNote, Tag, Truck, Undo2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FormField, Select } from "../components/FormField";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { PrintMenu } from "../components/PrintOrder";
import { formatRM } from "../format";
import { completeOrder, exportPaidOrdersUrl, listOrders, shipOrder, unshipOrder } from "../services/ordersService";

const TABS = [
  { key: "to_ship", label: "To ship" },
  { key: "shipped", label: "Shipped" },
  { key: "completed", label: "Completed" },
  { key: "awaiting_payment", label: "Awaiting payment" },
  { key: "cancelled", label: "Cancelled" },
];

const COURIERS = ["J&T Express", "Pos Laju", "Ninja Van", "DHL eCommerce", "City-Link Express", "SPX Express", "Flash Express", "GDex", "Lalamove", "Self pickup"];

const STATUS_LABEL = {
  pending_payment: "Awaiting payment",
  paid: "To ship",
  sent_to_bigseller: "To ship",
  shipped: "Shipped",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

const STATUS_CLASS = {
  pending_payment: "bg-slate-100 text-slate-700",
  paid: "bg-amber-50 text-amber-800",
  sent_to_bigseller: "bg-amber-50 text-amber-800",
  shipped: "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-red-700",
  refunded: "bg-red-50 text-red-700",
};

function timeAgo(iso) {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatDateTime(iso) {
  return iso ? new Date(iso).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";
}

function addressText(s) {
  return [s.name, s.phone, s.address, [s.postcode, s.city].filter(Boolean).join(" "), s.state].filter(Boolean).join("\n");
}

export function PendingOrdersPage() {
  const [tab, setTab] = useState("to_ship");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [shipping, setShipping] = useState(null);
  const [notice, setNotice] = useState("");
  const [exportOpen, setExportOpen] = useState(false);

  const load = useCallback(async (which) => {
    setLoading(true);
    setError("");
    try {
      setData(await listOrders(which));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  function afterChange(message) {
    setNotice(message);
    load(tab);
    window.dispatchEvent(new Event("admin:orders-changed"));
  }

  async function run(action, order, message) {
    try {
      await action(order.id);
      afterChange(message);
    } catch (err) {
      setNotice("");
      setError(err.message);
    }
  }

  const counts = data?.counts ?? {};
  const orders = data?.tab === tab ? data.orders : [];

  return (
    <>
      <PageHeader
        title="Pending Orders"
        description={counts.to_ship ? `${counts.to_ship} paid order${counts.to_ship === 1 ? "" : "s"} waiting to be packed and shipped` : "Nothing waiting to ship"}
        actions={
          <>
            <Button variant="outline" onClick={() => setExportOpen(true)} data-testid="export-bigseller">
              <Download />
              Export paid orders CSV for BigSeller
            </Button>
            <Button variant="outline" onClick={() => load(tab)} disabled={loading}>
              <RefreshCw className={cn(loading && "animate-spin")} />
              Refresh
            </Button>
          </>
        }
      />
      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}

      <div className="mb-5 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setNotice("");
              setTab(t.key);
            }}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              tab === t.key ? "border-primary text-foreground" : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {t.label}
            {counts[t.key] > 0 && (
              <span className={cn("rounded-full px-1.5 py-0.5 text-xs tabular-nums", t.key === "to_ship" ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground")}>
                {counts[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {notice && (
        <p role="status" className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </p>
      )}
      {error && <p className="text-destructive mb-4 rounded-md bg-red-50 px-3 py-2 text-sm">{error}</p>}

      {loading && !orders.length ? (
        <div className="flex justify-center py-20">
          <Loader2 className="text-muted-foreground size-6 animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-card flex flex-col items-center rounded-xl border py-16 text-center">
          <PackageCheck className="text-muted-foreground size-10" strokeWidth={1.5} />
          <p className="mt-3 font-medium">{tab === "to_ship" ? "All caught up" : "No orders here"}</p>
          <p className="text-muted-foreground mt-1 text-sm">{tab === "to_ship" ? "New paid orders will show up here." : "Orders in this stage will appear here."}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {orders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              onShip={() => setShipping(o)}
              onUnship={() => run(unshipOrder, o, `${o.orderNo} moved back to To ship.`)}
              onComplete={() => run(completeOrder, o, `${o.orderNo} marked completed.`)}
            />
          ))}
        </div>
      )}

      {shipping && (
        <ShipDialog
          order={shipping}
          onClose={() => setShipping(null)}
          onShipped={(o) => {
            setShipping(null);
            afterChange(`${o.orderNo} marked shipped with ${o.courier}${o.trackingNo ? ` (${o.trackingNo})` : ""}.`);
          }}
        />
      )}
    </>
  );
}

function OrderCard({ order: o, onShip, onUnship, onComplete }) {
  const [copied, setCopied] = useState(false);
  const toShip = o.status === "paid" || o.status === "sent_to_bigseller";
  const pieces = o.items.reduce((s, i) => s + (i.qty ?? 0), 0);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(addressText(o.shipping));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className={cn("bg-card overflow-hidden rounded-xl border shadow-xs", toShip && "border-l-4 border-l-amber-400")}>
      <header className="bg-muted/40 flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-3">
        <span className="font-mono text-sm font-semibold">{o.orderNo}</span>
        <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", STATUS_CLASS[o.status])}>{STATUS_LABEL[o.status] ?? o.status}</span>
        <span className="text-muted-foreground text-xs">
          {o.paidAt ? `Paid ${formatDateTime(o.paidAt)} · ${timeAgo(o.paidAt)}` : `Placed ${formatDateTime(o.createdAt)}`}
        </span>
        <span className="ml-auto text-sm font-semibold tabular-nums">{formatRM(o.total)}</span>
      </header>

      <div className="grid gap-5 p-4 md:grid-cols-5">
        <div className="md:col-span-3">
          <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
            Pack · {pieces} piece{pieces === 1 ? "" : "s"}
          </p>
          <ul className="divide-y rounded-lg border">
            {o.items.map((i) => (
              <li key={i.id} className="flex items-center gap-3 p-2.5">
                {i.image ? (
                  <img src={i.image} alt="" referrerPolicy="no-referrer" className="size-11 shrink-0 rounded-md border object-cover" />
                ) : (
                  <div className="bg-muted text-muted-foreground grid size-11 shrink-0 place-items-center rounded-md">
                    <ImageOff className="size-4" />
                  </div>
                )}
                <span className="bg-primary text-primary-foreground grid h-7 min-w-9 shrink-0 place-items-center rounded-md px-1.5 text-sm font-bold tabular-nums">{i.qty}×</span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-medium">{i.productName}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {[i.variantName, i.sku && `SKU ${i.sku}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          {o.note && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-amber-900 uppercase">
                <StickyNote className="size-3.5" />
                Customer note
              </p>
              <p className="mt-1 break-words whitespace-pre-line text-amber-950">{o.note}</p>
            </div>
          )}
        </div>

        <div className="md:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Ship to</p>
            <button onClick={copyAddress} className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline">
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy address"}
            </button>
          </div>
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-semibold">{o.shipping.name}</p>
            {o.shipping.phone && (
              <a href={`tel:${o.shipping.phone}`} className="text-muted-foreground mt-1 flex items-center gap-1.5 hover:underline">
                <Phone className="size-3.5" />
                {o.shipping.phone}
              </a>
            )}
            <p className="text-muted-foreground mt-1 flex gap-1.5">
              <MapPin className="mt-0.5 size-3.5 shrink-0" />
              <span className="whitespace-pre-line">{[o.shipping.address, [o.shipping.postcode, o.shipping.city].filter(Boolean).join(" "), o.shipping.state].filter(Boolean).join("\n")}</span>
            </p>
            {o.companyName && (
              <p className="text-muted-foreground mt-1 flex items-center gap-1.5">
                <Building2 className="size-3.5 shrink-0" />
                {o.companyName}
              </p>
            )}
            {o.email && <p className="text-muted-foreground mt-2 truncate text-xs">{o.email}</p>}
          </div>
          {o.voucherCode && (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-emerald-700">
              <Tag className="size-4" />
              {o.voucherCode} · −{formatRM(o.discount)}
            </p>
          )}
          {o.courier && (
            <p className="mt-3 flex items-center gap-1.5 text-sm">
              <Truck className="text-muted-foreground size-4" />
              {o.courier}
              {o.trackingNo && (
                <>
                  {" · "}
                  <span className="font-mono select-all">{o.trackingNo}</span>
                </>
              )}
            </p>
          )}
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3">
        <div className="mr-auto">
          <PrintMenu order={o} />
        </div>
        {toShip && (
          <Button onClick={onShip}>
            <Truck />
            Mark as shipped
          </Button>
        )}
        {o.status === "shipped" && (
          <>
            <Button variant="ghost" onClick={onUnship}>
              <Undo2 />
              Back to To ship
            </Button>
            <Button variant="outline" onClick={onShip}>
              Edit tracking
            </Button>
            <Button variant="outline" onClick={onComplete}>
              <CheckCheck />
              Mark completed
            </Button>
          </>
        )}
      </footer>
    </article>
  );
}

function ShipDialog({ order, onClose, onShipped }) {
  const known = COURIERS.includes(order.courier ?? "");
  const [courier, setCourier] = useState(order.courier ? (known ? order.courier : "Other") : COURIERS[0]);
  const [otherCourier, setOtherCourier] = useState(known ? "" : (order.courier ?? ""));
  const [trackingNo, setTrackingNo] = useState(order.trackingNo ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    const name = courier === "Other" ? otherCourier.trim() : courier;
    if (!name || (!trackingNo.trim() && name !== "Self pickup")) {
      setError("Enter the courier and tracking number.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      onShipped(await shipOrder(order.id, name, trackingNo.trim()));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Ship ${order.orderNo}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="ship-form" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Mark as shipped
          </Button>
        </>
      }
    >
      <form id="ship-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">The customer sees the courier and tracking number on their order page.</p>
        <FormField label="Courier" htmlFor="courier">
          <Select id="courier" value={courier} onChange={(e) => setCourier(e.target.value)}>
            {COURIERS.map((c) => (
              <option key={c}>{c}</option>
            ))}
            <option>Other</option>
          </Select>
        </FormField>
        {courier === "Other" && (
          <FormField label="Courier name" htmlFor="otherCourier">
            <Input id="otherCourier" value={otherCourier} onChange={(e) => setOtherCourier(e.target.value)} />
          </FormField>
        )}
        <FormField label={courier === "Self pickup" ? "Reference (optional)" : "Tracking number"} htmlFor="trackingNo">
          <Input id="trackingNo" autoFocus value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} className="font-mono" />
        </FormField>
        {error && <p className="text-destructive text-sm">{error}</p>}
      </form>
    </Modal>
  );
}

function ExportDialog({ onClose }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  return (
    <Modal
      open
      onClose={onClose}
      title="Export paid orders for BigSeller"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button asChild>
            <a href={exportPaidOrdersUrl(from, to)} onClick={onClose} data-testid="export-download">
              <Download />
              Download CSV
            </a>
          </Button>
        </>
      }
    >
      <p className="text-muted-foreground text-sm">Paid, shipped and completed orders, one row per item. Leave the dates empty to export everything.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <FormField label="Paid from" htmlFor="export-from">
          <Input id="export-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </FormField>
        <FormField label="Paid to" htmlFor="export-to">
          <Input id="export-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}
