import express, { type Express, type Request, type Response } from "express";
import { usersRouter } from "./example/users/users.js";
import { roomsRouter } from "./rooms/roomsRouter.js";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { randomUUID } from "node:crypto";

const app: Express = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.json());

app.use("/api/example/users", usersRouter);
app.use("/api/rooms", roomsRouter);

app.get("/", (req: Request, res: Response) => {
  res.send("<h1>Hello world!</h1>");
});

httpServer.listen(3000, () => {
  console.log("backend listening on port 3000...");
});

io.on("connection", (socket) => {
  console.log("user connected: ", socket.id);

  socket.on("chat message", (text: string) => {
    const msg = { id: randomUUID(), text };
    io.emit("chat message", msg);
  });
  socket.on("disconnect", () => {
    console.log("user disconnected: ", socket.id);
  });
});
