import { Ban, PackagePlus, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "../components/DataTable";
import { FormField, Select } from "../components/FormField";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { formatDate, formatNumber, formatRM, localISODate } from "../format";
import { listStock } from "../services/inventoryService";
import { cancelPurchaseOrder, deletePurchaseOrder, listPurchaseOrders, receivePurchaseOrder, savePurchaseOrder } from "../services/purchasingService";

const STATUS = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700" },
  ordered: { label: "Ordered", className: "bg-blue-50 text-blue-700" },
  received: { label: "Received", className: "bg-emerald-50 text-emerald-700" },
  cancelled: { label: "Cancelled", className: "bg-red-50 text-red-700" },
};

const EDITABLE = ["draft", "ordered"];

const newKey = () => crypto.randomUUID();
const emptyLine = () => ({ key: newKey(), variantId: null, sku: "", description: "", qty: "1", unitCost: "" });

function StatusPill({ status }) {
  const s = STATUS[status] ?? { label: status, className: "bg-muted" };
  return <span className={`rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ${s.className}`}>{s.label}</span>;
}

export function PurchasingPage() {
  const [data, setData] = useState({ orders: [], suppliers: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await listPurchaseOrders());
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = statusFilter ? data.orders.filter((o) => o.status === statusFilter) : data.orders;

  const columns = [
    { key: "poNumber", header: "PO number", className: "font-mono text-xs whitespace-nowrap" },
    { key: "supplier", header: "Supplier", className: "min-w-44" },
    { key: "orderDate", header: "Date", className: "whitespace-nowrap", render: (r) => formatDate(r.orderDate) },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} /> },
    {
      key: "items",
      header: "Items",
      className: "min-w-56",
      render: (r) => (
        <span className="text-muted-foreground line-clamp-2 text-xs">
          {r.lines.map((l) => `${formatNumber(l.qty)}× ${l.sku ?? l.description}`).join(", ")}
        </span>
      ),
    },
    { key: "total", header: "Total", align: "right", render: (r) => <span className="font-medium">{formatRM(r.total)}</span> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-1">
          {EDITABLE.includes(r.status) && (
            <>
              <Button size="sm" onClick={() => setConfirm({ type: "receive", po: r })}>
                <PackagePlus />
                Receive
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setEditing(r)} aria-label="Edit" title="Edit">
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setConfirm({ type: "cancel", po: r })} aria-label="Cancel PO" title="Cancel PO">
                <Ban />
              </Button>
            </>
          )}
          {r.status !== "received" && (
            <Button variant="ghost" size="icon" onClick={() => setConfirm({ type: "delete", po: r })} aria-label="Delete" title="Delete" className="text-red-600 hover:bg-red-50 hover:text-red-700">
              <Trash2 />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Purchasing"
        description="Purchase orders to suppliers. Receiving a PO adds its quantities to product stock."
        actions={
          <Button onClick={() => setEditing({})}>
            <Plus />
            Create PO
          </Button>
        }
      />
      {notice && (
        <p role="status" className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </p>
      )}
      {error && <p className="text-destructive mb-4 rounded-md bg-red-50 px-3 py-2 text-sm">{error}</p>}
      <div className="mb-4">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-white sm:w-48">
          <option value="">All statuses</option>
          {Object.entries(STATUS).map(([k, s]) => (
            <option key={k} value={k}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
      <DataTable columns={columns} rows={rows} isLoading={isLoading} emptyMessage="No purchase orders yet. Create one when you restock from a supplier." />

      {editing && (
        <PoForm
          po={editing}
          suppliers={data.suppliers}
          onClose={() => setEditing(null)}
          onSaved={(po) => {
            setEditing(null);
            setNotice(`${editing.id ? "Saved" : "Created"} ${po.poNumber}.`);
            load();
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          {...confirm}
          onClose={() => setConfirm(null)}
          onDone={(message) => {
            setConfirm(null);
            setNotice(message);
            load();
          }}
        />
      )}
    </>
  );
}

const CONFIRM = {
  receive: {
    title: "Receive stock?",
    button: "Receive & add to stock",
    run: receivePurchaseOrder,
    done: (po) => `${po.poNumber} received. Stock updated.`,
  },
  cancel: { title: "Cancel purchase order?", button: "Cancel PO", run: cancelPurchaseOrder, done: (po) => `${po.poNumber} cancelled.` },
  delete: { title: "Delete purchase order?", button: "Delete", run: deletePurchaseOrder, done: (po) => `${po.poNumber} deleted.` },
};

function ConfirmDialog({ type, po, onClose, onDone }) {
  const cfg = CONFIRM[type];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const linked = po.lines.filter((l) => l.variantId != null);
  const unlinked = po.lines.length - linked.length;

  async function go() {
    setBusy(true);
    setError("");
    try {
      await cfg.run(po.id);
      onDone(cfg.done(po));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={cfg.title}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Back
          </Button>
          <Button onClick={go} disabled={busy} className={type === "delete" ? "bg-red-600 hover:bg-red-700" : undefined}>
            {cfg.button}
          </Button>
        </>
      }
    >
      <p className="text-sm">
        <span className="font-mono font-semibold">{po.poNumber}</span> from {po.supplier}
      </p>
      {type === "receive" && (
        <>
          <ul className="mt-3 space-y-1 rounded-lg border p-3 text-sm">
            {linked.map((l) => (
              <li key={l.id} className="flex justify-between gap-3">
                <span className="truncate">{l.description}</span>
                <span className="font-semibold whitespace-nowrap text-emerald-700">+{formatNumber(l.qty)}</span>
              </li>
            ))}
            {linked.length === 0 && <li className="text-muted-foreground">No lines are linked to a product.</li>}
          </ul>
          {unlinked > 0 && <p className="text-muted-foreground mt-2 text-xs">{unlinked} custom line(s) aren't linked to a product, so they don't change stock.</p>}
          <p className="text-muted-foreground mt-2 text-xs">This can't be undone. Check the delivery against the PO first.</p>
        </>
      )}
      {error && <p className="text-destructive mt-3 rounded-md bg-red-50 px-3 py-2 text-sm">{error}</p>}
    </Modal>
  );
}

function PoForm({ po, suppliers, onClose, onSaved }) {
  const isNew = !po.id;
  const [supplier, setSupplier] = useState(po.supplier ?? "");
  const [orderDate, setOrderDate] = useState(po.orderDate ?? localISODate());
  const [status, setStatus] = useState(po.status ?? "draft");
  const [notes, setNotes] = useState(po.notes ?? "");
  const [lines, setLines] = useState(
    po.lines?.length ? po.lines.map((l) => ({ ...l, key: newKey(), qty: String(l.qty), unitCost: String(l.unitCost) })) : [emptyLine()],
  );
  const [stock, setStock] = useState([]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listStock().then(setStock).catch(() => setStock([]));
  }, []);

  const groups = useMemo(() => {
    const map = new Map();
    for (const v of stock) {
      const list = map.get(v.productName) ?? [];
      list.push(v);
      map.set(v.productName, list);
    }
    return [...map];
  }, [stock]);

  const updateLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function pickVariant(key, value) {
    if (!value) return updateLine(key, { variantId: null, sku: "" });
    const v = stock.find((s) => String(s.variantId) === value);
    updateLine(key, { variantId: v.variantId, sku: v.sku, description: [v.productName, v.variantName].filter(Boolean).join(" — ").slice(0, 255) });
  }

  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitCost) || 0), 0);

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError("");
    try {
      const saved = await savePurchaseOrder({
        id: po.id,
        supplier,
        orderDate,
        status,
        notes,
        lines: lines.map((l) => ({ variantId: l.variantId, sku: l.sku, description: l.description, qty: Number(l.qty), unitCost: l.unitCost === "" ? null : Number(l.unitCost) })),
      });
      onSaved(saved);
    } catch (err) {
      setErrors(err.body?.fields ?? {});
      setFormError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? "Create purchase order" : `Edit ${po.poNumber}`}
      className="max-w-4xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="po-form" disabled={saving}>
            {isNew ? "Create PO" : "Save"}
          </Button>
        </>
      }
    >
      <form id="po-form" onSubmit={onSubmit} className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Supplier" htmlFor="supplier" error={errors.supplier}>
            <Input id="supplier" list="supplier-list" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            <datalist id="supplier-list">
              {suppliers.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </FormField>
          <FormField label="Order date" htmlFor="orderDate" error={errors.orderDate}>
            <Input id="orderDate" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
          </FormField>
          <FormField label="Status" htmlFor="status">
            <Select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="draft">Draft</option>
              <option value="ordered">Ordered (sent to supplier)</option>
            </Select>
          </FormField>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Line items</h3>
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
              <Plus />
              Add line
            </Button>
          </div>
          {errors.lines && <p className="text-destructive mb-2 text-sm">{errors.lines}</p>}
          <div className="flex flex-col gap-3">
            {lines.map((l, i) => {
              const err = (f) => errors[`lines.${i}.${f}`];
              return (
                <div key={l.key} className="grid grid-cols-2 items-start gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_5.5rem_6.5rem_auto] sm:border-0 sm:p-0">
                  <FormField label="Product" className="col-span-2 sm:col-span-1">
                    <Select value={l.variantId ?? ""} onChange={(e) => pickVariant(l.key, e.target.value)}>
                      <option value="">Custom item (no stock update)</option>
                      {groups.map(([name, variants]) => (
                        <optgroup key={name} label={name}>
                          {variants.map((v) => (
                            <option key={v.variantId} value={v.variantId}>
                              {v.variantName ? `${v.variantName} · ` : ""}
                              {v.sku}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label="Description" error={err("description")} className="col-span-2 sm:col-span-1">
                    <Input value={l.description} onChange={(e) => updateLine(l.key, { description: e.target.value })} />
                  </FormField>
                  <FormField label="Qty" error={err("qty")}>
                    <Input type="number" min="1" step="1" value={l.qty} onChange={(e) => updateLine(l.key, { qty: e.target.value })} />
                  </FormField>
                  <FormField label="Unit cost (RM)" error={err("unitCost")}>
                    <Input type="number" min="0" step="0.01" value={l.unitCost} onChange={(e) => updateLine(l.key, { unitCost: e.target.value })} />
                  </FormField>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove line"
                    disabled={lines.length === 1}
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    className="mt-6 justify-self-end"
                  >
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        <FormField label="Notes (optional)" htmlFor="notes">
          <textarea
            id="notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm"
          />
        </FormField>

        {formError && <p className="text-destructive text-sm">{formError}</p>}
        <div className="flex justify-end border-t pt-4 text-base">
          <span className="text-muted-foreground mr-3">Total</span>
          <span className="font-bold tabular-nums">{formatRM(total)}</span>
        </div>
      </form>
    </Modal>
  );
}
