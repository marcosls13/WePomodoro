import type { Express, Request, Response } from "express";

import { Prisma } from "../generated/prisma/client.js";
import { createUser, listUsers } from "./users.service.js";

export function runUsers(app: Express) {
  app.post("/users", async (req: Request, res: Response) => {
    const { email, username } = (req.body ?? {}) as {
      email?: unknown;
      username?: unknown;
    };

    if (
      typeof email !== "string" ||
      typeof username !== "string" ||
      !email ||
      !username
    ) {
      return res.status(400).json({ error: "email and username are required" });
    }

    try {
      const user = await createUser({ email, username });
      res.status(201).json(user);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        return res
          .status(409)
          .json({ error: "email or username already in use" });
      }
      throw e;
    }
  });

  app.get("/users", async (req: Request, res: Response) => {
    const skip = Number(req.query.skip) || 0;
    const take = Math.min(Number(req.query.take) || 20, 100);
    res.json(await listUsers(skip, take));
  });
}
