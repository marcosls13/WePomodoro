import {
  Router,
  raw,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import rateLimit, {
  ipKeyGenerator,
  type RateLimitInfo,
} from "express-rate-limit";
import {
  ApiError,
  body,
  email,
  integer,
  pagination,
  profileSelect,
  registered,
  text,
  username,
  uuid,
  type Actor,
  type Context,
} from "./common.js";
import {
  authenticate,
  createGuest,
  login,
  me,
  password,
  updateProfile,
  verifyPassword,
} from "../auth/auth.service.js";
import {
  OAuthError,
  oauthCallback,
  oauthExchange,
  oauthStart,
} from "../auth/oauth.service.js";
import {
  resendChallenge,
  requestToggleCode,
  confirmToggleCode,
  finishChallenge,
  twoFactorStatus,
} from "../auth/twofactor.service.js";
import {
  acceptFriend,
  listFriends,
  removeFriend,
  requestFriend,
} from "../friends/friends.service.js";
import {
  confirmPasswordReset,
  requestPasswordReset,
  verifyResetCode,
} from "../auth/reset.service.js";
import { sendVerificationCode, verifyEmail } from "../auth/verify.service.js";
import { getUserStatistics } from "../stats/stats.service.js";
import {
  avatarMaxBytes,
  avatarTypes,
  clearAvatar,
  getAvatar,
  publicProfile,
  setAvatar,
} from "../users/users.service.js";
import {
  deleteUser,
  getUser,
  listUsers,
  createUser,
  deleteGuest,
  listGuests,
  requireStaff,
  resetTwoFactor,
  updateUser,
} from "../admin/admin.service.js";
import { endIdentity } from "./lifecycle.js";
import { migrationsPending } from "./migrations.js";
import {
  cancelPending,
  completePending,
  resendPending,
  startSignup,
} from "../auth/pending.service.js";

// Shown to users without a picture; deliberately says nothing about who it is.
const defaultAvatar =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">' +
  '<rect width="128" height="128" fill="#d1d5db"/>' +
  '<circle cx="64" cy="50" r="24" fill="#9ca3af"/>' +
  '<path d="M16 128c0-30 22-48 48-48s48 18 48 48z" fill="#9ca3af"/></svg>';

function actor(res: Response): Actor {
  return res.locals.actor as Actor;
}

// Existing passwords are only compared, so don't apply the new-password rules.
function currentPassword(value: unknown) {
  if (typeof value !== "string" || value.length > 128)
    throw new ApiError(
      400,
      "Password must be a string of at most 128 characters",
    );
  return value;
}

export interface RateLimits {
  /** Token-issuing requests (signup, login, guest) per IP per minute. */
  authPerMinute: number;
  /** Failed logins per username per 15 minutes. */
  loginFailures: number;
  /** Password-reset emails per address per 15 minutes (stops mail bombing). */
  resetRequests: number;
}

export const defaultRateLimits: RateLimits = {
  authPerMinute: 20,
  loginFailures: 8,
  resetRequests: 3,
};

// Rate-limit key from a string field of the JSON body, falling back to the IP.
function bodyKey(field: string, prefix: string, max: number) {
  return (req: Request) => {
    const input: unknown = req.body;
    const value =
      typeof input === "object" && input !== null && field in input
        ? (input as Record<string, unknown>)[field]
        : undefined;
    return typeof value === "string" && value.length <= max
      ? `${prefix}:${value.trim().toLowerCase()}`
      : ipKeyGenerator(req.ip ?? "unknown");
  };
}

function tooMany(message: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { rateLimit: info } = req as Request & { rateLimit?: RateLimitInfo };
    const resetAt = info?.resetTime?.getTime() ?? Date.now() + 60000;
    res.setHeader(
      "Retry-After",
      String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))),
    );
    next(new ApiError(429, message));
  };
}

