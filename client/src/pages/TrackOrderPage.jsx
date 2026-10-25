import { useMutation } from "@tanstack/react-query";
import { Loader2, PackageSearch } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Field } from "@/components/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCustomer } from "@/lib/account";
import { ApiError } from "@/lib/api";
import { fetchOrder, rememberOrderEmail } from "@/lib/checkout";

export function TrackOrderPage() {
  const navigate = useNavigate();
  const { customer } = useCustomer();
  const [form, setForm] = useState({ orderNo: "", email: "" });
  const lookup = useMutation({
    mutationFn: ({ orderNo, email }) => fetchOrder(orderNo, email),
    onSuccess: (order, { email }) => {
      rememberOrderEmail(order.orderNo, email);
      navigate(`/orders/${order.orderNo}`);
    },
  });
  const set = (k) => (e) => {
    lookup.reset();
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  function onSubmit(e) {
    e.preventDefault();
    lookup.mutate({ orderNo: form.orderNo.trim().toUpperCase(), email: form.email.trim().toLowerCase() });
  }

  return (
    <>
      <title>Track your order · WYR Technology</title>
      <section className="bg-brand-navy relative overflow-hidden text-white">
        <div className="bg-brand-orange/30 absolute -top-20 right-0 size-72 rounded-full blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 py-14 md:py-16">
          <p className="text-brand-orange text-xs font-semibold tracking-[0.14em] uppercase">Track order</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-extrabold tracking-tight sm:text-5xl">Where's my order?</h1>
          <p className="mt-4 max-w-xl text-lg text-slate-300">Enter your order number and the email you used at checkout.</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-10">
        <div className="mx-auto max-w-lg">
          <form onSubmit={onSubmit} className="bg-card space-y-4 rounded-2xl border p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-3">
              <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-lg">
                <PackageSearch className="size-5" />
              </span>
              <h2 className="font-semibold">Find your order</h2>
            </div>
            <Field label="Order number" hint="Starts with WYR, e.g. WYR261025-ABCD. It's on your payment receipt.">
              <Input value={form.orderNo} onChange={set("orderNo")} placeholder="WYR261025-ABCD" autoCapitalize="characters" spellCheck={false} required autoFocus />
            </Field>
            <Field label="Email">
              <Input type="email" autoComplete="email" value={form.email} onChange={set("email")} placeholder="you@example.com" required />
            </Field>
            {lookup.isError && (
              <p className="text-destructive rounded-md bg-red-50 px-3 py-2 text-sm" role="alert">
                {lookup.error instanceof ApiError ? lookup.error.message : "Something went wrong. Please try again."}
              </p>
            )}
            <Button type="submit" size="lg" className="bg-brand-orange hover:bg-brand-orange-deep w-full" disabled={lookup.isPending || !form.orderNo.trim() || !form.email.trim()}>
              {lookup.isPending && <Loader2 className="animate-spin" />}
              Track order
            </Button>
          </form>
          <p className="text-muted-foreground mt-5 text-center text-sm">
            {customer ? (
              <>
                Orders placed while logged in are in{" "}
                <Link to="/account/orders" className="text-primary font-medium hover:underline">
                  My orders
                </Link>
                .
              </>
            ) : (
              <>
                Have an account?{" "}
                <Link to="/account/login" className="text-primary font-medium hover:underline">
                  Log in
                </Link>{" "}
                to see all your orders.
              </>
            )}
          </p>
        </div>
      </section>
    </>
  );
}
