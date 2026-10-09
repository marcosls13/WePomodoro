import {
  Router,
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
  identity,
  integer,
  pagination,
  profileSelect,
  registered,
  text,
  transaction,
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
  signup,
  updateProfile,
  verifyPassword,
} from "../auth/auth.service.js";
import { listMessages, sendMessage } from "../chat/chat.service.js";
import {
  acceptJoin,
  askToJoin,
  dropJoinRequest,
  listJoinRequests,
  setPresence,
} from "../friends/social.service.js";
import {
  acceptFriend,
  listFriends,
  removeFriend,
  requestFriend,
} from "../friends/friends.service.js";
import {
  createRoom,
  getInvite,
  getRoom,
  joinRoom,
  leaveRoom,
  listRooms,
  manageRoom,
  removeMember,
  updateRoom,
  type RoomSettings,
} from "../rooms/rooms.service.js";
import {
  getTimer,
  startRoom,
  startSolo,
  sweepTimers,
  timerAction,
  timerView,
} from "../timers/timers.service.js";
import {
  confirmPasswordReset,
  requestPasswordReset,
  verifyResetCode,
} from "../auth/reset.service.js";
import { sendVerificationCode, verifyEmail } from "../auth/verify.service.js";
import { getUserStatistics } from "../stats/stats.service.js";
import { recordGame, type GameVerifiers } from "../games/games.service.js";
import { endIdentity } from "./lifecycle.js";

function actor(res: Response): Actor {
  return res.locals.actor as Actor;
}

