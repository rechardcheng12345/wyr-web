import { BarChart3, Boxes, Calculator, ClipboardList, LogOut, Menu, Package, ShoppingCart, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "../hooks/useAuth";
import { getOrderCounts } from "../services/ordersService";

const NAV = [
  { to: "/system/products", label: "Products", icon: Boxes },
  { to: "/system/inventory", label: "Inventory", icon: Package },
  { to: "/system/purchasing", label: "Purchasing", icon: ShoppingCart },
  { to: "/system/costing", label: "Costing Calculation", icon: Calculator },
  { to: "/system/sales", label: "Sales Performance", icon: BarChart3 },
  { to: "/system/orders/pending", label: "Pending Orders", icon: ClipboardList, badge: "to_ship" },
  { to: "/system/static", label: "Static", icon: SlidersHorizontal },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [counts, setCounts] = useState({});

  useEffect(() => setMenuOpen(false), [location.pathname]);

  useEffect(() => {
    const refresh = () => getOrderCounts().then(setCounts).catch(() => {});
    refresh();
    const timer = setInterval(refresh, 60_000);
    window.addEventListener("admin:orders-changed", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("admin:orders-changed", refresh);
    };
  }, []);

  async function onLogout() {
    await logout();
    navigate("/system/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <title>WYR Admin</title>
      {menuOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMenuOpen(false)} />}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-900 text-slate-300 transition-transform lg:translate-x-0",
          menuOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <span className="text-lg font-bold text-white">
            WYR <span className="text-primary-foreground/60 font-medium">Admin</span>
          </span>
          <button className="rounded p-1 hover:bg-slate-800 lg:hidden" onClick={() => setMenuOpen(false)} aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
          {NAV.map(({ to, label, icon: Icon, badge }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive ? "bg-primary text-white" : "hover:bg-slate-800 hover:text-white",
                )
              }
            >
              <Icon className="size-4.5 shrink-0" />
              {label}
              {badge && counts[badge] > 0 && (
                <span className="bg-brand-orange ml-auto rounded-full px-2 py-0.5 text-xs font-semibold text-white tabular-nums">{counts[badge]}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <a href="/" className="border-t border-slate-800 px-5 py-4 text-xs text-slate-400 hover:text-white">
          ← Back to public site
        </a>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-white/90 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Menu />
          </Button>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="text-sm font-semibold">{user?.name}</p>
              <p className="text-muted-foreground text-xs">{user?.username}</p>
            </div>
            <Button variant="outline" size="sm" onClick={onLogout}>
              <LogOut />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
