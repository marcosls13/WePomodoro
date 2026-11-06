import { ApiError, type Context } from "../api/common.js";

const known = new Map<string, { reserved: boolean; until: number }>();
const TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 5000;

export async function isFortyTwoLogin(ctx: Context, login: string) {
  const lookup = ctx.oauth.get("42")?.loginExists;
  if (!lookup) return false;
  const hit = known.get(login);
  if (hit && hit.until > Date.now()) return hit.reserved;
  try {
    const reserved = await lookup(login);
    if (known.size >= MAX_ENTRIES) known.clear();
    known.set(login, { reserved, until: Date.now() + TTL_MS });
    return reserved;
  } catch (error) {
    console.error("42 login lookup failed", error);
    return false;
  }
}

export async function assertNotFortyTwoLogin(ctx: Context, login: string) {
  if (await isFortyTwoLogin(ctx, login))
    throw new ApiError(
      409,
      "That name belongs to a 42 account; sign in with 42 instead",
    );
}
