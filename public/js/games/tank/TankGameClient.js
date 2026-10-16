/**
 * TankGameClient：客户端坦克大战
 * - 负责键盘 / 触屏输入采集并周期性发送给服务端
 * - 负责渲染服务端广播的权威状态（tank_state）
 */

import { fitCanvas, onCanvasResize } from "../../core/canvasFit.js";

/** 战场逻辑坐标系（与物理判定保持一致，渲染时按显示尺寸等比缩放） */
const VIEW_W = 800;
const VIEW_H = 600;

/** 暗色主题配色（与平台视觉体系一致） */
const THEME = {
  bg: "#101317",
  grid: "rgba(217,164,65,.10)",
  border: "rgba(217,164,65,.28)",
  obstacleFill: "#2A2F38",
  obstacleStroke: "#3A414D",
  redBody: "#FF6B6B",
  blueBody: "#5B8DEF",
  redBullet: "#FF6B6B",
  blueBullet: "#5B8DEF",
  text: "#E7EAEF",
  accent: "#D9A441",
};

export class TankGameClient {
  constructor({ app, canvas, touchPadEl }) {
    this.app = app;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.touchPadEl = touchPadEl || null;

    this.state = null;
    this.keys = { left: false, right: false, up: false, down: false, shoot: false };

    this._timer = null;
    this._padHandlers = [];
    this._unbindResize = null;
    this._onKeyDown = (e) => this.handleKey(e, true);
    this._onKeyUp = (e) => this.handleKey(e, false);
  }

  initWithState(state) {
    this.state = state;
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
    this.bindTouchPad();
    this.startInputLoop();
    this._unbindResize = onCanvasResize(() => this.render());
    this.render();
  }

  destroy() {
    this.stopInputLoop();
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    this.unbindTouchPad();
    this._unbindResize?.();
    this._unbindResize = null;
  }

  /** 移动端虚拟方向键：按下即置位，抬起 / 移出即复位 */
  bindTouchPad() {
    const pad = this.touchPadEl;
    if (!pad) return;

    pad.querySelectorAll("[data-key]").forEach((btn) => {
      const key = btn.dataset.key;
      if (!(key in this.keys)) return;

      const on = (e) => {
        e.preventDefault();
        this.keys[key] = true;
        btn.classList.add("on");
      };
      const off = (e) => {
        e.preventDefault();
        this.keys[key] = false;
        btn.classList.remove("on");
      };

      btn.addEventListener("pointerdown", on);
      btn.addEventListener("pointerup", off);
      btn.addEventListener("pointercancel", off);
      btn.addEventListener("pointerleave", off);
      this._padHandlers.push([btn, on, off]);
    });
  }

  unbindTouchPad() {
    this._padHandlers.forEach(([btn, on, off]) => {
      btn.removeEventListener("pointerdown", on);
      btn.removeEventListener("pointerup", off);
      btn.removeEventListener("pointercancel", off);
      btn.removeEventListener("pointerleave", off);
    });
    this._padHandlers = [];
    this.touchPadEl?.querySelectorAll(".pad-btn.on").forEach((b) => b.classList.remove("on"));
  }

  onGameRestarted(data) {
    this.state = data.gameState;
    this.render();
    this.app.updatePlayerInfo();
  }

  /**
   * 服务端宣布对局结束（认输等）
   */
  onGameOver(data) {
    if (!this.state) {
      this.state = { players: {}, bullets: [], obstacles: [], gameOver: false, winner: null };
    }
    this.state.gameOver = true;
    this.state.winner = data.winner || null;
    this.render();
    this.app.updatePlayerInfo();
    if (data.message) this.app.addChatMessage("系统", data.message, true);
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
    }, 50);
  }

  stopInputLoop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  render() {
    const ctx = this.ctx;

    // 位图对齐 CSS 显示尺寸 × dpr；后续一律使用 800×600 逻辑坐标
    fitCanvas(this.canvas, ctx, VIEW_W, VIEW_H);

    ctx.clearRect(0, 0, VIEW_W, VIEW_H);

    // 背景（暗色石板）+ 细网格，提升质感而不抢戏
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    ctx.strokeStyle = THEME.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x <= VIEW_W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, VIEW_H);
      ctx.stroke();
    }
    for (let y = 0; y <= VIEW_H; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(VIEW_W, y + 0.5);
      ctx.stroke();
    }

    // 战场边界
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, VIEW_W - 36, VIEW_H - 36);

    const state = this.state || {};
    const players = state.players || {};
    const bullets = state.bullets || [];
    const obstacles = state.obstacles || [];

    // 绘制障碍物
    obstacles.forEach((obs) => {
      ctx.fillStyle = THEME.obstacleFill;
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
      ctx.strokeStyle = THEME.obstacleStroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(obs.x + 0.5, obs.y + 0.5, obs.width - 1, obs.height - 1);
    });

    // 子弹
    bullets.forEach((b) => {
      ctx.beginPath();
      ctx.fillStyle = b.color === "red" ? THEME.redBullet : THEME.blueBullet;
      ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // 坦克
    Object.values(players).forEach((p) => {
      if (!p.isAlive) return;

      const body = p.color === "red" ? THEME.redBody : THEME.blueBody;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.direction * Math.PI) / 180);
      ctx.fillStyle = body;
      ctx.fillRect(-12, -12, 24, 24);
      ctx.strokeStyle = "rgba(0,0,0,.6)";
      ctx.lineWidth = 1;
      ctx.strokeRect(-12, -12, 24, 24);
      ctx.restore();

      // 炮管
      const rad = (p.turretDirection * Math.PI) / 180;
      const ex = p.x + Math.cos(rad) * 18;
      const ey = p.y + Math.sin(rad) * 18;
      ctx.strokeStyle = "rgba(0,0,0,.6)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // 血条
      const bw = 40;
      const bh = 6;
      ctx.fillStyle = "rgba(0,0,0,.7)";
      ctx.fillRect(p.x - bw / 2, p.y - 26, bw, bh);
      const ratio = Math.max(0, p.health / 100);
      ctx.fillStyle = ratio > 0.5 ? "#4ADE80" : ratio > 0.2 ? "#FBBF24" : "#F87171";
      ctx.fillRect(p.x - bw / 2 + 1, p.y - 25, (bw - 2) * ratio, bh - 2);
    });

    if (state.gameOver) {
      ctx.fillStyle = "rgba(14,16,19,.66)";
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.fillStyle = THEME.accent;
      ctx.font = "600 30px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const text = state.winner ? (state.winner === "red" ? "红方胜利" : "蓝方胜利") : "平局";
      ctx.fillText(text, VIEW_W / 2, VIEW_H / 2);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }
  }
}

