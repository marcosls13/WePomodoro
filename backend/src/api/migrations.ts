import { existsSync, readdirSync } from "node:fs";
import type { PrismaClient } from "../generated/prisma/client.js";

const dir = "prisma/migrations";

/** True when the database lacks a migration committed in the repo (or one failed). */
export async function migrationsPending(db: PrismaClient) {
  // Not shipped (e.g. a trimmed image): nothing to compare against.
  if (!existsSync(dir)) return false;
  const rows = await db.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  const applied = new Set(rows.map((row) => row.migration_name));
  return readdirSync(dir, { withFileTypes: true }).some(
    (entry) => entry.isDirectory() && !applied.has(entry.name),
  );
}
