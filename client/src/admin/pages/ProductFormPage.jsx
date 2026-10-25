import { ArrowDown, ArrowLeft, ArrowUp, ExternalLink, ImageOff, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FormField, Select } from "../components/FormField";
import { PageHeader } from "../components/PageHeader";
import { getProduct, listCategories, saveProduct } from "../services/productsService";

const newKey = () => crypto.randomUUID();
const emptyVariant = () => ({ key: newKey(), id: null, sku: "", name: "", price: "", specialPrice: "", weightG: "", stock: "0", reserved: 0, hasPriceTiers: false });

const EMPTY = {
  name: "",
  displayName: "",
  autoDisplayName: "",
  slug: "",
  categoryId: "",
  parentSku: "",
  description: "",
  isActive: true,
  images: [],
  variants: [emptyVariant()],
  marketplaces: { shopee: "", lazada: "" },
};

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const blank = (v) => (v == null ? "" : String(v));

function fromServer(p) {
  return {
    ...p,
    categoryId: blank(p.categoryId),
    images: p.images.map((url) => ({ key: newKey(), url })),
    variants: p.variants.map((v) => ({
      ...v,
      key: newKey(),
      price: blank(v.price),
      specialPrice: blank(v.specialPrice),
      weightG: blank(v.weightG),
      stock: blank(v.stock),
    })),
  };
}

function toServer(form) {
  return {
    id: form.id,
    name: form.name,
    displayName: form.displayName,
    slug: form.slug,
    categoryId: form.categoryId === "" ? null : Number(form.categoryId),
    parentSku: form.parentSku,
    description: form.description,
    isActive: form.isActive,
    images: form.images.map((i) => i.url.trim()).filter(Boolean),
    variants: form.variants.map(({ id, sku, name, price, specialPrice, weightG, stock }) => ({ id, sku, name, price, specialPrice, weightG, stock: stock === "" ? 0 : Number(stock) })),
    marketplaces: form.marketplaces,
  };
}

function move(list, index, delta) {
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(index + delta, 0, item);
  return next;
}

