// Run the Prisma CLI against the database configured by DB_* (see src/env.js).
//   node scripts/prisma.js migrate deploy
import "../src/env.js";
import { spawnSync } from "node:child_process";

const result = spawnSync("prisma", process.argv.slice(2), { stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);
