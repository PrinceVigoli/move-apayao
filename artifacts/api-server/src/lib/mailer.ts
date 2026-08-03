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
 * If SMTP is not configured the app still runs; reset requests are accepted
 * and the link is written to the server log instead of being sent. That keeps
 * local development working without credentials, and makes a misconfigured
 * production server obvious in the logs rather than silently dropping mail.
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
    logger.warn("SMTP not configured — password reset links will be logged, not emailed");
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
    logger.warn({ to, resetUrl }, "SMTP not configured — password reset link (dev only)");
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
