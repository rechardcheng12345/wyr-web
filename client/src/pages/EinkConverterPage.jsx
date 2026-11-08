import { AlertTriangle, CheckCircle2, Download, ImagePlus, RotateCcw, Share2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CARD_H,
  CARD_W,
  EFFORT_FAIL,
  EFFORT_OK,
  NEUTRAL_TONES,
  adjust,
  fitToCard,
  render,
  toImageData,
  toPngBlob,
} from "@/lib/eink";
import { usePageMeta } from "@/lib/site";

const TITLE = "E-ink card image converter · WYR Technology";
const DESCRIPTION =
  "Convert any photo into a 200 × 300 black, white, red and yellow picture that the e-ink NFC card accepts, ready to write with the NETME app on iPhone.";

// Photos are scaled down once on load; the card is only 200 px wide, so this keeps
// dragging and zooming smooth on phones without losing anything visible.
const MAX_SOURCE = 1600;
const MAX_ZOOM = 5;

async function loadSource(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const s = Math.min(1, MAX_SOURCE / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * s));
    c.height = Math.max(1, Math.round(img.naturalHeight * s));
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Zoom 1 = centre-crop filling the card; below 1 the whole photo fits with white margins.
function zoomRange(src) {
  const cover = Math.min(src.width, (src.height * 2) / 3);
  const contain = Math.max(src.width, (src.height * 2) / 3);
  return { min: cover / contain, cover };
}

function cropRect(src, view) {
  const { cover } = zoomRange(src);
  const w = cover / view.zoom;
  const h = w * 1.5;
  const clampC = (c, size, span) => (span <= size ? Math.min(Math.max(c, span / 2), size - span / 2) : size / 2);
  const cx = clampC(view.cx, src.width, w);
  const cy = clampC(view.cy, src.height, h);
  return { x: cx - w / 2, y: cy - h / 2, w, h, cx, cy };
}

function effortStatus(effort) {
  if (effort <= EFFORT_OK) return "ok";
  if (effort < EFFORT_FAIL) return "untested";
  return "fail";
}

