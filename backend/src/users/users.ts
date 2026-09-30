import express, { type Express, type Request, type Response } from 'express';
import { User } from './User.js';

export function runUsers(app: Express) {
  app.get('/users/', usersMain);
}


function usersMain(req: Request, res: Response): void {
  const users: Array<User> = createUsers();
  res.send(users);
  console.log(users);
}

function createUsers(): Array<User> {
  const usernames: Array<string> = ["Marcos", "Ignacio", "Fernando", "Manuel", "Rober"];
  let emails: Array<string> = [];

  for (const username of usernames) {
    emails.push(usernameToEmail(username));
  }

  let users: Array<User> = [];

  for (let i = 0; i < usernames.length; i++) {
    users.push(new User(usernames[i], emails[i]));
  }
  return users;
}

function usernameToEmail(username: string): string {
  return username.toLowerCase() + "@example.com";
}
