const WebSocket = require("ws");
const http = require("http");
const fs = require("fs");
const path = require("path");

const { createChessState, applyChessMove } = require("./games/chess/chessGame");
const {
  createTankState,
  ensureTankPlayers,
  applyTankInput,
  tickTankRoom,
  makeTankBroadcastPayload,
} = require("./games/tank/tankGame");

/**
 * 服务器说明
 * - HTTP：提供静态页面（public/）
 * - WebSocket：房间/对战/聊天
 */

class GameServer {
  constructor({ port = 3000, publicDir }) {
    this.port = port;
    this.publicDir = publicDir;

    this.server = http.createServer(this.handleHttpRequest.bind(this));
    this.wss = new WebSocket.Server({ server: this.server });

    this.clients = new Map(); // clientId -> { ws, roomId, color, clientId }
    this.rooms = new Map(); // roomId -> { id, clients:Set, gameType, gameState, turn, created }

    // Tank tick（20 FPS）
    this.tankTick = setInterval(() => this.updateTankRooms(), 50);

    this.setupWebSocket();
  }

  handleHttpRequest(req, res) {
    const urlPath = req.url === "/" ? "/index.html" : req.url;
    const filePath = path.join(this.publicDir, urlPath);

    const mimeTypes = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
    };

    const extname = path.extname(filePath);
    const contentType = mimeTypes[extname] || "application/octet-stream";

