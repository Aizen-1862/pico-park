const express = require("express");
const http = require("http");
const crypto = require("crypto");
const { WebSocketServer, WebSocket } = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 3000;
app.use(express.static("public"));
app.get("/health", (_req, res) => res.json({ ok: true, game: "Pico Park-inspired co-op" }));

const rooms = new Map();
const COLORS = ["#ff6b6b", "#55c7ff", "#ffd166", "#8ce99a", "#c99bff", "#ff9fce", "#a8e6cf", "#ffb86b"];

function code() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}
function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function roomState(room) {
  return {
    type: "state",
    room: room.code,
    keyTaken: room.keyTaken,
    won: room.won,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, color: p.color, x: p.x, y: p.y,
      facing: p.facing, ready: p.ready
    }))
  };
}
function broadcast(room) {
  const state = roomState(room);
  for (const p of room.players.values()) send(p.ws, state);
}
function leave(ws) {
  const room = rooms.get(ws.roomCode);
  if (!room) return;
  room.players.delete(ws.playerId);
  if (!room.players.size) rooms.delete(room.code);
  else broadcast(room);
  ws.roomCode = null;
}

wss.on("connection", ws => {
  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === "create" || msg.type === "join") {
      leave(ws);
      let room;
      if (msg.type === "create") {
        let id = code();
        while (rooms.has(id)) id = code();
        room = { code: id, players: new Map(), keyTaken: false, won: false };
        rooms.set(id, room);
      } else {
        room = rooms.get(String(msg.code || "").trim().toUpperCase());
        if (!room) return send(ws, { type: "error", message: "Room not found. Check the code and try again." });
        if (room.players.size >= 8) return send(ws, { type: "error", message: "This room is full (8 players max)." });
      }
      const id = crypto.randomUUID();
      const index = room.players.size;
      const player = {
        id, ws, name: String(msg.name || "Player").slice(0, 14),
        color: COLORS[index % COLORS.length], x: 70 + index * 42, y: 360,
        facing: 1, ready: false
      };
      room.players.set(id, player);
      ws.roomCode = room.code;
      ws.playerId = id;
      send(ws, { type: "joined", id, room: room.code, color: player.color });
      broadcast(room);
      return;
    }

    const room = rooms.get(ws.roomCode);
    const player = room && room.players.get(ws.playerId);
    if (!room || !player) return;

    if (msg.type === "move") {
      player.x = Math.max(8, Math.min(940, Number(msg.x) || player.x));
      player.y = Math.max(-100, Math.min(560, Number(msg.y) || player.y));
      player.facing = msg.facing === -1 ? -1 : 1;
      // The key is shared: any teammate can collect it.
      if (!room.keyTaken && Math.hypot(player.x - 490, player.y - 340) < 48) room.keyTaken = true;
      // Everyone must reach the unlocked exit together.
      if (room.keyTaken && [...room.players.values()].every(p => p.x > 850 && p.y > 250)) room.won = true;
      broadcast(room);
    } else if (msg.type === "ready") {
      player.ready = !!msg.ready;
      broadcast(room);
    } else if (msg.type === "restart") {
      room.keyTaken = false;
      room.won = false;
      let i = 0;
      for (const p of room.players.values()) {
        p.x = 70 + i++ * 42;
        p.y = 360;
      }
      broadcast(room);
    }
  });
  ws.on("close", () => leave(ws));
});

server.listen(PORT, () => console.log("Co-op game server listening on " + PORT));