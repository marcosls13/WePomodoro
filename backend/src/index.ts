import express, { type Express, type Request, type Response } from "express";
import { usersRouter } from "./example/users/users.js";
import { roomsRouter } from "./rooms/roomsRouter.js";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { registerSocketHandlers } from "./sockets/registerSocketHandlers.js";

const app: Express = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.json());

app.use("/api/example/users", usersRouter);
app.use("/api/rooms", roomsRouter);

app.get("/", (req: Request, res: Response) => {
  res.send("<h1>Hello world!</h1>");
});

registerSocketHandlers(io);

httpServer.listen(3000, () => {
  console.log("backend listening on port 3000...");
});
