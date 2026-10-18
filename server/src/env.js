// Load server/.env, then give Prisma its connection URL, built from the DB_* variables.
// Real environment variables win over .env, so production can set DB_* without any file.
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Loading .env relative to this file (server/src) rather than the current directory means it works
// whichever folder the server is started from (e.g. `node index.js` from the project root).
export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = path.join(SERVER_ROOT, ".env");
// Hostinger writes the hPanel environment variables to a .env at the project root (like virtual_listing uses).
const ROOT_ENV_FILE = path.join(SERVER_ROOT, "..", ".env");
// Earlier sources win: real environment variables, then server/.env, then the root .env.
dotenv.config({ path: [ENV_FILE, ROOT_ENV_FILE] });

const { DB_HOST, DB_PORT = "3306", DB_USER, DB_PASSWORD = "", DB_NAME } = process.env;

/** Required DB_* variables that are not set. The server refuses to start while this is non-empty. */
export const MISSING_DB_VARS = ["DB_HOST", "DB_USER", "DB_NAME"].filter((name) => !process.env[name]?.trim());
export const DB_CONFIG_HELP =
  `Set them as environment variables (in production: your host's environment variable settings) or in ${ENV_FILE} / ${ROOT_ENV_FILE}. ` +
  "server/.env is not committed to git, so it does not exist on the production server.";

if (MISSING_DB_VARS.length) {
  console.warn(`[warn] database not configured: ${MISSING_DB_VARS.join(", ")} not set. ${DB_CONFIG_HELP}`);
} else {
  // Internal only: Prisma reads its URL from this variable (see prisma/schema.prisma). Never set it yourself.
  const auth = `${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD)}`;
  process.env.DATABASE_URL = `mysql://${auth}@${DB_HOST}:${DB_PORT}/${encodeURIComponent(DB_NAME)}`;
}
