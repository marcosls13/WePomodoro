import { cleanupExpiredSessions } from "./api/lifecycle.js";
import { createApp } from "./app.js";
import { gameVerifiers } from "./games/registry.js";
import { prisma } from "./prisma.js";
import { sweepTimers } from "./timers/timers.service.js";

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be between 1 and 65535");

const trustProxy = Number(process.env.TRUST_PROXY ?? 0);
if (!Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 10)
  throw new Error("TRUST_PROXY must be an integer between 0 and 10");

const ctx = { db: prisma, now: () => new Date() };
const app = createApp(ctx, {
  gameVerifiers,
  trustProxy,
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
