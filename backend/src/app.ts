import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import helmet from "helmet";
import { Prisma } from "./generated/prisma/client.js";
import { ApiError, type Context } from "./api/common.js";
import { createRouter, type RateLimits } from "./api/router.js";
import type { GameVerifiers } from "./games/games.service.js";
import { devRouter } from "./dev.js";

export function createApp(
  ctx: Context,
  options: {
    origins?: string[];
    /** Number of reverse proxies in front of the app; 0 when directly exposed. */
    trustProxy?: number;
    rateLimits?: RateLimits;
    gameVerifiers?: GameVerifiers;
    onError?: (error: unknown) => void;
    /** Dev only: let `X-Dev-User` act as any user without a token. Ignored in production. */
    devAuth?: boolean;
  } = {},
) {
  const dev = process.env.NODE_ENV !== "production";
  const devAuth = dev && options.devAuth === true;
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  // Needed for correct client IPs (rate limiting) behind a reverse proxy. A
  // value larger than the real proxy count lets clients spoof their IP.
  app.set("trust proxy", options.trustProxy ?? 0);

  const origins = options.origins ?? ["http://localhost:5173"];
  app.use(
    cors({
      origin(origin, callback) {
        // Requests without an Origin header (curl, native clients) are not CORS.
        if (!origin || origins.includes(origin)) callback(null, true);
        else callback(new ApiError(403, "Origin not allowed"));
      },
    }),
  );

  app.use(express.json({ limit: "16kb" }));

  app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  app.get("/", (req, res) => {
    res.json({ service: "WePomodoro API", health: "/api/health", dev: "/dev" });
  });

  if (dev) app.use("/dev", devRouter(ctx, devAuth));

  app.use(
    "/api",
    createRouter(ctx, options.gameVerifiers, options.rateLimits, devAuth),
  );

  app.use((req, res) => {
    res.status(404).json({ error: "Endpoint not found" });
  });

  app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof ApiError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        res
          .status(409)
          .json({ error: "This value or active record already exists" });
        return;
      }
      if (error.code === "P2025") {
        res.status(404).json({ error: "Record not found" });
        return;
      }
      if (error.code === "P2003" || error.code === "P2034") {
        res.status(409).json({
          error:
            "Data changed or a related record prevents this action; retry the request",
        });
        return;
      }
    }
    if (typeof error === "object" && error !== null && "type" in error) {
      if (error.type === "entity.parse.failed") {
        res.status(400).json({ error: "Invalid JSON" });
        return;
      }
      if (error.type === "entity.too.large") {
        res.status(413).json({ error: "Request body is too large" });
        return;
      }
    }
    options.onError?.(error);
    res.status(500).json({ error: "An unexpected server error occurred" });
  });
  return app;
}
