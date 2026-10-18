import "dotenv/config";
import { createApp } from "./app.js";
import { startExpireOrdersJob } from "./jobs/expire-orders.js";
import { paymentMode } from "./payments/index.js";

const port = Number(process.env.PORT ?? 4000);

// Express 5 passes listen errors (e.g. EADDRINUSE) to the callback instead of throwing.
createApp().listen(port, (err?: Error) => {
  if (err) {
    console.error(`WYR API could not listen on port ${port}: ${err.message}`);
    process.exit(1);
  }
  console.log(`WYR API listening on http://localhost:${port}`);
  if (paymentMode() === "mock") console.warn("PAYMENT_MODE=mock: payments are fake. Never use this in production.");
  startExpireOrdersJob();
});
