import express, { type Express, type Request, type Response } from "express";

import { usersRouter } from "./example/users/users.js";

const app: Express = express();
const port = 3000;

app.use(express.json());

app.use("/api/example/users", usersRouter);

app.get("/", (req: Request, res: Response) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
