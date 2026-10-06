import express, { type Express, type Request, type Response } from "express";
import { runUsers } from "./users/users.js";
import cors from "cors";

const app: Express = express();
const port = 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req: Request, res: Response) => {
  res.send("Hello World!");
});

runUsers(app);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

