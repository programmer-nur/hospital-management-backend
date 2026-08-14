import nodemailer, { Transporter } from "nodemailer";

import config from "../../config";
import {
  NotificationProvider,
  ProviderResult,
} from "./notification.type";

/**
 * Development provider.
 *
 * Records the message to stdout and reports success. Used when SMTP is not
 * configured, so the queue → dispatch → status pipeline is exercisable
 * locally without a mail account.
 *
 * It is deliberately loud about what it is: a silent no-op that reported
 * success would be indistinguishable from real delivery, which is exactly how
 * a broken notification system goes unnoticed.
 */
export class LogProvider implements NotificationProvider {
  readonly name = "log";
  readonly channel = "email" as const;

  async send(
    to: string,
    subject: string,
    body: string
  ): Promise<ProviderResult> {
    console.log(
      `[notifications] LOG PROVIDER — not actually delivered\n` +
        `  to:      ${to}\n` +
        `  subject: ${subject}\n` +
        `  body:    ${body.replace(/\n/g, "\n           ")}`
    );
    return { ok: true, reference: `log:${Date.now()}` };
  }
}

/** Sends over SMTP using the credentials already declared in config. */
export class SmtpProvider implements NotificationProvider {
  readonly name = "smtp";
  readonly channel = "email" as const;
  private transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.smtp_host,
      port: Number(config.smtp_port) || 587,
      secure: Number(config.smtp_port) === 465,
      auth: {
        user: config.smtp_email_username,
        pass: config.smtp_email_password,
      },
    });
  }

  async send(
    to: string,
    subject: string,
    body: string
  ): Promise<ProviderResult> {
    try {
      const info = await this.transporter.sendMail({
        from: config.smtp_email,
        to,
        subject,
        text: body,
      });
      return { ok: true, reference: info.messageId };
    } catch (error: any) {
      return { ok: false, error: error?.message ?? "SMTP send failed" };
    }
  }
}

let cached: NotificationProvider | null = null;

/**
 * The active provider.
 *
 * SMTP when host and credentials are configured; otherwise the log provider.
 * Selecting on configuration means enabling real delivery is an env change,
 * not a code change — and a missing credential degrades to a visible no-op
 * rather than a crash on every queued message.
 */
export function getProvider(): NotificationProvider {
  if (cached) return cached;

  const smtpConfigured =
    !!config.smtp_host &&
    !!config.smtp_email_username &&
    !!config.smtp_email_password;

  cached = smtpConfigured ? new SmtpProvider() : new LogProvider();
  console.log(`[notifications] provider: ${cached.name}`);
  return cached;
}

/** Test seam — lets a caller reset the memoised provider. */
export function resetProvider(): void {
  cached = null;
}
