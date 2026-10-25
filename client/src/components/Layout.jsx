import { Menu, MessageCircle, Search, ShoppingCart, User, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Input } from "@/components/ui/input";
import { useCustomer } from "@/lib/account";
import { useCart } from "@/lib/cart";
import { LOGO_SRC, useSiteInfo, whatsappLink } from "@/lib/site";
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

function AccountLink() {
  const { customer } = useCustomer();
  const firstName = customer?.name?.split(" ")[0];
  return (
    <Link
      to={customer ? "/account/orders" : "/account/login"}
      className="hover:bg-accent focus-visible:ring-ring/50 flex h-10 min-w-10 items-center justify-center gap-2 rounded-lg px-2.5 outline-none focus-visible:ring-[3px]"
      aria-label={customer ? "My account" : "Log in"}
      data-testid="header-account"
    >
      <User className="size-5" />
      <span className="hidden max-w-24 truncate text-sm font-medium xl:inline">{customer ? firstName || "Account" : "Log in"}</span>
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
    <form onSubmit={onSubmit} className="relative mr-1 hidden w-56 md:block xl:w-64" role="search">
      <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search NTAG215, ACR122U…" className="pl-9" aria-label="Search products" />
    </form>
  );
}

const NAV = [
  { to: "/", label: "Home", end: true },
  { to: "/products", label: "Shop" },
  { to: "/about", label: "About Us" },
  { to: "/contact", label: "Contact Us" },
  { to: "/track", label: "Track Order" },
];

const navClass = ({ isActive }) =>
  cn(
    "relative py-1 text-sm font-medium transition-colors hover:text-foreground",
    "after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-brand-orange after:transition-transform",
    isActive ? "text-foreground after:scale-x-100" : "text-muted-foreground after:scale-x-0",
  );

function Logo({ className }) {
  return (
    <Link to="/" className={cn("flex shrink-0 items-center gap-2.5", className)} aria-label="WYR Technology home">
      <img src={LOGO_SRC} alt="" width="318" height="178" className="h-8 w-auto" />
      <span className="leading-none">
        <span className="block text-[15px] font-bold tracking-tight">WYR Technology</span>
        <span className="text-muted-foreground block text-[10px] font-medium tracking-[0.14em] uppercase">NFC · RFID · UHF</span>
      </span>
    </Link>
  );
}

function FooterColumn({ title, children }) {
  return (
    <div>
      <p className="text-sm font-semibold text-white">{title}</p>
      <div className="mt-4 flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

function FooterLink({ to, href, children }) {
  const className = "w-fit text-sm transition-colors hover:text-white";
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  ) : (
    <Link to={to} className={className}>
      {children}
    </Link>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const site = useSiteInfo();
  const whatsapp = whatsappLink(site.whatsappNumber, "Hi WYR Technology, I have a question.");
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);
  // Braces matter: newer Chrome returns a Promise from scrollTo, and React would call it as the cleanup.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex min-h-svh flex-col">
      <header className="bg-background/85 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <Logo />
          <nav className="hidden items-center gap-6 lg:flex" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={navClass}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <HeaderSearch />
            <AccountLink />
            <CartLink />
            <button
              className="hover:bg-accent grid size-10 place-items-center rounded-lg lg:hidden"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="bg-background border-t px-4 pt-2 pb-4 lg:hidden" aria-label="Mobile">
            <form
              role="search"
              className="relative mb-2 md:hidden"
              onSubmit={(e) => {
                e.preventDefault();
                const q = new FormData(e.currentTarget).get("q")?.toString().trim();
                navigate(q ? `/products?q=${encodeURIComponent(q)}` : "/products");
              }}
            >
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input name="q" placeholder="Search products" className="pl-9" aria-label="Search products" />
            </form>
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => cn("block rounded-lg px-3 py-2.5 text-sm font-medium", isActive ? "bg-accent text-foreground" : "text-muted-foreground")}
              >
                {n.label}
              </NavLink>
            ))}
            <NavLink
              to="/account/orders"
              className={({ isActive }) => cn("mt-1 block rounded-lg border-t px-3 pt-3.5 pb-2.5 text-sm font-medium", isActive ? "text-foreground" : "text-muted-foreground")}
            >
              My account
            </NavLink>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      <footer className="bg-brand-navy mt-20 text-slate-300">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2.5">
              <span className="rounded-lg bg-white p-1.5">
                <img src={LOGO_SRC} alt="" className="h-6 w-auto" />
              </span>
              <span className="font-bold text-white">WYR Technology</span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed">NFC tags, RFID cards and readers. Ready stock, shipped from Kuala Lumpur.</p>
          </div>
          <FooterColumn title="Shop">
            <FooterLink to="/products">All products</FooterLink>
            <FooterLink to="/products?category=nfc-tags">NFC tags & stickers</FooterLink>
            <FooterLink to="/products?category=rfid-cards">RFID cards & key fobs</FooterLink>
            <FooterLink to="/products?category=readers-writers">Readers & writers</FooterLink>
          </FooterColumn>
          <FooterColumn title="Company">
            <FooterLink to="/about">About us</FooterLink>
            <FooterLink to="/contact">Contact us</FooterLink>
            <FooterLink to="/track">Track order</FooterLink>
            <FooterLink to="/account/orders">My account</FooterLink>
            {site.shopeeUrl && <FooterLink href={site.shopeeUrl}>Shopee store</FooterLink>}
          </FooterColumn>
          <FooterColumn title="Talk to us">
            {whatsapp ? (
              <a href={whatsapp} target="_blank" rel="noreferrer" className="bg-brand-orange hover:bg-brand-orange-deep inline-flex w-fit items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors">
                <MessageCircle className="size-4" />
                WhatsApp us
              </a>
            ) : (
              <FooterLink to="/contact">Contact options</FooterLink>
            )}
            <p className="text-sm">Kuala Lumpur, Malaysia</p>
          </FooterColumn>
        </div>
        <p className="border-t border-white/10 py-5 text-center text-xs text-slate-400">© {new Date().getFullYear()} WYR Technology, Malaysia</p>
      </footer>
    </div>
  );
}
