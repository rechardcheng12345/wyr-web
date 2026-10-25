import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { displayNameOf } from "./display-name.js";
import { priceLadder, unitPriceCents as tierUnitPriceCents } from "./pricing.js";
import { getSetting } from "./settings.js";
import { isMalaysianState, quoteShipping, shippingSummary } from "./shipping.js";
import { logStockMovement, minQtyFor, sellableQty, sellableSql } from "./stock.js";
import { applyVoucher, normalizeCode } from "./vouchers.js";

/** An error whose message is safe to show the buyer. */
export class CheckoutError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const MAX_LINES = 50;
const MAX_QTY = 999;

export function holdMinutes() {
  return getSetting("orderHoldMinutes");
}

export const toCents = (d) => (d === null ? null : Math.round(d.toNumber() * 100));
const fromCents = (cents) => new Prisma.Decimal(cents).div(100);
export const centsToRm = (cents) => cents / 100;

// ---------------------------------------------------------------------------
// Input parsing (never trust the client: only variant ids and quantities are read from the cart)

export function parseCartItems(raw) {
  if (!Array.isArray(raw) || raw.length === 0) throw new CheckoutError(400, "Your cart is empty.");
  if (raw.length > MAX_LINES) throw new CheckoutError(400, `A cart can hold at most ${MAX_LINES} different items.`);
  const merged = new Map();
  for (const item of raw) {
    const variantId = Number(item?.variantId);
    const qty = Number(item?.qty);
    if (!Number.isSafeInteger(variantId) || variantId <= 0 || !Number.isSafeInteger(qty) || qty <= 0) {
      throw new CheckoutError(400, "The cart contains an invalid item.");
    }
    merged.set(variantId, (merged.get(variantId) ?? 0) + qty);
  }
  for (const qty of merged.values()) {
    if (qty > MAX_QTY) throw new CheckoutError(400, `At most ${MAX_QTY} of one item per order.`);
  }
  return [...merged].map(([variantId, qty]) => ({ variantId, qty }));
}

function text(value, field, max, errors) {
  const v = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!v) errors[field] = "Required";
  else if (v.length > max) errors[field] = `At most ${max} characters`;
  return v;
}

