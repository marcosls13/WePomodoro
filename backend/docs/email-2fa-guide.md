# What is left to do: email-code 2FA, then hard delete of a server

Everything is written and verified: backend, frontend, tests and
`docs/backend.md`. `npm test` passes 77 of 77 against a local Postgres; ESLint,
`tsc` (also with `noUnusedLocals`), Prettier and the frontend build are clean in
both projects. What is left is a manual run and the deploy.

## 1. Manual run

- [ ] Start the backend and frontend (with no `SMTP_USER` the emailed code is
      printed in the backend log): sign up → turn on (password → code →
      confirm) → sign out → sign in with the emailed code → "Resend code" →
      turn off. Also try a wrong code, and an expired one (5 minutes).

## 2. Before deploying

- [ ] Your local `.env`: remove `TWO_FACTOR_KEY` (it is no longer read).
- [ ] Hosted DB: `npx prisma migrate status --config prisma7.config.ts`, then
      `npm run db:deploy` if `email_2fa` is pending (it copies the flag, then
      drops `TwoFactor` and `RecoveryCode`; tested locally). Deploy backend and
      frontend together: the old code can't run against the migrated DB, and
      the old frontend can't sign in 2FA users.
- [ ] Production needs a real mailer (`SMTP_USER`, `SMTP_PASSWORD` in
      `.env.example`): every 2FA sign-in now depends on email delivery.
- [ ] Optional: a CHECK on `LoginChallenge.codeHash`
      (`length(btrim("codeHash")) > 0`) in a new migration.
- [ ] Commit (ask first). The migration folder
      `prisma/migrations/20261015080914_email_2fa/` is untracked and must be
      included. Delete this guide first (it is a working note) or leave it out.

## 3. Hard delete of a server (new feature)

Today `POST /rooms/:roomId/close` only sets `closedAt` (the room disappears from
the owner's list and rejects joins, updates and new timers). Goal: the owner can
also **permanently delete** the server (subject: "delete organizations"). Close
stays as it is. No migration is needed: the foreign keys already do the work
(checked in the migrations): `RoomMember`, `Invite`, `RoomBan`, `JoinRequest`
and `Message` are `ON DELETE CASCADE`, and `PomodoroSession.roomId` and
`Presence.roomId` are `ON DELETE SET NULL`. Account deletion already deletes
owned rooms this way (`src/api/lifecycle.ts`), so the new code mirrors it.

Decisions (the guide assumes these):

- Route: `DELETE /api/rooms/:roomId` → `204`, **owner only** (`403` for a member,
  a guest, or anyone else; `404` if it doesn't exist or is already deleted).
- Allowed whether the room is open or closed.
- **Study history is kept.** Past timers lose their room (`roomId` becomes null)
  but their attendance rows stay, so every member keeps their study totals, same
  as when an owner deletes their account. The live timer must be settled first
  or it would survive as a live "solo" timer with no room.
- Unrecoverable: chat messages, invites, bans and memberships of that server go
  with it. The frontend must ask for confirmation.

### Files to change

- [ ] **`src/rooms/rooms.service.ts`**: new `deleteRoom(ctx, actor, roomId)`, next to
      `manageRoom` (which has the owner check and the close). `cancelRoomTimer`
      and `lockRoom` are already imported there. Order matters: lock the room
      (it also gives the `404`), check `room.ownerId === actor.userId` (else
      `403`), `cancelRoomTimer(tx, roomId, ctx.now())`, then
      `tx.studyRoom.delete(...)`, all in one `transaction`. It returns nothing.
      I compiled this version in a scratch copy (`tsc` and ESLint clean, not run
      against a database):

```ts
/** Permanently removes a room. Closing keeps it; this is the owner's hard delete. */
export async function deleteRoom(ctx: Context, actor: Actor, roomId: string) {
  await transaction(ctx, async (tx) => {
    const room = await lockRoom(tx, roomId);
    if (room.ownerId !== actor.userId)
      throw new ApiError(403, "Only the owner can delete the room");
    // Credit the live timer first, so members keep their partial study time.
    await cancelRoomTimer(tx, roomId, ctx.now());
    await tx.studyRoom.delete({ where: { id: roomId } });
  });
}
```

- [ ] **`src/api/router.ts`**: add `deleteRoom` to the import from
      `../rooms/rooms.service.js` (~line 72, next to `manageRoom`), and the route
      next to `/rooms/:roomId/close` (~line 701):

```ts
router.delete("/rooms/:roomId", async (req, res) => {
  await deleteRoom(ctx, actor(res), uuid(req.params.roomId));
  res.sendStatus(204);
});
```

- [ ] **`src/dev.ts`** (~line 110): a preset after "Close room":
      `["Rooms", "Delete room", "DELETE", "/rooms/{roomId}", null],`.
- [ ] **Comments that now lie** (no behaviour change, no migration): the comment on
      `StudyRoom.closedAt` in `prisma/schema.prisma` (~172: "Close rooms instead
      of deleting them to preserve study history") and the one in
      `endIdentity` in `src/api/lifecycle.ts` (~21: "Delete rooms only on
      explicit account deletion. Closing a room alone keeps it"). Say that the
      owner can also delete, and that history survives either way.
- [ ] **Optional dedupe**: `endIdentity` does the same lock, `cancelRoomTimer`,
      `delete` per room. You may extract that into one helper used by both, but
      it is three lines; leaving it duplicated is fine.
- [ ] **`test/api.test.ts`**, next to "closing a room cancels its timer and keeps
      partial study time" (~line 944). Reuse the `user()`, `room()`, `shared()`,
      `advance()` helpers. One test (or two) covering:
  - owner deletes an open room → `204`; then `GET /api/rooms/:id` → `404`,
    `GET /api/rooms` no longer lists it, joining with the old invite code fails,
    and `db.roomMember` / `db.invite` / `db.message` counts for that room are 0;
  - a live shared timer: start it, `advance(3)`, delete → the timer is
    `CANCELLED` (still readable by its participant) and `/api/users/me/stats`
    still shows 3 focused seconds (mirror the close test);
  - a member who isn't the owner → `403` and the room still exists; an unknown
    id → `404`; a guest → `403`; deleting twice → second is `404`;
  - a closed room can be deleted (close it, then delete → `204`).
- [ ] **`docs/backend.md`**: add the row to the rooms endpoint table (~line 370):
      `DELETE /api/rooms/:roomId` | Owner | None | `204`: permanently deletes the
      server, its chat and invites; members keep their study history. Update
      "Owners must transfer ownership or close the room before leaving" (~404) to
      "...close or delete...", the "Delete StudyRoom" row of the deletion table
      (~933: it says "Prefer close; account deletion physically removes owned
      rooms") to mention the owner's `DELETE`, and add `DELETE /api/rooms/:roomId`
      wherever the docs list what the owner can do.
- [ ] **Frontend**: nothing to change yet because there is no servers UI. When
      you build it, the owner-only "Delete server" button needs a confirmation
      that names the server (it is irreversible); close stays the reversible-looking
      "archive" action.
- [ ] **README "Modules"**: in the organization-system justification say that
      create/edit = `POST`/`PATCH /rooms`, close and delete = `POST /rooms/:id/close`
      and `DELETE /rooms/:id`, add/remove users = invites, join requests, kick and
      ban.

### Checks

- [ ] `npm run lint`, `npm run format:check`, `npm run test:types`, `npm test`
      (`npm run test:db:up` first).
- [ ] The existing admin test that deletes a user and asserts their room is gone
      (`db.studyRoom.count`) must still pass: that path doesn't change.
