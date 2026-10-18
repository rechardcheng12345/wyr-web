// Load server/.env, then give Prisma its connection URL, built from the DB_* variables.
// Real environment variables win over .env, so production can set DB_* without any file.
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// This file runs from server/src (tsx) or server/dist/src (built), so find the server root first.
// Loading .env from here rather than the current directory means it works whichever folder the
// server is started from (e.g. `node server/dist/src/index.js` from the project root).
const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(here, here.endsWith(path.join("dist", "src")) ? "../.." : "..");
const ENV_FILE = path.join(SERVER_ROOT, ".env");
dotenv.config({ path: ENV_FILE });

const { DB_HOST = "localhost", DB_PORT = "3306", DB_USER, DB_PASSWORD = "", DB_NAME } = process.env;
const missing = [!DB_USER && "DB_USER", !DB_NAME && "DB_NAME"].filter(Boolean);
if (missing.length) {
  console.warn(`[warn] database not configured: ${missing.join(", ")} not set (checked environment variables and ${ENV_FILE})`);
} else {
  // Internal only: Prisma reads its URL from this variable (see prisma/schema.prisma). Never set it yourself.
  const auth = `${encodeURIComponent(DB_USER!)}:${encodeURIComponent(DB_PASSWORD)}`;
  process.env.DATABASE_URL = `mysql://${auth}@${DB_HOST}:${DB_PORT}/${encodeURIComponent(DB_NAME!)}`;
}
