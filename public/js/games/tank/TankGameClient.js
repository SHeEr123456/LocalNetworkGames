/**
 * TankGameClient：客户端坦克大战
 * - 负责键盘输入采集（WASD/J）并周期性发送给服务端
 * - 负责渲染服务端广播的权威状态（tank_state）
 */

export class TankGameClient {
  constructor({ app, canvas }) {
    this.app = app;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    this.state = null;
    this.keys = { left: false, right: false, up: false, down: false, shoot: false };

    this._timer = null;
    this._onKeyDown = (e) => this.handleKey(e, true);
    this._onKeyUp = (e) => this.handleKey(e, false);
  }

  initWithState(state) {
    this.state = state;
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
    this.startInputLoop();
    this.render();
  }

  destroy() {
    this.stopInputLoop();
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
  }

  onGameRestarted(data) {
    this.state = data.gameState;
    this.render();
    this.app.updatePlayerInfo();
  }

  onTankState(data) {
    this.state = {
      players: data.players || {},
      bullets: data.bullets || [],
      obstacles: data.obstacles || [], // 接收障碍物数据
      gameOver: !!data.gameOver,
      winner: data.winner || null,
    };
    this.render();

    if (this.state.gameOver) {
      const text = this.state.winner ? (this.state.winner === "red" ? "红方胜利！" : "蓝方胜利！") : "平局";
      this.app.addChatMessage("系统", text, true);
    }
  }

  handleKey(e, down) {
    if (this.app.gameType !== "tank") return;
    const code = e.key.toLowerCase();
    if (code === "a") this.keys.left = down;
    if (code === "d") this.keys.right = down;
    if (code === "w") this.keys.up = down;
    if (code === "s") this.keys.down = down;
    if (code === "j") this.keys.shoot = down;
  }

  startInputLoop() {
    this.stopInputLoop();
    this._timer = setInterval(() => {
      this.app.sendTankInput(this.keys);
    }, 17);
  }

  stopInputLoop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  render() {
    const ctx = this.ctx;
    const canvas = this.canvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 背景与边框
    ctx.fillStyle = "#0f3b0f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#ccc";
    ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);

    const state = this.state || {};
    const players = state.players || {};
    const bullets = state.bullets || [];
    const obstacles = state.obstacles || [];

    // 绘制障碍物
    obstacles.forEach((obs) => {
      ctx.fillStyle = "#555";
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 2;
      ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
    });

    // 子弹
    bullets.forEach((b) => {
      ctx.beginPath();
      ctx.fillStyle = b.color === "red" ? "#ff4d4f" : "#4d8bff";
      ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // 坦克
    Object.values(players).forEach((p) => {
      if (!p.isAlive) return;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.direction * Math.PI) / 180);
      ctx.fillStyle = p.color === "red" ? "#ff4d4f" : "#4d8bff";
      ctx.fillRect(-12, -12, 24, 24);
      ctx.strokeStyle = "#000";
      ctx.strokeRect(-12, -12, 24, 24);
      ctx.restore();

      // 炮管
      const rad = (p.turretDirection * Math.PI) / 180;
      const ex = p.x + Math.cos(rad) * 18;
      const ey = p.y + Math.sin(rad) * 18;
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // 血条
      const bw = 40,
        bh = 6;
      ctx.fillStyle = "#000";
      ctx.fillRect(p.x - bw / 2, p.y - 26, bw, bh);
      const ratio = Math.max(0, p.health / 100);
      ctx.fillStyle = ratio > 0.5 ? "#0f0" : ratio > 0.2 ? "#ff0" : "#f00";
      ctx.fillRect(p.x - bw / 2 + 1, p.y - 25, (bw - 2) * ratio, bh - 2);
    });

    if (state.gameOver) {
      ctx.fillStyle = "#fff";
      ctx.font = "28px Arial";
      const text = state.winner ? (state.winner === "red" ? "红方胜利" : "蓝方胜利") : "平局";
      ctx.fillText(text, canvas.width / 2 - ctx.measureText(text).width / 2, canvas.height / 2);
    }
  }
}

