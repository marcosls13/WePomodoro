import express, { type Express, type Request, type Response } from "express";
import { runUsers } from "./users/users.js";
import cors from "cors";

const app: Express = express();
const port = 3000;

app.use(express.json());
app.use(cors({ origin: "http://localhost:5173" }));

app.get("/", (req: Request, res: Response) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

runUsers(app);
