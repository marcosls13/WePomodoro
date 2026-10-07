import { Router, type Response } from "express";
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
import {
  createRoom,
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

export function createRouter(ctx: Context, verifiers: GameVerifiers = {}) {
  const router = Router();
  // Bound local rate limit for token issuance; deployment proxies can add a shared limit.
  const attempts = new Map<string, { count: number; resetAt: number }>();

  router.use(
    ["/auth/signup", "/auth/login", "/auth/guest", "/users"],
    (req, res, next) => {
      if (req.method !== "POST") {
        next();
        return;
      }
      const now = Date.now();
      if (attempts.size > 10000)
        for (const [key, entry] of attempts)
          if (entry.resetAt <= now) attempts.delete(key);
      const key = req.ip ?? "unknown";
      let entry = attempts.get(key);
      if (!entry || entry.resetAt <= now) {
        entry = { count: 0, resetAt: now + 60000 };
        attempts.set(key, entry);
      }
      entry.count++;
      if (entry.count > 60 || attempts.size > 10000) {
        res.setHeader("Retry-After", "60");
        next(
          new ApiError(
            429,
            "Too many authentication attempts; try again shortly",
          ),
        );
        return;
      }
      next();
    },
  );

  router.post(["/auth/signup", "/users"], async (req, res) => {
    const input = body(req);
    res.status(201).json(
      await signup(ctx, {
        email: email(input.email),
        username: username(input.username),
        password: password(input.password),
      }),
    );
  });

  router.post("/auth/login", async (req, res) => {
    const input = body(req);
    res.json(
      await login(ctx, username(input.username), password(input.password)),
    );
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
      await manageRoom(ctx, actor(res), uuid(req.params.roomId), "rotate"),
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
