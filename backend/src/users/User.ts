export class User {
  username: string;
  email: string;
  age?: number;

  constructor(username: string, email: string) {
    this.username = username;
    this.email = email;
  }
}
