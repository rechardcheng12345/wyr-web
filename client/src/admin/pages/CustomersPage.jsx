import { ArrowLeft, FilePlus2, Mail, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DataTable } from "../components/DataTable";
import { FormField } from "../components/FormField";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { DOC_TITLE } from "../components/PrintDocument";
import { formatDate, formatRM } from "../format";
import { deleteClient, getClient, listClients, saveClient } from "../services/documentsService";

const textareaClass =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm";

function docCounts(c) {
  return [
    [c.quotations, "quotation"],
    [c.invoices, "invoice"],
    [c.deliveryOrders, "DO"],
  ]
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}${n === 1 ? "" : "s"}`)
    .join(" · ");
}

/** Opens the document form on the Documents page, filled in for this customer. */
function useNewDocument() {
  const navigate = useNavigate();
  return (client, type) => navigate(`/system/documents?type=${type}`, { state: { newFor: client } });
}

function NewDocButtons({ client, size = "sm" }) {
  const newDocument = useNewDocument();
  return (
    <>
      <Button size={size} variant="outline" onClick={() => newDocument(client, "quotation")}>
        <FilePlus2 />
        Quotation
      </Button>
      <Button size={size} variant="outline" onClick={() => newDocument(client, "invoice")}>
        <FilePlus2 />
        Invoice
      </Button>
    </>
  );
}

export function CustomersPage() {
  const [clients, setClients] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    listClients()
      .then((list) => {
        setClients(list);
        setError("");
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!clients) return [];
    return clients.filter((c) => !q || [c.name, c.attention, c.phone, c.email, c.address].some((v) => v?.toLowerCase().includes(q)));
  }, [clients, query]);

  const unpaid = clients?.reduce((s, c) => s + c.unpaid, 0) ?? 0;

  const columns = [
    {
      key: "name",
      header: "Customer",
      className: "min-w-56",
      render: (c) => (
        <Link to={`/system/customers/${c.id}`} className="group block">
          <p className="font-medium group-hover:underline">{c.name}</p>
          {c.attention && <p className="text-muted-foreground text-xs">Attn: {c.attention}</p>}
        </Link>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      className: "text-xs",
      render: (c) => (
        <div className="text-muted-foreground flex flex-col gap-0.5">
          {c.phone && <span className="whitespace-nowrap">{c.phone}</span>}
          {c.email && <span className="break-all">{c.email}</span>}
          {!c.phone && !c.email && <span>–</span>}
        </div>
      ),
    },
    { key: "docs", header: "Documents", className: "text-xs whitespace-nowrap", render: (c) => docCounts(c) || <span className="text-muted-foreground">None yet</span> },
    {
      key: "invoiced",
      header: "Invoiced",
      align: "right",
      render: (c) => (
        <div className="whitespace-nowrap">
          <p className="font-medium">{formatRM(c.invoiced)}</p>
          {c.unpaid > 0 && <p className="text-xs text-amber-700">{formatRM(c.unpaid)} unpaid</p>}
        </div>
      ),
    },
    { key: "last", header: "Last document", className: "whitespace-nowrap", render: (c) => (c.lastDocDate ? formatDate(c.lastDocDate) : "–") },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (c) => (
        <div className="flex justify-end gap-1">
          <NewDocButtons client={c} />
          <Button variant="ghost" size="icon" onClick={() => setEditing(c)} aria-label="Edit" title="Edit">
            <Pencil />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone you've sent a quotation, invoice or delivery order to. They're saved automatically when you save a document."
        actions={
          <Button onClick={() => setEditing({})}>
            <Plus />
            New customer
          </Button>
        }
      />
      {notice && (
        <p role="status" className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </p>
      )}
      {error && <p className="text-destructive mb-4 rounded-md bg-red-50 px-3 py-2 text-sm">{error}</p>}
      {unpaid > 0 && <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{formatRM(unpaid)} unpaid across all customers</p>}

      <div className="relative mb-4 sm:w-80">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, contact, phone, email" className="bg-white pl-9" />
      </div>

      <DataTable columns={columns} rows={rows} isLoading={!clients && !error} emptyMessage={clients?.length ? "Nothing matches." : "No customers yet. They appear here once you save a quotation or invoice."} />

      {editing && (
        <ClientDialog
          client={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved, wasNew) => {
            setEditing(null);
            if (wasNew) navigate(`/system/customers/${saved.id}`);
            else {
              setNotice(`Saved ${saved.name}.`);
              load();
            }
          }}
        />
      )}
    </>
  );
}

function StatusText({ doc }) {
  if (doc.status === "void") return <span className="text-red-700">Void</span>;
  if (doc.type === "invoice") return doc.paidAt ? <span className="text-emerald-700">Paid {formatDate(doc.paidAt)}</span> : <span className="text-amber-700">Unpaid</span>;
  if (doc.status === "draft") return <span className="text-muted-foreground">Draft</span>;
  return <span className="text-muted-foreground">Issued</span>;
}

export function CustomerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    getClient(id)
      .then((c) => {
        setClient(c);
        setError("");
      })
      .catch((err) => setError(err.message));
  }, [id]);

  useEffect(load, [load]);

  if (error && !client) {
    return (
      <>
        <BackLink />
        <p className="text-destructive rounded-md bg-red-50 px-3 py-2 text-sm">{error}</p>
      </>
    );
  }

  const columns = [
    {
      key: "docNo",
      header: "Number",
      className: "font-mono text-xs whitespace-nowrap",
      render: (d) => (
        <button className="hover:underline" onClick={() => navigate(`/system/documents?type=${d.type}`, { state: { search: d.docNo } })}>
          {d.docNo}
        </button>
      ),
    },
    { key: "type", header: "Type", className: "whitespace-nowrap", render: (d) => DOC_TITLE[d.type] },
    { key: "docDate", header: "Date", className: "whitespace-nowrap", render: (d) => formatDate(d.docDate) },
    { key: "ref", header: "Ref", className: "text-muted-foreground text-xs", render: (d) => d.customerRef },
    { key: "total", header: "Total", align: "right", render: (d) => (d.type === "delivery_order" ? "–" : formatRM(d.total)) },
    { key: "status", header: "Status", className: "text-xs whitespace-nowrap", render: (d) => <StatusText doc={d} /> },
  ];

  return (
    <>
      <BackLink />
      <PageHeader
        title={client?.name ?? "Customer"}
        description={client ? docCounts(client) || "No documents yet" : undefined}
        actions={
          client && (
            <>
              <NewDocButtons client={client} size="default" />
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil />
                Edit
              </Button>
              {client.documents.length === 0 && (
                <Button variant="outline" onClick={() => setDeleting(true)} className="text-red-600 hover:bg-red-50 hover:text-red-700">
                  <Trash2 />
                  Delete
                </Button>
              )}
            </>
          )
        }
      />
      {client && (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <div className="bg-card rounded-xl border p-4 shadow-xs md:col-span-2">
              <h2 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">Details</h2>
              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground text-xs">Address</p>
                  <p className="whitespace-pre-line">{client.address || "–"}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <div>
                    <p className="text-muted-foreground text-xs">Attention</p>
                    <p>{client.attention || "–"}</p>
                  </div>
                  <p className="flex items-center gap-2">
                    <Phone className="text-muted-foreground size-4 shrink-0" />
                    {client.phone ? <a href={`tel:${client.phone.replace(/[^\d+]/g, "")}`}>{client.phone}</a> : "–"}
                  </p>
                  <p className="flex items-center gap-2 break-all">
                    <Mail className="text-muted-foreground size-4 shrink-0" />
                    {client.email ? <a href={`mailto:${client.email}`}>{client.email}</a> : "–"}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-xl border p-4 shadow-xs">
              <h2 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">Invoiced</h2>
              <p className="text-2xl font-bold tabular-nums">{formatRM(client.invoiced)}</p>
              <p className={cn("mt-1 text-sm", client.unpaid > 0 ? "text-amber-700" : "text-muted-foreground")}>
                {client.unpaid > 0 ? `${formatRM(client.unpaid)} unpaid` : "Nothing unpaid"}
              </p>
              {client.lastDocDate && <p className="text-muted-foreground mt-3 text-xs">Last document {formatDate(client.lastDocDate)}</p>}
            </div>
          </div>
          <h2 className="mb-3 text-lg font-semibold">Documents</h2>
        </>
      )}
      <DataTable columns={columns} rows={client?.documents ?? []} isLoading={!client} emptyMessage="No documents yet." />

      {editing && (
        <ClientDialog
          client={client}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      )}
      {deleting && <DeleteDialog client={client} onClose={() => setDeleting(false)} onDone={() => navigate("/system/customers")} />}
    </>
  );
}

function BackLink() {
  return (
    <Link to="/system/customers" className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm">
      <ArrowLeft className="size-4" />
      Customers
    </Link>
  );
}

function ClientDialog({ client, onClose, onSaved }) {
  const isNew = !client.id;
  const [form, setForm] = useState({
    name: client.name ?? "",
    attention: client.attention ?? "",
    phone: client.phone ?? "",
    email: client.email ?? "",
    address: client.address ?? "",
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError("");
    try {
      const saved = await saveClient({ id: client.id, ...form });
      onSaved(saved, isNew);
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
      title={isNew ? "New customer" : `Edit ${client.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="client-form" disabled={saving}>
            Save
          </Button>
        </>
      }
    >
      <form id="client-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField label="Company or name" htmlFor="c-name" error={errors.name}>
          <Input id="c-name" value={form.name} onChange={set("name")} autoFocus={isNew} />
        </FormField>
        <FormField label="Attention (optional)" htmlFor="c-attention">
          <Input id="c-attention" value={form.attention} onChange={set("attention")} placeholder="Contact person" />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Phone (optional)" htmlFor="c-phone">
            <Input id="c-phone" type="tel" value={form.phone} onChange={set("phone")} />
          </FormField>
          <FormField label="Email (optional)" htmlFor="c-email" error={errors.email}>
            <Input id="c-email" type="email" value={form.email} onChange={set("email")} />
          </FormField>
        </div>
        <FormField label="Address" htmlFor="c-address">
          <textarea id="c-address" rows={4} value={form.address} onChange={set("address")} className={textareaClass} />
        </FormField>
        {!isNew && <p className="text-muted-foreground text-xs">New documents use these details. Documents already issued keep what was printed on them.</p>}
        {formError && <p className="text-destructive text-sm">{formError}</p>}
      </form>
    </Modal>
  );
}

function DeleteDialog({ client, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function go() {
    setBusy(true);
    setError("");
    try {
      await deleteClient(client.id);
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Delete customer?"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Back
          </Button>
          <Button onClick={go} disabled={busy} className="bg-red-600 hover:bg-red-700">
            Delete
          </Button>
        </>
      }
    >
      <p className="text-sm">{client.name}</p>
      {error && <p className="text-destructive mt-3 rounded-md bg-red-50 px-3 py-2 text-sm">{error}</p>}
    </Modal>
  );
}