export function createRouter(
  ctx: Context,
  limits: RateLimits = defaultRateLimits,
) {
  const router = Router();

  // In-memory limits are per process. A multi-instance deployment should also
  // enforce a shared limit at its gateway.
  const perIp = rateLimit({
    windowMs: 60_000,
    limit: limits.authPerMinute,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: (req) => req.method !== "POST",
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown"),
    handler: tooMany("Too many authentication attempts; try again shortly"),
  });
  // Stops password guessing against one account from many IPs. Successful
  // logins don't count, so a legitimate user is never locked out by their own use.
  const perAccount = rateLimit({
    windowMs: 15 * 60_000,
    limit: limits.loginFailures,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: bodyKey("username", "user", 32),
    handler: tooMany(
      "Too many failed logins for this account; try again later",
    ),
  });

  // Each reset request sends an email, so cap them per address.
  const perAddress = rateLimit({
    windowMs: 15 * 60_000,
    limit: limits.resetRequests,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: bodyKey("email", "mail", 254),
    handler: tooMany("Too many reset requests for this address; try later"),
  });

  const perChallenge = rateLimit({
    windowMs: 15 * 60_000,
    limit: limits.resetRequests,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: bodyKey("challengeToken", "2fa", 128),
    handler: tooMany("Too many attempts; try again later"),
  });

  router.use(
    [
      "/auth/signup",
      "/auth/login",
      "/auth/guest",
      "/auth/password-reset",
      "/users",
    ],
    perIp,
  );
  router.post("/auth/login", perAccount);
  router.post("/auth/password-reset/request", perAddress);

  // Each code check or resend is limited per pending signup, on top of the
  // per-IP limit and the 5-attempt cap stored on the row.
  const perPending = rateLimit({
    windowMs: 15 * 60_000,
    limit: limits.resetRequests,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: bodyKey("pendingToken", "pending", 128),
    handler: tooMany("Too many attempts; try again later"),
  });
  const pendingToken = (value: unknown) => {
    if (typeof value !== "string" || !value || value.length > 128)
      throw new ApiError(400, "A pendingToken is required");
    return value;
  };

  router.post(["/auth/signup", "/users"], async (req, res) => {
    const input = body(req);
    res.status(202).json(
      await startSignup(ctx, {
        email: email(input.email),
        username: username(input.username),
        password: password(input.password),
      }),
    );
  });

  router.post("/auth/signup/verify", perPending, async (req, res) => {
    const input = body(req);
    if (typeof input.code !== "string" || !/^\d{6}$/.test(input.code))
      throw new ApiError(400, "The code must be 6 digits");
    res
      .status(201)
      .json(
        await completePending(
          ctx,
          pendingToken(input.pendingToken),
          input.code,
        ),
      );
  });

  router.post("/auth/signup/resend", perPending, async (req, res) => {
    await resendPending(ctx, pendingToken(body(req).pendingToken));
    res.status(202).json({ message: "A new code has been sent." });
  });

  router.post("/auth/signup/cancel", async (req, res) => {
    await cancelPending(ctx, pendingToken(body(req).pendingToken));
    res.sendStatus(204);
  });

  router.post("/auth/login", async (req, res) => {
    const input = body(req);
    res.json(
      await login(ctx, username(input.username), password(input.password)),
    );
  });

  // Password recovery: email a code, verify it, then set a new password.
  router.post("/auth/login/2fa", async (req, res) => {
    res.json(await finishChallenge(ctx, body(req).challengeToken, body(req)));
  });

  router.post("/auth/login/2fa/resend", perChallenge, async (req, res) => {
    await resendChallenge(ctx, body(req).challengeToken);
    res.sendStatus(204);
  });

  router.post("/auth/password-reset/request", async (req, res) => {
    await requestPasswordReset(ctx, email(body(req).email));
    // Same answer whether or not the address has an account.
    res.status(202).json({
      message: "If that address has an account, a code has been sent.",
    });
  });

  router.post("/auth/password-reset/verify", async (req, res) => {
    const input = body(req);
    if (typeof input.code !== "string" || !/^\d{6}$/.test(input.code))
      throw new ApiError(400, "The code must be 6 digits");
    res.json(await verifyResetCode(ctx, email(input.email), input.code));
  });

  router.post("/auth/password-reset/confirm", async (req, res) => {
    const input = body(req);
    if (typeof input.resetToken !== "string" || input.resetToken.length > 128)
      throw new ApiError(400, "A reset token is required");
    await confirmPasswordReset(ctx, input.resetToken, password(input.password));
    res.sendStatus(204);
  });

  // Limits every method on the OAuth routes (the perIp limiter only counts POST,
  // and these are mostly browser GET navigations).
  router.use(
    "/auth/oauth",
    rateLimit({
      windowMs: 60_000,
      limit: limits.authPerMinute,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown"),
      handler: tooMany("Too many authentication attempts; try again shortly"),
    }),
  );

  // Lists the enabled providers so the frontend draws only those buttons.
  router.get("/auth/oauth", (req, res) => {
    res.json({ providers: [...ctx.oauth.keys()] });
  });

  // Starts a sign-in: stores a random state in a cookie, then redirects the
  // browser to the provider.
  router.get("/auth/oauth/:provider", (req, res) => {
    const { url, state } = oauthStart(ctx, req.params.provider);
    res.cookie("oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/auth/oauth",
      maxAge: 10 * 60_000,
    });
    res.redirect(url);
  });

  // Where the provider sends the browser back. Always redirects to the frontend
  // (`?code=` or `?error=`) and never answers JSON, since it is a page navigation.
  router.get("/auth/oauth/:provider/callback", async (req, res) => {
    const frontend = (
      process.env.FRONTEND_URL ?? "http://localhost:5173"
    ).replace(/\/$/, "");
    const cookieState = /(?:^|;\s*)oauth_state=([^;]*)/.exec(
      req.headers.cookie ?? "",
    )?.[1];
    res.clearCookie("oauth_state", { path: "/api/auth/oauth" });
    try {
      if (typeof req.query.error === "string") throw new OAuthError("denied");
      const result = await oauthCallback(
        ctx,
        req.params.provider,
        req.query.code,
        cookieState,
        req.query.state,
      );
      res.redirect(
        "pendingToken" in result
          ? `${frontend}/auth/oauth?pending=${encodeURIComponent(result.pendingToken)}`
          : `${frontend}/auth/oauth?code=${encodeURIComponent(result.code)}`,
      );
    } catch (error) {
      if (!(error instanceof OAuthError))
        console.error("OAuth callback failed", error);
      const reason = error instanceof OAuthError ? error.code : "failed";
      res.redirect(`${frontend}/auth/oauth?error=${reason}`);
    }
  });

  // The frontend swaps the one-time code for a session token, like a login.
  router.post("/auth/oauth/exchange", async (req, res) => {
    res.json(await oauthExchange(ctx, body(req).code));
  });

  router.post("/auth/guest", async (req, res) => {
    res
      .status(201)
      .json(
        await createGuest(ctx, text(body(req).displayName, "displayName", 32)),
      );
  });

  router.get("/health", async (req, res) => {
    await ctx.db.$queryRaw`SELECT 1`;
    if (await migrationsPending(ctx.db)) {
      res.status(503).json({ status: "migrations pending; run db:deploy" });
      return;
    }
    res.json({ status: "ok" });
  });

  // Public so <img> tags work (they can't send a token). Anyone without a
  // picture, or who doesn't exist, gets the same default.
  router.get("/users/:id/avatar", async (req, res) => {
    const id = integer(Number(req.params.id), "id", 1, 2147483647);
    const avatar = await getAvatar(ctx, id);
    res.setHeader("Cache-Control", "public, max-age=60");
    // helmet's default would stop the frontend (another origin) from showing it.
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    if (!avatar) res.type("image/svg+xml").send(defaultAvatar);
    else res.type(avatar.contentType).send(Buffer.from(avatar.data));
  });

  router.use(async (req, res, next) => {
    res.locals.actor = await authenticate(ctx, req);
    next();
  });

  // Registered accounts must prove their email before using anything but the
  // routes needed to verify it, fix a mistyped address, or leave.
  const unverifiedOk = new Set([
    "GET /auth/me",
    "POST /auth/logout",
    "POST /auth/verify-email",
    "POST /auth/verify-email/resend",
    "GET /users/me",
    "PATCH /users/me",
    "DELETE /users/me",
  ]);
  router.use(async (req, res, next) => {
    const { userId } = actor(res);
    if (userId !== null && !unverifiedOk.has(`${req.method} ${req.path}`)) {
      const user = await ctx.db.user.findUnique({
        where: { id: userId },
        select: { emailVerifiedAt: true },
      });
      if (!user?.emailVerifiedAt)
        throw new ApiError(403, "Verify your email address first");
    }
    next();
  });

  // Resends are capped per account because each one sends an email.
  const perUser = rateLimit({
    windowMs: 15 * 60_000,
    limit: limits.resetRequests,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (_req, res) =>
      `verify:${String(actor(res).userId ?? "guest")}`,
    handler: tooMany("Too many verification emails; try again later"),
  });

  router.post("/auth/verify-email/resend", perUser, async (req, res) => {
    await sendVerificationCode(ctx, registered(actor(res)));
    res.status(202).json({ message: "A new code has been sent." });
  });

  router.post("/auth/verify-email", async (req, res) => {
    const { code } = body(req);
    if (typeof code !== "string" || !/^\d{6}$/.test(code))
      throw new ApiError(400, "The code must be 6 digits");
    await verifyEmail(ctx, registered(actor(res)), code);
    res.sendStatus(204);
  });

  // Each of these checks a password or a code, so cap attempts per account.
  const perUser2fa = rateLimit({
    windowMs: 15 * 60_000,
    limit: limits.loginFailures,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (_req, res) => `2fa:${String(actor(res).userId ?? "guest")}`,
    handler: tooMany("Too many attempts; try again later"),
  });

  router.get("/auth/2fa", async (req, res) => {
    res.json(await twoFactorStatus(ctx, actor(res)));
  });

  router.post("/auth/2fa/enable/request", perUser2fa, async (req, res) => {
    await requestToggleCode(ctx, actor(res), "enable", body(req).password);
    res.sendStatus(204);
  });

  router.post("/auth/2fa/enable", perUser2fa, async (req, res) => {
    await confirmToggleCode(ctx, actor(res), "enable", body(req));
    res.sendStatus(204);
  });

  router.post("/auth/2fa/disable/request", perUser2fa, async (req, res) => {
    await requestToggleCode(ctx, actor(res), "disable", body(req).password);
    res.sendStatus(204);
  });

  router.post("/auth/2fa/disable", perUser2fa, async (req, res) => {
    await confirmToggleCode(ctx, actor(res), "disable", body(req));
    res.sendStatus(204);
  });

  router.get("/auth/me", async (req, res) => {
    res.json(await me(ctx, actor(res)));
  });

  router.post("/auth/logout", async (req, res) => {
    await endIdentity(ctx, actor(res));
    res.sendStatus(204);
  });

  router.get("/users", async (req, res) => {
    res.json(
      await ctx.db.user.findMany({
        ...pagination(req),
        select: { id: true, username: true },
        orderBy: { id: "desc" },
      }),
    );
  });

  router.get("/users/me", async (req, res) => {
    res.json(
      await ctx.db.user.findUniqueOrThrow({
        where: { id: registered(actor(res)) },
        select: profileSelect,
      }),
    );
  });

  router.patch("/users/me", async (req, res) => {
    const input = body(req);
    if (
      !Object.keys(input).some((key) =>
        ["email", "username", "password"].includes(key),
      )
    )
      throw new ApiError(400, "Provide email, username or password to update");
    const updated = await updateProfile(ctx, actor(res), {
      email: input.email === undefined ? undefined : email(input.email),
      username:
        input.username === undefined ? undefined : username(input.username),
      password:
        input.password === undefined ? undefined : password(input.password),
      currentPassword:
        input.currentPassword === undefined
          ? undefined
          : currentPassword(input.currentPassword),
    });
    // A new address starts unverified; mail it a code right away.
    if (!updated.emailVerifiedAt) await sendVerificationCode(ctx, updated.id);
    res.json(updated);
  });

  router.delete("/users/me", async (req, res) => {
    const id = registered(actor(res));
    const user = await ctx.db.user.findUniqueOrThrow({ where: { id } });
    if (
      !(await verifyPassword(
        currentPassword(body(req).password),
        user.passwordHash,
      ))
    )
      throw new ApiError(401, "Incorrect password");
    await endIdentity(ctx, actor(res), true);
    res.sendStatus(204);
  });

  router.get("/users/me/stats", async (req, res) => {
    res.json(await getUserStatistics(ctx.db, registered(actor(res))));
  });

  router.put(
    "/users/me/avatar",
    raw({ type: avatarTypes, limit: avatarMaxBytes }),
    async (req, res) => {
      const type = req.is(avatarTypes);
      await setAvatar(
        ctx,
        actor(res),
        typeof type === "string" ? type : "",
        req.body,
      );
      res.sendStatus(204);
    },
  );

  router.delete("/users/me/avatar", async (req, res) => {
    await clearAvatar(ctx, actor(res));
    res.sendStatus(204);
  });

  router.get("/users/:id", async (req, res) => {
    res.json(
      await publicProfile(
        ctx,
        actor(res),
        integer(Number(req.params.id), "id", 1, 2147483647),
      ),
    );
  });

  // Moderators may look (without private details); only admins change things.
  router.use("/admin", async (req, res, next) => {
    res.locals.staff = await requireStaff(
      ctx,
      actor(res),
      req.method === "GET",
    );
    next();
  });

  const userId = (req: Request) =>
    integer(Number(req.params.id), "id", 1, 2147483647);

  router.get("/admin/users", async (req, res) => {
    const { q } = req.query;
    res.json(
      await listUsers(
        ctx,
        pagination(req),
        typeof q === "string" && q.trim() ? q.trim().slice(0, 100) : undefined,
        res.locals.staff === "ADMIN",
      ),
    );
  });

  router.get("/admin/users/:id", async (req, res) => {
    res.json(await getUser(ctx, userId(req), res.locals.staff === "ADMIN"));
  });

  const roles = ["USER", "MODERATOR", "ADMIN"] as const;
  const roleOf = (value: unknown) => {
    const role = roles.find((r) => r === value);
    if (value !== undefined && !role)
      throw new ApiError(400, "role must be USER, MODERATOR or ADMIN");
    return role;
  };

  router.post("/admin/users", async (req, res) => {
    const input = body(req);
    res.status(201).json(
      await createUser(ctx, {
        username: username(input.username),
        email: email(input.email),
        password: password(input.password),
        role: roleOf(input.role) ?? "USER",
      }),
    );
  });

  router.patch("/admin/users/:id", async (req, res) => {
    const input = body(req);
    const changes = {
      username:
        input.username === undefined ? undefined : username(input.username),
      email: input.email === undefined ? undefined : email(input.email),
      role: roleOf(input.role),
      password:
        input.password === undefined ? undefined : password(input.password),
    };
    if (Object.values(changes).every((value) => value === undefined))
      throw new ApiError(
        400,
        "Provide username, email, password or role to update",
      );
    res.json(await updateUser(ctx, userId(req), changes));
  });

  router.delete("/admin/users/:id", async (req, res) => {
    await deleteUser(ctx, actor(res), userId(req));
    res.sendStatus(204);
  });

  router.delete("/admin/users/:id/2fa", async (req, res) => {
    await resetTwoFactor(ctx, userId(req));
    res.sendStatus(204);
  });

  router.get("/admin/guests", async (req, res) => {
    res.json(await listGuests(ctx));
  });

  router.delete("/admin/guests/:id", async (req, res) => {
    await deleteGuest(ctx, uuid(req.params.id));
    res.sendStatus(204);
  });

  router.get("/friends", async (req, res) => {
    res.json(await listFriends(ctx, actor(res)));
  });

  router.post("/friends", async (req, res) => {
    res
      .status(201)
      .json(await requestFriend(ctx, actor(res), username(body(req).username)));
  });

  router.post("/friends/:id/accept", async (req, res) => {
    await acceptFriend(ctx, actor(res), uuid(req.params.id));
    res.sendStatus(204);
  });

  router.delete("/friends/:id", async (req, res) => {
    await removeFriend(ctx, actor(res), uuid(req.params.id));
    res.sendStatus(204);
  });
  return router;
}
