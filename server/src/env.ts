// Load server/.env, then build DATABASE_URL (which Prisma reads) from the DB_* variables.
// Real environment variables win over .env, so production can set DB_* without any file.
// If DATABASE_URL is already set it is used as-is.
import "dotenv/config";

if (!process.env.DATABASE_URL) {
  const { DB_HOST = "localhost", DB_PORT = "3306", DB_USER, DB_PASSWORD = "", DB_NAME } = process.env;
  if (DB_USER && DB_NAME) {
    const auth = `${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD)}`;
    process.env.DATABASE_URL = `mysql://${auth}@${DB_HOST}:${DB_PORT}/${encodeURIComponent(DB_NAME)}`;
  } else {
    console.warn("[warn] database not configured: set DB_USER and DB_NAME (or DATABASE_URL)");
  }
}
