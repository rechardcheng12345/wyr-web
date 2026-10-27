import { Download, ExternalLink, FileSpreadsheet, ImageOff, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "../components/DataTable";
import { Select } from "../components/FormField";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { formatNumber, formatRM } from "../format";
import { deleteProduct, downloadInfoSheet, importInfoSheet, listCategories, listProducts } from "../services/productsService";

export function ProductsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("");
  const [toDelete, setToDelete] = useState(null);
  const [notice, setNotice] = useState(location.state?.notice ?? "");
  const [sheetFile, setSheetFile] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const sheetInput = useRef(null);

  async function onDownloadSheet() {
    setDownloading(true);
    setLoadError("");
    try {
      await downloadInfoSheet();
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setDownloading(false);
    }
  }

  useEffect(() => {
    Promise.all([listProducts(), listCategories()])
      .then(([p, c]) => {
        setProducts(p);
        setCategories(c);
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (location.state?.notice) navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(
      (p) =>
        (!q || p.name.toLowerCase().includes(q) || p.slug?.toLowerCase().includes(q)) &&
        (!categoryId || String(p.category?.id) === categoryId) &&
        (!status || (status === "active" ? p.isActive : !p.isActive)),
    );
  }, [products, search, categoryId, status]);

  const hiddenCount = products.filter((p) => !p.isActive).length;

  const columns = [
    {
      key: "product",
      header: "Product",
      className: "min-w-64 max-w-xs",
      render: (p) => (
        <div className="flex items-center gap-3">
          {p.image ? (
            <img src={p.image} alt="" referrerPolicy="no-referrer" className="size-12 shrink-0 rounded-md border object-cover" />
          ) : (
            <div className="bg-muted text-muted-foreground grid size-12 shrink-0 place-items-center rounded-md">
              <ImageOff className="size-4" />
            </div>
          )}
          <div className="min-w-0">
            <Link to={`/system/products/${p.id}`} className="line-clamp-2 font-medium hover:underline">
              {p.name}
            </Link>
            <p className="text-muted-foreground truncate text-xs">/{p.slug}</p>
          </div>
        </div>
      ),
    },
    { key: "category", header: "Category", className: "min-w-32", render: (p) => p.category?.name ?? <span className="text-muted-foreground">None</span> },
    {
      key: "price",
      header: "Price",
      align: "right",
      className: "whitespace-nowrap",
      render: (p) => (
        <>
          {p.minPrice == null ? "—" : p.maxPrice > p.minPrice ? `${formatRM(p.minPrice)} – ${formatRM(p.maxPrice)}` : formatRM(p.minPrice)}
          <span className="text-muted-foreground block text-xs">
            {p.variantCount} variant{p.variantCount === 1 ? "" : "s"}
          </span>
        </>
      ),
    },
    { key: "stock", header: "Stock", align: "right", render: (p) => <span className={p.stock === 0 ? "font-semibold text-red-700" : undefined}>{formatNumber(p.stock)}</span> },
    {
      key: "status",
      header: "Status",
      render: (p) => (
        <span className={p.isActive ? "rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-emerald-700" : "rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-slate-600"}>
          {p.isActive ? "On sale" : "Hidden"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (p) => (
        <div className="flex justify-end gap-1">
          {p.isActive && (
            <Button variant="ghost" size="icon" asChild>
              <a href={`/products/${p.slug}`} target="_blank" rel="noreferrer" aria-label="View on site" title="View on site">
                <ExternalLink />
              </a>
            </Button>
          )}
          <Button variant="ghost" size="icon" asChild>
            <Link to={`/system/products/${p.id}`} aria-label="Edit" title="Edit">
              <Pencil />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setToDelete(p)} aria-label="Delete" title="Delete" className="text-red-600 hover:bg-red-50 hover:text-red-700">
            <Trash2 />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Products"
        description={`${products.length} products · ${hiddenCount} hidden from the shop`}
        actions={
          <>
            <Button variant="outline" onClick={onDownloadSheet} disabled={downloading}>
              {downloading ? <Loader2 className="animate-spin" /> : <Download />}
              Download info sheet
            </Button>
            <Button variant="outline" onClick={() => sheetInput.current.click()}>
              <FileSpreadsheet />
              Upload info sheet
            </Button>
            <input
              ref={sheetInput}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                setSheetFile(e.target.files[0] ?? null);
                e.target.value = "";
              }}
            />
            <Button asChild>
              <Link to="/system/products/new">
                <Plus />
                Add product
              </Link>
            </Button>
          </>
        }
      />

      {notice && (
        <p role="status" className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </p>
      )}
      {loadError && <p className="text-destructive mb-4 rounded-md bg-red-50 px-3 py-2 text-sm">Could not load products: {loadError}</p>}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} className="bg-white pl-9" />
        </div>
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="bg-white sm:w-56">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="bg-white sm:w-40">
          <option value="">Any status</option>
          <option value="active">On sale</option>
          <option value="hidden">Hidden</option>
        </Select>
      </div>

      <DataTable columns={columns} rows={filtered} isLoading={isLoading} emptyMessage="No products match." />

      {sheetFile && (
        <ImportSheetDialog
          file={sheetFile}
          onClose={() => setSheetFile(null)}
          onApplied={(message) => {
            setSheetFile(null);
            setNotice(message);
          }}
        />
      )}

      {toDelete && (
        <DeleteDialog
          product={toDelete}
          onClose={() => setToDelete(null)}
          onDeleted={() => {
            setProducts((prev) => prev.filter((p) => p.id !== toDelete.id));
            setNotice(`Deleted "${toDelete.name}".`);
            setToDelete(null);
          }}
        />
      )}
    </>
  );
}

function DeleteDialog({ product, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onConfirm() {
    setBusy(true);
    setError("");
    try {
      await deleteProduct(product.id);
      onDeleted();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Delete product?"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={busy} className="bg-red-600 hover:bg-red-700">
            Delete permanently
          </Button>
        </>
      }
    >
      <p className="text-sm">
        <span className="font-semibold">{product.name}</span> and all its variants, stock and photos will be removed from the shop. This can't be undone.
      </p>
      <p className="text-muted-foreground mt-3 text-sm">To take it off the shop for a while instead, edit it and turn off "Show on shop".</p>
      {error && <p className="text-destructive mt-3 rounded-md bg-red-50 px-3 py-2 text-sm">{error}</p>}
    </Modal>
  );
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function ImportSheetDialog({ file, onClose, onApplied }) {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    importInfoSheet(file, false)
      .then(setPlan)
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false));
  }, [file]);

  const changes = plan ? plan.products.length + plan.variants.length + plan.faqs.length : 0;

  async function onApply() {
    setBusy(true);
    setError("");
    try {
      const result = await importInfoSheet(file, true);
      if (!result.applied) {
        setPlan(result);
        setBusy(false);
        return;
      }
      onApplied(`Saved product information from ${file.name}: ${plural(result.products.length, "product")}, ${plural(result.variants.length, "variant")}, FAQ for ${plural(result.faqs.length, "product")}.`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const section = (title, list) =>
    list.length > 0 && (
      <div>
        <h3 className="mb-1 text-sm font-semibold">
          {title} ({list.length})
        </h3>
        <ul className="divide-y rounded-md border text-sm">
          {list.map((c) => (
            <li key={c.id} className="px-3 py-1.5">
              <span className="font-medium">{c.label}</span>
              <span className="text-muted-foreground block text-xs">{c.changed.join(", ")}</span>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <Modal
      open
      onClose={onClose}
      title="Upload info sheet"
      className="sm:max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onApply} disabled={busy || !plan || plan.errorCount > 0 || changes === 0}>
            {busy && plan && <Loader2 className="animate-spin" />}
            Save {changes > 0 ? plural(changes, "change") : "changes"}
          </Button>
        </>
      }
    >
      <p className="text-muted-foreground mb-3 text-sm">{file.name}</p>
      {busy && !plan && (
        <p className="flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Reading the sheet…
        </p>
      )}
      {error && <p className="text-destructive rounded-md bg-red-50 px-3 py-2 text-sm">{error}</p>}
      {plan && (
        <div className="flex flex-col gap-4">
          {plan.errorCount > 0 && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              <p className="font-semibold">Fix {plural(plan.errorCount, "problem")} in the sheet and upload it again. Nothing has been saved.</p>
              <ul className="mt-1 list-disc pl-5">
                {plan.errors.map((e, i) => (
                  <li key={i}>
                    {e.sheet && `${e.sheet}${e.row ? ` row ${e.row}` : ""}: `}
                    {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {plan.errorCount === 0 && changes === 0 && <p className="text-sm">No changes: the sheet matches what is already saved.</p>}
          {plan.errorCount === 0 && changes > 0 && <p className="text-sm">Check the changes below, then save. Only the changed fields are listed.</p>}
          {section("Products", plan.products)}
          {section("Variants (weight and package size)", plan.variants)}
          {section("FAQ", plan.faqs)}
        </div>
      )}
    </Modal>
  );
}
