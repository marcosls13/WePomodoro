import type { Request } from "express";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Actor {
  userId: number | null;
  guestSessionId: string | null;
  authSessionId?: string;
}

export interface Context {
  db: PrismaClient;
  now: () => Date;
}

export type Transaction = Prisma.TransactionClient;
export function identity(actor: Actor) {
  return { userId: actor.userId, guestSessionId: actor.guestSessionId };
}

export function registered(actor: Actor): number {
  if (actor.userId === null)
    throw new ApiError(403, "A registered account is required");
  return actor.userId;
}

export function body(req: Request): Record<string, unknown> {
  const value: unknown = req.body;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ApiError(400, "A JSON object is required");
  return value as Record<string, unknown>;
}

export function text(value: unknown, name: string, max = 80): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new ApiError(
      400,
      `${name} is required and must be at most ${max} characters`,
    );
  return value.trim();
}

export function integer(
  value: unknown,
  name: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    throw new ApiError(
      400,
      `${name} must be an integer between ${min} and ${max}`,
    );
  return value;
}

export function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new ApiError(400, "A valid UUID is required");
  return value;
}

export function pagination(req: Request) {
  const parse = (
    v: unknown,
    fallback: number,
    min: number,
    max: number,
    name: string,
  ) => {
    if (v === undefined) return fallback;
    if (typeof v !== "string" || !/^\d+$/.test(v))
      throw new ApiError(400, `Invalid ${name}`);
    return integer(Number(v), name, min, max);
  };
  return {
    skip: parse(req.query.skip, 0, 0, 1000000, "skip"),
    take: parse(req.query.take, 20, 1, 100, "take"),
  };
}

export async function transaction<T>(
  ctx: Context,
  action: (tx: Transaction) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await ctx.db.$transaction(action, {
        isolationLevel: "Serializable",
        timeout: 15000,
      });
    } catch (error) {
      if (
        attempt < 3 &&
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2034"
      )
        continue;
      throw error;
    }
  }
}

export const profileSelect = {
  id: true,
  username: true,
  email: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function email(value: unknown) {
  const result = text(value, "email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))
    throw new ApiError(400, "A valid email is required");
  return result;
}

export function username(value: unknown) {
  const result = text(value, "username", 32);
  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(result))
    throw new ApiError(
      400,
      "Username must have 3–32 letters, numbers, underscores or hyphens",
    );
  return result.toLowerCase();
}