export function parseBuyer(raw) {
  const b = (raw ?? {});
  const errors = {};
  const name = text(b.name, "name", 150, errors);
  const email = text(b.email, "email", 255, errors).toLowerCase();
  if (email && !errors.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address";
  // Malaysian numbers: 01x-xxx xxxx or +60 1x-xxx xxxx. Stored as digits only (ToyyibPay wants numeric).
  let phone = text(b.phone, "phone", 30, errors).replace(/[\s\-()+]/g, "");
  if (phone && !errors.phone) {
    if (phone.startsWith("60")) phone = `0${phone.slice(2)}`;
    if (!/^0\d{8,10}$/.test(phone)) errors.phone = "Enter a Malaysian phone number, e.g. 012-345 6789";
  }
  const addressLine = text(b.addressLine, "addressLine", 300, errors);
  const postcode = text(b.postcode, "postcode", 10, errors);
  if (postcode && !errors.postcode && !/^\d{5}$/.test(postcode)) errors.postcode = "Postcode must be 5 digits";
  const city = text(b.city, "city", 100, errors);
  const state = text(b.state, "state", 50, errors);
  if (state && !errors.state && !isMalaysianState(state)) errors.state = "Choose a state";
  if (Object.keys(errors).length > 0) throw new CheckoutError(400, "Please check the highlighted fields.", { fields: errors });
  return { name, email, phone, addressLine, postcode, city, state: state };
}

export function parseOrderExtras(raw) {
  const b = raw ?? {};
  const errors = {};
  const companyName = typeof b.companyName === "string" ? b.companyName.trim().replace(/\s+/g, " ") : "";
  if (companyName.length > 150) errors.companyName = "At most 150 characters";
  const note = typeof b.note === "string" ? b.note.trim() : "";
  if (note.length > 2000) errors.note = "At most 2000 characters";
  if (Object.keys(errors).length > 0) throw new CheckoutError(400, "Please check the highlighted fields.", { fields: errors });
  return { companyName: companyName || null, note: note || null, voucherCode: normalizeCode(b.voucherCode) || null };
}

export function minOrderCents() {
  return Math.round(getSetting("min_order_subtotal") * 100);
}

// ---------------------------------------------------------------------------
// Pricing: server prices and stock only

export async function priceCart(items, db = prisma) {
  const variants = await db.productVariant.findMany({
    where: { id: { in: items.map((i) => i.variantId) } },
    include: {
      inventory: true,
      priceTiers: true,
      product: { select: { name: true, displayName: true, slug: true, isActive: true, images: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: 1 } } },
    },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  // Variant-specific photos, for the cart thumbnail.
  const variantImages = await db.productImage.findMany({
    where: { variantId: { in: variants.map((v) => v.id) } },
    orderBy: { sortOrder: "asc" },
  });

  const lines = items.map(({ variantId, qty }) => {
    const v = byId.get(variantId);
    const ladder = v ? priceLadder(v) : null;
    // No inventory row = no stock data (not synced from BigSeller yet), so the site can't sell it.
    const sellable = v?.product.isActive && v.inventory && ladder !== null && ladder[0].unitPriceCents > 0;
    const stock = sellable ? sellableQty(v.inventory) : 0;
    const unitPriceCents = ladder ? tierUnitPriceCents(ladder, qty) : 0;
    const minQty = minQtyFor(ladder?.[0].unitPriceCents ?? null);
    return {
      variantId,
      sku: v?.sku ?? "",
      productName: v ? displayNameOf(v.product) : "Unavailable item",
      productSlug: v?.product.slug ?? null,
      variantName: v?.variationName ?? null,
      image: variantImages.find((i) => i.variantId === variantId)?.url ?? v?.product.images[0]?.url ?? null,
      qty,
      unitPriceCents,
      baseUnitPriceCents: ladder?.[0].unitPriceCents ?? 0,
      lineTotalCents: unitPriceCents * qty,
      tiers: ladder ?? [],
      stock,
      minQty,
      problem: !sellable || stock < minQty ? "unavailable" : stock < qty ? "insufficient_stock" : qty < minQty ? "below_min_qty" : null,
    };
  });
  const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
  return { lines, subtotalCents, weights: variants.map((v) => ({ variantId: v.id, weightG: v.weightG })) };
}

function withWeights(items, weights) {
  return items.map((i) => ({ ...i, weightG: weights.find((w) => w.variantId === i.variantId)?.weightG ?? null }));
}

export function minimumOrder(subtotalCents) {
  const minCents = minOrderCents();
  return { minCents, shortfallCents: Math.max(0, minCents - subtotalCents) };
}

export async function quote(items, state, voucherCode) {
  const { lines, subtotalCents, weights } = await priceCart(items);
  const shipping = state ? quoteShipping(state, withWeights(items, weights), subtotalCents) : null;
  const voucher = voucherCode ? await applyVoucher(voucherCode, subtotalCents) : null;
  const discount = voucher?.valid ? voucher.discountCents : 0;
  const summary = shippingSummary();
  return {
    lines,
    subtotalCents,
    voucher,
    discountCents: discount,
    shippingCents: shipping?.feeCents ?? null,
    shippingRange: {
      westCents: summary.westCents,
      eastCents: summary.eastCents,
      freeShippingThresholdCents: summary.freeThresholdCents,
      freeShippingShortfallCents: summary.freeThresholdCents == null ? null : Math.max(0, summary.freeThresholdCents - subtotalCents),
    },
    totalCents: shipping ? subtotalCents - discount + shipping.feeCents : null,
    minimumOrder: minimumOrder(subtotalCents),
    ok: lines.every((l) => l.problem === null),
  };
}

// ---------------------------------------------------------------------------
// Orders and stock reservations

/**
 * Options for transactions that change stock. The guarded UPDATEs below are atomic on their own, so
 * no snapshot is needed; and under REPEATABLE READ, MariaDB 11.8+ (innodb_snapshot_isolation=ON)
 * fails an UPDATE on a row another checkout changed after this transaction's first read (error 1020).
 */
export const STOCK_TX = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted };

const ORDER_NO_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I

function newOrderNo() {
  // Date part in Malaysia time (UTC+8), e.g. WYR261012-7K3Q
  const myt = new Date(Date.now() + 8 * 3600_000).toISOString();
  const date = myt.slice(2, 10).replaceAll("-", "");
  const suffix = Array.from({ length: 4 }, () => ORDER_NO_ALPHABET[randomInt(ORDER_NO_ALPHABET.length)]).join("");
  return `WYR${date}-${suffix}`;
}

/**
 * Prices the cart from the database, then in one transaction reserves stock for every line and
 * creates the order + items as pending_payment. Any line short of stock rolls the whole thing back.
 */
export async function createPendingOrder(items, buyer, extras = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const { lines, subtotalCents, weights } = await priceCart(items, tx);
        const belowMin = lines.find((l) => l.problem === "below_min_qty");
        if (belowMin) {
          throw new CheckoutError(409, `${belowMin.productName}${belowMin.variantName ? ` (${belowMin.variantName})` : ""} has a minimum of ${belowMin.minQty} pcs.`, { lines });
        }
        const bad = lines.filter((l) => l.problem !== null);
        if (bad.length > 0) throw new CheckoutError(409, "Some items in your cart are no longer available in that quantity.", { lines });
        const { minCents, shortfallCents } = minimumOrder(subtotalCents);
        if (shortfallCents > 0) {
          throw new CheckoutError(409, `Minimum order RM${(minCents / 100).toFixed(2)}: add RM${(shortfallCents / 100).toFixed(2)} more.`, { lines });
        }
        const voucher = extras.voucherCode ? await applyVoucher(extras.voucherCode, subtotalCents, tx) : null;
        if (voucher && !voucher.valid) throw new CheckoutError(409, voucher.error, { fields: { voucherCode: voucher.error } });
        const discount = voucher?.discountCents ?? 0;

        // Fixed lock order (by variant id) so two concurrent checkouts can't deadlock.
        for (const line of [...lines].sort((a, b) => a.variantId - b.variantId)) {
          const updated = await tx.$executeRaw`
            UPDATE inventory SET reserved = reserved + ${line.qty}
            WHERE variant_id = ${line.variantId} AND ${sellableSql()} >= ${line.qty}`;
          if (updated !== 1) {
            throw new CheckoutError(409, `Sorry, ${line.productName}${line.variantName ? ` (${line.variantName})` : ""} just sold out in that quantity.`, {
              lines,
            });
          }
        }

        const shipping = quoteShipping(buyer.state, withWeights(items, weights), subtotalCents);
        const now = new Date();
        return tx.order.create({
          data: {
            orderNo: newOrderNo(),
            email: buyer.email,
            status: "pending_payment",
            subtotal: fromCents(subtotalCents),
            voucherCode: voucher?.code ?? null,
            discount: fromCents(discount),
            shippingFee: fromCents(shipping.feeCents),
            total: fromCents(subtotalCents - discount + shipping.feeCents),
            companyName: extras.companyName ?? null,
            note: extras.note ?? null,
            shipName: buyer.name,
            shipPhone: buyer.phone,
            shipAddress: buyer.addressLine,
            shipPostcode: buyer.postcode,
            shipCity: buyer.city,
            shipState: buyer.state,
            createdAt: now,
            expiresAt: new Date(now.getTime() + holdMinutes() * 60_000),
            items: {
              create: lines.map((l) => ({ variantId: l.variantId, qty: l.qty, unitPrice: fromCents(l.unitPriceCents) })),
            },
          },
          include: { items: true },
        });
      }, STOCK_TX);
    } catch (err) {
      // Order number collision: try again with a new one.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && attempt < 4) continue;
      throw err;
    }
  }
}

