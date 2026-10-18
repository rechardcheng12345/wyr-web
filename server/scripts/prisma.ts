// Run the Prisma CLI with DATABASE_URL built from DB_* (see src/env.ts).
//   tsx scripts/prisma.ts migrate deploy
import "../src/env.js";
import { spawnSync } from "node:child_process";

const result = spawnSync("prisma", process.argv.slice(2), { stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);
