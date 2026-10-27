import express, { Router } from "express";
import ExcelJS from "exceljs";
import { requireAdmin } from "../auth.js";
import { prisma } from "../db.js";
import { DIMENSIONS, INFO_FIELDS, infoText, parseCm, parseFaqs } from "../product-info.js";

// Product information in bulk: download every product as an Excel sheet pre-filled from the database,
// fill it in, upload it back. Uploading first previews the changes; ?apply=1 saves them.
// Photos and videos are files, so they stay on the product form.

export const adminProductInfoRouter = Router();
adminProductInfoRouter.use(requireAdmin);

const MAX_DESCRIPTION = 60_000;
// Excel cells hold at most 32,767 characters; longer descriptions are left out of the sheet.
const EXCEL_CELL_MAX = 32_000;
const TOO_LONG = "(Too long for Excel: edit it on the product form. Leave this text as it is.)";

const HELP = {
  brand: "e.g. NXP, Impinj, WYR",
  model: "Model or part number",
  origin: "e.g. China, Malaysia",
  warranty: "e.g. 1 year",
  specs: "One per line, Name: value\ne.g. Chip: NTAG215\nMemory: 504 bytes",
  inTheBox: "What the buyer receives, one per line",
  compatibility: "Phones, readers or systems it works with",
  keywords: "Words buyers search for, comma separated",
  aiNotes: "Selling points, who it's for, claims to avoid",
};

const PRODUCT_COLUMNS = [
  { key: "id", header: "Product ID", width: 11, locked: true },
  { key: "parentSku", header: "Parent SKU", width: 16, locked: true },
  { key: "name", header: "Product name", width: 45, locked: true },
  { key: "category", header: "Category", width: 20, locked: true },
  ...INFO_FIELDS.map((f) => ({ key: f.key, header: f.label, width: f.max > 255 ? 40 : 18, wrap: f.max > 255 })),
  // optional: a sheet without this column leaves descriptions as they are
  { key: "description", header: "Description", width: 60, wrap: true, optional: true },
  { key: "media", header: "Photos / videos", width: 14, locked: true },
];

const VARIANT_COLUMNS = [
  { key: "sku", header: "SKU", width: 22, locked: true },
  { key: "productId", header: "Product ID", width: 11, locked: true },
  { key: "productName", header: "Product name", width: 40, locked: true },
  { key: "option", header: "Option", width: 24, locked: true },
  { key: "weightG", header: "Weight (g)", width: 11 },
  { key: "lengthCm", header: "Length (cm)", width: 12 },
  { key: "widthCm", header: "Width (cm)", width: 12 },
  { key: "heightCm", header: "Height (cm)", width: 12 },
];

const variantHeader = (key) => VARIANT_COLUMNS.find((c) => c.key === key).header;

const FAQ_COLUMNS = [
  { key: "productId", header: "Product ID", width: 11 },
  { key: "productName", header: "Product name (for reference)", width: 40, locked: true },
  { key: "question", header: "Question", width: 50, wrap: true },
  { key: "answer", header: "Answer", width: 70, wrap: true },
];

const toNumber = (d) => (d == null ? null : d.toNumber());

