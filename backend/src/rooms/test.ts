import {
  createRoom,
  joinRoom,
  leaveRoom,
  getRoom,
  startRoom,
} from "./rooms.js";

const r = createRoom();
console.log(r.code, r.startedAt); // 6 chars, null
joinRoom(r.code, "sock1", { clientId: "a", name: "Ana" });
console.log(startRoom(r.code)?.startedAt); // a timestamp
leaveRoom(r.code, "sock1");
console.log(getRoom(r.code)); // undefined (room deleted)
