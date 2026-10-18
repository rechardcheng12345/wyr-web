import { Nfc, Search, ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Input } from "@/components/ui/input";
import { useCart } from "@/lib/cart";
import { cn } from "@/lib/utils";

function CartLink() {
  const { count } = useCart();
  return (
    <Link
      to="/cart"
      className="hover:bg-accent focus-visible:ring-ring/50 relative grid size-10 place-items-center rounded-lg outline-none focus-visible:ring-[3px]"
      aria-label={count > 0 ? `Cart, ${count} item${count === 1 ? "" : "s"}` : "Cart"}
      data-testid="header-cart"
    >
      <ShoppingCart className="size-5" />
      {count > 0 && (
        <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-semibold">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

function HeaderSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const onSubmit = (e) => {
    e.preventDefault();
    navigate(q.trim() ? `/products?q=${encodeURIComponent(q.trim())}` : "/products");
  };
  return (
    <form onSubmit={onSubmit} className="relative hidden w-72 md:block" role="search">
      <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search NTAG215, ACR122U…" className="pl-9" aria-label="Search products" />
    </form>
  );
}

const navClass = ({ isActive }) =>
  cn("text-sm font-medium transition-colors hover:text-foreground", isActive ? "text-foreground" : "text-muted-foreground");

export function Layout() {
  const { pathname } = useLocation();
  // Braces matter: newer Chrome returns a Promise from scrollTo, and React would call it as the cleanup.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex min-h-svh flex-col">
      <header className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-lg">
              <Nfc className="size-5" />
            </span>
            WYR Technology
          </Link>
          <nav className="flex items-center gap-5">
            <NavLink to="/products" className={navClass}>
              Shop all
            </NavLink>
            <Link to="/products?category=nfc-tags" className={navClass({ isActive: false })}>
              NFC tags
            </Link>
            <Link to="/products?category=review-social-nfc" className={cn(navClass({ isActive: false }), "hidden sm:inline")}>
              Review standees
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <HeaderSearch />
            <CartLink />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      <footer className="bg-muted/40 mt-16 border-t">
        <div className="text-muted-foreground mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm sm:grid-cols-3">
          <div>
            <p className="text-foreground font-semibold">WYR Technology</p>
            <p className="mt-2">NFC tags, RFID cards and readers. Ready stock, shipped from Kuala Lumpur.</p>
          </div>
          <div>
            <p className="text-foreground font-semibold">Shop</p>
            <ul className="mt-2 space-y-1">
              <li><Link to="/products" className="hover:text-foreground">All products</Link></li>
              <li><Link to="/products?category=readers-writers" className="hover:text-foreground">Readers & writers</Link></li>
              <li><Link to="/products?category=uhf-rfid-tags" className="hover:text-foreground">UHF RFID tags</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-foreground font-semibold">Also on</p>
            <ul className="mt-2 space-y-1">
              <li><a href="https://shopee.com.my/shop/147356782" target="_blank" rel="noreferrer" className="hover:text-foreground">Shopee</a></li>
              <li>Lazada (link on each product page)</li>
            </ul>
          </div>
        </div>
        <p className="text-muted-foreground border-t py-4 text-center text-xs">© {new Date().getFullYear()} WYR Technology, Malaysia</p>
      </footer>
    </div>
  );
}
