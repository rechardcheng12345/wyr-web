import { Router } from "express";
import { checkCredentials, clearSession, getSessionUser, setSession } from "../auth.js";

export const authRouter = Router();

authRouter.post("/login", (req, res) => {
  const { username, password } = req.body ?? {};
  const user = checkCredentials(username, password);
  if (!user) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }
  setSession(res, user);
  res.json({ user });
});

authRouter.post("/logout", (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

authRouter.get("/me", (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json({ user });
});
