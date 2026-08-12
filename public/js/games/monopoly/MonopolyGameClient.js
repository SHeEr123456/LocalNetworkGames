/**
 * MonopolyGameClient：环球之旅风格长方形大富翁棋盘（Canvas）
 */

const COLOR_HEX = {
  red: "#e74c3c",
  blue: "#3498db",
  green: "#27ae60",
  yellow: "#f1c40f",
};

const COLOR_NAMES = {
  red: "红方",
  blue: "蓝方",
  green: "绿方",
  yellow: "黄方",
};

const GROUP_COLORS = {
  a: "#c0392b",
  b: "#2980b9",
  c: "#8e44ad",
  d: "#d35400",
  e: "#16a085",
  f: "#2c3e50",
};

export class MonopolyGameClient {
  constructor({ app, canvas }) {
    this.app = app;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.state = null;
    this.cellRects = []; // [{id, x, y, w, h}]
    this._onClick = (e) => this.handleClick(e);
    this._onResize = () => this.render();
  }

  initWithState(state) {
    this.state = state;
    this.canvas.addEventListener("click", this._onClick);
    window.addEventListener("resize", this._onResize);
    this.syncActionButtons();
    this.render();
  }

  destroy() {
    this.canvas.removeEventListener("click", this._onClick);
    window.removeEventListener("resize", this._onResize);
    this.hideActionButtons();
  }

  onGameRestarted(data) {
    this.state = data.gameState;
    this.syncActionButtons();
    this.render();
    this.app.updatePlayerInfo();
  }

  onMonopolyState(nextState) {
    const oldDice = this.state?.dice;
    const newDice = nextState?.dice;

    if (newDice != null && newDice !== oldDice) {
      this.showDiceAnimation(newDice);
      const turnName = COLOR_NAMES[nextState.turn] || "玩家";
      this.app.addChatMessage("游戏", `${turnName} 掷出 ${newDice} 点`, true);
    }

    if (nextState.lastAction && !String(nextState.lastAction).includes("掷出")) {
      this.app.addChatMessage("游戏", nextState.lastAction, true);
    }

    this.state = nextState;
    this.syncActionButtons();
    this.render();

    if (this.state?.gameOver && this.state.winner) {
      this.app.addChatMessage("系统", `${COLOR_NAMES[this.state.winner] || ""} 获胜！`, true);
    }
  }

  syncActionButtons() {
    const buyBtn = document.getElementById("monopolyBuyBtn");
    const skipBtn = document.getElementById("monopolySkipBtn");
    const isMyTurn = this.isMyTurn();
    const decision = this.state?.phase === "DECISION" && isMyTurn;

    if (buyBtn) buyBtn.style.display = decision ? "inline-block" : "none";
    if (skipBtn) skipBtn.style.display = decision ? "inline-block" : "none";

    if (this.app.el.rollDiceBtn) {
      const canRoll = this.state?.phase === "WAITING_DICE" && isMyTurn && !this.state?.gameOver;
      this.app.el.rollDiceBtn.disabled = !canRoll;
    }
  }

  hideActionButtons() {
    const buyBtn = document.getElementById("monopolyBuyBtn");
    const skipBtn = document.getElementById("monopolySkipBtn");
    if (buyBtn) buyBtn.style.display = "none";
    if (skipBtn) skipBtn.style.display = "none";
  }

  isMyTurn() {
    if (!this.state) return false;
    if (this.app.isHotseat?.()) {
      return !!this.state.gameStarted && !this.state.gameOver;
    }
    if (!this.app.clientId) return false;
    const cur = this.state.order?.[this.state.currentIndex];
    return cur === this.app.clientId;
  }

  handleClick() {
    // 购买/跳过走按钮；棋盘点击暂不需要
  }