function addSheet(wb, name, columns, rows) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", xSplit: name === "FAQ" ? 0 : 1, ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ key: c.key, header: c.header, width: c.width }));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  columns.forEach((c, i) => {
    const head = ws.getRow(1).getCell(i + 1);
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.locked ? "FF64748B" : "FF1E3A8A" } };
    if (HELP[c.key]) head.note = HELP[c.key];
  });
  ws.addRows(rows);
  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.alignment = { vertical: "top", wrapText: !!c.wrap };
    if (c.locked) {
      col.eachCell((cell, rowNo) => {
        if (rowNo > 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      });
    }
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

async function buildWorkbook() {
  const products = await prisma.product.findMany({
    include: {
      category: { select: { name: true } },
      variants: { orderBy: { id: "asc" } },
      faqs: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      _count: { select: { images: true, videos: true } },
    },
    orderBy: { id: "asc" },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "WYR Technology";
  const help = wb.addWorksheet("How to fill");
  help.getColumn(1).width = 110;
  [
    "WYR product information sheet",
    "",
    "1. Fill in the blue columns on the Products, Variants and FAQ sheets. Grey columns are for reference only: changes to them are ignored.",
    "2. Leave a cell empty if you don't know it yet. Emptying a cell that had a value clears it on the website.",
    "3. Inside a cell, press Alt+Enter (Mac: Option+Enter) to start a new line, e.g. one specification per line.",
    "4. FAQ: one question per row. Copy the Product ID from the Products sheet. To delete a question, delete its row.",
    "5. Don't add or remove products or variants here (use Products › Add product). Don't change Product ID or SKU.",
    "6. Save, then in the admin go to Products › Upload info sheet. You will see the changes before anything is saved.",
    "",
    "Photos and videos are uploaded on each product's page, not in this sheet.",
    "Hover over a column heading on the Products sheet for an example.",
  ].forEach((line, i) => {
    const row = help.addRow([line]);
    if (i === 0) row.font = { bold: true, size: 14 };
  });

  addSheet(
    wb,
    "Products",
    PRODUCT_COLUMNS,
    products.map((p) => ({
      id: p.id,
      parentSku: p.parentSku ?? "",
      name: p.name,
      category: p.category?.name ?? "",
      ...Object.fromEntries(INFO_FIELDS.map((f) => [f.key, p[f.key] ?? ""])),
      description: (p.description ?? "").length > EXCEL_CELL_MAX ? TOO_LONG : (p.description ?? ""),
      media: `${p._count.images} / ${p._count.videos}`,
    })),
  );
  addSheet(
    wb,
    "Variants",
    VARIANT_COLUMNS,
    products.flatMap((p) =>
      p.variants.map((v) => ({
        sku: v.sku,
        productId: p.id,
        productName: p.name,
        option: v.variationName ?? "",
        weightG: v.weightG,
        lengthCm: toNumber(v.lengthCm),
        widthCm: toNumber(v.widthCm),
        heightCm: toNumber(v.heightCm),
      })),
    ),
  );
  addSheet(
    wb,
    "FAQ",
    FAQ_COLUMNS,
    products.flatMap((p) => p.faqs.map((f) => ({ productId: p.id, productName: p.name, question: f.question, answer: f.answer }))),
  );
  return wb;
}

adminProductInfoRouter.get("/export", async (_req, res) => {
  const wb = await buildWorkbook();
  const date = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="wyr-product-info-${date}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

function cellText(cell) {
  const v = cell.value;
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    if ("result" in v) return v.result == null || typeof v.result === "object" ? "" : String(v.result);
    if ("text" in v) return typeof v.text === "string" ? v.text : cellText({ value: v.text });
    return "";
  }
  return String(v);
}

/** Rows of a sheet as { rowNo, get(header), has(header) }, finding columns by their heading so reordering is fine. */
function readSheet(wb, name, columns, errors) {
  const ws = wb.getWorksheet(name);
  if (!ws) {
    errors.push({ sheet: name, message: `Sheet "${name}" is missing` });
    return [];
  }
  const index = {};
  ws.getRow(1).eachCell((cell, col) => {
    index[cellText(cell).trim().toLowerCase()] = col;
  });
  const missing = columns.filter((c) => !c.locked && !c.optional && !index[c.header.toLowerCase()]).map((c) => c.header);
  const keyCol = columns[0];
  if (!index[keyCol.header.toLowerCase()]) missing.unshift(keyCol.header);
  if (missing.length) {
    errors.push({ sheet: name, message: `Column${missing.length > 1 ? "s" : ""} not found: ${missing.join(", ")}` });
    return [];
  }
  const has = (header) => !!index[header.toLowerCase()];
  const rows = [];
  ws.eachRow((row, rowNo) => {
    if (rowNo === 1) return;
    const get = (header) => {
      const col = index[header.toLowerCase()];
      return col ? cellText(row.getCell(col)) : "";
    };
    if (columns.some((c) => get(c.header).trim())) rows.push({ rowNo, get, has });
  });
  return rows;
}

function rowId(text) {
  const n = Number(String(text).trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Reads the uploaded workbook and works out what would change. Nothing is written here. */
async function planImport(buffer) {
  const errors = [];
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    return { errors: [{ message: "This isn't an Excel (.xlsx) file. Save it as Excel Workbook and try again." }], products: [], variants: [], faqs: [] };
  }

  const db = await prisma.product.findMany({
    include: { variants: true, faqs: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
  });
  const byId = new Map(db.map((p) => [p.id, p]));
  const variantBySku = new Map(db.flatMap((p) => p.variants.map((v) => [v.sku.toLowerCase(), { ...v, productName: p.name }])));
  const label = (p) => `${p.name}${p.parentSku ? ` (${p.parentSku})` : ""}`;

  const products = [];
  const seenProducts = new Set();
  for (const { rowNo, get, has } of readSheet(wb, "Products", PRODUCT_COLUMNS, errors)) {
    const at = { sheet: "Products", row: rowNo };
    const id = rowId(get("Product ID"));
    const p = id && byId.get(id);
    if (!p) {
      errors.push({ ...at, message: `Product ID "${get("Product ID")}" not found` });
      continue;
    }
    if (seenProducts.has(id)) {
      errors.push({ ...at, message: `Product ID ${id} appears twice` });
      continue;
    }
    seenProducts.add(id);
    const fields = {};
    const data = Object.fromEntries(INFO_FIELDS.map((f) => [f.key, infoText(get(f.label), f.max, f.label, fields)]));
    const description = get("Description").trim();
    if (has("Description") && description !== TOO_LONG) data.description = infoText(description, MAX_DESCRIPTION, "Description", fields);
    for (const [col, message] of Object.entries(fields)) errors.push({ ...at, message: `${col}: ${message}` });
    const changed = Object.keys(data).filter((k) => !same(data[k], p[k] || null));
    if (changed.length) products.push({ id, label: label(p), data, changed: changed.map((k) => INFO_FIELDS.find((f) => f.key === k)?.label ?? "Description") });
  }

  const variants = [];
  const seenSkus = new Set();
  for (const { rowNo, get } of readSheet(wb, "Variants", VARIANT_COLUMNS, errors)) {
    const at = { sheet: "Variants", row: rowNo };
    const sku = get("SKU").trim();
    const v = variantBySku.get(sku.toLowerCase());
    if (!v) {
      errors.push({ ...at, message: `SKU "${sku}" not found` });
      continue;
    }
    if (seenSkus.has(v.id)) {
      errors.push({ ...at, message: `SKU ${sku} appears twice` });
      continue;
    }
    seenSkus.add(v.id);
    const fields = {};
    const weight = get("Weight (g)").trim();
    let weightG = null;
    if (weight) {
      weightG = Number(weight);
      if (!Number.isInteger(weightG) || weightG < 0) fields["Weight (g)"] = "whole number of grams";
    }
    const data = { weightG, ...Object.fromEntries(DIMENSIONS.map((d) => [d, parseCm(get(variantHeader(d)).trim(), variantHeader(d), fields)])) };
    for (const [col, message] of Object.entries(fields)) errors.push({ ...at, message: `${col}: ${message}` });
    const current = { weightG: v.weightG, ...Object.fromEntries(DIMENSIONS.map((d) => [d, toNumber(v[d])])) };
    const changed = Object.keys(data).filter((k) => !same(data[k], current[k]));
    if (changed.length) variants.push({ id: v.id, label: `${v.sku} · ${v.productName}`, data, changed: changed.map(variantHeader) });
  }

  // FAQ sheet is the full list: for every product on the Products or FAQ sheet, its questions become exactly these rows.
  const faqRows = new Map();
  for (const { rowNo, get } of readSheet(wb, "FAQ", FAQ_COLUMNS, errors)) {
    const id = rowId(get("Product ID"));
    if (!id || !byId.has(id)) {
      errors.push({ sheet: "FAQ", row: rowNo, message: `Product ID "${get("Product ID")}" not found` });
      continue;
    }
    if (!faqRows.has(id)) faqRows.set(id, []);
    faqRows.get(id).push({ rowNo, question: get("Question"), answer: get("Answer") });
  }
  const faqs = [];
  for (const id of new Set([...seenProducts, ...faqRows.keys()])) {
    const rows = faqRows.get(id) ?? [];
    const fields = {};
    const list = parseFaqs(rows, fields, "faq");
    for (const [key, message] of Object.entries(fields)) {
      const [, i, col] = key.split(".");
      errors.push({ sheet: "FAQ", row: rows[Number(i)]?.rowNo, message: col ? `${col === "question" ? "Question" : "Answer"}: ${message}` : message });
    }
    const p = byId.get(id);
    const current = p.faqs.map((f) => ({ question: f.question, answer: f.answer }));
    if (!same(list, current)) faqs.push({ id, label: label(p), list, changed: [`${current.length} → ${list.length} question${list.length === 1 ? "" : "s"}`] });
  }

  return { errors, products, variants, faqs };
}

adminProductInfoRouter.post("/import", express.raw({ type: () => true, limit: "20mb" }), async (req, res, next) => {
  try {
    if (!req.body?.length) {
      res.status(400).json({ error: "No file received" });
      return;
    }
    const plan = await planImport(req.body);
    const apply = req.query.apply === "1";
    if (apply && plan.errors.length) {
      res.status(400).json({ error: "Fix the problems in the sheet first; nothing was saved.", ...plan });
      return;
    }
    if (apply) {
      await prisma.$transaction(
        async (tx) => {
          for (const p of plan.products) await tx.product.update({ where: { id: p.id }, data: p.data });
          for (const v of plan.variants) await tx.productVariant.update({ where: { id: v.id }, data: v.data });
          for (const f of plan.faqs) {
            await tx.productFaq.deleteMany({ where: { productId: f.id } });
            if (f.list.length) await tx.productFaq.createMany({ data: f.list.map((q, i) => ({ productId: f.id, ...q, sortOrder: i })) });
          }
        },
        { timeout: 60_000 },
      );
    }
    const summarize = (list) => list.map(({ id, label, changed }) => ({ id, label, changed }));
    res.json({ applied: apply, errors: plan.errors.slice(0, 200), errorCount: plan.errors.length, products: summarize(plan.products), variants: summarize(plan.variants), faqs: summarize(plan.faqs) });
  } catch (err) {
    next(err);
  }
});
