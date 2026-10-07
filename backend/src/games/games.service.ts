import {
  ApiError,
  registered,
  transaction,
  type Actor,
  type Context,
} from "../api/common.js";

// Actual games are not defined yet. Each implemented game registers a server-side
// verifier here; no generic endpoint accepts a client's claimed score.
export interface GameVerification {
  score: number;
  durationSeconds: number;
}
export interface GameVerifier {
  verify: (
    userId: number,
    payload: unknown,
  ) => Promise<GameVerification> | GameVerification;
}
export type GameVerifiers = Readonly<Record<string, GameVerifier>>;
export async function recordGame(
  ctx: Context,
  actor: Actor,
  key: string,
  payload: unknown,
  verifiers: GameVerifiers,
) {
  const userId = registered(actor);
  const game = await ctx.db.miniGame.findUnique({ where: { key } });
  if (!game?.isEnabled) throw new ApiError(404, "Game not available");
  const verifier = Object.hasOwn(verifiers, key) ? verifiers[key] : undefined;
  if (!verifier)
    throw new ApiError(501, "This game has no server-side result verifier yet");
  const result = await verifier.verify(userId, payload);
  if (
    !Number.isSafeInteger(result.score) ||
    result.score < -2147483648 ||
    result.score > 2147483647 ||
    !Number.isSafeInteger(result.durationSeconds) ||
    result.durationSeconds < 0 ||
    result.durationSeconds > 86400
  )
    throw new ApiError(400, "Invalid game result");
  return transaction(ctx, async (tx) => {
    const current = await tx.miniGame.findUnique({ where: { id: game.id } });
    if (!current?.isEnabled) throw new ApiError(404, "Game not available");
    return tx.gameResult.create({
      data: { userId, gameId: game.id, ...result, playedAt: ctx.now() },
    });
  });
}
