import {
  createHash,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  ApiError,
  profileSelect,
  transaction,
  type Context,
  type Transaction,
} from "../api/common.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  SESSION_EXPIRES_AT,
  VERIFY_WINDOW_MS,
  hashPassword,
  token,
  tokenHash,
} from "./auth.service.js";
import { assertNotFortyTwoLogin, isFortyTwoLogin } from "./reserved.service.js";

const MAX_CODE_ATTEMPTS = 5;
const MAX_RESENDS = 3;
const RESEND_WINDOW_MS = 15 * 60_000;

const invalidCode = () =>
  new ApiError(400, "Invalid or expired code; request a new one");
const gone = () =>
  new ApiError(400, "This signup has expired; please sign up again");

type Provider = "GOOGLE" | "GITHUB" | "FORTY_TWO";
type Identity =
  { passwordHash: string } | { provider: Provider; providerUserId: string };

function codeHash(id: string, code: string) {
  return createHash("sha256").update(`pending:${id}:${code}`).digest("hex");
}

export function candidate(login: string, attempt: number) {
  const name = login
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .slice(0, 32)
    .padEnd(3, "_");
  return attempt === 0
    ? name
    : `${name.slice(0, 27)}_${randomInt(0, 65536).toString(16).padStart(4, "0")}`;
}

async function mailCode(ctx: Context, to: string, code: string) {
  try {
    await ctx.mailer.send(
      to,
      "Verify your WePomodoro email",
      `Your verification code is ${code}. It expires in 10 minutes.\n` +
        "If you didn't create an account, you can ignore this email.",
    );
  } catch (error) {
    console.error("Could not send verification email", error);
  }
}

export async function startSignup(
  ctx: Context,
  input: { email: string; username: string; password: string },
) {
  await assertNotFortyTwoLogin(ctx, input.username);
  return createPending(ctx, {
    email: input.email,
    username: input.username,
    passwordHash: await hashPassword(input.password),
  });
}

export async function createPending(
  ctx: Context,
  input: { email: string; username: string } & Identity,
) {
  const id = randomUUID();
  const bearer = token();
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const now = ctx.now();
  const expiresAt = new Date(now.getTime() + VERIFY_WINDOW_MS);
  await transaction(ctx, async (tx) => {
    if (await tx.user.findUnique({ where: { email: input.email } }))
      throw new ApiError(409, "That email is already registered");
    // Password signups find out about a taken name now, not after the code.
    if (
      "passwordHash" in input &&
      (await tx.user.findUnique({ where: { username: input.username } }))
    )
      throw new ApiError(409, "That username is taken");
    // One pending signup per email: a new attempt replaces the old one, so a
    // squatter never blocks the address's real owner.
    await tx.pendingSignup.deleteMany({ where: { email: input.email } });
    await tx.pendingSignup.create({
      data: {
        id,
        tokenHash: tokenHash(bearer),
        email: input.email,
        username: input.username,
        passwordHash: "passwordHash" in input ? input.passwordHash : null,
        provider: "provider" in input ? input.provider : null,
        providerUserId: "provider" in input ? input.providerUserId : null,
        codeHash: codeHash(id, code),
        resendWindowAt: now,
        expiresAt,
      },
    });
  });
  await mailCode(ctx, input.email, code);
  return { pendingToken: bearer, expiresAt };
}

export async function resendPending(ctx: Context, pendingToken: string) {
  const now = ctx.now();
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const to = await transaction(ctx, async (tx) => {
    const row = await tx.pendingSignup.findUnique({
      where: { tokenHash: tokenHash(pendingToken) },
    });
    if (!row || row.expiresAt <= now) throw gone();
    const fresh =
      now.getTime() - row.resendWindowAt.getTime() > RESEND_WINDOW_MS;
    if (!fresh && row.resends >= MAX_RESENDS)
      throw new ApiError(429, "Too many codes requested; try again later");
    await tx.pendingSignup.update({
      where: { id: row.id },
      data: {
        codeHash: codeHash(row.id, code),
        failedAttempts: 0,
        resends: fresh ? 1 : row.resends + 1,
        resendWindowAt: fresh ? now : row.resendWindowAt,
      },
    });
    return row.email;
  });
  await mailCode(ctx, to, code);
}

// Always succeeds, so it reveals nothing about whether the token was valid.
export async function cancelPending(ctx: Context, pendingToken: string) {
  await ctx.db.pendingSignup.deleteMany({
    where: { tokenHash: tokenHash(pendingToken) },
  });
}

export async function completePending(
  ctx: Context,
  pendingToken: string,
  code: string,
) {
  const hash = tokenHash(pendingToken);
  const peek = await ctx.db.pendingSignup.findUnique({
    where: { tokenHash: hash },
  });
  if (!peek) throw invalidCode();
  // Google and GitHub users can't take a name that is a real 42 login.
  const skipPlain =
    peek.provider !== null &&
    peek.provider !== "FORTY_TWO" &&
    (await isFortyTwoLogin(ctx, candidate(peek.username, 0)));
  for (let attempt = 0; ; attempt++) {
    try {
      const done = await transaction(ctx, (tx) =>
        finish(ctx, tx, hash, code, attempt + (skipPlain ? 1 : 0)),
      );
      if (!done) throw invalidCode(); // wrong code: the counter was committed
      return done;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        // A provider login clash gets a new random suffix; a password signup
        // lost the race for its name or email.
        if (peek.provider && attempt < 4) continue;
        throw new ApiError(409, "That name was just taken; sign up again");
      }
      throw error;
    }
  }
}

async function finish(
  ctx: Context,
  tx: Transaction,
  hash: string,
  code: string,
  attempt: number,
) {
  const now = ctx.now();
  const row = await tx.pendingSignup.findUnique({ where: { tokenHash: hash } });
  if (!row || row.expiresAt <= now) throw invalidCode();
  const expected = Buffer.from(row.codeHash, "hex");
  const actual = Buffer.from(codeHash(row.id, code), "hex");
  if (!timingSafeEqual(expected, actual)) {
    if (row.failedAttempts + 1 >= MAX_CODE_ATTEMPTS)
      await tx.pendingSignup.delete({ where: { id: row.id } });
    else
      await tx.pendingSignup.update({
        where: { id: row.id },
        data: { failedAttempts: { increment: 1 } },
      });
    return null;
  }
  const username = row.provider
    ? candidate(row.username, attempt)
    : row.username;
  if (await tx.user.findUnique({ where: { email: row.email } }))
    throw new ApiError(409, "That email is already registered");
  if (!row.provider && (await tx.user.findUnique({ where: { username } })))
    throw new ApiError(409, "That name was just taken; sign up again");
  const user = await tx.user.create({
    data: {
      email: row.email,
      username,
      passwordHash: row.passwordHash,
      emailVerifiedAt: now,
      ...(row.provider &&
        row.providerUserId && {
          oAuthAccounts: {
            create: {
              provider: row.provider,
              providerUserId: row.providerUserId,
            },
          },
        }),
    },
    select: profileSelect,
  });
  await tx.pendingSignup.delete({ where: { id: row.id } });
  const bearer = token();
  const expiresAt = new Date(now.getTime() + SESSION_EXPIRES_AT);
  await tx.authSession.create({
    data: {
      userId: user.id,
      tokenHash: tokenHash(bearer),
      createdAt: now,
      expiresAt,
    },
  });
  return { token: bearer, expiresAt, user };
}
