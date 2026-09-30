import { type Express, type Request, type Response } from "express";
import { User } from "./User.js";

export function runUsers(app: Express) {
  app.get("/users/", usersMain);
}

function usersMain(req: Request, res: Response): void {
  const users: User[] = createUsers();
  res.send(users);
  console.log(users);
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
