import { type Express, type Request, type Response } from "express";
import { User } from "./User.js";
import { writeFileSync } from "fs";
import { readFile } from "fs/promises";

const DB_PATH = "src/users/users.json"

export function runUsers(app: Express) {
  app.get("/users/", usersMain);
}

async function usersMain(req: Request, res: Response): Promise<void> {
  const users = await loadUsers(DB_PATH);
  res.send(users);
  console.log(users);
  saveUsers(users);
}

function createUsers(): User[] {
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
