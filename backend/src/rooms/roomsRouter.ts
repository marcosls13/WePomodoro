import { Router, type Request, type Response } from "express";
import { createRoom, getRoom } from "./rooms.js";

export const roomsRouter = Router();

roomsRouter.get("/:code", getRoomHandler);
roomsRouter.post("/", createRoomHandler);

function createRoomHandler(req: Request, res: Response) {
  const room = createRoom();
  res.status(201).json({ code: room.code });
}

function getRoomHandler(req: Request, res: Response) {
  const { code } = req.params;
  if (typeof code !== "string") {
    res.status(400).json({ error: "invalid room code" });
    return;
  }
  const room = getRoom(code);
  if (!room) {
    res.status(404).json({ error: "room not found" });
    return;
  }
  res.status(200).json({ code: room.code });
}
