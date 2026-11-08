// Image pipeline for the 4-colour e-ink card written with the NETME iOS app.
// Same steps as the Android app, so the output is a picture the card is known to accept:
// fit to 200x300 -> tones -> sharpen -> Atkinson dither to the card palette -> "card effort"
// check, with the dither detail lowered automatically until the card can draw it.

export const CARD_W = 200;
export const CARD_H = 300;

// Card effort: <= 33 drew every time, >= 44 failed every time, 34-43 untested.
export const EFFORT_OK = 33;
export const EFFORT_FAIL = 44;

export const NEUTRAL_TONES = { brightness: 0, contrast: 1, saturation: 1 };

const BLACK = [0, 0, 0];
const WHITE = [255, 255, 255];
const YELLOW = [255, 255, 0];
const RED = [255, 0, 0];
export const PALETTE_COLOUR = [BLACK, WHITE, YELLOW, RED];
export const PALETTE_BW = [BLACK, WHITE];
const YELLOW_INDEX = 2; // index in both palettes' shared order (BW has no yellow)

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * Step 1: draw `source` (image/canvas/bitmap) onto a white 200x300 canvas.
 * `crop` is the source-pixel rectangle {x, y, w, h} (2:3) to show; it may extend past the
 * image, which leaves white margins.
 */
export function fitToCard(source, crop, canvas = document.createElement("canvas")) {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const s = CARD_W / crop.w;
  // Draw the whole image positioned so the crop lands on the canvas (the canvas clips the rest).
  ctx.drawImage(source, -crop.x * s, -crop.y * s, source.width * s, source.height * s);
  return canvas;
}

/** Steps 2 + 3: tones then unsharp mask. Returns Float32Array RGB (3 per pixel). */
export function adjust(imageData, { brightness, contrast, saturation }) {
  const { data, width: w, height: h } = imageData;
  const n = w * h;
  const px = new Float32Array(n * 3);
  const gamma = Math.pow(2, -brightness / 100);
  for (let i = 0; i < n; i++) {
    let r = data[i * 4];
    let g = data[i * 4 + 1];
    let b = data[i * 4 + 2];
    // Saturation
    const L = 0.213 * r + 0.715 * g + 0.072 * b;
    r = L + (r - L) * saturation;
    g = L + (g - L) * saturation;
    b = L + (b - L) * saturation;
    // Contrast
    r = clamp((r - 128) * contrast + 128);
    g = clamp((g - 128) * contrast + 128);
    b = clamp((b - 128) * contrast + 128);
    // Brightness as a mid-tone gamma (keeps pure black and white)
    if (gamma !== 1) {
      r = 255 * Math.pow(r / 255, gamma);
      g = 255 * Math.pow(g / 255, gamma);
      b = 255 * Math.pow(b / 255, gamma);
    }
    px[i * 3] = r;
    px[i * 3 + 1] = g;
    px[i * 3 + 2] = b;
  }
  return sharpen(px, w, h, 0.5);
}

function sharpen(px, w, h, amount) {
  const out = new Float32Array(px.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy < 0 ? 0 : y + dy >= h ? h - 1 : y + dy;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx < 0 ? 0 : x + dx >= w ? w - 1 : x + dx;
            sum += px[(yy * w + xx) * 3 + c];
          }
        }
        const i = (y * w + x) * 3 + c;
        out[i] = clamp(px[i] + amount * (px[i] - sum / 9));
      }
    }
  }
  return out;
}

function nearest(r, g, b, palette) {
  let best = 0;
  let bestD = Infinity;
  for (let k = 0; k < palette.length; k++) {
    const [pr, pg, pb] = palette[k];
    const rm = (r + pr) / 2;
    const dr = r - pr;
    const dg = g - pg;
    const db = b - pb;
    const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

/** Step 4: Atkinson dither. Returns Uint8Array of palette indexes (one per pixel). */
export function dither(adjusted, w, h, palette, strength) {
  const buf = Float32Array.from(adjusted);
  const idx = new Uint8Array(w * h);
  const spread = (x, y, er, eg, eb) => {
    if (x < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 3;
    buf[i] += er;
    buf[i + 1] += eg;
    buf[i + 2] += eb;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const r = clamp(buf[i]);
      const g = clamp(buf[i + 1]);
      const b = clamp(buf[i + 2]);
      const k = nearest(r, g, b, palette);
      idx[y * w + x] = k;
      if (strength === 0) continue;
      const [pr, pg, pb] = palette[k];
      const f = strength / 8;
      const er = (r - pr) * f;
      const eg = (g - pg) * f;
      const eb = (b - pb) * f;
      spread(x + 1, y, er, eg, eb);
      spread(x + 2, y, er, eg, eb);
      spread(x - 1, y + 1, er, eg, eb);
      spread(x, y + 1, er, eg, eb);
      spread(x + 1, y + 1, er, eg, eb);
      spread(x, y + 2, er, eg, eb);
    }
  }
  return idx;
}

/** Step 5: card effort, 0-100. Share of neighbour pairs that differ with neither being yellow. */
export function cardEffort(idx, w, h, palette) {
  const yellow = palette === PALETTE_COLOUR ? YELLOW_INDEX : -1;
  let busy = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = idx[y * w + x];
      if (x + 1 < w) {
        const b = idx[y * w + x + 1];
        if (a !== b && a !== yellow && b !== yellow) busy++;
      }
      if (y + 1 < h) {
        const b = idx[(y + 1) * w + x];
        if (a !== b && a !== yellow && b !== yellow) busy++;
      }
    }
  }
  const total = (w - 1) * h + w * (h - 1);
  return (100 * busy) / total;
}

/**
 * Steps 4-6. `detail` is a number 0-1, or "auto" to try 1.0, 0.9 ... 0 and take the first
 * whose effort is <= 33 (or detail 0 when none is).
 */
export function render(adjusted, w, h, { colour = true, detail = "auto" } = {}) {
  const palette = colour ? PALETTE_COLOUR : PALETTE_BW;
  const steps = detail === "auto" ? [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0] : [Math.round(detail * 10)];
  let result;
  for (const s of steps) {
    const idx = dither(adjusted, w, h, palette, s / 10);
    result = { idx, palette, detail: s / 10, effort: cardEffort(idx, w, h, palette) };
    if (result.effort <= EFFORT_OK) break;
  }
  return result;
}

/** Palette indexes -> ImageData, optionally enlarged by an integer factor (nearest-neighbour). */
export function toImageData({ idx, palette }, w, h, scale = 1) {
  const W = w * scale;
  const H = h * scale;
  const img = new ImageData(W, H);
  const d = img.data;
  for (let Y = 0; Y < H; Y++) {
    const y = Math.floor(Y / scale);
    for (let X = 0; X < W; X++) {
      const [r, g, b] = palette[idx[y * w + Math.floor(X / scale)]];
      const o = (Y * W + X) * 4;
      d[o] = r;
      d[o + 1] = g;
      d[o + 2] = b;
      d[o + 3] = 255;
    }
  }
  return img;
}

/** Step 7: PNG blob at 200x300 (scale 1) or enlarged (e.g. scale 3 = 600x900). */
export function toPngBlob(result, w, h, scale = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.putImageData(toImageData(result, w, h, scale), 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png"));
}
