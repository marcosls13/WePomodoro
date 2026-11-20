import { type Transaction } from "../api/common.js";

export async function areFriends(tx: Transaction, a: number, b: number) {
  return Boolean(
    await tx.friendship.findFirst({
      where: {
        status: "ACCEPTED",
        OR: [
          { requesterId: a, addresseeId: b },
          { requesterId: b, addresseeId: a },
        ],
      },
    }),
  );
}
