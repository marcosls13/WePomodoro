import nodemailer, { type Transporter } from "nodemailer";
import type { Mailer } from "./mailer.js";

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

// Defaults target Gmail: smtp.gmail.com on 465 (implicit TLS). Gmail needs 2-Step
// Verification and an App Password; the account password won't work.
// Empty variables (FOO=) count as unset.
const setting = (value: string | undefined) => value?.trim() ?? "";

export function smtpConfigFromEnv(env: NodeJS.ProcessEnv): SmtpConfig | null {
  const user = setting(env.SMTP_USER);
  if (user === "") return null;
  // Google shows app passwords in groups separated by spaces; they aren't part of it.
  const password = (env.SMTP_PASSWORD ?? "").replace(/\s+/g, "");
  if (!password)
    throw new Error("SMTP_PASSWORD is required when SMTP_USER is set");
  const port = Number(env.SMTP_PORT ?? 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("SMTP_PORT must be between 1 and 65535");
  return {
    host:
      setting(env.SMTP_HOST) === "" ? "smtp.gmail.com" : setting(env.SMTP_HOST),
    port,
    user,
    password,
    from:
      setting(env.MAIL_FROM) === ""
        ? `WePomodoro <${user}>`
        : setting(env.MAIL_FROM),
  };
}

export function createSmtpMailer(
  config: SmtpConfig,
  transport: Transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.password },
  }),
) {
  const mailer: Mailer = {
    send: async (to, subject, text) => {
      await transport.sendMail({ from: config.from, to, subject, text });
    },
  };
  // Resolves if the server accepts our login; use it to fail loudly at startup.
  return { mailer, verify: () => transport.verify() };
}
