// Product information master fields (goal: one place AI reads from to write marketplace listings).
// Shared by the product form (routes/admin-products.js) and the Excel sheet (routes/admin-product-info.js),
// so both validate the same way.

export const INFO_FIELDS = [
  { key: "brand", label: "Brand", max: 100 },
  { key: "model", label: "Model", max: 100 },
  { key: "origin", label: "Country of origin", max: 80 },
  { key: "warranty", label: "Warranty", max: 255 },
  { key: "specs", label: "Specifications", max: 20_000 },
  { key: "inTheBox", label: "In the box", max: 5_000 },
  { key: "compatibility", label: "Compatibility", max: 5_000 },
  { key: "keywords", label: "Search keywords", max: 2_000 },
  { key: "aiNotes", label: "Notes for AI", max: 10_000 },
];

export const DIMENSIONS = ["lengthCm", "widthCm", "heightCm"];
export const MAX_FAQS = 50;
export const MAX_VIDEOS = 10;

/** Trimmed text with Windows line endings normalised; "" becomes null. Too long is an error, not a silent cut. */
export function infoText(value, max, field, fields) {
  if (value == null) return null;
  const text = String(value).replace(/\r\n?/g, "\n").trim();
  if (!text) return null;
  if (text.length > max) fields[field] = `At most ${max.toLocaleString("en")} characters (now ${text.length.toLocaleString("en")})`;
  return text;
}

export function parseInfo(body, fields, prefix = "") {
  return Object.fromEntries(INFO_FIELDS.map((f) => [f.key, infoText(body?.[f.key], f.max, prefix + f.key, fields)]));
}

/** Package size in cm, one decimal. */
export function parseCm(value, field, fields) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 9999) {
    fields[field] = "cm, more than 0";
    return null;
  }
  return Math.round(n * 10) / 10;
}

export function parseFaqs(list, fields, prefix = "faqs") {
  const rows = (Array.isArray(list) ? list : [])
    .map((f) => ({ question: f?.question, answer: f?.answer }))
    .filter((f) => String(f.question ?? "").trim() || String(f.answer ?? "").trim());
  if (rows.length > MAX_FAQS) fields[prefix] = `At most ${MAX_FAQS} questions`;
  return rows.slice(0, MAX_FAQS).map((f, i) => {
    const question = infoText(f.question, 500, `${prefix}.${i}.question`, fields);
    const answer = infoText(f.answer, 5_000, `${prefix}.${i}.answer`, fields);
    if (!question) fields[`${prefix}.${i}.question`] = "Required";
    if (!answer) fields[`${prefix}.${i}.answer`] = "Required";
    return { question, answer };
  });
}

export function parseVideos(list, fields) {
  const rows = (Array.isArray(list) ? list : []).filter((v) => String(v?.url ?? "").trim());
  if (rows.length > MAX_VIDEOS) fields.videos = `At most ${MAX_VIDEOS} videos`;
  return rows.slice(0, MAX_VIDEOS).map((v, i) => {
    const url = String(v.url).trim().slice(0, 500);
    if (!/^\/uploads\/videos\/[\w./-]+$/.test(url) && !/^https?:\/\//.test(url)) fields[`videos.${i}`] = "Not an uploaded video";
    return { url, title: infoText(v.title, 200, `videos.${i}.title`, fields) };
  });
}
