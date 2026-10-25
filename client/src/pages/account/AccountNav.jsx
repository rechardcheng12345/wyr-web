import { NavLink } from "react-router-dom";
import { useCustomer } from "@/lib/account";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/account/orders", label: "My orders" },
  { to: "/account", label: "Account details", end: true },
];

export function AccountHeader({ title }) {
  const { customer } = useCustomer();
  return (
    <div>
      <p className="text-muted-foreground text-sm">Hi, {customer?.name?.split(" ")[0] || "there"}</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
      <nav className="mt-5 flex gap-1 border-b" aria-label="Account">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cn("-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors", isActive ? "border-brand-orange text-foreground" : "text-muted-foreground hover:text-foreground border-transparent")
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