export function ProductFormPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const [form, setForm] = useState(isNew ? EMPTY : null);
  const [categories, setCategories] = useState([]);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [newImage, setNewImage] = useState("");

  useEffect(() => {
    listCategories().then(setCategories).catch(() => setCategories([]));
    if (!isNew) {
      getProduct(id)
        .then((p) => setForm(fromServer(p)))
        .catch((err) => setLoadError(err.status === 404 ? "This product no longer exists." : err.message));
    }
  }, [id, isNew]);

  if (loadError) {
    return (
      <div className="py-16 text-center">
        <p className="text-destructive">{loadError}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/system/products">Back to products</Link>
        </Button>
      </div>
    );
  }
  if (!form) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setVariant = (key, patch) => set({ variants: form.variants.map((v) => (v.key === key ? { ...v, ...patch } : v)) });

  function onNameChange(name) {
    set(slugTouched ? { name } : { name, slug: slugify(name) });
  }

  function addImage() {
    const url = newImage.trim();
    if (!url) return;
    set({ images: [...form.images, { key: newKey(), url }] });
    setNewImage("");
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError("");
    try {
      const saved = await saveProduct(toServer(form));
      navigate("/system/products", { state: { notice: `${isNew ? "Added" : "Saved"} "${saved.name}".` } });
    } catch (err) {
      setErrors(err.body?.fields ?? {});
      setFormError(err.message);
      setSaving(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  const imageError = Object.keys(errors).find((k) => k.startsWith("images"));

  return (
    <form onSubmit={onSubmit} noValidate>
      <Link to="/system/products" className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm">
        <ArrowLeft className="size-4" />
        Products
      </Link>
      <PageHeader
        title={isNew ? "Add product" : "Edit product"}
        description={isNew ? "New products appear on the public shop as soon as you save, if “Show on shop” is on." : form.name}
        actions={
          <>
            {!isNew && form.isActive && (
              <Button variant="outline" asChild>
                <a href={`/products/${form.slug}`} target="_blank" rel="noreferrer">
                  <ExternalLink />
                  View on site
                </a>
              </Button>
            )}
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {isNew ? "Add product" : "Save changes"}
            </Button>
          </>
        }
      />

      {formError && (
        <p role="alert" className="text-destructive mb-4 rounded-md bg-red-50 px-3 py-2 text-sm">
          {formError}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
              <h2 className="font-semibold sm:col-span-2">Details</h2>
              <FormField label="Product name" htmlFor="name" error={errors.name} className="sm:col-span-2">
                <Input id="name" value={form.name} onChange={(e) => onNameChange(e.target.value)} />
              </FormField>
              <FormField label="Display name (optional)" htmlFor="displayName" error={errors.displayName} className="sm:col-span-2">
                <Input
                  id="displayName"
                  value={form.displayName}
                  maxLength={255}
                  placeholder={form.autoDisplayName || "Short name for cards, headings and the cart"}
                  onChange={(e) => set({ displayName: e.target.value })}
                />
                <p className="text-muted-foreground text-xs">
                  Shown on product cards, the product heading and the cart. Empty = the product name, cleaned up automatically
                  {form.autoDisplayName ? ` ("${form.autoDisplayName}")` : ""}.
                </p>
              </FormField>
              <FormField label="Page URL" htmlFor="slug" error={errors.slug} className="sm:col-span-2">
                <div className="flex items-center">
                  <span className="bg-muted text-muted-foreground border-input flex h-9 items-center rounded-l-md border border-r-0 px-3 text-sm">/products/</span>
                  <Input
                    id="slug"
                    value={form.slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      set({ slug: e.target.value });
                    }}
                    className="rounded-l-none"
                  />
                </div>
              </FormField>
              <FormField label="Category" htmlFor="categoryId" error={errors.categoryId}>
                <Select id="categoryId" value={form.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
                  <option value="">No category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Parent SKU (optional)" htmlFor="parentSku" error={errors.parentSku}>
                <Input id="parentSku" value={form.parentSku} onChange={(e) => set({ parentSku: e.target.value })} />
              </FormField>
              <FormField label="Description" htmlFor="description" className="sm:col-span-2">
                <textarea
                  id="description"
                  rows={8}
                  value={form.description}
                  onChange={(e) => set({ description: e.target.value })}
                  className="border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm"
                />
              </FormField>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">Variants, prices & stock</h2>
                  <p className="text-muted-foreground text-xs">Each colour/size option is a variant with its own SKU. Prices are per piece in RM.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => set({ variants: [...form.variants, emptyVariant()] })}>
                  <Plus />
                  Add variant
                </Button>
              </div>
              {errors.variants && <p className="text-destructive mb-3 text-sm">{errors.variants}</p>}
              <div className="flex flex-col gap-3">
                {form.variants.map((v, i) => {
                  const err = (f) => errors[`variants.${i}.${f}`];
                  return (
                    <div key={v.key} className="rounded-lg border p-3">
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                        <FormField label="SKU" error={err("sku")} className="col-span-2">
                          <Input value={v.sku} onChange={(e) => setVariant(v.key, { sku: e.target.value })} />
                        </FormField>
                        <FormField label="Option name" error={err("name")} className="col-span-2 sm:col-span-4">
                          <Input value={v.name} placeholder="e.g. White, 25mm" onChange={(e) => setVariant(v.key, { name: e.target.value })} />
                        </FormField>
                        <FormField label="Price" error={err("price")} className="sm:col-span-2">
                          <Input type="number" min="0" step="0.01" value={v.price} onChange={(e) => setVariant(v.key, { price: e.target.value })} />
                        </FormField>
                        <FormField label="Sale price" error={err("specialPrice")} className="sm:col-span-2">
                          <Input type="number" min="0" step="0.01" value={v.specialPrice} placeholder="Optional" onChange={(e) => setVariant(v.key, { specialPrice: e.target.value })} />
                        </FormField>
                        <FormField label="Stock" error={err("stock")}>
                          <Input type="number" min="0" step="1" value={v.stock} onChange={(e) => setVariant(v.key, { stock: e.target.value })} />
                        </FormField>
                        <FormField label="Weight (g)" error={err("weightG")}>
                          <Input type="number" min="0" step="1" value={v.weightG} placeholder="—" onChange={(e) => setVariant(v.key, { weightG: e.target.value })} />
                        </FormField>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="text-muted-foreground text-xs">
                          {v.reserved > 0 && `${v.reserved} reserved by unpaid orders. `}
                          {v.hasPriceTiers && "Has bulk price tiers (kept as is). "}
                          Stock = pieces free to sell. Paid orders not shipped yet are already taken out (see Inventory › Locked for orders). The shop keeps 1 back as a safety buffer.
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={form.variants.length === 1}
                          onClick={() => set({ variants: form.variants.filter((x) => x.key !== v.key) })}
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 />
                          Remove
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="p-5">
              <label className="flex cursor-pointer items-start justify-between gap-4">
                <span>
                  <span className="block font-semibold">Show on shop</span>
                  <span className="text-muted-foreground text-xs">Off = hidden from the public site, but kept here.</span>
                </span>
                <input type="checkbox" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} className="peer sr-only" />
                <span className="relative mt-1 h-6 w-11 shrink-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-emerald-500 peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" />
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h2 className="font-semibold">Photos</h2>
              <p className="text-muted-foreground mb-3 text-xs">Paste image links (e.g. from Shopee) or /images/… for files in client/public/images. The first photo is the main one.</p>
              {imageError && <p className="text-destructive mb-2 text-xs">{errors[imageError]}</p>}
              <ul className="flex flex-col gap-2">
                {form.images.map((img, i) => (
                  <li key={img.key} className={cn("flex items-center gap-2 rounded-lg border p-2", errors[`images.${i}`] && "border-red-300 bg-red-50")}>
                    <ImageThumb url={img.url} />
                    <span className="min-w-0 flex-1 truncate text-xs" title={img.url}>
                      {i === 0 && <span className="bg-primary text-primary-foreground mr-1 rounded px-1 py-0.5 text-[10px] font-semibold">MAIN</span>}
                      {img.url}
                    </span>
                    <div className="flex">
                      <Button type="button" variant="ghost" size="icon" className="size-7" disabled={i === 0} onClick={() => set({ images: move(form.images, i, -1) })} aria-label="Move up">
                        <ArrowUp />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="size-7" disabled={i === form.images.length - 1} onClick={() => set({ images: move(form.images, i, 1) })} aria-label="Move down">
                        <ArrowDown />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="size-7 text-red-600" onClick={() => set({ images: form.images.filter((x) => x.key !== img.key) })} aria-label="Remove photo">
                        <Trash2 />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <Input
                  value={newImage}
                  placeholder="https://… or /images/…"
                  onChange={(e) => setNewImage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addImage();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addImage}>
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-4 p-5">
              <div>
                <h2 className="font-semibold">Marketplace links</h2>
                <p className="text-muted-foreground text-xs">Shown as “Also on” buttons on the product page.</p>
              </div>
              <FormField label="Shopee" htmlFor="shopee" error={errors["marketplaces.shopee"]}>
                <Input id="shopee" value={form.marketplaces.shopee} placeholder="https://shopee.com.my/…" onChange={(e) => set({ marketplaces: { ...form.marketplaces, shopee: e.target.value } })} />
              </FormField>
              <FormField label="Lazada" htmlFor="lazada" error={errors["marketplaces.lazada"]}>
                <Input id="lazada" value={form.marketplaces.lazada} placeholder="https://www.lazada.com.my/…" onChange={(e) => set({ marketplaces: { ...form.marketplaces, lazada: e.target.value } })} />
              </FormField>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2 border-t pt-6">
        <Button variant="outline" asChild>
          <Link to="/system/products">Cancel</Link>
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          {isNew ? "Add product" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function ImageThumb({ url }) {
  const [broken, setBroken] = useState(false);
  if (broken || !url) {
    return (
      <div className="bg-muted text-muted-foreground grid size-12 shrink-0 place-items-center rounded-md">
        <ImageOff className="size-4" />
      </div>
    );
  }
  return <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="size-12 shrink-0 rounded-md border object-cover" />;
}
