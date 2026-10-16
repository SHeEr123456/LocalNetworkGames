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
const {
  createFlyingState,
  ensureFlyingPlayer,
  applyFlyingAction,
} = require("./games/flying/flyingGame");
const {
  createMonopolyState,
  ensureMonopolyPlayer,
  cleanupMonopolyPlayer,
  applyMonopolyAction,
  makeMonopolyBroadcastPayload,
} = require("./games/monopoly/monopolyGame");

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
    // 去除路径前导 / 防止 Windows 下 path.join 将其当作绝对路径
    let urlPath = req.url;
    if (urlPath.startsWith("/")) urlPath = urlPath.substring(1);
    if (!urlPath) urlPath = "index.html";

    const filePath = path.join(this.publicDir, urlPath);

    const mimeTypes = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".mjs": "application/javascript",
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
        this.createRoom(clientId, data.gameType || "chess", data.maxPlayers);
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
      case "flying_action":
        this.handleFlyingAction(clientId, data);
        break;
      case "monopoly_action":
        this.handleMonopolyAction(clientId, data);
        break;
      case "chat":
        this.handleChat(clientId, data);
        break;
      case "leave_room":
        this.leaveRoom(clientId);
        break;
      case "restart":
        this.handleRestart(clientId);
        break;
      case "surrender":
        this.handleSurrender(clientId);
        break;
      case "get_rooms":
        this.sendRoomList(clientId);
        break;
    }
  }

  createRoom(clientId, gameType = "chess", maxPlayers) {
    const client = this.clients.get(clientId);
    if (!client) return;
    if (client.roomId) this.leaveRoom(clientId);

    // 飞行棋与大富翁支持 2~4 人；象棋与坦克固定双人房
    const multiPlayer = gameType === "flying" || gameType === "monopoly";
    const normalizedMaxPlayers = multiPlayer
      ? Math.max(2, Math.min(4, Number(maxPlayers) || 4))
      : 2;

    const roomId = this.generateRoomId();
    const room = {
      id: roomId,
      clients: new Set([clientId]),
      gameType,
      gameState: this.initializeGameState(gameType, { maxPlayers: normalizedMaxPlayers }),
      turn: "red",
      created: Date.now(),
      maxPlayers: normalizedMaxPlayers,
    };

    this.rooms.set(roomId, room);

    client.roomId = roomId;
    if (gameType === "flying") {
      ensureFlyingPlayer(room, clientId);
      const playerState = room.gameState.players?.[clientId];
      client.color = playerState ? playerState.color : null;
    } else if (gameType === "monopoly") {
      const playerState = ensureMonopolyPlayer(room, clientId);
      client.color = playerState ? playerState.color : null;
    } else {
      client.color = "red";
      if (gameType === "tank") ensureTankPlayers(room);
    }

    client.ws.send(
      JSON.stringify({
        type: "room_created",
        roomId,
        color: client.color,
        gameType: room.gameType,
        gameState: room.gameState,
        maxPlayers: room.maxPlayers,
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
    const limit = room.maxPlayers || 2;
    if (room.clients.size >= limit) return this.sendError(clientId, "房间已满");

    // 仅在切换到其他房间时才退出旧房间；
    // 若已在目标房间（建房时自动入房后的重复 join），直接刷新状态即可。
    // 否则 leaveRoom 会把房内人数减到 0 而销毁房间，导致其他玩家"房间不存在"。
    if (client.roomId && client.roomId !== roomId) this.leaveRoom(clientId);

    room.clients.add(clientId);
    client.roomId = roomId;
    if (room.gameType === "flying") {
      ensureFlyingPlayer(room, clientId);
      const playerState = room.gameState.players?.[clientId];
      client.color = playerState ? playerState.color : null;
    } else if (room.gameType === "monopoly") {
      const playerState = ensureMonopolyPlayer(room, clientId);
      client.color = playerState ? playerState.color : null;
    } else {
      client.color = room.gameType === "chess" ? "black" : "blue";
      if (room.gameType === "tank") ensureTankPlayers(room);
    }

    client.ws.send(
      JSON.stringify({
        type: "room_joined",
        roomId,
        color: client.color,
        gameType: room.gameType,
        gameState: room.gameState,
        maxPlayers: room.maxPlayers,
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

    // 新玩家加入可能触发飞行棋自动开局 / 坦克补位，
    // 需向全房同步一次权威状态，否则房主端会停留在旧的空状态
    if (room.gameType === "flying") {
      this.broadcastToRoom(room.id, {
        type: "flying_state",
        gameType: "flying",
        state: room.gameState,
      });
    } else if (room.gameType === "tank") {
      this.broadcastToRoom(room.id, makeTankBroadcastPayload(room));
    } else if (room.gameType === "monopoly") {
      this.broadcastToRoom(room.id, makeMonopolyBroadcastPayload(room));
    }

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

  handleFlyingAction(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client || !client.roomId) return;
    const room = this.rooms.get(client.roomId);
    if (!room || room.gameType !== "flying") return;

    const result = applyFlyingAction(room, clientId, data);
    if (!result.ok) return this.sendError(clientId, result.error);

    this.broadcastToRoom(room.id, result.payload);
    
    // 如果无子可走，2.5秒后自动切换玩家
    if (result.noMoves) {
      const roomId = room.id;
      setTimeout(() => {
        const currentRoom = this.rooms.get(roomId);
        if (!currentRoom) return;
        const state = currentRoom.gameState;
        // 三重校验：state存在 + 阶段匹配 + 游戏未结束
        if (!state || state.gameOver || state.phase !== "SELECTING_PLANE") return;
        
        state.dice = null;
        state.consecutiveSixCount = 0;
        state.canMovePlanes = [];
        state.phase = "WAITING_DICE";
        
        // 切换玩家
        state.currentIndex = (state.currentIndex + 1) % state.order.length;
        const currentPlayer = state.players[state.order[state.currentIndex]];
        state.turn = currentPlayer.color;
        
        // 广播更新后的状态
        this.broadcastToRoom(currentRoom.id, {
          type: "flying_state",
          gameType: "flying",
          state: state
        });
      }, 2500);
    }
  }

  /**
   * 大富翁：权威动作处理
   * 客户端只上报意图（roll / buy / end_turn / build / mortgage / unmortgage / pay_bail / use_jail_card），
   * 全部判定在服务端完成后广播整份权威状态
   */
  handleMonopolyAction(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client || !client.roomId) return;
    const room = this.rooms.get(client.roomId);
    if (!room || room.gameType !== "monopoly") return;

    const result = applyMonopolyAction(room, clientId, data || {});
    if (!result.ok) return this.sendError(clientId, result.error);
    if (result.payload) this.broadcastToRoom(room.id, result.payload);
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

    room.gameState = this.initializeGameState(room.gameType || "chess", {
      maxPlayers: room.maxPlayers,
    });
    room.turn = "red";

    // 重新为坦克 / 飞行棋 / 大富翁房间补充玩家状态
    if (room.gameType === "tank") {
      ensureTankPlayers(room);
    } else if (room.gameType === "flying") {
      Array.from(room.clients).forEach((cid) => ensureFlyingPlayer(room, cid));
    } else if (room.gameType === "monopoly") {
      Array.from(room.clients).forEach((cid) => ensureMonopolyPlayer(room, cid));
    }

    this.broadcastToRoom(room.id, {
      type: "game_restarted",
      gameState: room.gameState,
      turn: room.turn,
      message: "游戏已重新开始",
    });
  }

  /**
   * 认输：当前玩家认输，对手直接获胜
   * 兼容象棋 / 坦克 / 飞行棋三种房间
   */
  handleSurrender(clientId) {
    const client = this.clients.get(clientId);
    if (!client || !client.roomId) return;
    const room = this.rooms.get(client.roomId);
    if (!room || !room.gameState) return;

    const state = room.gameState;
    if (state.gameOver) return;

    // 对手：房间内除自己以外的第一个玩家（单人练习时无对手）
    const opponentId = Array.from(room.clients).find((cid) => cid !== clientId);
    const opponent = opponentId ? this.clients.get(opponentId) : null;
    const winner = opponent ? opponent.color : null;

    state.gameOver = true;
    state.winner = winner;
    if (room.gameType === "flying" || room.gameType === "monopoly") {
      state.phase = "GAME_OVER";
    }

    const colorText = {
      red: "红方",
      black: "黑方",
      blue: "蓝方",
      yellow: "黄方",
      green: "绿方",
    };
    const loserText = client.color ? `${colorText[client.color] || client.color}` : "玩家";

    this.broadcastToRoom(room.id, {
      type: "game_over",
      gameType: room.gameType,
      winner,
      reason: "surrender",
      clientId,
      message: winner
        ? `${loserText}认输，${colorText[winner] || winner}获胜！`
        : `${loserText}认输，本局结束。`,
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

      // 清理该玩家在权威对局状态中的残留，避免对局卡死（坦克永不结束 / 飞行棋轮空）
      this.cleanupPlayerState(room, clientId);

      this.broadcastToRoom(
        room.id,
        {
          type: "player_left",
          clientId,
          message: "玩家已离开房间",
        },
        clientId,
      );

      // 玩家退出会改变权威状态，主动同步一帧给其余玩家
      if (room.gameType === "tank") {
        this.broadcastToRoom(room.id, makeTankBroadcastPayload(room));
      } else if (room.gameType === "flying") {
        this.broadcastToRoom(room.id, {
          type: "flying_state",
          gameType: "flying",
          state: room.gameState,
        });
      } else if (room.gameType === "monopoly") {
        this.broadcastToRoom(room.id, makeMonopolyBroadcastPayload(room));
      }

      if (room.clients.size === 0) this.rooms.delete(room.id);
      this.broadcastRoomList();
    }

    client.roomId = null;
    client.color = null;
  }

  /**
   * 玩家离开后清理其在对局状态中的残留数据
   * - 坦克：置为阵亡，交由 tick 判胜结算
   * - 飞行棋：从 order / players 中移除，人数不足则回到等待状态
   * - 象棋：无需处理（服务端回合与阵营校验会自动拒绝其后续走子）
   */
  cleanupPlayerState(room, clientId) {
    const state = room.gameState;
    if (!state) return;

    if (room.gameType === "tank") {
      const player = state.players?.[clientId];
      if (player) {
        player.isAlive = false;
        player.health = 0;
        player.keys = { left: false, right: false, up: false, down: false, shoot: false };
      }
      return;
    }

    if (room.gameType === "flying") {
      if (state.players) delete state.players[clientId];

      if (Array.isArray(state.order)) {
        const idx = state.order.indexOf(clientId);
        if (idx !== -1) state.order.splice(idx, 1);
      }
      if (!Array.isArray(state.order) || state.order.length === 0) {
        state.currentIndex = 0;
      } else if (state.currentIndex >= state.order.length) {
        state.currentIndex = 0;
      }

      state.dice = null;
      state.canMovePlanes = [];
      state.consecutiveSixCount = 0;

      if (state.order.length < 2) {
        state.gameStarted = false;
        state.phase = "WAITING_DICE";
        state.turn = null;
        state.lastAction = "玩家不足 2 人，等待其他玩家加入…";
      } else if (state.gameStarted) {
        const currentPlayer = state.players[state.order[state.currentIndex]];
        state.phase = "WAITING_DICE";
        state.turn = currentPlayer ? currentPlayer.color : null;
        state.lastAction = "有玩家离开，继续游戏";
      }
      return;
    }

    if (room.gameType === "monopoly") {
      // 大富翁：名下地产回归银行并从名次中移除；不足 2 人则暂停牌局
      cleanupMonopolyPlayer(room, clientId);
      return;
    }
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
      maxPlayers: room.maxPlayers || 2,
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
      maxPlayers: room.maxPlayers || 2,
    }));
    client.ws.send(JSON.stringify({ type: "room_list", rooms: roomList }));
  }

  sendError(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;
    client.ws.send(JSON.stringify({ type: "error", message }));
  }

  initializeGameState(gameType = "chess", options = {}) {
    if (gameType === "tank") return createTankState();
    if (gameType === "flying") return createFlyingState(options.maxPlayers || 4);
    if (gameType === "monopoly") return createMonopolyState(options.maxPlayers || 4);
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