  showDiceAnimation(diceValue) {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;justify-content:center;align-items:center;z-index:10000;";
    const img = document.createElement("img");
    img.src = `./gif/${diceValue}.gif`;
    img.alt = `骰子${diceValue}`;
    img.style.cssText =
      "max-width:360px;max-height:360px;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.5);background:#fff;";
    img.onerror = () => {
      overlay.innerHTML = "";
      const text = document.createElement("div");
      text.textContent = `🎲 ${diceValue}`;
      text.style.cssText =
        "font-size:100px;color:#fff;font-weight:bold;text-shadow:0 4px 20px rgba(0,0,0,.8)";
      overlay.appendChild(text);
    };
    overlay.appendChild(img);
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 1800);
  }

  /** 28 格顺时针：底 0-7 → 右 8-13 → 顶 14-21 → 左 22-27 */
  layoutCells(boardW, boardH, margin) {
    const cols = 8;
    const rows = 8;
    const cellW = (boardW - margin * 2) / cols;
    const cellH = (boardH - margin * 2) / rows;
    const ox = margin;
    const oy = margin;
    const rects = [];

    // 底边：左→右 (0..7) —— 起点在左下角
    for (let i = 0; i < 8; i++) {
      rects.push({
        id: i,
        x: ox + i * cellW,
        y: oy + (rows - 1) * cellH,
        w: cellW,
        h: cellH,
      });
    }
    // 右边：下→上 (8..13)，不含两角
    for (let i = 0; i < 6; i++) {
      rects.push({
        id: 8 + i,
        x: ox + (cols - 1) * cellW,
        y: oy + (rows - 2 - i) * cellH,
        w: cellW,
        h: cellH,
      });
    }
    // 顶边：右→左 (14..21)
    for (let i = 0; i < 8; i++) {
      rects.push({
        id: 14 + i,
        x: ox + (cols - 1 - i) * cellW,
        y: oy,
        w: cellW,
        h: cellH,
      });
    }
    // 左边：上→下 (22..27)，不含两角
    for (let i = 0; i < 6; i++) {
      rects.push({
        id: 22 + i,
        x: ox,
        y: oy + (1 + i) * cellH,
        w: cellW,
        h: cellH,
      });
    }

    return { rects, cellW, cellH, ox, oy, cols, rows };
  }

  render() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    // 背景
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#e8f5e9");
    bg.addColorStop(1, "#fff8e1");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const margin = 16;
    const { rects, cellW, cellH, ox, oy, cols, rows } = this.layoutCells(W, H, margin);
    this.cellRects = rects;

    // 中心面板
    const innerX = ox + cellW;
    const innerY = oy + cellH;
    const innerW = cellW * (cols - 2);
    const innerH = cellH * (rows - 2);
    ctx.fillStyle = "#faf6e8";
    ctx.fillRect(innerX, innerY, innerW, innerH);
    ctx.strokeStyle = "#c4a35a";
    ctx.lineWidth = 3;
    ctx.strokeRect(innerX + 4, innerY + 4, innerW - 8, innerH - 8);

    ctx.fillStyle = "#8b4513";
    ctx.font = "bold 28px 'Segoe UI', 'Microsoft YaHei', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("环球之旅 · 大富翁", innerX + innerW / 2, innerY + 42);

    this.drawCenterInfo(innerX, innerY, innerW, innerH);

    const board = this.state?.board || [];
    for (const r of rects) {
      const sq = board[r.id];
      if (sq) this.drawSquare(r, sq);
    }

    this.drawTokens(rects);
  }

  drawCenterInfo(x, y, w, h) {
    const ctx = this.ctx;
    if (!this.state) {
      ctx.fillStyle = "#666";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("等待状态…", x + w / 2, y + h / 2);
      return;
    }

    const players = (this.state.order || [])
      .map((id) => this.state.players[id])
      .filter(Boolean);

    ctx.textAlign = "left";
    ctx.font = "14px 'Microsoft YaHei', sans-serif";
    let py = y + 70;
    const px = x + 24;

    for (const p of players) {
      ctx.fillStyle = COLOR_HEX[p.color] || "#333";
      const actingId = this.app.getActingPlayerId?.() ?? this.app.clientId;
      const mine = p.id === actingId ? "（当前）" : "";
      const status = p.bankrupt ? "【破产】" : p.inJail ? "【监狱】" : "";
      const turnMark = this.state.turn === p.color && !this.state.gameOver ? " ▶" : "";
      ctx.fillText(
        `${COLOR_NAMES[p.color]}${mine}${turnMark}  $${p.money}  位置:${p.position} ${status}`,
        px,
        py,
      );
      py += 22;
    }

    py += 10;
    ctx.fillStyle = "#333";
    ctx.font = "13px 'Microsoft YaHei', sans-serif";
    const action = this.state.lastAction || "";
    this.wrapText(action, px, py, w - 48, 18);

    if (this.state.phase === "DECISION" && this.isMyTurn()) {
      ctx.fillStyle = "#c0392b";
      ctx.font = "bold 15px sans-serif";
      ctx.textAlign = "center";
      const who = COLOR_NAMES[this.state.turn] || "当前玩家";
      ctx.fillText(`${who}：购买或跳过这块地产`, x + w / 2, y + h - 28);
    } else if (this.state.phase === "WAITING_DICE" && this.isMyTurn() && !this.state.gameOver) {
      ctx.fillStyle = "#1b8a3a";
      ctx.font = "bold 15px sans-serif";
      ctx.textAlign = "center";
      const who = COLOR_NAMES[this.state.turn] || "当前玩家";
      ctx.fillText(`${who}：点击「掷骰子」`, x + w / 2, y + h - 28);
    } else if (this.state.gameOver) {
      ctx.fillStyle = "#8b0000";
      ctx.font = "bold 18px sans-serif";
      ctx.textAlign = "center";
      const win = this.state.winner ? `${COLOR_NAMES[this.state.winner]} 获胜！` : "游戏结束";
      ctx.fillText(win, x + w / 2, y + h - 28);
    } else if (!this.state.gameStarted) {
      ctx.fillStyle = "#555";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("等待至少 2 名玩家…", x + w / 2, y + h - 28);
    }
  }

  wrapText(text, x, y, maxWidth, lineHeight) {
    const ctx = this.ctx;
    const chars = String(text).split("");
    let line = "";
    let yy = y;
    for (const ch of chars) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, yy);
        line = ch;
        yy += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, yy);
  }

  drawSquare(rect, sq) {
    const ctx = this.ctx;
    const { x, y, w, h } = rect;

    let fill = "#fffef5";
    if (sq.type === "start") fill = "#ffe082";
    else if (sq.type === "jail") fill = "#b0bec5";
    else if (sq.type === "goto_jail") fill = "#ef9a9a";
    else if (sq.type === "parking") fill = "#a5d6a7";
    else if (sq.type === "chance") fill = "#ce93d8";
    else if (sq.type === "tax") fill = "#ffcc80";
    else if (sq.type === "property") fill = "#fffde7";

    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#5d4037";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);

    if (sq.type === "property" && sq.colorGroup) {
      const band = 10;
      ctx.fillStyle = GROUP_COLORS[sq.colorGroup] || "#888";
      // 色带朝向棋盘内侧
      if (sq.id <= 7) ctx.fillRect(x, y, w, band); // 底：上沿
      else if (sq.id >= 8 && sq.id <= 13) ctx.fillRect(x, y, band, h); // 右：左沿
      else if (sq.id >= 14 && sq.id <= 21) ctx.fillRect(x, y + h - band, w, band); // 顶：下沿
      else ctx.fillRect(x + w - band, y, band, h); // 左：右沿
    }

    // 业主标记
    const ownerId = this.state?.owners?.[String(sq.id)];
    if (ownerId && this.state.players[ownerId]) {
      const oc = this.state.players[ownerId].color;
      ctx.fillStyle = COLOR_HEX[oc] || "#000";
      ctx.beginPath();
      ctx.arc(x + w - 10, y + 10, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#333";
    ctx.textAlign = "center";
    ctx.font = "bold 11px 'Microsoft YaHei', sans-serif";
    const name = sq.name || "";
    if (name.length <= 3) {
      ctx.fillText(name, x + w / 2, y + h / 2 - 2);
    } else {
      ctx.fillText(name.slice(0, 2), x + w / 2, y + h / 2 - 8);
      ctx.fillText(name.slice(2), x + w / 2, y + h / 2 + 6);
    }

    if (sq.type === "property" && sq.price) {
      ctx.font = "10px sans-serif";
      ctx.fillStyle = "#666";
      ctx.fillText(`$${sq.price}`, x + w / 2, y + h - 8);
    }
  }

  drawTokens(rects) {
    if (!this.state?.players) return;
    const ctx = this.ctx;
    const byPos = {};

    for (const id of this.state.order || []) {
      const p = this.state.players[id];
      if (!p || p.bankrupt) continue;
      const key = p.position;
      if (!byPos[key]) byPos[key] = [];
      byPos[key].push(p);
    }

    for (const [posStr, list] of Object.entries(byPos)) {
      const rect = rects.find((r) => r.id === Number(posStr));
      if (!rect) continue;
      list.forEach((p, i) => {
        const cx = rect.x + rect.w / 2 + (i - (list.length - 1) / 2) * 14;
        const cy = rect.y + rect.h / 2 + 10;
        ctx.beginPath();
        ctx.fillStyle = COLOR_HEX[p.color] || "#000";
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.arc(cx, cy, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (p.id === (this.app.getActingPlayerId?.() ?? this.app.clientId)) {
          ctx.beginPath();
          ctx.strokeStyle = "#000";
          ctx.lineWidth = 1.5;
          ctx.arc(cx, cy, 12, 0, Math.PI * 2);
          ctx.stroke();
        }
      });
    }
  }
}