/** Cancels an unpaid order and gives its reserved stock back. No-op unless it's still pending_payment. */
export async function cancelUnpaidOrder(orderId) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({ where: { id: orderId, status: "pending_payment" }, data: { status: "cancelled" } });
    if (count === 0) return false;
    const items = await tx.orderItem.findMany({ where: { orderId } });
    for (const item of items) {
      await tx.$executeRaw`UPDATE inventory SET reserved = GREATEST(reserved - ${item.qty ?? 0}, 0) WHERE variant_id = ${item.variantId}`;
    }
    return true;
  }, STOCK_TX);
}

/**
 * Marks an order paid and turns its reservation into a sale (available -= qty, reserved -= qty).
 * Must run inside the payment transaction. Returns what happened, for logging; safe to call twice.
 */
async function recordSale(tx, orderId, items, note) {
  for (const item of items) {
    if (item.variantId == null) continue;
    await logStockMovement(tx, { variantId: item.variantId, delta: -(item.qty ?? 0), reason: "sale", orderId, note });
  }
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { voucherCode: true } });
  if (order?.voucherCode) await tx.$executeRaw`UPDATE vouchers SET used_count = used_count + 1 WHERE code = ${order.voucherCode}`;
}

export async function settlePaidOrder(tx, orderId) {
  const paidAt = new Date();
  const { count } = await tx.order.updateMany({ where: { id: orderId, status: "pending_payment" }, data: { status: "paid", paidAt } });
  const items = await tx.orderItem.findMany({ where: { orderId } });
  if (count === 1) {
    for (const item of items) {
      const qty = item.qty ?? 0;
      await tx.$executeRaw`
        UPDATE inventory SET available = available - ${qty}, reserved = GREATEST(reserved - ${qty}, 0)
        WHERE variant_id = ${item.variantId}`;
    }
    await recordSale(tx, orderId, items, null);
    return "paid";
  }
  // Paid after the hold expired and the reservation was released: still take the money's worth of
  // stock (it may go negative = oversold), and leave it to staff to fulfil or refund.
  const late = await tx.order.updateMany({ where: { id: orderId, status: "cancelled" }, data: { status: "paid", paidAt } });
  if (late.count === 1) {
    for (const item of items) {
      await tx.$executeRaw`UPDATE inventory SET available = available - ${item.qty ?? 0} WHERE variant_id = ${item.variantId}`;
    }
    await recordSale(tx, orderId, items, "paid after hold expired");
    return "paid_after_expiry";
  }
  return "already_settled";
}

