import { cleanupExpiredSessions } from "./api/lifecycle.js";
import { createApp } from "./app.js";
import { gameVerifiers } from "./games/registry.js";
import { consoleMailer, type Mailer } from "./mail/mailer.js";
import { createSmtpMailer, smtpConfigFromEnv } from "./mail/smtp.js";
import { prisma } from "./prisma.js";
import { sweepTimers } from "./timers/timers.service.js";

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be between 1 and 65535");

const trustProxy = Number(process.env.TRUST_PROXY ?? 0);
if (!Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 10)
  throw new Error("TRUST_PROXY must be an integer between 0 and 10");

function createMailer(): Mailer {
  const config = smtpConfigFromEnv(process.env);
  if (!config) {
    if (process.env.NODE_ENV === "production")
      throw new Error("SMTP_USER and SMTP_PASSWORD are required in production");
    console.warn("SMTP_USER is not set: emails are only logged, not sent");
    return consoleMailer;
  }
  const smtp = createSmtpMailer(config);
  smtp
    .verify()
    .then(() => {
      console.log(`Email ready: sending as ${config.from}`);
    })
    .catch((error: unknown) => {
      console.error("Could not log in to the SMTP server", error);
    });
  return smtp.mailer;
}

const ctx = { db: prisma, now: () => new Date(), mailer: createMailer() };
const app = createApp(ctx, {
  gameVerifiers,
  trustProxy,
  devAuth: process.env.DEV_AUTH === "true",
  origins: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim()),
  onError: (error) => {
    console.error("API request failed", error);
  },
});

const server = app.listen(port, () => {
  console.log(`WePomodoro API listening on port ${port}`);
});

let sweeping: Promise<void> | null = null;
let ticks = 0;
const worker = setInterval(() => {
  if (sweeping) return;
  ticks++;
  sweeping = sweepTimers(ctx)
    .then(async () => {
      if (ticks % 60 === 0) await cleanupExpiredSessions(ctx);
    })
    .catch((error: unknown) => {
      console.error("Timer finalization failed", error);
    })
    .finally(() => {
      sweeping = null;
    });
}, 1000);

worker.unref();

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  clearInterval(worker);
  const forced = setTimeout(() => {
    console.error("Graceful shutdown timed out; forcing exit");
    process.exit(1);
  }, 10000);
  forced.unref();
  const closed = new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
  // Idle keep-alive connections would otherwise hold server.close() open.
  server.closeIdleConnections();
  await closed;
  await sweeping;
  await prisma.$disconnect();
  process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => void shutdown());
