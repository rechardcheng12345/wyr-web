import { Ban, CheckCircle2, FileOutput, Pencil, Plus, Printer, Search, Send, Trash2, Truck, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DataTable } from "../components/DataTable";
import { FormField, Select } from "../components/FormField";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { DOC_TITLE, PrintDocument } from "../components/PrintDocument";
import { formatDate, formatNumber, formatRM, localISODate } from "../format";
import { deleteDocument, issueDocument, listDocuments, saveDocument, setInvoicePaid, voidDocument } from "../services/documentsService";
import { listStock } from "../services/inventoryService";

const TABS = [
  { type: "quotation", label: "Quotations" },
  { type: "invoice", label: "Invoices" },
  { type: "delivery_order", label: "Delivery orders" },
];

const FILTERS = {
  quotation: [
    ["issued", "Issued"],
    ["void", "Void"],
  ],
  invoice: [
    ["unpaid", "Unpaid"],
    ["paid", "Paid"],
    ["void", "Void"],
  ],
  delivery_order: [
    ["draft", "Draft"],
    ["issued", "Issued"],
    ["void", "Void"],
  ],
};

const textareaClass =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm";

const newKey = () => crypto.randomUUID();
const emptyLine = () => ({ key: newKey(), variantId: null, sku: "", description: "", note: "", qty: "1", unitPrice: "" });

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localISODate(d);
}

function matchesFilter(doc, filter) {
  if (!filter) return true;
  if (filter === "void") return doc.status === "void";
  if (doc.status === "void") return false;
  if (filter === "paid") return Boolean(doc.paidAt);
  if (filter === "unpaid") return !doc.paidAt;
  return doc.status === filter;
}

function Pill({ className, children }) {
  return <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap", className)}>{children}</span>;
}

function StatusPill({ doc }) {
  if (doc.status === "void") return <Pill className="bg-red-50 text-red-700">Void</Pill>;
  if (doc.type === "invoice") {
    return doc.paidAt ? <Pill className="bg-emerald-50 text-emerald-700">Paid {formatDate(doc.paidAt)}</Pill> : <Pill className="bg-amber-50 text-amber-700">Unpaid</Pill>;
  }
  if (doc.type === "delivery_order") {
    return doc.status === "draft" ? <Pill className="bg-slate-100 text-slate-700">Draft</Pill> : <Pill className="bg-emerald-50 text-emerald-700">Issued</Pill>;
  }
  const invoiced = doc.derived.find((x) => x.type === "invoice" && x.status !== "void");
  return invoiced ? <Pill className="bg-blue-50 text-blue-700">Invoiced {invoiced.docNo}</Pill> : <Pill className="bg-slate-100 text-slate-700">Issued</Pill>;
}

/** Form values for a new document copied from another one (quotation → invoice → DO). */
function copyFrom(doc, type) {
  return {
    type,
    sourceId: doc.id,
    billToName: doc.billToName,
    billToAddress: doc.billToAddress,
    attention: doc.attention,
    customerRef: doc.customerRef,
    otherLabel: type === "invoice" ? doc.otherLabel : "",
    otherAmount: type === "invoice" ? doc.otherAmount : 0,
    // A website order's invoice also has a Shipping line, which isn't something to deliver.
    lines: doc.lines.filter((l) => type !== "delivery_order" || doc.orderId == null || l.sku).map(({ id: _id, ...l }) => l),
    fromLabel: `${DOC_TITLE[doc.type]} ${doc.docNo}`,
  };
}

/** Form values for a formal invoice of a website order (already paid, stock already taken). */
function invoiceForOrder(o) {
  const s = o.shipping;
  const lines = o.items.map((i) => ({
    variantId: null,
    sku: i.sku ?? "",
    description: [i.productName, i.variantName].filter(Boolean).join(" — "),
    note: "",
    qty: i.qty,
    unitPrice: i.unitPrice,
  }));
  if (o.shippingFee > 0) lines.push({ variantId: null, sku: "", description: "Shipping", note: "", qty: 1, unitPrice: o.shippingFee });
  return {
    type: "invoice",
    orderId: o.id,
    docDate: o.paidAt ? localISODate(new Date(o.paidAt)) : localISODate(),
    paidAt: o.paidAt ? localISODate(new Date(o.paidAt)) : null,
    billToName: o.companyName || s.name,
    billToAddress: [s.address, [s.postcode, s.city].filter(Boolean).join(" "), s.state].filter(Boolean).join("\n"),
    attention: o.companyName ? s.name : "",
    customerRef: o.orderNo,
    otherLabel: o.discount > 0 ? `Voucher ${o.voucherCode ?? ""}`.trim() : "",
    otherAmount: o.discount > 0 ? -o.discount : 0,
    lines,
    fromLabel: `website order ${o.orderNo}`,
  };
}