    fs.readFile(filePath, (error, content) => {
      if (error) {
        if (error.code === "ENOENT") {
          // SPA/容错：找不到资源时回退 index.html
          fs.readFile(path.join(this.publicDir, "index.html"), (err, data) => {
            if (err) {
              res.writeHead(500);
              res.end("Error loading index.html");
              return;
            }
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(data, "utf-8");
          });
          return;
        }
        res.writeHead(500);
        res.end("Server Error: " + error.code);
        return;
      }

      res.writeHead(200, { "Content-Type": contentType });
      res.end(content, extname === ".png" || extname === ".jpg" || extname === ".jpeg" ? undefined : "utf-8");
    });
  }

  setupWebSocket() {
    this.wss.on("connection", (ws) => {
      const clientId = this.generateClientId();
      console.log(`新客户端连接: ${clientId}`);

      this.clients.set(clientId, {
        ws,
        roomId: null,
        color: null,
        clientId,
      });

      ws.send(
        JSON.stringify({
          type: "welcome",
          clientId,
          message: "连接到游戏服务器",
        }),
      );

      ws.on("message", (message) => {
        try {
          const data = JSON.parse(message);
          this.handleMessage(clientId, data);
        } catch (e) {
          console.error("消息解析错误:", e);
        }
      });

      ws.on("close", () => {
        console.log(`客户端断开: ${clientId}`);
        this.handleDisconnect(clientId);
      });

      ws.on("error", (e) => {
        console.error(`客户端错误 ${clientId}:`, e);
      });
    });
  }

  handleMessage(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (data.type) {
      case "create_room":
        this.createRoom(clientId, data.gameType || "chess");
        break;
      case "join_room":
        this.joinRoom(clientId, data.roomId);
        break;
      case "move":
        this.handleMove(clientId, data);
        break;
      case "tank_input":
        this.handleTankInput(clientId, data);
        break;
      case "chat":
        this.handleChat(clientId, data);
        break;
      case "restart":
        this.handleRestart(clientId);
        break;
      case "get_rooms":
        this.sendRoomList(clientId);
        break;
    }
  }

  createRoom(clientId, gameType = "chess") {
    const client = this.clients.get(clientId);
    if (!client) return;
    if (client.roomId) this.leaveRoom(clientId);

    const roomId = this.generateRoomId();
    const room = {
      id: roomId,
      clients: new Set([clientId]),
      gameType,
      gameState: this.initializeGameState(gameType),
      turn: "red",
      created: Date.now(),
    };

    this.rooms.set(roomId, room);

    client.roomId = roomId;
    client.color = "red";

    client.ws.send(
      JSON.stringify({
        type: "room_created",
        roomId,
        color: client.color,
        gameType: room.gameType,
        gameState: room.gameState,
        message: "房间创建成功，等待其他玩家加入...",
      }),
    );

    this.broadcastRoomList();
  }

  joinRoom(clientId, roomId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const room = this.rooms.get(roomId);
    if (!room) return this.sendError(clientId, "房间不存在");
    if (room.clients.size >= 2) return this.sendError(clientId, "房间已满");

    if (client.roomId) this.leaveRoom(clientId);

    room.clients.add(clientId);
    client.roomId = roomId;
    client.color = room.gameType === "chess" ? "black" : "blue";

    if (room.gameType === "tank") ensureTankPlayers(room);

    client.ws.send(
      JSON.stringify({
        type: "room_joined",
        roomId,
        color: client.color,
        gameType: room.gameType,
        gameState: room.gameState,
        opponent: Array.from(room.clients).find((id) => id !== clientId),
        message: "加入房间成功，游戏开始！",
      }),
    );

    this.broadcastToRoom(
      roomId,
      {
        type: "player_joined",
        clientId,
        color: client.color,
        gameType: room.gameType,
        message: "新玩家已加入，游戏开始！",
      },
      clientId,
    );

    this.broadcastRoomList();
  }

  handleMove(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client || !client.roomId) return;
    const room = this.rooms.get(client.roomId);
    if (!room) return;
    if (room.gameType !== "chess") return;

    const result = applyChessMove(room, client, data);
    if (!result.ok) return this.sendError(clientId, result.error);

    this.broadcastToRoom(room.id, result.payload);
  }

  handleTankInput(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client || !client.roomId) return;
    const room = this.rooms.get(client.roomId);
    if (!room || room.gameType !== "tank") return;
    applyTankInput(room, clientId, data.keys);
  }

  handleChat(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client || !client.roomId) return;
    this.broadcastToRoom(client.roomId, {
      type: "chat",
      clientId,
      message: data.message,
      timestamp: new Date().toLocaleTimeString(),
    });
  }

  handleRestart(clientId) {
    const client = this.clients.get(clientId);
    if (!client || !client.roomId) return;
    const room = this.rooms.get(client.roomId);
    if (!room) return;

    room.gameState = this.initializeGameState(room.gameType || "chess");
    room.turn = "red";

    this.broadcastToRoom(room.id, {
      type: "game_restarted",
      gameState: room.gameState,
      turn: room.turn,
      message: "游戏已重新开始",
    });
  }

  handleDisconnect(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;
    if (client.roomId) this.leaveRoom(clientId);
    this.clients.delete(clientId);
  }

  leaveRoom(clientId) {
    const client = this.clients.get(clientId);
    if (!client || !client.roomId) return;
    const room = this.rooms.get(client.roomId);
    if (room) {
      room.clients.delete(clientId);

      this.broadcastToRoom(
        room.id,
        {
          type: "player_left",
          clientId,
          message: "玩家已离开房间",
        },
        clientId,
      );

      if (room.clients.size === 0) this.rooms.delete(room.id);
      this.broadcastRoomList();
    }

    client.roomId = null;
    client.color = null;
  }

  broadcastToRoom(roomId, message, excludeClientId = null) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.clients.forEach((cid) => {
      if (cid === excludeClientId) return;
      const c = this.clients.get(cid);
      if (c && c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(message));
    });
  }

  broadcastRoomList() {
    const roomList = Array.from(this.rooms.values()).map((room) => ({
      id: room.id,
      playerCount: room.clients.size,
      created: room.created,
      gameType: room.gameType || "chess",
    }));
    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(
          JSON.stringify({
            type: "room_list",
            rooms: roomList,
          }),
        );
      }
    });
  }

  sendRoomList(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;
    const roomList = Array.from(this.rooms.values()).map((room) => ({
      id: room.id,
      playerCount: room.clients.size,
      created: room.created,
      gameType: room.gameType || "chess",
    }));
    client.ws.send(JSON.stringify({ type: "room_list", rooms: roomList }));
  }

  sendError(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;
    client.ws.send(JSON.stringify({ type: "error", message }));
  }

  initializeGameState(gameType = "chess") {
    if (gameType === "tank") return createTankState();
    return createChessState();
  }

  updateTankRooms() {
    const now = Date.now();
    this.rooms.forEach((room) => {
      if (room.gameType !== "tank") return;
      tickTankRoom(room, now);
      // broadcast
      this.broadcastToRoom(room.id, makeTankBroadcastPayload(room));
    });
  }

  generateClientId() {
    return "client_" + Math.random().toString(36).slice(2, 11);
  }

  generateRoomId() {
    return "room_" + Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  start() {
    this.server.listen(this.port, () => {
      console.log("========================================");
      console.log("局域网对战服务器已启动！");
      console.log(`本地访问: http://localhost:${this.port}`);
      console.log("========================================");
    });
  }
}

module.exports = { GameServer };

