import { prisma } from "../db.js";
import { cancelUnpaidOrder } from "../orders.js";
import { reconcileOrderPayments } from "../payments/index.js";

const INTERVAL_MS = 60_000;

/** Cancels orders still unpaid after their hold time and releases their reserved stock. */
export async function expireUnpaidOrders(now = new Date()) {
  const due = await prisma.order.findMany({
    where: { status: "pending_payment", expiresAt: { lte: now } },
    select: { id: true, orderNo: true },
    take: 100,
  });
  let cancelled = 0;
  for (const order of due) {
    try {
      // A payment may have gone through without its callback reaching us; ask the gateway first.
      await reconcileOrderPayments(order.id);
      if (await cancelUnpaidOrder(order.id)) {
        cancelled++;
        console.log(`[expire-orders] ${order.orderNo} unpaid, cancelled and stock released`);
      }
    } catch (err) {
      console.error(`[expire-orders] ${order.orderNo}:`, err);
    }
  }
  return cancelled;
}

export function startExpireOrdersJob() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await expireUnpaidOrders();
    } catch (err) {
      console.error("[expire-orders]", err);
    } finally {
      running = false;
    }
  };
  void tick();
  return setInterval(tick, INTERVAL_MS).unref();
}
