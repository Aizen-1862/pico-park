const express = require("express");
const http = require("http");
const crypto = require("crypto");
const { WebSocketServer, WebSocket } = require("ws");
const LEVELS = require("./public/levels.js");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 3000;
app.use(express.static("public"));
app.get("/health", (_req, res) => res.json({ ok: true, game: "CATNAP 20-stage co-op campaign", stages: LEVELS.length }));

const rooms = new Map();
const COLORS = ["#ff6b6b", "#55c7ff", "#ffd166", "#8ce99a", "#c99bff", "#ff9fce", "#a8e6cf", "#ffb86b"];
function code() { return crypto.randomBytes(3).toString("hex").toUpperCase(); }
function send(ws, data) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); }
function requiredFor(room) { return Math.min(4, Math.max(1, Math.ceil(room.players.size / 2))); }
function activeSwitches(room) {
  const stage = LEVELS[room.stageIndex];
  const usedPlayers = new Set();
  return stage.switches.map((sw, index) => {
    const player = [...room.players.values()].find(p =>
      !usedPlayers.has(p.id) && Math.hypot((p.x + 13.5) - sw.x, (p.y + 14.5) - sw.y) < 39
    );
    if (player) usedPlayers.add(player.id);
    return Boolean(player);
  });
}
function roomState(room) {
  const stage = LEVELS[room.stageIndex];
  const switches = activeSwitches(room);
  return {
    type: "state", room: room.code, stage: room.stageIndex + 1,
    totalStages: LEVELS.length, stageName: stage.name, hint: stage.hint,
    keyTaken: room.keyTaken, switches, requiredSwitches: requiredFor(room),
    stageClear: room.stageClear, won: room.won,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, color: p.color, x: p.x, y: p.y, facing: p.facing
    }))
  };
}
function broadcast(room) { const state = roomState(room); for (const p of room.players.values()) send(p.ws, state); }
function resetStage(room) {
  room.keyTaken = false; room.stageClear = false;
  let i = 0;
  for (const p of room.players.values()) { p.x = 48 + i++ * 38; p.y = 460; p.facing = 1; }
}
function leave(ws) {
  const room = rooms.get(ws.roomCode);
  if (!room) return;
  room.players.delete(ws.playerId);
  if (!room.players.size) rooms.delete(room.code);
  else broadcast(room);
  ws.roomCode = null; ws.playerId = null;
}

wss.on("connection", ws => {
  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === "create" || msg.type === "join") {
      leave(ws);
      let room;
      if (msg.type === "create") {
        let id = code(); while (rooms.has(id)) id = code();
        room = { code: id, players: new Map(), stageIndex: 0, keyTaken: false, stageClear: false, won: false };
        rooms.set(id, room);
      } else {
        room = rooms.get(String(msg.code || "").trim().toUpperCase());
        if (!room) return send(ws, { type: "error", message: "Room not found. Check the code and try again." });
        if (room.players.size >= 8) return send(ws, { type: "error", message: "This room is full (8 players max)." });
        if (room.stageClear || room.won) return send(ws, { type: "error", message: "This room is between stages. Try again in a moment." });
      }
      const id = crypto.randomUUID(), index = room.players.size;
      const player = { id, ws, name: String(msg.name || "Player").slice(0, 14), color: COLORS[index % COLORS.length], x: 48 + index * 38, y: 460, facing: 1 };
      room.players.set(id, player); ws.roomCode = room.code; ws.playerId = id;
      send(ws, { type: "joined", id, room: room.code, color: player.color });
      broadcast(room); return;
    }

    const room = rooms.get(ws.roomCode), player = room && room.players.get(ws.playerId);
    if (!room || !player) return;
    if (msg.type === "move" && !room.stageClear && !room.won) {
      player.x = Math.max(0, Math.min(933, Number(msg.x) || player.x));
      player.y = Math.max(-80, Math.min(520, Number(msg.y) || player.y));
      player.facing = msg.facing === -1 ? -1 : 1;
      const stage = LEVELS[room.stageIndex];
      if (!room.keyTaken && Math.hypot((player.x + 13.5) - stage.key.x, (player.y + 14.5) - stage.key.y) < 38) room.keyTaken = true;
      const switches = activeSwitches(room);
      if (room.keyTaken && switches.filter(Boolean).length >= requiredFor(room) &&
          [...room.players.values()].every(p => p.x > 850 && p.y > 420)) {
        room.stageClear = true;
        if (room.stageIndex === LEVELS.length - 1) room.won = true;
      }
      broadcast(room);
    } else if (msg.type === "next" && room.stageClear && !room.won) {
      room.stageIndex = Math.min(LEVELS.length - 1, room.stageIndex + 1);
      resetStage(room); broadcast(room);
    } else if (msg.type === "restart") {
      room.stageIndex = 0; room.won = false; resetStage(room); broadcast(room);
    }
  });
  ws.on("close", () => leave(ws));
});
server.listen(PORT, () => console.log("CATNAP multiplayer server listening on " + PORT));