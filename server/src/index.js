import { DB_CONFIG_HELP, MISSING_DB_VARS } from "./env.js";
import { createApp } from "./app.js";
import { ADMIN_LOGIN_DISABLED, USING_RANDOM_SESSION_SECRET } from "./auth.js";
import { startExpireOrdersJob } from "./jobs/expire-orders.js";
import { paymentMode } from "./payments/index.js";
import { loadSettings } from "./settings.js";
import { startSyncHealthJob } from "./sync-health.js";

const port = Number(process.env.PORT ?? 4000);

if (MISSING_DB_VARS.length) {
  console.error(`WYR API cannot start: missing ${MISSING_DB_VARS.join(", ")}. ${DB_CONFIG_HELP}`);
  process.exit(1);
}

loadSettings()
  .catch((err) => console.warn(`[settings] could not load saved settings, using defaults: ${err.message}`))
  .then(start);

function start() {
  // Express 5 passes listen errors (e.g. EADDRINUSE) to the callback instead of throwing.
  createApp().listen(port, (err) => {
    if (err) {
      console.error(`WYR API could not listen on port ${port}: ${err.message}`);
      process.exit(1);
    }
    console.log(`WYR API listening on http://localhost:${port}`);
    if (paymentMode() === "mock") console.warn("PAYMENT_MODE=mock: payments are fake. Never use this in production.");
    if (ADMIN_LOGIN_DISABLED) console.warn("ADMIN_USERNAME/ADMIN_PASSWORD not set: admin login is disabled until both are set.");
    if (USING_RANDOM_SESSION_SECRET) console.warn("SESSION_SECRET not set: admin sessions end whenever the server restarts.");
    startExpireOrdersJob();
    startSyncHealthJob();
  });
}
