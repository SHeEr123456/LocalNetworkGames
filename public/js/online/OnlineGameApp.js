/**
 * OnlineGameApp：联网对战的“壳”
 * - 负责 WebSocket 连接、房间创建/加入、聊天、通用 UI
 * - 根据房间的 gameType 选择具体游戏实现（象棋/坦克/飞行棋）
 */

import { ChessGameClient } from "../games/chess/ChessGameClient.js";
import { TankGameClient } from "../games/tank/TankGameClient.js";
import { FlyingGameClient } from "../games/flying/FlyingGameClient.js";

export class OnlineGameApp {
  constructor({ el }) {
    this.el = el;

    /** @type {WebSocket|null} */
    this.socket = null;
    this.clientId = null;

    this.roomId = null;
    this.playerColor = null; // chess: red/black, tank: red/blue
    this.gameType = "chess";

    // 服务端下发的权威状态（不同 gameType 结构不同）
    this.gameState = null;

    // 当前游戏实例
    this.game = null;

    // 通用设置
    this.soundEnabled = true;
  }

  init() {
    // 绑定 UI 事件（替代旧版 inline onclick，避免全局污染）
    this.el.connectBtn.addEventListener("click", () => this.connectFromInput());
    this.el.createRoomBtn.addEventListener("click", () => this.createRoom());
    this.el.refreshRoomBtn.addEventListener("click", () => this.refreshRoomList());
    this.el.sendChatBtn.addEventListener("click", () => this.sendChatFromInput());
    this.el.chatInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.sendChatFromInput();
    });
    this.el.restartBtn.addEventListener("click", () => this.restartGame());
    this.el.surrenderBtn.addEventListener("click", () => this.surrender());
    this.el.toggleSoundBtn.addEventListener("click", () => this.toggleSound());

    if (this.el.rollDiceBtn) {
      this.el.rollDiceBtn.addEventListener("click", () => this.rollDice());
    }

    this.updateStatus("等待连接服务器...", "info");
  }

  connectFromInput() {
    let address = this.el.serverAddress.value.trim();
    if (!address) address = `${window.location.hostname}:3000`;
    address = address.replace(/^https?:\/\//, "");
    this.connect(address);
  }

  connect(address) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${address}`;

    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      this.updateStatus("已连接到服务器", "success");
      this.el.roomListContainer.style.display = "block";
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleServerMessage(data);
      } catch (e) {
        console.error("消息解析失败:", e);
      }
    };

    this.socket.onclose = () => {
      this.updateStatus("连接已断开", "error");
      this.resetToLobby();
    };

    this.socket.onerror = () => {
      this.updateStatus("连接错误，请检查服务器地址", "error");
    };
  }

  send(msg) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(msg));
    return true;
  }

  handleServerMessage(data) {
    switch (data.type) {
      case "welcome":
        this.clientId = data.clientId;
        this.updateStatus(`已连接，客户端ID: ${this.clientId}`, "success");
        break;

      case "room_created":
      case "room_joined":
        this.roomId = data.roomId;
        this.playerColor = data.color;
        this.gameType = data.gameType || "chess";
        this.gameState = data.gameState;

        this.enterGame();
        this.addChatMessage("系统", data.message || "进入房间", true);
        break;

      case "room_list":
        this.renderRoomList(data.rooms || []);
        break;

      case "player_joined":
        this.addChatMessage("系统", data.message || `玩家 ${data.clientId} 已加入房间`, true);
        break;

      case "player_left":
        this.addChatMessage("系统", data.message || `玩家 ${data.clientId} 已离开房间`, true);
        break;

      case "chat":
        // 服务端会广播给所有人，前端过滤“自己”以避免重复显示
        if (data.clientId !== this.clientId) {
          this.addChatMessage("对手", data.message, false);
        }
        break;

      case "move":
        // chess 专用
        if (this.game && this.gameType === "chess") this.game.onServerMove(data);
        break;

      case "tank_state":
        // tank 专用（权威状态帧）
        if (this.game && this.gameType === "tank") this.game.onTankState(data);
        break;

      case "flying_state":
        // 飞行棋：同步完整状态
        if (this.game && this.gameType === "flying") {
          this.gameState = data.state || data.gameState || null;
          if (this.gameState) {
            this.game.onFlyingState(this.gameState);
            this.updatePlayerInfo();
          }
        }
        break;

      case "game_restarted":
        this.gameState = data.gameState;
        if (this.game) this.game.onGameRestarted(data);
        this.clearMoveHistory();
        this.addChatMessage("系统", data.message || "游戏已重新开始", true);
        break;

      case "error":
        alert(data.message);
        break;
    }
  }

  enterGame() {
    // UI 切换
    this.el.connectionPanel.style.display = "none";
    this.el.gameContainer.style.display = "flex";

    // 创建/切换游戏实例
    if (this.game) this.game.destroy?.();

    // 先隐藏所有棋盘容器
    this.el.chessboard.style.display = "none";
    this.el.tankContainer.style.display = "none";
    if (this.el.flyingContainer) this.el.flyingContainer.style.display = "none";

    // 掷骰按钮：仅飞行棋显示
    if (this.el.rollDiceBtn) {
      this.el.rollDiceBtn.style.display = this.gameType === "flying" ? "inline-block" : "none";
    }

    if (this.gameType === "tank") {
      this.el.tankContainer.style.display = "block";
      this.game = new TankGameClient({
        app: this,
        canvas: this.el.tankCanvas,
      });
    } else if (this.gameType === "flying") {
      if (this.el.flyingContainer) this.el.flyingContainer.style.display = "block";
      this.game = new FlyingGameClient({
        app: this,
        canvas: this.el.flyingCanvas,
      });
    } else {
      this.el.chessboard.style.display = "block";
      this.game = new ChessGameClient({
        app: this,
        boardEl: this.el.chessboard,
        moveHistoryEl: this.el.moveHistory,
      });
    }

    this.updatePlayerInfo();
    this.game.initWithState(this.gameState);
  }

  resetToLobby() {
    this.roomId = null;
    this.playerColor = null;
    this.gameType = "chess";
    this.gameState = null;
    if (this.game) this.game.destroy?.();
    this.game = null;

    this.el.connectionPanel.style.display = "block";
    this.el.gameContainer.style.display = "none";
    this.el.roomListContainer.style.display = "none";

    if (this.el.rollDiceBtn) this.el.rollDiceBtn.style.display = "none";
    if (this.el.flyingContainer) this.el.flyingContainer.style.display = "none";
  }

  createRoom() {
    const gameType = this.el.gameSelect?.value || "chess";
    const maxPlayers = Number(this.el.playerCountSelect?.value || 2);
    if (!this.send({ type: "create_room", gameType, maxPlayers })) {
      alert("请先连接到服务器");
      return;
    }
    this.updateStatus("正在创建房间...", "info");
  }

  refreshRoomList() {
    if (!this.send({ type: "get_rooms" })) {
      alert("请先连接到服务器");
      return;
    }
    this.updateStatus("刷新房间列表中...", "info");
  }

  joinRoom(roomId) {
    if (!this.send({ type: "join_room", roomId })) {
      alert("请先连接到服务器");
      return;
    }
    this.updateStatus("正在加入房间...", "info");
  }

  sendChessMove(from, to, piece) {
    this.send({ type: "move", from, to, piece });
  }

  sendTankInput(keys) {
    this.send({ type: "tank_input", keys });
  }

  sendFlyingAction(payload) {
    this.send({ type: "flying_action", ...payload });
  }

  sendChatFromInput() {
    const message = this.el.chatInput.value.trim();
    if (!message) return;
    this.el.chatInput.value = "";
    this.send({ type: "chat", message });
    this.addChatMessage("我", message, false);
  }

  restartGame() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    if (confirm("确定要重新开始游戏吗？")) {
      this.send({ type: "restart" });
    }
  }

  surrender() {
    if (!confirm("确定要认输吗？")) return;
    // 当前项目服务端未实现“认输”协议，这里仅做本地提示
    this.addChatMessage("系统", "你已认输（本地提示），如需联网结算可在服务端补充协议。", true);
    this.playSound("invalid");
  }

  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    this.el.toggleSoundBtn.textContent = `音效: ${this.soundEnabled ? "开" : "关"}`;
    this.playSound("select");
  }

  playSound(type) {
    if (!this.soundEnabled) return;
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      switch (type) {
        case "select":
          oscillator.frequency.value = 523.25;
          break;
        case "move":
          oscillator.frequency.value = 659.25;
          break;
        case "capture":
          oscillator.frequency.value = 783.99;
          break;
        case "invalid":
        default:
          oscillator.frequency.value = 349.23;
          break;
      }

      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (e) {
      // 某些浏览器/环境可能禁止自动播放或无 AudioContext
      console.log("音效播放失败:", e);
    }
  }

  updateStatus(message, type = "info") {
    const el = this.el.connectionStatus;
    el.textContent = message;
    el.style.color = type === "success" ? "#4CAF50" : type === "error" ? "#f44336" : "#2196F3";
  }

  updatePlayerInfo() {
    const colorMapText = {
      red: "红方",
      black: "黑方",
      blue: "蓝方",
      green: "绿方",
      yellow: "黄方",
    };
    const colorMapColor = {
      red: "#B22222",
      black: "#000000",
      blue: "#2b63ff",
      green: "#1b8a3a",
      yellow: "#d4b100",
    };

    if (this.playerColor) {
      const txt = colorMapText[this.playerColor] || this.playerColor;
      const col = colorMapColor[this.playerColor] || "#000";
      this.el.playerColor.textContent = txt;
      this.el.playerColor.style.color = col;
    }

    const turn = this.gameState?.turn;
    if (turn) {
      const txt = colorMapText[turn] || turn;
      const col = colorMapColor[turn] || "#000";
      this.el.currentTurn.textContent = txt;
      this.el.currentTurn.style.color = col;
    }

    this.el.roomId.textContent = this.roomId || "-";
  }

  addChatMessage(sender, message, isSystem = false) {
    const chatElement = this.el.chatMessages;
    const messageElement = document.createElement("div");
    messageElement.className = `chat-message ${isSystem ? "system" : sender === "我" ? "" : "opponent"}`;
    messageElement.innerHTML = `<strong>${sender}:</strong> ${message}`;
    chatElement.appendChild(messageElement);
    chatElement.scrollTop = chatElement.scrollHeight;
  }

  clearMoveHistory() {
    this.el.moveHistory.innerHTML = "";
  }

  addMoveToHistory(text) {
    const moveElement = document.createElement("div");
    moveElement.className = "move-record";
    moveElement.textContent = text;
    this.el.moveHistory.appendChild(moveElement);
    this.el.moveHistory.scrollTop = this.el.moveHistory.scrollHeight;
  }

  renderRoomList(rooms) {
    const roomListElement = this.el.roomList;
    roomListElement.innerHTML = "";

    if (!rooms.length) {
      roomListElement.innerHTML =
        '<div style="padding: 20px; text-align: center; color: #666;">暂无可用房间</div>';
      this.el.roomListContainer.style.display = "block";
      return;
    }

    rooms.forEach((room) => {
      const roomElement = document.createElement("div");
      roomElement.className = "room-item";
      const gameLabel =
        room.gameType === "tank"
          ? "坦克大战"
          : room.gameType === "flying"
            ? "飞行棋"
            : "中国象棋";
      const maxPlayers = room.maxPlayers || 2;
      roomElement.innerHTML = `
        <div><strong>房间号:</strong> ${room.id}</div>
        <div><strong>游戏:</strong> ${gameLabel}</div>
        <div><strong>玩家:</strong> ${room.playerCount}/${maxPlayers}</div>
        <div><small>创建时间: ${new Date(room.created).toLocaleTimeString()}</small></div>
      `;

      if (room.playerCount < maxPlayers) {
        roomElement.addEventListener("click", () => this.joinRoom(room.id));
      } else {
        roomElement.style.opacity = "0.6";
        roomElement.style.cursor = "not-allowed";
        roomElement.innerHTML += '<div style="color: #f44336;">房间已满</div>';
      }

      roomListElement.appendChild(roomElement);
    });

    this.el.roomListContainer.style.display = "block";
  }

  rollDice() {
    if (this.gameType !== "flying") return;
    this.sendFlyingAction({ action: "roll" });
  }
}

