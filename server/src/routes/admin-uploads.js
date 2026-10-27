import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Router } from "express";
import { requireAdmin } from "../auth.js";
import { SERVER_ROOT } from "../env.js";

// Uploaded product photos and videos. Kept outside client/dist so a rebuild doesn't wipe them;
// set UPLOAD_DIR to a folder that also survives redeploys on the host.
export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR?.trim() || path.join(SERVER_ROOT, "..", "uploads"));
export const UPLOAD_URL = "/uploads";

const KINDS = {
  image: { maxMb: 10, types: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } },
  video: { maxMb: 200, types: { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" } },
};

export const adminUploadsRouter = Router();
adminUploadsRouter.use(requireAdmin);

function baseName(name) {
  return (
    path
      .parse(typeof name === "string" ? name : "")
      .name.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "file"
  );
}

// The file is the raw request body (Content-Type = the file's type), so no multipart parser is needed.
// POST /api/admin/uploads?kind=image|video&name=original-file-name.mp4  ->  { url, size }
adminUploadsRouter.post("/", async (req, res, next) => {
  const kind = KINDS[req.query.kind];
  if (!kind) {
    res.status(400).json({ error: "kind must be image or video" });
    return;
  }
  const type = (req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  const ext = kind.types[type];
  if (!ext) {
    res.status(415).json({ error: `Unsupported file type. Use ${Object.values(kind.types).join(", ")}.` });
    return;
  }
  const limit = kind.maxMb * 1024 * 1024;
  if (Number(req.headers["content-length"]) > limit) {
    res.status(413).json({ error: `File is larger than ${kind.maxMb} MB` });
    return;
  }

  const month = new Date().toISOString().slice(0, 7);
  const rel = path.posix.join(`${req.query.kind}s`, month, `${crypto.randomBytes(4).toString("hex")}-${baseName(req.query.name)}.${ext}`);
  const dest = path.join(UPLOAD_DIR, rel);
  const tmp = `${dest}.part`;
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    let size = 0;
    await pipeline(
      req,
      async function* (source) {
        for await (const chunk of source) {
          size += chunk.length;
          if (size > limit) throw Object.assign(new Error(`File is larger than ${kind.maxMb} MB`), { status: 413 });
          yield chunk;
        }
      },
      fs.createWriteStream(tmp),
    );
    if (size === 0) throw Object.assign(new Error("The file is empty"), { status: 400 });
    fs.renameSync(tmp, dest);
    res.status(201).json({ url: `${UPLOAD_URL}/${rel}`, size });
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    if (err.status) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    next(err);
  }
});
