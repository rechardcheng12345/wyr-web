import nodemailer from "nodemailer";
import { getSetting } from "./settings.js";

let transport = null;
let warned = false;

export function mailConfigured() {
  return ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"].every((k) => process.env[k]?.trim());
}

function getTransport() {
  if (transport) return transport;
  const port = Number(process.env.SMTP_PORT ?? 587);
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST.trim(),
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER.trim(), pass: process.env.SMTP_PASS.replace(/\s+/g, "") },
  });
  return transport;
}

function fromAddress() {
  const custom = process.env.SMTP_FROM?.trim();
  if (custom) return custom;
  const name = (getSetting("company_name") ?? "").replace(/["\\]/g, "");
  const user = process.env.SMTP_USER.trim();
  return name ? `"${name}" <${user}>` : user;
}

/** Sends one email. Returns false (and logs) instead of throwing, so a mail problem never breaks an order. */
export async function sendMail({ to, subject, html, text, attachments }) {
  if (!mailConfigured()) {
    if (!warned) console.warn("[mail] SMTP_HOST/SMTP_USER/SMTP_PASS not set: emails are not sent.");
    warned = true;
    return false;
  }
  const replyTo = process.env.SMTP_REPLY_TO?.trim() || getSetting("company_email") || undefined;
  try {
    const info = await getTransport().sendMail({ from: fromAddress(), replyTo, to, subject, html, text, attachments });
    console.log(`[mail] sent "${subject}" to ${to} (${info.messageId})`);
    return true;
  } catch (err) {
    console.error(`[mail] failed to send "${subject}" to ${to}: ${err.message}`);
    return false;
  }
}

export async function verifyMail() {
  if (!mailConfigured()) return false;
  await getTransport().verify();
  return true;
}
