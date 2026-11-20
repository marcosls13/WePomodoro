import {
  ApiError,
  registered,
  transaction,
  type Actor,
  type Context,
} from "../api/common.js";

const person = { select: { id: true, username: true } } as const;

export async function listFriends(ctx: Context, actor: Actor) {
  const me = registered(actor);
  const rows = await ctx.db.friendship.findMany({
    where: { OR: [{ requesterId: me }, { addresseeId: me }] },
    include: { requester: person, addressee: person },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  // Friends see which shared (coded) session someone is in; solo timers are
  // private. "Online" comes from the WebSocket layer, not from the database.
  const friendIds = rows
    .filter((r) => r.status === "ACCEPTED")
    .map((r) => (r.requesterId === me ? r.addresseeId : r.requesterId));
  const memberships = await ctx.db.sessionMember.findMany({
    where: {
      userId: { in: [...friendIds, me] },
      session: { code: { not: null } },
    },
    include: { session: { select: { id: true, name: true } } },
    orderBy: { joinedAt: "desc" },
  });
  const mine = new Set(
    memberships.filter((m) => m.userId === me).map((m) => m.sessionId),
  );
  const presenceOf = (userId: number) => {
    const s = memberships.find((m) => m.userId === userId)?.session;
    return { session: s && { id: s.id, name: s.name, joined: mine.has(s.id) } };
  };
  const view = (row: (typeof rows)[number]) => {
    const user = row.requesterId === me ? row.addressee : row.requester;
    return {
      id: row.id,
      user,
      createdAt: row.createdAt,
      ...(row.status === "ACCEPTED" ? { presence: presenceOf(user.id) } : {}),
    };
  };
  return {
    friends: rows.filter((r) => r.status === "ACCEPTED").map(view),
    incoming: rows
      .filter((r) => r.status === "PENDING" && r.addresseeId === me)
      .map(view),
    outgoing: rows
      .filter((r) => r.status === "PENDING" && r.requesterId === me)
      .map(view),
  };
}

/** Sends a request, or accepts the other person's pending one to you. */
export async function requestFriend(
  ctx: Context,
  actor: Actor,
  username: string,
) {
  const me = registered(actor);
  return transaction(ctx, async (tx) => {
    const other = await tx.user.findUnique({ where: { username } });
    if (!other) throw new ApiError(404, "User not found");
    if (other.id === me)
      throw new ApiError(400, "You cannot befriend yourself");
    const existing = await tx.friendship.findFirst({
      where: {
        OR: [
          { requesterId: me, addresseeId: other.id },
          { requesterId: other.id, addresseeId: me },
        ],
      },
    });
    if (!existing)
      return tx.friendship.create({
        data: { requesterId: me, addresseeId: other.id, createdAt: ctx.now() },
      });
    if (existing.status === "ACCEPTED")
      throw new ApiError(409, "You are already friends");
    if (existing.requesterId === me)
      throw new ApiError(409, "Request already sent");
    return tx.friendship.update({
      where: { id: existing.id },
      data: { status: "ACCEPTED" },
    });
  });
}

export async function acceptFriend(ctx: Context, actor: Actor, id: string) {
  const me = registered(actor);
  const result = await ctx.db.friendship.updateMany({
    where: { id, addresseeId: me, status: "PENDING" },
    data: { status: "ACCEPTED" },
  });
  if (!result.count) throw new ApiError(404, "Friend request not found");
}

/** Declines, cancels or removes: either side may delete the row. */
export async function removeFriend(ctx: Context, actor: Actor, id: string) {
  const me = registered(actor);
  const result = await ctx.db.friendship.deleteMany({
    where: { id, OR: [{ requesterId: me }, { addresseeId: me }] },
  });
  if (!result.count) throw new ApiError(404, "Friendship not found");
}
