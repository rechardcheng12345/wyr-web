import { Loader2, RotateCcw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FormField, Select } from "../components/FormField";
import { PageHeader } from "../components/PageHeader";
import { formatRM } from "../format";
import { listSettings, saveSettings } from "../services/settingsService";

const asText = (v) => (v == null ? "" : String(v));

function displayDefault(s) {
  if (s.type === "money") return s.defaultValue == null ? "(off)" : formatRM(s.defaultValue);
  if (s.type === "select") return s.options.find((o) => o.value === s.defaultValue)?.label ?? s.defaultValue;
  return asText(s.defaultValue) || "(empty)";
}

export function StaticPage() {
  const [settings, setSettings] = useState([]);
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  function apply(list) {
    setSettings(list);
    setForm(Object.fromEntries(list.map((s) => [s.key, asText(s.value)])));
  }

  useEffect(() => {
    listSettings()
      .then(apply)
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  const groups = useMemo(() => {
    const map = new Map();
    for (const s of settings) map.set(s.group, [...(map.get(s.group) ?? []), s]);
    return [...map];
  }, [settings]);

  const changed = settings.filter((s) => form[s.key] !== asText(s.value));

  async function onSave(e) {
    e.preventDefault();
    if (!changed.length) return;
    setSaving(true);
    setErrors({});
    setError("");
    setNotice("");
    try {
      apply(await saveSettings(Object.fromEntries(changed.map((s) => [s.key, form[s.key]]))));
      setNotice(`Saved ${changed.length} change${changed.length === 1 ? "" : "s"}. They apply to the shop straight away.`);
    } catch (err) {
      setErrors(err.body?.fields ?? {});
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <form onSubmit={onSave}>
      <PageHeader
        title="Static"
        description="Fixed values the shop uses: shipping fees, checkout and contact details."
        actions={
          <>
            <Button type="button" variant="outline" disabled={!changed.length || saving} onClick={() => apply(settings)}>
              <RotateCcw />
              Discard
            </Button>
            <Button type="submit" disabled={!changed.length || saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              Save changes{changed.length ? ` (${changed.length})` : ""}
            </Button>
          </>
        }
      />

      {notice && (
        <p role="status" className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </p>
      )}
      {error && <p className="text-destructive mb-4 rounded-md bg-red-50 px-3 py-2 text-sm">{error}</p>}

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="text-muted-foreground size-6 animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(([group, items]) => (
            <Card key={group}>
              <CardContent className="p-5">
                <h2 className="mb-4 font-semibold">{group}</h2>
                <div className="grid gap-5 md:grid-cols-2">
                  {items.map((s) => {
                    const dirty = form[s.key] !== asText(s.value);
                    const atDefault = form[s.key] === asText(s.defaultValue);
                    return (
                      <FormField key={s.key} label={s.label} htmlFor={s.key} error={errors[s.key]} className={cn(s.type === "select" || s.type === "url" ? "md:col-span-2" : "")}>
                        <SettingInput setting={s} value={form[s.key] ?? ""} onChange={set(s.key)} dirty={dirty} />
                        <p className="text-muted-foreground text-xs">{s.help}</p>
                        <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
                          <span>Default: {displayDefault(s)}</span>
                          {!atDefault && (
                            <button type="button" onClick={() => setForm((f) => ({ ...f, [s.key]: asText(s.defaultValue) }))} className="text-primary font-medium hover:underline">
                              Use default
                            </button>
                          )}
                          {s.updatedAt && !s.isDefault && <span>· changed {new Date(s.updatedAt).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>}
                        </p>
                      </FormField>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </form>
  );
}

function SettingInput({ setting: s, value, onChange, dirty }) {
  const ring = dirty ? "border-amber-400 bg-amber-50/40" : "";
  if (s.type === "select") {
    return (
      <Select id={s.key} value={value} onChange={onChange} className={ring}>
        {s.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    );
  }
  if (s.type === "money") {
    return (
      <div className="flex items-center">
        <span className="bg-muted text-muted-foreground border-input flex h-9 items-center rounded-l-md border border-r-0 px-3 text-sm">RM</span>
        <Input
          id={s.key}
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          placeholder={s.optional ? "Off" : undefined}
          value={value}
          onChange={onChange}
          className={cn("rounded-l-none", ring)}
        />
      </div>
    );
  }
  if (s.type === "int") {
    return <Input id={s.key} type="number" min="0" step="1" value={value} onChange={onChange} className={ring} />;
  }
  if (s.type === "text") {
    return <Input id={s.key} type="text" value={value} onChange={onChange} className={ring} />;
  }
  return <Input id={s.key} type={s.type === "url" ? "url" : "tel"} value={value} onChange={onChange} className={ring} />;
}
