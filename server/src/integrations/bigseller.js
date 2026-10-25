export function bigsellerEnabled() {
  return Boolean(process.env.BIGSELLER_APP_KEY?.trim() && process.env.BIGSELLER_APP_SECRET?.trim());
}

export async function pushOrder(order) {
  if (!bigsellerEnabled()) return { enabled: false };
  // TODO: POST the paid order to BigSeller's open API (order create, e.g. /open/api/order/create) with the
  // signed app key/secret, store the returned id in orders.bigseller_order_id and set status sent_to_bigseller.
  return { enabled: true, pushed: false, orderNo: order?.orderNo ?? null, reason: "not implemented" };
}

export async function pullInventory() {
  if (!bigsellerEnabled()) return { enabled: false };
  // TODO: page through BigSeller's inventory list (e.g. /open/api/inventory/list) and write each SKU's
  // on-hand qty to inventory.available, logging the difference to stock_movements with reason 'import'.
  return { enabled: true, pulled: 0, reason: "not implemented" };
}
