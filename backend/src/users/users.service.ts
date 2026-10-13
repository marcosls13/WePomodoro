import {
  ApiError,
  registered,
  type Actor,
  type Context,
} from "../api/common.js";
import { getUserStatistics } from "../stats/stats.service.js";

export const avatarTypes = ["image/png", "image/jpeg", "image/webp"];
export const avatarMaxBytes = 512 * 1024;

// Anyone can name a type, so check the file really is that format. SVG is not
// accepted: it can carry scripts.
function matches(type: string, b: Buffer) {
  const at = (offset: number, text: string) =>
    b.subarray(offset, offset + text.length).toString("latin1") === text;
  if (type === "image/png") return at(0, "\x89PNG\r\n\x1a\n");
  if (type === "image/jpeg") return at(0, "\xff\xd8\xff");
  return at(0, "RIFF") && at(8, "WEBP");
}

export async function setAvatar(
  ctx: Context,
  actor: Actor,
  type: string,
  data: unknown,
) {
  const userId = registered(actor);
  if (!Buffer.isBuffer(data) || !data.length)
    throw new ApiError(415, "Send the image as the body: PNG, JPEG or WebP");
  if (!matches(type, data))
    throw new ApiError(400, "The file is not a valid " + type);
  const row = { contentType: type, data: new Uint8Array(data) };
  await ctx.db.userAvatar.upsert({
    where: { userId },
    create: { userId, ...row },
    update: row,
  });
}

export async function clearAvatar(ctx: Context, actor: Actor) {
  await ctx.db.userAvatar.deleteMany({ where: { userId: registered(actor) } });
}

export function getAvatar(ctx: Context, userId: number) {
  return ctx.db.userAvatar.findUnique({ where: { userId } });
}

/** What any signed-in identity may see about a registered user. */
export async function publicProfile(ctx: Context, actor: Actor, id: number) {
  const user = await ctx.db.user.findUnique({
    where: { id },
    select: { id: true, username: true, createdAt: true },
  });
  if (!user) throw new ApiError(404, "User not found");
  const stats = await getUserStatistics(ctx.db, id, ctx.now());
  const me = actor.userId;
  const row =
    me === null || me === id
      ? null
      : await ctx.db.friendship.findFirst({
          where: {
            OR: [
              { requesterId: me, addresseeId: id },
              { requesterId: id, addresseeId: me },
            ],
          },
        });
  return {
    ...user,
    focusedSeconds: stats?.focusedSeconds ?? 0,
    completedFocusSessions: stats?.completedFocusSessions ?? 0,
    friendship: row && {
      id: row.id,
      status: row.status,
      direction: row.requesterId === me ? "outgoing" : "incoming",
    },
  };
}