// ---------------------------------------------------------------------------
// Buyer-facing view of an order

export async function findOrderForBuyer(orderNo, email) {
  const order = await prisma.order.findUnique({
    where: { orderNo },
    include: {
      items: { include: { variant: { include: { product: { select: { name: true, displayName: true, slug: true } } } } }, orderBy: { id: "asc" } },
      payments: { orderBy: { id: "desc" }, take: 1 },
    },
  });
  // Same response for "no such order" and "wrong email", so order numbers can't be probed.
  if (!order || !order.email || order.email !== email.trim().toLowerCase()) return null;
  return order;
}

export function serializeOrder(order) {
  const latestPayment = order.payments[0] ?? null;
  return {
    orderNo: order.orderNo,
    status: order.status,
    createdAt: order.createdAt,
    expiresAt: order.expiresAt,
    paidAt: order.paidAt,
    email: order.email,
    items: order.items.map((i) => ({
      variantId: i.variantId,
      sku: i.variant?.sku ?? null,
      productName: i.variant ? displayNameOf(i.variant.product) : null,
      productSlug: i.variant?.product.slug ?? null,
      variantName: i.variant?.variationName ?? null,
      qty: i.qty,
      unitPrice: i.unitPrice?.toNumber() ?? null,
      lineTotal: i.unitPrice && i.qty ? i.unitPrice.mul(i.qty).toNumber() : null,
    })),
    subtotal: order.subtotal?.toNumber() ?? null,
    voucherCode: order.voucherCode,
    discount: order.discount?.toNumber() ?? 0,
    companyName: order.companyName,
    note: order.note,
    shippingFee: order.shippingFee?.toNumber() ?? null,
    total: order.total?.toNumber() ?? null,
    shipping: {
      name: order.shipName,
      phone: order.shipPhone,
      addressLine: order.shipAddress,
      postcode: order.shipPostcode,
      city: order.shipCity,
      state: order.shipState,
    },
    payment: latestPayment && { status: latestPayment.status, method: latestPayment.method, provider: latestPayment.provider },
    courier: order.courier,
    trackingNo: order.trackingNo,
  };
}
