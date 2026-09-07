import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "./logger";

/**
 * Outbound email, used only for password resets.
 *
 * Configuration (api-server/.env.local):
 *   SMTP_HOST=smtp.gmail.com
 *   SMTP_PORT=587
 *   SMTP_USER=you@example.com
 *   SMTP_PASS=your-app-password        <- Gmail requires an App Password
 *   SMTP_FROM="MOVE Apayao <no-reply@example.com>"
 *
 * If SMTP is not configured in local development, reset requests are accepted
 * but no message is delivered. Reset URLs contain bearer secrets and must
 * never be written to logs. Production configuration validation requires SMTP.
 */

let _transport: Transporter | null = null;
let _checked = false;

function getTransport(): Transporter | null {
  if (_checked) return _transport;
  _checked = true;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    logger.warn("SMTP not configured - password reset email will not be delivered");
    return null;
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  _transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 is implicit TLS; 587 upgrades via STARTTLS
    auth: { user, pass },
  });
  return _transport;
}

export function isMailConfigured(): boolean {
  return getTransport() !== null;
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const transport = getTransport();

  if (!transport) {
    logger.warn({ to }, "SMTP not configured - password reset email not delivered");
    return;
  }

  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER!;

  await transport.sendMail({
    from,
    to,
    subject: "Reset your MOVE Apayao password",
    text: [
      "We received a request to reset your MOVE Apayao password.",
      "",
      "Open this link to choose a new password:",
      resetUrl,
      "",
      "The link expires in 1 hour and can only be used once.",
      "If you did not request this, you can ignore this email — your password will not change.",
    ].join("\n"),
    html: `
      <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;color:#12241b">
        <h2 style="margin:0 0 16px;font-size:20px">Reset your password</h2>
        <p style="margin:0 0 16px;line-height:1.6">
          We received a request to reset your MOVE Apayao password.
        </p>
        <p style="margin:0 0 24px">
          <a href="${resetUrl}"
             style="display:inline-block;background:#d93a10;color:#fff;text-decoration:none;
                    padding:12px 22px;border-radius:8px;font-weight:600">
            Choose a new password
          </a>
        </p>
        <p style="margin:0 0 8px;font-size:13px;color:#5b6b63;line-height:1.6">
          The link expires in 1 hour and can only be used once.
        </p>
        <p style="margin:0;font-size:13px;color:#5b6b63;line-height:1.6">
          If you did not request this, you can ignore this email — your password will not change.
        </p>
      </div>
    `,
  });
}

export async function sendDriverApplicationDecisionEmail(
  to: string,
  status: "approved" | "rejected" | "revoked",
  reason?: string,
): Promise<void> {
  const transport = getTransport();
  if (!transport) {
    logger.warn({ to, status }, "SMTP not configured — driver decision email not sent");
    return;
  }
  const approved = status === "approved";
  const subject = approved
    ? "Your MOVE Apayao driver application was approved"
    : status === "rejected"
      ? "Update on your MOVE Apayao driver application"
      : "Your MOVE Apayao driver access was revoked";
  const detail = reason ? `Reason: ${reason}` : "";
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER!,
    to,
    subject,
    text: [
      approved
        ? "Your application was approved. You can now sign in to the MOVE Driver app."
        : "An administrator updated your driver application or access.",
      detail,
      "If you need help, contact the MOVE Apayao operations team.",
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
}
