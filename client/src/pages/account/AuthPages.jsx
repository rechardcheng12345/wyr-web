import { useMutation } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Field } from "@/components/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login, register, safeNext, useCustomer, useSetCustomer } from "@/lib/account";
import { ApiError } from "@/lib/api";

function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="mx-auto max-w-md px-4 py-14 sm:py-20">
      <div className="bg-card rounded-2xl border p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-1.5 text-sm">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
      <p className="text-muted-foreground mt-6 text-center text-sm">{footer}</p>
    </div>
  );
}

function PasswordInput({ value, onChange, autoComplete, name = "password" }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input name={name} type={shown ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={onChange} required className="pr-10" />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 grid w-10 place-items-center"
        aria-label={shown ? "Hide password" : "Show password"}
      >
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function errorText(err) {
  return err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
}

function useAuthDone() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const setCustomer = useSetCustomer();
  const next = safeNext(params.get("next"));
  return {
    next,
    done: (customer) => {
      setCustomer(customer);
      navigate(next, { replace: true });
    },
  };
}

export function LoginPage() {
  const { customer } = useCustomer();
  const { next, done } = useAuthDone();
  const [form, setForm] = useState({ email: "", password: "" });
  const submit = useMutation({ mutationFn: () => login(form.email.trim(), form.password), onSuccess: done });

  if (customer && !submit.isSuccess) return <Navigate to={next} replace />;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const nextQuery = next === "/account/orders" ? "" : `?next=${encodeURIComponent(next)}`;

  return (
    <AuthShell
      title="Log in"
      subtitle="See your orders and check out faster."
      footer={
        <>
          New here?{" "}
          <Link to={`/account/register${nextQuery}`} className="text-primary font-medium hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <title>Log in · WYR Technology</title>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} required autoFocus />
        </Field>
        <Field label="Password">
          <PasswordInput value={form.password} onChange={set("password")} autoComplete="current-password" />
        </Field>
        {submit.isError && (
          <p className="text-destructive rounded-md bg-red-50 px-3 py-2 text-sm" role="alert">
            {errorText(submit.error)}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={submit.isPending}>
          {submit.isPending && <Loader2 className="animate-spin" />}
          Log in
        </Button>
        <p className="text-muted-foreground text-xs">
          Forgot your password?{" "}
          <Link to="/contact" className="text-primary hover:underline">
            Contact us
          </Link>{" "}
          and we'll help you get back in.
        </p>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { customer } = useCustomer();
  const { next, done } = useAuthDone();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const submit = useMutation({ mutationFn: () => register({ ...form, email: form.email.trim() }), onSuccess: done });
  const fields = submit.error instanceof ApiError ? (submit.error.body?.fields ?? {}) : {};

  if (customer && !submit.isSuccess) return <Navigate to={next} replace />;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const nextQuery = next === "/account/orders" ? "" : `?next=${encodeURIComponent(next)}`;

  return (
    <AuthShell
      title="Create an account"
      subtitle="Track every order in one place. Guest checkout still works without one."
      footer={
        <>
          Already have an account?{" "}
          <Link to={`/account/login${nextQuery}`} className="text-primary font-medium hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <title>Create an account · WYR Technology</title>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        <Field label="Full name" error={fields.name}>
          <Input name="name" autoComplete="name" value={form.name} onChange={set("name")} required autoFocus />
        </Field>
        <Field label="Email" error={fields.email}>
          <Input name="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} required />
        </Field>
        <Field label="Phone (optional)" error={fields.phone}>
          <Input name="phone" type="tel" autoComplete="tel" placeholder="012-345 6789" value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label="Password" hint="At least 8 characters." error={fields.password}>
          <PasswordInput value={form.password} onChange={set("password")} autoComplete="new-password" />
        </Field>
        {submit.isError && !Object.keys(fields).length && (
          <p className="text-destructive rounded-md bg-red-50 px-3 py-2 text-sm" role="alert">
            {errorText(submit.error)}
          </p>
        )}
        {submit.isError && fields.email === "Already registered" && (
          <p className="text-destructive rounded-md bg-red-50 px-3 py-2 text-sm" role="alert">
            {submit.error.message}{" "}
            <Link to={`/account/login${nextQuery}`} className="font-medium underline">
              Log in
            </Link>
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={submit.isPending}>
          {submit.isPending && <Loader2 className="animate-spin" />}
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
