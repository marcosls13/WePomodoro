import { type Express, type Request, type Response } from "express";
import { User } from "./User.js";
import { writeFileSync } from "fs";
import { readFile } from "fs/promises";

const DB_PATH = "src/example/users/users.json";

export function runUsers(app: Express) {
  app.get("/api/example/users", async (req, res) => {
    const users = await loadUsers(DB_PATH);
    res.send(users);
  });
  app.post("/api/example/users", createUser);
}

async function createUser(req: Request, res: Response) {
  const body: unknown = req.body;
  if (typeof body !== "object") {
    res.status(400).json({ error: "invalid user input" });
    return;
  }
  const { username, email } = body as Record<string, unknown>;
  if (typeof username !== "string" || typeof email !== "string") {
    res.status(400).json({ error: "invalid user input" });
    return;
  }
  const users = await loadUsers(DB_PATH);
  const newUser = new User(username, email);
  users.push(newUser);
  saveUsers(users);
  res.status(201).json();
}

export function createUsers(): User[] {
  const usernames: string[] = [
    "Marcos",
    "Ignacio",
    "Fernando",
    "Manuel",
    "Rober",
  ];
  const emails: string[] = [];

  for (const username of usernames) {
    emails.push(usernameToEmail(username));
  }

  const users: User[] = [];

  for (let i = 0; i < usernames.length; i++) {
    users.push(new User(usernames[i], emails[i]));
  }
  return users;
}

function usernameToEmail(username: string): string {
  return username.toLowerCase() + "@example.com";
}

function saveUsers(users: User[]): void {
  writeFileSync(DB_PATH, JSON.stringify(users, null, 2), "utf-8");
}

async function loadUsers(path: string): Promise<User[]> {
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw) as User[];
}