export function EinkConverterPage() {
  usePageMeta(TITLE, DESCRIPTION);
  const [src, setSrc] = useState(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [view, setView] = useState({ zoom: 1, cx: 0, cy: 0 });
  const [tones, setTones] = useState(NEUTRAL_TONES);
  const [colour, setColour] = useState(true);
  const [detail, setDetail] = useState("auto");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const photoCanvas = useRef(null);
  const cardCanvas = useRef(null);
  const fileInput = useRef(null);
  const adjustedRef = useRef(null);

  async function openFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That file isn't an image. Choose a JPG, PNG or HEIC photo.");
      return;
    }
    setError("");
    try {
      const c = await loadSource(file);
      setSrc(c);
      setFileName(file.name.replace(/\.[^.]+$/, "") || "photo");
      setView({ zoom: 1, cx: c.width / 2, cy: c.height / 2 });
    } catch {
      setError("This photo couldn't be opened in your browser. Try a JPG or PNG copy of it.");
    }
  }

  // Steps 1-3 whenever the photo, crop or tones change; steps 4-6 also when colour/detail change.
  const frame = useRef(0);
  const latest = useRef({});
  latest.current = { src, view, tones, colour, detail };
  const stage = useRef({ crop: null, tones: null, src: null });

  const run = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const { src, view, tones, colour, detail } = latest.current;
      if (!src || !photoCanvas.current || !cardCanvas.current) return;
      const crop = cropRect(src, view);
      const key = `${crop.x},${crop.y},${crop.w}`;
      if (stage.current.src !== src || stage.current.crop !== key || stage.current.tones !== tones) {
        const fitted = fitToCard(src, crop, photoCanvas.current);
        const data = fitted.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, CARD_W, CARD_H);
        adjustedRef.current = adjust(data, tones);
        stage.current = { src, crop: key, tones };
      }
      const r = render(adjustedRef.current, CARD_W, CARD_H, { colour, detail });
      cardCanvas.current.getContext("2d").putImageData(toImageData(r, CARD_W, CARD_H), 0, 0);
      setResult(r);
    });
  }, []);

  useEffect(() => {
    run();
  }, [src, view, tones, colour, detail, run]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // Drag to move the crop, pinch or scroll to zoom.
  const pointers = useRef(new Map());
  const gesture = useRef(null);

  function onPointerDown(e) {
    if (!src) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current = null;
  }

  function onPointerMove(e) {
    if (!src || !pointers.current.has(e.pointerId)) return;
    const prev = [...pointers.current.values()];
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const now = [...pointers.current.values()];
    const box = e.currentTarget.getBoundingClientRect();
    setView((v) => {
      const crop = cropRect(src, v);
      const perPx = crop.w / box.width; // source pixels per screen pixel
      if (now.length === 1) {
        const dx = now[0].x - prev[0].x;
        const dy = now[0].y - prev[0].y;
        return { ...v, cx: crop.cx - dx * perPx, cy: crop.cy - dy * perPx };
      }
      const dist = (p) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      const before = dist(prev);
      if (!before) return v;
      const { min } = zoomRange(src);
      const zoom = Math.min(MAX_ZOOM, Math.max(min, (v.zoom * dist(now)) / before));
      return { ...v, zoom, cx: crop.cx, cy: crop.cy };
    });
  }

  function onPointerUp(e) {
    pointers.current.delete(e.pointerId);
  }

  // React's onWheel is passive, so attach it by hand to stop the page scrolling.
  useEffect(() => {
    const el = photoCanvas.current?.parentElement;
    if (!el || !src) return;
    const onWheel = (e) => {
      e.preventDefault();
      const { min } = zoomRange(src);
      setView((v) => {
        const crop = cropRect(src, v);
        return { ...v, zoom: Math.min(MAX_ZOOM, Math.max(min, v.zoom * Math.exp(-e.deltaY / 500))), cx: crop.cx, cy: crop.cy };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [src]);

  async function makeFile(scale) {
    const blob = await toPngBlob(result, CARD_W, CARD_H, scale);
    const name = `${fileName}-eink-${CARD_W * scale}x${CARD_H * scale}.png`;
    return new File([blob], name, { type: "image/png" });
  }

  function download(file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function save(scale) {
    if (!result) return;
    setBusy(true);
    try {
      const file = await makeFile(scale);
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
        } catch (err) {
          if (err?.name !== "AbortError") download(file);
        }
      } else {
        download(file);
      }
    } finally {
      setBusy(false);
    }
  }

  const status = result ? effortStatus(result.effort) : null;
  const zr = src ? zoomRange(src) : { min: 1 };
  const canShare = typeof navigator !== "undefined" && !!navigator.canShare;

  return (
    <>
      <title>{TITLE}</title>
      <section className="bg-brand-navy relative overflow-hidden text-white">
        <div className="bg-brand-orange/30 absolute -top-20 right-0 size-72 rounded-full blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 py-12 md:py-16">
          <p className="text-brand-orange text-xs font-semibold tracking-[0.14em] uppercase">Free tool · E-ink NFC card</p>
          <h1 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">E-ink card image converter</h1>
          <p className="mt-4 max-w-2xl text-slate-300">
            Turn any photo into a 200 × 300 picture in black, white, red and yellow that your e-ink card can display. Save it, then pick it in the NETME app on your iPhone and tap the card to write it.
            Your photo stays on your device; nothing is uploaded.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            openFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        {!src ? (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              openFile(e.dataTransfer.files?.[0]);
            }}
            className={`flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-20 text-center transition-colors ${dragOver ? "border-brand-orange bg-orange-50" : "border-slate-300 bg-slate-50 hover:border-brand-orange"}`}
          >
            <ImagePlus className="text-brand-orange size-10" />
            <span className="text-lg font-semibold text-slate-900">Choose a photo</span>
            <span className="text-sm text-slate-500">Tap to pick from your photos, or drop an image here</span>
          </button>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div>
              <div className="grid grid-cols-2 gap-3 sm:gap-6">
                <figure>
                  <figcaption className="mb-2 text-sm font-semibold text-slate-700">Your photo</figcaption>
                  <div
                    className="relative cursor-grab touch-none overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm select-none active:cursor-grabbing"
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                  >
                    <canvas ref={photoCanvas} width={CARD_W} height={CARD_H} className="block aspect-[2/3] w-full" />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Drag to move. Pinch, scroll or use the slider to zoom.</p>
                </figure>
                <figure>
                  <figcaption className="mb-2 text-sm font-semibold text-slate-700">On the card</figcaption>
                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                    <canvas ref={cardCanvas} width={CARD_W} height={CARD_H} className="block aspect-[2/3] w-full [image-rendering:pixelated]" />
                  </div>
                  {result && <EffortBadge status={status} effort={result.effort} />}
                </figure>
              </div>
            </div>

            <div className="flex flex-col gap-6">
              {result && status !== "ok" && (
                <div className={`flex gap-3 rounded-lg border p-3 text-sm ${status === "fail" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <p>
                    {status === "fail"
                      ? "This picture is too busy for the card and will probably fail to write."
                      : "This picture is busier than what we've confirmed the card can draw. It may or may not write."}{" "}
                    {detail === "auto" ? "Even the lowest detail is above the limit. Zoom in, choose a simpler photo, or switch to black & white." : "Turn on Auto detail, or zoom in, choose a simpler photo, or switch to black & white."}
                  </p>
                </div>
              )}

              <Group title="Crop">
                <Slider
                  label="Zoom"
                  min={zr.min}
                  max={MAX_ZOOM}
                  step={0.01}
                  value={view.zoom}
                  display={view.zoom < 1 ? "Whole photo" : `${view.zoom.toFixed(1)}×`}
                  onChange={(zoom) => setView((v) => {
                    const { cx, cy } = cropRect(src, v);
                    return { zoom, cx, cy };
                  })}
                />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setView({ zoom: 1, cx: src.width / 2, cy: src.height / 2 })}>
                    Centre crop
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setView({ zoom: zr.min, cx: src.width / 2, cy: src.height / 2 })}>
                    Fit whole photo
                  </Button>
                </div>
              </Group>

              <Group title="Colours">
                <Segmented
                  value={colour ? "colour" : "bw"}
                  onChange={(v) => setColour(v === "colour")}
                  options={[
                    { value: "colour", label: "Black, white, red, yellow" },
                    { value: "bw", label: "Black & white" },
                  ]}
                />
              </Group>

              <Group
                title="Tones"
                action={
                  <button
                    type="button"
                    onClick={() => setTones(NEUTRAL_TONES)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
                  >
                    <RotateCcw className="size-3" /> Original
                  </button>
                }
              >
                <Slider label="Brightness" min={-100} max={100} step={1} value={tones.brightness} display={tones.brightness > 0 ? `+${tones.brightness}` : tones.brightness} onChange={(brightness) => setTones((t) => ({ ...t, brightness }))} />
                <Slider label="Contrast" min={0.5} max={2} step={0.05} value={tones.contrast} display={tones.contrast.toFixed(2)} onChange={(contrast) => setTones((t) => ({ ...t, contrast }))} />
                <Slider label="Saturation" min={0} max={2} step={0.05} value={tones.saturation} display={tones.saturation.toFixed(2)} onChange={(saturation) => setTones((t) => ({ ...t, saturation }))} />
              </Group>

              <Group title="Detail">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={detail === "auto"} onChange={(e) => setDetail(e.target.checked ? "auto" : (result?.detail ?? 1))} className="accent-brand-orange size-4" />
                  Auto: most detail the card can draw
                </label>
                <Slider
                  label="Detail"
                  min={0}
                  max={1}
                  step={0.1}
                  value={detail === "auto" ? (result?.detail ?? 1) : detail}
                  display={(detail === "auto" ? (result?.detail ?? 1) : detail).toFixed(1)}
                  disabled={detail === "auto"}
                  onChange={setDetail}
                />
              </Group>

              <Group title="Save">
                <Button className="bg-brand-orange hover:bg-brand-orange-deep h-11 text-base text-white" disabled={!result || busy} onClick={() => save(1)}>
                  {canShare ? <Share2 /> : <Download />}
                  {canShare ? "Save image (200 × 300)" : "Download PNG (200 × 300)"}
                </Button>
                <Button variant="outline" disabled={!result || busy} onClick={() => save(3)}>
                  <Download /> Enlarged copy (600 × 900)
                </Button>
                <p className="text-xs leading-relaxed text-slate-500">
                  On iPhone, tap <strong>Save image</strong> and choose <strong>Save Image</strong> to put it in Photos. Then open NETME, pick the picture and hold the card to your phone. Use the
                  enlarged copy only if NETME doesn't take the normal one.
                </p>
              </Group>

              <Button variant="ghost" size="sm" className="self-start" onClick={() => fileInput.current?.click()}>
                <ImagePlus /> Choose another photo
              </Button>
            </div>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-14 grid gap-6 text-sm text-slate-600 md:grid-cols-3">
          <Tip title="Why the detail changes">
            The card can only draw a limited amount of fine pattern. The converter checks every picture and lowers the detail until it's within what the card has drawn reliably.
          </Tip>
          <Tip title="Photos that work best">
            Simple subjects, big shapes and strong contrast. Logos, text and illustrations look sharper than busy landscapes. Red and yellow areas show up well.
          </Tip>
          <Tip title="Don't edit the saved image">
            Send the saved PNG to NETME as it is. Cropping, filters or screenshots change the pixels and can make the card reject it.
          </Tip>
        </div>
      </section>
    </>
  );
}

function EffortBadge({ status, effort }) {
  const tone = { ok: "text-emerald-700", untested: "text-amber-700", fail: "text-red-700" }[status];
  const Icon = status === "ok" ? CheckCircle2 : AlertTriangle;
  const label = { ok: "Card can draw this", untested: "Untested", fail: "Too busy" }[status];
  return (
    <p className={`mt-2 flex items-center gap-1.5 text-xs font-medium ${tone}`} title={`Card effort ${Math.round(effort)} (limit ${EFFORT_OK})`}>
      <Icon className="size-3.5 shrink-0" />
      {label} · effort {Math.round(effort)}/{EFFORT_OK}
    </p>
  );
}

function Group({ title, action, children }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function Slider({ label, min, max, step, value, display, onChange, disabled }) {
  return (
    <label className={`flex flex-col gap-1 ${disabled ? "opacity-50" : ""}`}>
      <span className="flex justify-between text-sm text-slate-700">
        <span>{label}</span>
        <span className="font-mono text-xs text-slate-500 tabular-nums">{display}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="accent-brand-orange w-full" />
    </label>
  );
}

function Segmented({ value, onChange, options }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${value === o.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Tip({ title, children }) {
  return (
    <div>
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 leading-relaxed">{children}</p>
    </div>
  );
}
