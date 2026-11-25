-- Rooms are temporary: they live in the realtime (WebSocket) layer while someone
-- is in them and are never stored. Study time is the only thing kept, and it
-- already lives in "UserStat".
DROP TABLE "SessionMember";
DROP TABLE "PomodoroSession";
DROP TYPE "TimerStatus";
DROP TYPE "PomodoroPhase";

-- Audit timestamps nobody reads any more. The guest expiry check compared the
-- two columns, so it goes first (dropping the column would drop it anyway).
ALTER TABLE "GuestSession" DROP CONSTRAINT "GuestSession_expiry_check";
ALTER TABLE "GuestSession" DROP COLUMN "createdAt";
ALTER TABLE "User" DROP COLUMN "createdAt", DROP COLUMN "updatedAt";
