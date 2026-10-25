import { Router } from "express";
import { requireAdmin } from "../auth.js";
import { describeSettings, saveSettings } from "../settings.js";

export const adminSettingsRouter = Router();
adminSettingsRouter.use(requireAdmin);

adminSettingsRouter.get("/", (_req, res) => {
  res.json(describeSettings());
});

adminSettingsRouter.put("/", async (req, res) => {
  const result = await saveSettings(req.body?.values);
  if (result.errors) {
    res.status(400).json({ error: "Please fix the highlighted fields", fields: result.errors });
    return;
  }
  res.json(describeSettings());
});
