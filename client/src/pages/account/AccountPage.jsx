import { useMutation } from "@tanstack/react-query";
import { Loader2, LogOut } from "lucide-react";
import { useState } from "react";
import { Field } from "@/components/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changePassword, logout, logoutEverywhere, updateProfile, useCustomer, useSetCustomer } from "@/lib/account";
import { ApiError } from "@/lib/api";
import { MALAYSIAN_STATES } from "@/lib/checkout";
import { AccountHeader } from "./AccountNav";

const selectClass =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm";

function fieldsOf(err) {
  return err instanceof ApiError ? (err.body?.fields ?? {}) : {};
}

function Notice({ mutation, success }) {
  if (mutation.isSuccess) return <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">{success}</p>;
  if (mutation.isError && !Object.keys(fieldsOf(mutation.error)).length) {
    return <p className="text-destructive rounded-md bg-red-50 px-3 py-2 text-sm" role="alert">{mutation.error instanceof ApiError ? mutation.error.message : "Something went wrong."}</p>;
  }
  return null;
}

export function AccountPage() {
  const { customer } = useCustomer();
  const setCustomer = useSetCustomer();

  const signOut = useMutation({
    mutationFn: (everywhere) => (everywhere ? logoutEverywhere() : logout()),
    onSuccess: () => window.location.assign("/"),
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <title>My account · WYR Technology</title>
      <AccountHeader title="Account details" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <ProfileForm key={customer.id} customer={customer} onSaved={setCustomer} />
        <div className="space-y-6">
          <PasswordForm onSaved={setCustomer} />
          <section className="bg-card rounded-xl border p-5">
            <h2 className="font-semibold">Log out</h2>
            <p className="text-muted-foreground mt-1 text-sm">Signed in as {customer.email}</p>
            <div className="mt-4 flex flex-col gap-2">
              <Button variant="outline" onClick={() => signOut.mutate(false)} disabled={signOut.isPending}>
                <LogOut />
                Log out
              </Button>
              <Button variant="ghost" size="sm" onClick={() => signOut.mutate(true)} disabled={signOut.isPending}>
                Log out on all devices
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function ProfileForm({ customer, onSaved }) {
  const [form, setForm] = useState({ name: customer.name ?? "", phone: customer.phone ?? "", ...customer.address });
  const save = useMutation({
    mutationFn: () => updateProfile({ name: form.name, phone: form.phone, address: { addressLine: form.addressLine, postcode: form.postcode, city: form.city, state: form.state } }),
    onSuccess: onSaved,
  });
  const errors = fieldsOf(save.error);
  const set = (k) => (e) => {
    save.reset();
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  return (
    <form
      className="bg-card h-fit rounded-xl border p-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <h2 className="font-semibold">Profile and delivery address</h2>
      <p className="text-muted-foreground mt-1 text-sm">Used to fill in checkout for you.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Full name" error={errors.name}>
          <Input autoComplete="name" value={form.name} onChange={set("name")} required />
        </Field>
        <Field label="Phone" error={errors.phone}>
          <Input type="tel" autoComplete="tel" placeholder="012-345 6789" value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label="Email" hint="Contact us to change your login email." className="sm:col-span-2">
          <Input value={customer.email} disabled />
        </Field>
        <Field label="Address" error={errors.addressLine} className="sm:col-span-2">
          <Input autoComplete="street-address" value={form.addressLine} onChange={set("addressLine")} />
        </Field>
        <Field label="Postcode" error={errors.postcode}>
          <Input inputMode="numeric" autoComplete="postal-code" maxLength={5} value={form.postcode} onChange={set("postcode")} />
        </Field>
        <Field label="City" error={errors.city}>
          <Input autoComplete="address-level2" value={form.city} onChange={set("city")} />
        </Field>
        <Field label="State" error={errors.state} className="sm:col-span-2">
          <select value={form.state} onChange={set("state")} className={selectClass}>
            <option value="">Choose a state</option>
            {MALAYSIAN_STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-5 space-y-3">
        <Notice mutation={save} success="Saved." />
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />}
          Save changes
        </Button>
      </div>
    </form>
  );
}

function PasswordForm({ onSaved }) {
  const [form, setForm] = useState({ current: "", next: "" });
  const save = useMutation({
    mutationFn: () => changePassword(form.current, form.next),
    onSuccess: (customer) => {
      setForm({ current: "", next: "" });
      onSaved(customer);
    },
  });
  const errors = fieldsOf(save.error);
  const set = (k) => (e) => {
    save.reset();
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  return (
    <form
      className="bg-card rounded-xl border p-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <h2 className="font-semibold">Change password</h2>
      <div className="mt-4 space-y-4">
        <Field label="Current password" error={errors.currentPassword}>
          <Input type="password" autoComplete="current-password" value={form.current} onChange={set("current")} required />
        </Field>
        <Field label="New password" hint="At least 8 characters. Other devices will be logged out." error={errors.newPassword}>
          <Input type="password" autoComplete="new-password" value={form.next} onChange={set("next")} required />
        </Field>
        <Notice mutation={save} success="Password changed." />
        <Button type="submit" variant="outline" className="w-full" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />}
          Update password
        </Button>
      </div>
    </form>
  );
}
