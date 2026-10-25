import { Loader2, Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DataTable } from "../components/DataTable";
import { FormField, Select } from "../components/FormField";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { formatRM } from "../format";
import { listVouchers, saveVoucher } from "../services/vouchersService";

const EMPTY = { id: null, code: "", type: "percent", value: "", minSpend: "", usageLimit: "", startsAt: "", expiresAt: "", active: true };

function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const blank = (v) => (v == null ? "" : String(v));

function fromServer(v) {
  return { ...v, value: blank(v.value), minSpend: blank(v.minSpend), usageLimit: blank(v.usageLimit), startsAt: toLocalInput(v.startsAt), expiresAt: toLocalInput(v.expiresAt) };
}

function toServer(f) {
  return {
    ...f,
    startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : null,
    expiresAt: f.expiresAt ? new Date(f.expiresAt).toISOString() : null,
  };
}

function statusOf(v) {
  const now = Date.now();
  if (!v.active) return ["Inactive", "bg-slate-100 text-slate-600"];
  if (v.startsAt && new Date(v.startsAt).getTime() > now) return ["Scheduled", "bg-blue-50 text-blue-700"];
  if (v.expiresAt && new Date(v.expiresAt).getTime() <= now) return ["Expired", "bg-red-50 text-red-700"];
  if (v.usageLimit != null && v.usedCount >= v.usageLimit) return ["Used up", "bg-amber-50 text-amber-800"];
  return ["Active", "bg-emerald-50 text-emerald-700"];
}

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString("en-MY", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—");

export function VouchersPage() {
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(null);

  async function load() {
    setLoading(true);
    try {
      setVouchers(await listVouchers());
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggle(v) {
    try {
      await saveVoucher({ ...v, active: !v.active });
      setNotice(`${v.code} ${v.active ? "deactivated" : "activated"}.`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const columns = [
    { key: "code", header: "Code", render: (v) => <span className="font-mono font-semibold">{v.code}</span> },
    { key: "value", header: "Discount", render: (v) => (v.type === "percent" ? `${v.value}% off` : `${formatRM(v.value)} off`) },
    { key: "minSpend", header: "Min. spend", render: (v) => (v.minSpend ? formatRM(v.minSpend) : "—") },
    { key: "usage", header: "Used", align: "right", render: (v) => `${v.usedCount}${v.usageLimit != null ? ` / ${v.usageLimit}` : ""}` },
    { key: "dates", header: "Valid", render: (v) => (v.startsAt || v.expiresAt ? `${fmtDate(v.startsAt)} → ${fmtDate(v.expiresAt)}` : "No expiry") },
    {
      key: "status",
      header: "Status",
      render: (v) => {
        const [label, cls] = statusOf(v);
        return <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", cls)}>{label}</span>;
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (v) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(fromServer(v))}>
            <Pencil />
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={() => toggle(v)}>
            {v.active ? "Deactivate" : "Activate"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Vouchers"
        description="Discount codes customers enter at checkout. Usage is counted when an order is paid."
        actions={
          <Button onClick={() => setEditing({ ...EMPTY })}>
            <Plus />
            New voucher
          </Button>
        }
      />
      {notice && (
        <p role="status" className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </p>
      )}
      {error && <p className="text-destructive mb-4 rounded-md bg-red-50 px-3 py-2 text-sm">{error}</p>}
      <DataTable columns={columns} rows={vouchers} isLoading={loading} emptyMessage="No vouchers yet." />
      {editing && (
        <VoucherDialog
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={(v) => {
            setEditing(null);
            setNotice(`Saved ${v.code}.`);
            load();
          }}
        />
      )}
    </>
  );
}

function VoucherDialog({ initial, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setError("");
    try {
      onSaved(await saveVoucher(toServer(form)));
    } catch (err) {
      setErrors(err.body?.fields ?? {});
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={form.id ? `Edit ${initial.code}` : "New voucher"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="voucher-form" disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            Save
          </Button>
        </>
      }
    >
      <form id="voucher-form" onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
        {error && <p className="text-destructive rounded-md bg-red-50 px-3 py-2 text-sm sm:col-span-2">{error}</p>}
        <FormField label="Code" htmlFor="v-code" error={errors.code} className="sm:col-span-2">
          <Input id="v-code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} className="font-mono uppercase" />
        </FormField>
        <FormField label="Type" htmlFor="v-type" error={errors.type}>
          <Select id="v-type" value={form.type} onChange={set("type")}>
            <option value="percent">Percent off subtotal</option>
            <option value="fixed">Fixed RM off subtotal</option>
          </Select>
        </FormField>
        <FormField label={form.type === "percent" ? "Percent" : "Amount (RM)"} htmlFor="v-value" error={errors.value}>
          <Input id="v-value" type="number" min="0" step="0.01" value={form.value} onChange={set("value")} />
        </FormField>
        <FormField label="Min. spend (RM, optional)" htmlFor="v-min" error={errors.minSpend}>
          <Input id="v-min" type="number" min="0" step="0.01" value={form.minSpend} onChange={set("minSpend")} />
        </FormField>
        <FormField label="Usage limit (optional)" htmlFor="v-limit" error={errors.usageLimit}>
          <Input id="v-limit" type="number" min="1" step="1" value={form.usageLimit} onChange={set("usageLimit")} />
        </FormField>
        <FormField label="Starts (optional)" htmlFor="v-start" error={errors.startsAt}>
          <Input id="v-start" type="datetime-local" value={form.startsAt} onChange={set("startsAt")} />
        </FormField>
        <FormField label="Expires (optional)" htmlFor="v-end" error={errors.expiresAt}>
          <Input id="v-end" type="datetime-local" value={form.expiresAt} onChange={set("expiresAt")} />
        </FormField>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={form.active} onChange={set("active")} className="size-4" />
          Active
        </label>
      </form>
    </Modal>
  );
}