function settings(input: Record<string, unknown>): RoomSettings {
  const result: RoomSettings = {};
  if (input.name !== undefined) result.name = text(input.name, "name");
  for (const key of [
    "focusSeconds",
    "shortBreakSeconds",
    "longBreakSeconds",
  ] as const)
    if (input[key] !== undefined)
      result[key] = integer(input[key], key, 1, 14400);
  if (input.cyclesBeforeLongBreak !== undefined)
    result.cyclesBeforeLongBreak = integer(
      input.cyclesBeforeLongBreak,
      "cyclesBeforeLongBreak",
      1,
      12,
    );
  return result;
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

function phase(value: unknown) {
  if (value === undefined) return "FOCUS";
  if (value !== "FOCUS" && value !== "SHORT_BREAK" && value !== "LONG_BREAK")
    throw new ApiError(400, "Invalid timer phase");
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
  verifiers: GameVerifiers = {},
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

  router.post(["/auth/signup", "/users"], async (req, res) => {
    const input = body(req);
    const created = await signup(ctx, {
      email: email(input.email),
      username: username(input.username),
      password: password(input.password),
    });
    // The account is usable immediately; verifying the address is a separate step.
    await sendVerificationCode(ctx, created.user.id);
    res.status(201).json(created);
  });

  router.post("/auth/login", async (req, res) => {
    const input = body(req);
    res.json(
      await login(ctx, username(input.username), password(input.password)),
    );
  });

  // Password recovery: email a code, verify it, then set a new password.
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

  router.post("/auth/guest", async (req, res) => {
    res
      .status(201)
      .json(
        await createGuest(ctx, text(body(req).displayName, "displayName", 32)),
      );
  });

  router.get("/health", async (req, res) => {
    await ctx.db.$queryRaw`SELECT 1`;
    res.json({ status: "ok" });
  });

  router.use(async (req, res, next) => {
    res.locals.actor = await authenticate(ctx, req);
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
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
    res.json(
      await updateProfile(ctx, actor(res), {
        email: input.email === undefined ? undefined : email(input.email),
        username:
          input.username === undefined ? undefined : username(input.username),
        password:
          input.password === undefined ? undefined : password(input.password),
        currentPassword:
          input.currentPassword === undefined
            ? undefined
            : currentPassword(input.currentPassword),
      }),
    );
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
    const id = registered(actor(res));
    await sweepTimers(ctx);
    res.json(
      await transaction(ctx, (tx) => getUserStatistics(tx, id, ctx.now())),
    );
  });

  router.get("/users/me/study-sessions", async (req, res) => {
    const id = registered(actor(res));
    await sweepTimers(ctx);
    res.json(
      await ctx.db.sessionParticipant.findMany({
        where: { userId: id },
        ...pagination(req),
        include: { session: true },
        orderBy: [{ joinedAt: "desc" }, { id: "desc" }],
      }),
    );
  });

  router.get("/users/me/game-results", async (req, res) => {
    res.json(
      await ctx.db.gameResult.findMany({
        where: { userId: registered(actor(res)) },
        ...pagination(req),
        include: { game: true },
        orderBy: [{ playedAt: "desc" }, { id: "desc" }],
      }),
    );
  });

  router.get("/rooms", async (req, res) => {
    res.json(await listRooms(ctx, actor(res)));
  });

  router.post("/rooms", async (req, res) => {
    const input = body(req);
    res.status(201).json(
      await createRoom(ctx, actor(res), {
        ...settings(input),
        name: text(input.name, "name"),
      }),
    );
  });

  router.post("/rooms/join", async (req, res) => {
    res.json(
      await joinRoom(
        ctx,
        actor(res),
        text(body(req).inviteCode, "inviteCode", 64),
      ),
    );
  });

  router.get("/rooms/:roomId", async (req, res) => {
    res.json(await getRoom(ctx, actor(res), uuid(req.params.roomId)));
  });

  router.patch("/rooms/:roomId", async (req, res) => {
    const update = settings(body(req));
    if (!Object.keys(update).length)
      throw new ApiError(400, "Provide a room setting to update");
    res.json(
      await updateRoom(ctx, actor(res), uuid(req.params.roomId), update),
    );
  });

  router.post("/rooms/:roomId/leave", async (req, res) => {
    await leaveRoom(ctx, actor(res), uuid(req.params.roomId));
    res.sendStatus(204);
  });

  router.post("/rooms/:roomId/close", async (req, res) => {
    res.json(
      await manageRoom(ctx, actor(res), uuid(req.params.roomId), "close"),
    );
  });

  router.post("/rooms/:roomId/invite-code", async (req, res) => {
    res.json(
      await getInvite(
        ctx,
        actor(res),
        uuid(req.params.roomId),
        (req.body as { rotate?: unknown } | undefined)?.rotate === true,
      ),
    );
  });

  router.post("/rooms/:roomId/owner", async (req, res) => {
    res.json(
      await manageRoom(
        ctx,
        actor(res),
        uuid(req.params.roomId),
        "transfer",
        integer(body(req).userId, "userId", 1, 2147483647),
      ),
    );
  });

  router.delete("/rooms/:roomId/members/:memberId", async (req, res) => {
    await removeMember(
      ctx,
      actor(res),
      uuid(req.params.roomId),
      uuid(req.params.memberId),
    );
    res.sendStatus(204);
  });

  router.post("/rooms/:roomId/timers", async (req, res) => {
    res
      .status(201)
      .json(await startRoom(ctx, actor(res), uuid(req.params.roomId)));
  });

  router.post("/timers", async (req, res) => {
    const input = body(req);
    const timerPhase = phase(input.phase);
    const defaults = { FOCUS: 1500, SHORT_BREAK: 300, LONG_BREAK: 900 };
    res
      .status(201)
      .json(
        await startSolo(
          ctx,
          actor(res),
          timerPhase,
          input.plannedSeconds === undefined
            ? defaults[timerPhase]
            : integer(input.plannedSeconds, "plannedSeconds", 1, 14400),
        ),
      );
  });

  router.get("/timers", async (req, res) => {
    await sweepTimers(ctx);
    const now = ctx.now();
    const sessions = await ctx.db.pomodoroSession.findMany({
      where: {
        status: { in: ["ACTIVE", "PAUSED"] },
        participants: { some: { ...identity(actor(res)), leftAt: null } },
      },
      take: 100,
      orderBy: { startedAt: "desc" },
    });
    res.json(sessions.map((session) => timerView(session, now)));
  });

  router.get("/timers/:timerId", async (req, res) => {
    res.json(await getTimer(ctx, actor(res), uuid(req.params.timerId)));
  });

  for (const action of [
    "pause",
    "resume",
    "complete",
    "cancel",
    "join",
    "leave",
  ] as const)
    router.post(`/timers/:timerId/${action}`, async (req, res) => {
      res.json(
        await timerAction(ctx, actor(res), uuid(req.params.timerId), action),
      );
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

  router.put("/presence", async (req, res) => {
    const { roomId } = body(req);
    await setPresence(
      ctx,
      actor(res),
      roomId === null || roomId === undefined ? null : uuid(roomId),
    );
    res.sendStatus(204);
  });

  router.get("/join-requests", async (req, res) => {
    res.json(await listJoinRequests(ctx, actor(res)));
  });

  router.post("/join-requests", async (req, res) => {
    const input = body(req);
    res
      .status(201)
      .json(
        await askToJoin(
          ctx,
          actor(res),
          integer(input.friendId, "friendId", 1, 2147483647),
          uuid(input.roomId),
        ),
      );
  });

  router.post("/join-requests/:id/accept", async (req, res) => {
    await acceptJoin(ctx, actor(res), uuid(req.params.id));
    res.sendStatus(204);
  });

  router.delete("/join-requests/:id", async (req, res) => {
    await dropJoinRequest(ctx, actor(res), uuid(req.params.id));
    res.sendStatus(204);
  });

  router.get("/rooms/:roomId/messages", async (req, res) => {
    const { after, limit } = req.query;
    res.json(
      await listMessages(
        ctx,
        actor(res),
        uuid(req.params.roomId),
        after === undefined
          ? undefined
          : integer(Number(after), "after", 0, 2147483647),
        limit === undefined ? 50 : integer(Number(limit), "limit", 1, 100),
      ),
    );
  });

  // Chat is capped per identity so one client cannot flood a room.
  const perSender = rateLimit({
    windowMs: 10_000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (_req, res) =>
      `chat:${actor(res).userId ?? actor(res).guestSessionId}`,
    handler: tooMany("You are sending messages too fast"),
  });

  router.post("/rooms/:roomId/messages", perSender, async (req, res) => {
    res
      .status(201)
      .json(
        await sendMessage(
          ctx,
          actor(res),
          uuid(req.params.roomId),
          text(body(req).content, "content", 2000),
        ),
      );
  });

  router.get("/games", async (req, res) => {
    res.json(
      await ctx.db.miniGame.findMany({
        where: { isEnabled: true },
        orderBy: { key: "asc" },
        take: 100,
        select: { id: true, key: true, name: true },
      }),
    );
  });

  router.post("/games/:key/results", async (req, res) => {
    res
      .status(201)
      .json(
        await recordGame(
          ctx,
          actor(res),
          text(req.params.key, "game key", 64),
          body(req),
          verifiers,
        ),
      );
  });
  return router;
}
