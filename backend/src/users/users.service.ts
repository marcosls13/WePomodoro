import { prisma } from "../prisma.js";

export interface CreateUserInput {
  email: string;
  username: string;
}

export function createUser(data: CreateUserInput) {
  return prisma.user.create({ data });
}

export function listUsers(skip = 0, take = 20) {
  return prisma.user.findMany({
    skip,
    take,
    orderBy: { createdAt: "desc" },
  });
}