export function DocumentsPage() {
  const [params, setParams] = useSearchParams();
  const type = TABS.some((t) => t.type === params.get("type")) ? params.get("type") : "quotation";
  const location = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [paying, setPaying] = useState(null);
  const [printing, setPrinting] = useState(null);

  const load = useCallback(async () => {
    try {
      const result = await listDocuments(type);
      setData({ ...result, type });
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [type]);

  useEffect(() => {
    setIsLoading(true);
    setFilter("");
    load();
  }, [load]);

  // "Invoice" on a website order lands here with the order in the navigation state.
  const fromOrder = location.state?.fromOrder;
  useEffect(() => {
    if (!fromOrder || data?.type !== "invoice") return;
    navigate(location.pathname + location.search, { replace: true, state: null });
    const existing = data.documents.find((d) => d.orderId === fromOrder.id && d.status !== "void");
    if (existing) {
      setNotice(`Order ${fromOrder.orderNo} already has invoice ${existing.docNo}.`);
      setQuery(existing.docNo);
    } else {
      setEditing(invoiceForOrder(fromOrder));
    }
  }, [fromOrder, data, navigate, location.pathname, location.search]);

  const docs = data?.type === type ? data.documents : [];
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter(
      (d) => matchesFilter(d, filter) && (!q || [d.docNo, d.billToName, d.attention, d.customerRef, d.orderNo].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [docs, filter, query]);

  const unpaid = type === "invoice" ? docs.filter((d) => d.status !== "void" && !d.paidAt) : [];

  function switchTab(t) {
    setQuery("");
    setNotice("");
    setParams({ type: t });
  }

  function onSaved(doc, wasNew) {
    setEditing(null);
    setNotice(`${wasNew ? "Created" : "Saved"} ${DOC_TITLE[doc.type].toLowerCase()} ${doc.docNo}.`);
    if (doc.type !== type) setParams({ type: doc.type });
    else load();
  }

  const columns = [
    { key: "docNo", header: "Number", className: "font-mono text-xs whitespace-nowrap" },
    { key: "docDate", header: "Date", className: "whitespace-nowrap", render: (r) => formatDate(r.docDate) },
    {
      key: "billTo",
      header: type === "delivery_order" ? "Deliver to" : "Bill to",
      className: "min-w-48",
      render: (r) => (
        <>
          <p className="font-medium">{r.billToName}</p>
          {r.attention && <p className="text-muted-foreground text-xs">Attn: {r.attention}</p>}
        </>
      ),
    },
    {
      key: "ref",
      header: "Ref",
      className: "text-xs",
      render: (r) => (
        <div className="text-muted-foreground flex flex-col whitespace-nowrap">
          {r.customerRef && <span>{r.customerRef}</span>}
          {r.source && <span>from {r.source.docNo}</span>}
          {r.orderNo && r.orderNo !== r.customerRef && <span>order {r.orderNo}</span>}
        </div>
      ),
    },
    type === "delivery_order"
      ? { key: "items", header: "Items", align: "right", render: (r) => formatNumber(r.lines.reduce((s, l) => s + l.qty, 0)) }
      : { key: "total", header: "Total", align: "right", render: (r) => <span className="font-medium">{formatRM(r.total)}</span> },
    { key: "status", header: "Status", render: (r) => <StatusPill doc={r} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <RowActions
          doc={r}
          onPrint={() => setPrinting(r)}
          onEdit={() => setEditing(r)}
          onConvert={(to) => setEditing(copyFrom(r, to))}
          onPaid={() => setPaying(r)}
          onConfirm={(action) => setConfirm({ action, doc: r })}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Documents"
        description="Quotations, invoices and delivery orders for walk-in and company customers. Issuing a delivery order takes its products out of stock."
        actions={
          <Button onClick={() => setEditing({ type })}>
            <Plus />
            New {DOC_TITLE[type].toLowerCase()}
          </Button>
        }
      />

      <div className="mb-4 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button
            key={t.type}
            onClick={() => switchTab(t.type)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap",
              t.type === type ? "border-primary text-primary" : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {notice && (
        <p role="status" className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </p>
      )}
      {error && <p className="text-destructive mb-4 rounded-md bg-red-50 px-3 py-2 text-sm">{error}</p>}
      {unpaid.length > 0 && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {unpaid.length} unpaid invoice{unpaid.length === 1 ? "" : "s"} · {formatRM(unpaid.reduce((s, d) => s + d.total, 0))} outstanding
        </p>
      )}

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative sm:w-72">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search number, customer, ref" className="bg-white pl-9" />
        </div>
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="bg-white sm:w-44">
          <option value="">All</option>
          {FILTERS[type].map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      <DataTable columns={columns} rows={rows} isLoading={isLoading} emptyMessage={docs.length ? "Nothing matches." : `No ${TABS.find((t) => t.type === type).label.toLowerCase()} yet.`} />

      {editing && data && (
        <DocForm
          initial={editing}
          tabType={type}
          next={data.next}
          clients={data.clients}
          validDays={data.company.quotationValidDays}
          onClose={() => setEditing(null)}
          onSaved={(doc) => onSaved(doc, !editing.id)}
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
      {paying && (
        <PaidDialog
          doc={paying}
          onClose={() => setPaying(null)}
          onDone={(message) => {
            setPaying(null);
            setNotice(message);
            load();
          }}
        />
      )}
      {printing && data && <PrintDocument doc={printing} company={data.company} onDone={() => setPrinting(null)} />}
    </>
  );
}

function RowActions({ doc, onPrint, onEdit, onConvert, onPaid, onConfirm }) {
  const isVoid = doc.status === "void";
  const editable = !isVoid && (doc.type !== "delivery_order" || doc.status === "draft");
  const icon = (label, Icon, onClick, className) => (
    <Button variant="ghost" size="icon" onClick={onClick} aria-label={label} title={label} className={className}>
      <Icon />
    </Button>
  );
  return (
    <div className="flex justify-end gap-1">
      {!isVoid && doc.type === "quotation" && (
        <Button size="sm" variant="outline" onClick={() => onConvert("invoice")} title="Create an invoice from this quotation">
          <FileOutput />
          Invoice
        </Button>
      )}
      {!isVoid && doc.type === "invoice" && !doc.paidAt && (
        <Button size="sm" onClick={onPaid}>
          <CheckCircle2 />
          Paid
        </Button>
      )}
      {!isVoid && doc.type === "invoice" && (
        <Button size="sm" variant="outline" onClick={() => onConvert("delivery_order")} title="Create a delivery order from this invoice">
          <Truck />
          DO
        </Button>
      )}
      {doc.type === "delivery_order" && doc.status === "draft" && (
        <Button size="sm" onClick={() => onConfirm("issue")}>
          <Send />
          Issue
        </Button>
      )}
      {icon("Print", Printer, onPrint)}
      {editable && icon("Edit", Pencil, onEdit)}
      {!isVoid && doc.type === "invoice" && doc.paidAt && icon("Mark unpaid", Undo2, () => onConfirm("unpaid"))}
      {doc.status === "draft" && icon("Delete", Trash2, () => onConfirm("delete"), "text-red-600 hover:bg-red-50 hover:text-red-700")}
      {!isVoid && doc.status !== "draft" && icon("Void", Ban, () => onConfirm("void"), "text-red-600 hover:bg-red-50 hover:text-red-700")}
    </div>
  );
}

const CONFIRM = {
  issue: { title: "Issue delivery order?", button: "Issue & take out of stock", run: issueDocument, done: (d) => `${d.docNo} issued.` },
  void: { title: "Void document?", button: "Void", danger: true, run: voidDocument, done: (d) => `${d.docNo} voided.` },
  delete: { title: "Delete draft?", button: "Delete", danger: true, run: deleteDocument, done: (d) => `${d.docNo} deleted.` },
  unpaid: { title: "Mark invoice unpaid?", button: "Mark unpaid", run: (id) => setInvoicePaid(id, null), done: (d) => `${d.docNo} marked unpaid.` },
};

function ConfirmDialog({ action, doc, onClose, onDone }) {
  const cfg = CONFIRM[action];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const stockLines = doc.type === "delivery_order" && doc.orderId == null ? doc.lines.filter((l) => l.variantId != null) : [];
  const showStock = (action === "issue" || (action === "void" && doc.status === "issued")) && doc.type === "delivery_order";

  async function go() {
    setBusy(true);
    setError("");
    try {
      await cfg.run(doc.id);
      onDone(cfg.done(doc));
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
          <Button onClick={go} disabled={busy} className={cfg.danger ? "bg-red-600 hover:bg-red-700" : undefined}>
            {cfg.button}
          </Button>
        </>
      }
    >
      <p className="text-sm">
        <span className="font-mono font-semibold">{doc.docNo}</span> · {doc.billToName}
      </p>
      {showStock && doc.orderId != null && (
        <p className="text-muted-foreground mt-3 text-sm">This delivery order belongs to website order {doc.orderNo}, which already took its stock, so stock doesn't change.</p>
      )}
      {showStock && doc.orderId == null && (
        <>
          <ul className="mt-3 space-y-1 rounded-lg border p-3 text-sm">
            {stockLines.map((l) => (
              <li key={l.id} className="flex justify-between gap-3">
                <span className="truncate">{l.description}</span>
                <span className={cn("font-semibold whitespace-nowrap", action === "issue" ? "text-red-700" : "text-emerald-700")}>
                  {action === "issue" ? "−" : "+"}
                  {formatNumber(l.qty)}
                </span>
              </li>
            ))}
            {stockLines.length === 0 && <li className="text-muted-foreground">No lines are linked to a product, so stock doesn't change.</li>}
          </ul>
          {action === "void" && <p className="text-muted-foreground mt-2 text-xs">The quantities go back into stock.</p>}
        </>
      )}
      {action === "void" && doc.type !== "delivery_order" && (
        <p className="text-muted-foreground mt-3 text-sm">The number stays on record and the document can't be edited afterwards.</p>
      )}
      {error && <p className="text-destructive mt-3 rounded-md bg-red-50 px-3 py-2 text-sm">{error}</p>}
    </Modal>
  );
}

function PaidDialog({ doc, onClose, onDone }) {
  const [paidAt, setPaidAt] = useState(localISODate());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function go(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await setInvoicePaid(doc.id, paidAt);
      onDone(`${doc.docNo} marked paid.`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Mark ${doc.docNo} paid`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="paid-form" disabled={busy}>
            Mark paid
          </Button>
        </>
      }
    >
      <form id="paid-form" onSubmit={go} className="flex flex-col gap-3">
        <p className="text-sm">
          {doc.billToName} · <span className="font-semibold">{formatRM(doc.total)}</span>
        </p>
        <FormField label="Payment date" htmlFor="paidAt">
          <Input id="paidAt" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} required />
        </FormField>
        {error && <p className="text-destructive text-sm">{error}</p>}
      </form>
    </Modal>
  );
}

function DocForm({ initial, tabType, next, clients, validDays, onClose, onSaved }) {
  const isNew = !initial.id;
  const type = initial.type;
  const isDO = type === "delivery_order";
  const [seq, setSeq] = useState("");
  const [docDate, setDocDate] = useState(initial.docDate ?? localISODate());
  const [validUntil, setValidUntil] = useState(initial.validUntil ?? (type === "quotation" ? addDays(initial.docDate ?? localISODate(), validDays) : ""));
  const [validTouched, setValidTouched] = useState(Boolean(initial.validUntil));
  const [billToName, setBillToName] = useState(initial.billToName ?? "");
  const [billToAddress, setBillToAddress] = useState(initial.billToAddress ?? "");
  const [attention, setAttention] = useState(initial.attention ?? "");
  const [customerRef, setCustomerRef] = useState(initial.customerRef ?? "");
  const [otherLabel, setOtherLabel] = useState(initial.otherLabel ?? "");
  const [otherAmount, setOtherAmount] = useState(initial.otherAmount ? String(initial.otherAmount) : "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [lines, setLines] = useState(
    initial.lines?.length
      ? initial.lines.map((l) => ({ ...l, key: newKey(), note: l.note ?? "", qty: String(l.qty), unitPrice: isDO && !l.unitPrice ? "" : String(l.unitPrice) }))
      : [emptyLine()],
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
    for (const v of stock) map.set(v.productName, [...(map.get(v.productName) ?? []), v]);
    return [...map];
  }, [stock]);

  const updateLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function pickVariant(key, value) {
    if (!value) return updateLine(key, { variantId: null, sku: "" });
    const v = stock.find((s) => String(s.variantId) === value);
    updateLine(key, { variantId: v.variantId, sku: v.sku, description: [v.productName, v.variantName].filter(Boolean).join(" — ") });
  }

  function changeDate(value) {
    setDocDate(value);
    if (type === "quotation" && !validTouched && value) setValidUntil(addDays(value, validDays));
  }

  function changeBillTo(value) {
    setBillToName(value);
    const client = clients.find((c) => c.name.toLowerCase() === value.trim().toLowerCase());
    if (client && !billToAddress.trim()) {
      setBillToAddress(client.address);
      if (!attention.trim()) setAttention(client.attention);
    }
  }

  const subtotal = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0);
  const total = subtotal + (type === "invoice" ? Number(otherAmount) || 0 : 0);
  const numberHint = type === tabType && Number(docDate.slice(0, 4)) === next.year ? `Leave empty for ${next.docNo}` : "Leave empty for the next number";

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError("");
    try {
      const saved = await saveDocument({
        id: initial.id,
        type,
        seq: isNew && seq ? Number(seq) : undefined,
        sourceId: initial.sourceId,
        orderId: initial.orderId,
        paidAt: isNew ? initial.paidAt : undefined,
        docDate,
        validUntil: type === "quotation" ? validUntil : null,
        billToName,
        billToAddress,
        attention,
        customerRef,
        otherLabel,
        otherAmount: otherAmount === "" ? 0 : Number(otherAmount),
        notes,
        lines: lines.map((l) => ({
          variantId: l.variantId,
          sku: l.sku,
          description: l.description,
          note: l.note,
          qty: Number(l.qty),
          unitPrice: l.unitPrice === "" ? null : Number(l.unitPrice),
        })),
      });
      onSaved(saved);
    } catch (err) {
      setErrors(err.body?.fields ?? {});
      setFormError(err.message);
      setSaving(false);
    }
  }

  const title = isNew ? `New ${DOC_TITLE[type].toLowerCase()}` : `Edit ${initial.docNo}`;

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      className="max-w-4xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="doc-form" disabled={saving}>
            {isNew ? (isDO ? "Save draft" : "Create") : "Save"}
          </Button>
        </>
      }
    >
      <form id="doc-form" onSubmit={onSubmit} className="flex flex-col gap-5">
        {initial.fromLabel && <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">Copied from {initial.fromLabel}. Check the details, then save.</p>}
        {isDO && isNew && !initial.orderId && <p className="text-muted-foreground text-sm">Saved as a draft. Stock only changes when you issue it.</p>}

        <div className="grid gap-4 sm:grid-cols-3">
          {isNew ? (
            <FormField label="Number (optional)" htmlFor="seq" error={errors.seq}>
              <Input id="seq" type="number" min="1" step="1" value={seq} onChange={(e) => setSeq(e.target.value)} placeholder="Auto" />
              <p className="text-muted-foreground text-xs">{numberHint}</p>
            </FormField>
          ) : (
            <FormField label="Number">
              <Input value={initial.docNo} disabled />
            </FormField>
          )}
          <FormField label="Date" htmlFor="docDate" error={errors.docDate}>
            <Input id="docDate" type="date" value={docDate} onChange={(e) => changeDate(e.target.value)} />
          </FormField>
          {type === "quotation" ? (
            <FormField label="Valid until" htmlFor="validUntil" error={errors.validUntil}>
              <Input
                id="validUntil"
                type="date"
                value={validUntil}
                onChange={(e) => {
                  setValidUntil(e.target.value);
                  setValidTouched(true);
                }}
              />
            </FormField>
          ) : (
            <FormField label={isDO ? "Customer PO (optional)" : "Customer ref / PO (optional)"} htmlFor="customerRef">
              <Input id="customerRef" value={customerRef} onChange={(e) => setCustomerRef(e.target.value)} />
            </FormField>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-4">
            <FormField label={isDO ? "Deliver to (company or name)" : "Bill to (company or name)"} htmlFor="billToName" error={errors.billToName}>
              <Input id="billToName" list="client-list" value={billToName} onChange={(e) => changeBillTo(e.target.value)} autoComplete="off" />
              <datalist id="client-list">
                {clients.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </FormField>
            <FormField label="Attention (optional)" htmlFor="attention">
              <Input id="attention" value={attention} onChange={(e) => setAttention(e.target.value)} placeholder="Contact person" />
            </FormField>
            {type === "quotation" && (
              <FormField label="Customer ref (optional)" htmlFor="customerRef">
                <Input id="customerRef" value={customerRef} onChange={(e) => setCustomerRef(e.target.value)} />
              </FormField>
            )}
          </div>
          <FormField label="Address" htmlFor="billToAddress">
            <textarea id="billToAddress" rows={5} value={billToAddress} onChange={(e) => setBillToAddress(e.target.value)} className={textareaClass} />
          </FormField>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Items</h3>
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
                <div key={l.key} className="grid grid-cols-2 items-start gap-2 rounded-lg border p-3 sm:grid-cols-6">
                  <FormField label="Product" className="col-span-2 sm:col-span-2">
                    <Select value={l.variantId ?? ""} onChange={(e) => pickVariant(l.key, e.target.value)}>
                      <option value="">{isDO ? "Custom item (no stock change)" : "Custom item / service"}</option>
                      {groups.map(([name, variants]) => (
                        <optgroup key={name} label={name}>
                          {variants.map((v) => (
                            <option key={v.variantId} value={v.variantId}>
                              {v.variantName ? `${v.variantName} · ` : ""}
                              {v.sku}
                              {isDO ? ` (stock ${v.available})` : ""}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label="Description" error={err("description")} className="col-span-2 sm:col-span-4">
                    <textarea
                      rows={Math.min(Math.max(l.description.split("\n").length, 1), 6)}
                      value={l.description}
                      onChange={(e) => updateLine(l.key, { description: e.target.value })}
                      className={textareaClass}
                    />
                  </FormField>
                  <FormField label="Note (optional, italic)" className="col-span-2 sm:col-span-3">
                    <Input value={l.note} onChange={(e) => updateLine(l.key, { note: e.target.value })} placeholder="e.g. Warranty 1 year upon delivery date" />
                  </FormField>
                  <FormField label="Qty" error={err("qty")} className={isDO ? "sm:col-span-2" : undefined}>
                    <Input type="number" min="1" step="1" value={l.qty} onChange={(e) => updateLine(l.key, { qty: e.target.value })} />
                  </FormField>
                  {!isDO && (
                    <FormField label="Unit price (RM)" error={err("unitPrice")}>
                      <Input type="number" step="0.01" value={l.unitPrice} onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })} />
                    </FormField>
                  )}
                  <div className="col-span-2 flex items-center justify-between sm:col-span-6">
                    <span className="text-muted-foreground text-xs">{!isDO && `Amount ${formatRM((Number(l.qty) || 0) * (Number(l.unitPrice) || 0))}`}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={lines.length === 1}
                      onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 />
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {type === "invoice" && (
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Other charge / discount label" htmlFor="otherLabel" className="sm:col-span-2">
              <Input id="otherLabel" value={otherLabel} onChange={(e) => setOtherLabel(e.target.value)} placeholder="e.g. Delivery, Discount" />
            </FormField>
            <FormField label="Amount (RM, minus for discount)" htmlFor="otherAmount" error={errors.otherAmount}>
              <Input id="otherAmount" type="number" step="0.01" value={otherAmount} onChange={(e) => setOtherAmount(e.target.value)} placeholder="0.00" />
            </FormField>
          </div>
        )}

        <FormField label="Remarks (optional, printed)" htmlFor="notes">
          <textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={textareaClass} />
        </FormField>

        {formError && <p className="text-destructive text-sm">{formError}</p>}
        {!isDO && (
          <div className="flex justify-end border-t pt-4 text-base">
            <span className="text-muted-foreground mr-3">Total</span>
            <span className="font-bold tabular-nums">{formatRM(total)}</span>
          </div>
        )}
      </form>
    </Modal>
  );
}
