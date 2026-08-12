/**
 * MonopolyGameClient：2.5D 透视棋盘 + 立体棋子 / 房屋
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
    this.cellQuads = []; // [{id, pts:[{x,y}x4], cx, cy}]
    this._onClick = (e) => this.handleClick(e);
    this._onResize = () => this.render();
    this.animT = 0;
    this._raf = null;
  }

  initWithState(state) {
    this.state = state;
    this.canvas.addEventListener("click", this._onClick);
    window.addEventListener("resize", this._onResize);
    this.syncActionButtons();
    this.startLoop();
  }

  destroy() {
    this.canvas.removeEventListener("click", this._onClick);
    window.removeEventListener("resize", this._onResize);
    this.hideActionButtons();
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  startLoop() {
    const tick = () => {
      this.animT += 0.02;
      this.render();
      this._raf = requestAnimationFrame(tick);
    };
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(tick);
  }

  onGameRestarted(data) {
    this.state = data.gameState;
    this.syncActionButtons();
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
    this.app.updatePlayerInfo?.();

    if (this.state?.gameOver && this.state.winner) {
      this.app.addChatMessage("系统", `${COLOR_NAMES[this.state.winner] || ""} 获胜！`, true);
    }
  }

  syncActionButtons() {
    const buyBtn = document.getElementById("monopolyBuyBtn");
    const skipBtn = document.getElementById("monopolySkipBtn");
    const endBuildBtn = document.getElementById("monopolyEndBuildBtn");
    const isMyTurn = this.isMyTurn();
    const decision = this.state?.phase === "DECISION" && isMyTurn;
    const building = this.state?.phase === "BUILD" && isMyTurn;

    if (buyBtn) buyBtn.style.display = decision ? "inline-block" : "none";
    if (skipBtn) skipBtn.style.display = decision ? "inline-block" : "none";
    if (endBuildBtn) endBuildBtn.style.display = building ? "inline-block" : "none";

    if (this.app.el.rollDiceBtn) {
      const canRoll = this.state?.phase === "WAITING_DICE" && isMyTurn && !this.state?.gameOver;
      this.app.el.rollDiceBtn.disabled = !canRoll;
    }
  }

  hideActionButtons() {
    ["monopolyBuyBtn", "monopolySkipBtn", "monopolyEndBuildBtn"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
  }

  isMyTurn() {
    if (!this.state) return false;
    if (this.app.isHotseat?.()) {
      return !!this.state.gameStarted && !this.state.gameOver;
    }
    if (!this.app.clientId) return false;
    return this.state.order?.[this.state.currentIndex] === this.app.clientId;
  }

  handleClick(e) {
    if (!this.state || !this.isMyTurn()) return;
    if (this.state.phase !== "WAITING_DICE" && this.state.phase !== "BUILD") return;

    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const hit = this.hitTest(x, y);
    if (hit == null) return;

    const ups = this.state.upgradeable || [];
    if (!ups.includes(hit) && !ups.includes(Number(hit))) return;

    this.app.sendMonopolyAction({ action: "upgrade", squareId: hit });
  }

  hitTest(x, y) {
    for (const q of this.cellQuads) {
      if (pointInQuad(x, y, q.pts)) return q.id;
    }
    return null;
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

  /**
   * 2.5D：矩形环绕格映射到透视梯形盘面
   * 底边 0-7，右边 8-13，顶边 14-21（右→左），左边 22-27（上→下）
   */
  layoutPerspective(W, H) {
    const pad = 36;
    const depth = 18; // 格子挤出厚度
    // 近端（底）宽，远端（顶）窄 → 透视
    const nearL = { x: pad + 20, y: H - pad };
    const nearR = { x: W - pad - 20, y: H - pad };
    const farL = { x: pad + W * 0.14, y: pad + 30 };
    const farR = { x: W - pad - W * 0.14, y: pad + 30 };

    const cols = 8;
    const rows = 8;

    const corner = (c, r) => {
      const u = c / cols;
      const v = r / rows;
      const top = lerp2(farL, farR, u);
      const bot = lerp2(nearL, nearR, u);
      return lerp2(top, bot, v);
    };

    const makeQuad = (c0, r0, c1, r1) => {
      const pts = [corner(c0, r0), corner(c1, r0), corner(c1, r1), corner(c0, r1)];
      const cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
      const cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
      return { pts, cx, cy };
    };

    const quads = [];
    // 底 0-7
    for (let i = 0; i < 8; i++) {
      quads.push({ id: i, ...makeQuad(i, 7, i + 1, 8) });
    }
    // 右 8-13
    for (let i = 0; i < 6; i++) {
      quads.push({ id: 8 + i, ...makeQuad(7, 6 - i, 8, 7 - i) });
    }
    // 顶 14-21 右→左
    for (let i = 0; i < 8; i++) {
      quads.push({ id: 14 + i, ...makeQuad(7 - i, 0, 8 - i, 1) });
    }
    // 左 22-27 上→下
    for (let i = 0; i < 6; i++) {
      quads.push({ id: 22 + i, ...makeQuad(0, 1 + i, 1, 2 + i) });
    }

    const center = {
      pts: [corner(1, 1), corner(7, 1), corner(7, 7), corner(1, 7)],
    };

    return { quads, center, depth, corner };
  }

  render() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    // 桌面氛围
    const bg = ctx.createRadialGradient(W * 0.5, H * 0.35, 40, W * 0.5, H * 0.55, W * 0.7);
    bg.addColorStop(0, "#3d6b4f");
    bg.addColorStop(0.55, "#2a4a38");
    bg.addColorStop(1, "#1a2e24");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 木纹桌边暗示
    ctx.strokeStyle = "rgba(139,90,43,0.35)";
    ctx.lineWidth = 14;
    ctx.strokeRect(10, 10, W - 20, H - 20);

    const { quads, center, depth } = this.layoutPerspective(W, H);
    this.cellQuads = quads;

    // 中心台面（略抬起）
    this.drawExtrudedQuad(center.pts, depth * 0.6, "#f3e6c0", "#d4b87a", "#c4a35a");
    this.drawCenterInfo(center.pts);

    // 格子（按 y 排序，远的先画）
    const board = this.state?.board || [];
    const sorted = [...quads].sort((a, b) => a.cy - b.cy);
    for (const q of sorted) {
      const sq = board[q.id];
      if (sq) this.drawSquare(q, sq, depth);
    }

    // 棋子（更靠前的后画）
    this.drawTokens(quads);
  }

  drawExtrudedQuad(pts, depth, topColor, sideColor, edgeColor) {
    const ctx = this.ctx;
    const lifted = pts.map((p) => ({ x: p.x, y: p.y - depth }));

    // 右侧面
    ctx.beginPath();
    ctx.moveTo(pts[1].x, pts[1].y);
    ctx.lineTo(lifted[1].x, lifted[1].y);
    ctx.lineTo(lifted[2].x, lifted[2].y);
    ctx.lineTo(pts[2].x, pts[2].y);
    ctx.closePath();
    ctx.fillStyle = sideColor;
    ctx.fill();

    // 底侧面
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.lineTo(lifted[1].x, lifted[1].y);
    ctx.lineTo(lifted[0].x, lifted[0].y);
    ctx.closePath();
    ctx.fillStyle = shade(sideColor, -20);
    ctx.fill();

    // 顶面
    ctx.beginPath();
    ctx.moveTo(lifted[0].x, lifted[0].y);
    ctx.lineTo(lifted[1].x, lifted[1].y);
    ctx.lineTo(lifted[2].x, lifted[2].y);
    ctx.lineTo(lifted[3].x, lifted[3].y);
    ctx.closePath();
    ctx.fillStyle = topColor;
    ctx.fill();
    ctx.strokeStyle = edgeColor;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    return lifted;
  }

  drawSquare(q, sq, depth) {
    const ctx = this.ctx;
    let top = "#fff8e7";
    if (sq.type === "start") top = "#ffe082";
    else if (sq.type === "jail") top = "#b0bec5";
    else if (sq.type === "goto_jail") top = "#ef9a9a";
    else if (sq.type === "parking") top = "#a5d6a7";
    else if (sq.type === "chance") top = "#e1bee7";
    else if (sq.type === "tax") top = "#ffcc80";
    else if (sq.type === "property") top = "#fffde7";

    const ups = this.state?.upgradeable || [];
    const highlight = this.isMyTurn() && ups.includes(sq.id);
    if (highlight) {
      const pulse = 0.5 + 0.5 * Math.sin(this.animT * 3);
      top = mixHex(top, "#ffeb3b", 0.25 + pulse * 0.25);
    }

    const lifted = this.drawExtrudedQuad(q.pts, depth, top, "#c4a882", "#8d6e4c");

    // 色带（顶面内侧）
    if (sq.type === "property" && sq.colorGroup) {
      const band = insetQuad(lifted, 0.08, 0.22);
      ctx.beginPath();
      pathQuad(ctx, band);
      ctx.fillStyle = GROUP_COLORS[sq.colorGroup] || "#888";
      ctx.fill();
    }

    // 业主角标
    const ownerId = this.state?.owners?.[String(sq.id)];
    if (ownerId && this.state.players[ownerId]) {
      const oc = COLOR_HEX[this.state.players[ownerId].color] || "#000";
      const p = lifted[1];
      ctx.beginPath();
      ctx.arc(p.x - 8, p.y + 10, 5, 0, Math.PI * 2);
      ctx.fillStyle = oc;
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 房屋 / 旅馆
    const lvl = Number(this.state?.buildings?.[String(sq.id)] || 0);
    if (lvl > 0) this.drawBuildings(lifted, lvl);

    // 文字
    const cx = (lifted[0].x + lifted[1].x + lifted[2].x + lifted[3].x) / 4;
    const cy = (lifted[0].y + lifted[1].y + lifted[2].y + lifted[3].y) / 4;
    ctx.fillStyle = "#333";
    ctx.textAlign = "center";
    ctx.font = "bold 11px 'Microsoft YaHei', sans-serif";
    const name = sq.name || "";
    if (name.length <= 3) ctx.fillText(name, cx, cy + 2);
    else {
      ctx.fillText(name.slice(0, 2), cx, cy - 5);
      ctx.fillText(name.slice(2), cx, cy + 8);
    }
    if (sq.type === "property" && sq.price) {
      ctx.font = "10px sans-serif";
      ctx.fillStyle = "#666";
      ctx.fillText(`$${sq.price}`, cx, cy + 20);
    }
  }

  drawBuildings(lifted, level) {
    const ctx = this.ctx;
    const base = {
      x: (lifted[0].x + lifted[3].x) / 2,
      y: (lifted[0].y + lifted[3].y) / 2,
    };
    const right = {
      x: (lifted[1].x + lifted[2].x) / 2,
      y: (lifted[1].y + lifted[2].y) / 2,
    };

    if (level >= 5) {
      // 旅馆：红色扁块
      const hx = (base.x + right.x) / 2;
      const hy = (base.y + right.y) / 2 - 6;
      this.drawBox(hx, hy, 18, 12, 10, "#c62828", "#8e0000");
      return;
    }

    for (let i = 0; i < level; i++) {
      const t = (i + 1) / (level + 1);
      const x = base.x + (right.x - base.x) * t;
      const y = base.y + (right.y - base.y) * t - 4;
      this.drawBox(x, y, 8, 7, 7, "#43a047", "#2e7d32");
    }
  }

  drawBox(x, y, w, h, d, top, side) {
    const ctx = this.ctx;
    // 顶
    ctx.fillStyle = top;
    ctx.fillRect(x - w / 2, y - h - d, w, h);
    // 前
    ctx.fillStyle = side;
    ctx.fillRect(x - w / 2, y - d, w, d);
    // 右
    ctx.fillStyle = shade(side, -25);
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y - h - d);
    ctx.lineTo(x + w / 2 + 4, y - h - d + 3);
    ctx.lineTo(x + w / 2 + 4, y - d + 3);
    ctx.lineTo(x + w / 2, y - d);
    ctx.closePath();
    ctx.fill();
  }

  drawCenterInfo(pts) {
    const ctx = this.ctx;
    const cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
    const cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4 - 10;

    ctx.fillStyle = "#5d4037";
    ctx.font = "bold 26px 'Microsoft YaHei', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("环球之旅 · 大富翁", cx, cy - 70);

    if (!this.state) return;

    const players = (this.state.order || []).map((id) => this.state.players[id]).filter(Boolean);
    ctx.font = "14px 'Microsoft YaHei', sans-serif";
    ctx.textAlign = "left";
    let py = cy - 40;
    const px = cx - 160;
    const actingId = this.app.getActingPlayerId?.() ?? this.app.clientId;

    for (const p of players) {
      ctx.fillStyle = COLOR_HEX[p.color] || "#333";
      const mine = p.id === actingId ? "（当前）" : "";
      const status = p.bankrupt ? "【破产】" : p.inJail ? "【监狱】" : "";
      const turnMark = this.state.turn === p.color && !this.state.gameOver ? " ▶" : "";
      ctx.fillText(
        `${COLOR_NAMES[p.color]}${mine}${turnMark}  $${p.money}  格${p.position} ${status}`,
        px,
        py,
      );
      py += 20;
    }

    ctx.fillStyle = "#4e342e";
    ctx.font = "12px 'Microsoft YaHei', sans-serif";
    this.wrapText(this.state.lastAction || "", px, py + 8, 320, 16);

    ctx.textAlign = "center";
    ctx.font = "bold 14px sans-serif";
    if (this.state.phase === "DECISION" && this.isMyTurn()) {
      ctx.fillStyle = "#c0392b";
      ctx.fillText("购买地产或跳过", cx, cy + 100);
    } else if (this.state.phase === "BUILD" && this.isMyTurn()) {
      ctx.fillStyle = "#1565c0";
      ctx.fillText("点击高亮地产盖房，或「结束盖房」", cx, cy + 100);
    } else if (this.state.phase === "WAITING_DICE" && this.isMyTurn() && !this.state.gameOver) {
      ctx.fillStyle = "#2e7d32";
      const canUp = (this.state.upgradeable || []).length > 0;
      ctx.fillText(canUp ? "可先点击高亮地产盖房，或掷骰子" : "点击「掷骰子」", cx, cy + 100);
    } else if (this.state.gameOver) {
      ctx.fillStyle = "#b71c1c";
      ctx.fillText(
        this.state.winner ? `${COLOR_NAMES[this.state.winner]} 获胜！` : "游戏结束",
        cx,
        cy + 100,
      );
    }
  }

  wrapText(text, x, y, maxWidth, lineHeight) {
    const ctx = this.ctx;
    let line = "";
    let yy = y;
    for (const ch of String(text)) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, yy);
        line = ch;
        yy += lineHeight;
      } else line = test;
    }
    if (line) ctx.fillText(line, x, yy);
  }

  drawTokens(quads) {
    if (!this.state?.players) return;
    const byPos = {};
    for (const id of this.state.order || []) {
      const p = this.state.players[id];
      if (!p || p.bankrupt) continue;
      if (!byPos[p.position]) byPos[p.position] = [];
      byPos[p.position].push(p);
    }

    const actingId = this.app.getActingPlayerId?.() ?? this.app.clientId;
    const entries = Object.entries(byPos).sort((a, b) => {
      const qa = quads.find((q) => q.id === Number(a[0]));
      const qb = quads.find((q) => q.id === Number(b[0]));
      return (qa?.cy || 0) - (qb?.cy || 0);
    });

    for (const [posStr, list] of entries) {
      const q = quads.find((r) => r.id === Number(posStr));
      if (!q) continue;
      const liftedY = 18;
      list.forEach((p, i) => {
        const ox = (i - (list.length - 1) / 2) * 16;
        const x = q.cx + ox;
        const y = q.cy - liftedY;
        const bob = p.id === actingId ? Math.sin(this.animT * 4) * 2 : 0;
        this.drawPawn(x, y + bob, COLOR_HEX[p.color] || "#333", p.id === actingId);
      });
    }
  }

  /** 立体人偶棋子：底座 + 身体 + 头 */
  drawPawn(x, y, color, active) {
    const ctx = this.ctx;
    // 阴影
    ctx.beginPath();
    ctx.ellipse(x, y + 14, 11, 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fill();

    // 底座
    ctx.fillStyle = shade(color, -35);
    ctx.beginPath();
    ctx.ellipse(x, y + 10, 9, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 身体（圆锥感：梯形）
    const bodyGrad = ctx.createLinearGradient(x - 8, y - 8, x + 8, y + 10);
    bodyGrad.addColorStop(0, shade(color, 25));
    bodyGrad.addColorStop(0.5, color);
    bodyGrad.addColorStop(1, shade(color, -30));
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(x - 7, y + 9);
    ctx.lineTo(x - 4, y - 6);
    ctx.quadraticCurveTo(x, y - 10, x + 4, y - 6);
    ctx.lineTo(x + 7, y + 9);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // 头
    const headGrad = ctx.createRadialGradient(x - 2, y - 14, 1, x, y - 12, 7);
    headGrad.addColorStop(0, shade(color, 40));
    headGrad.addColorStop(1, shade(color, -10));
    ctx.beginPath();
    ctx.arc(x, y - 12, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = headGrad;
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = active ? 2 : 1;
    ctx.stroke();

    if (active) {
      ctx.beginPath();
      ctx.arc(x, y - 4, 16, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}

function lerp2(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function pathQuad(ctx, pts) {
  ctx.moveTo(pts[0].x, pts[0].y);
  ctx.lineTo(pts[1].x, pts[1].y);
  ctx.lineTo(pts[2].x, pts[2].y);
  ctx.lineTo(pts[3].x, pts[3].y);
  ctx.closePath();
}

function insetQuad(pts, uInset, vInset) {
  // 简单向中心收缩
  const cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
  const cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
  return pts.map((p, i) => {
    // 顶边两条更贴边做色带：0-1 边多缩一点
    const t = i <= 1 ? vInset : uInset;
    return { x: p.x + (cx - p.x) * t, y: p.y + (cy - p.y) * t };
  });
}

function pointInQuad(x, y, pts) {
  return pointInTri(x, y, pts[0], pts[1], pts[2]) || pointInTri(x, y, pts[0], pts[2], pts[3]);
}

function pointInTri(px, py, a, b, c) {
  const v0x = c.x - a.x;
  const v0y = c.y - a.y;
  const v1x = b.x - a.x;
  const v1y = b.y - a.y;
  const v2x = px - a.x;
  const v2y = py - a.y;
  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;
  const inv = 1 / (dot00 * dot11 - dot01 * dot01 || 1);
  const u = (dot11 * dot02 - dot01 * dot12) * inv;
  const v = (dot00 * dot12 - dot01 * dot02) * inv;
  return u >= 0 && v >= 0 && u + v <= 1;
}

function shade(hex, amt) {
  const n = hex.replace("#", "");
  const num = parseInt(n.length === 3 ? n.split("").map((c) => c + c).join("") : n, 16);
  let r = (num >> 16) + amt;
  let g = ((num >> 8) & 0xff) + amt;
  let b = (num & 0xff) + amt;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 0xff;
  const ag = (pa >> 8) & 0xff;
  const ab = pa & 0xff;
  const br = (pb >> 16) & 0xff;
  const bg = (pb >> 8) & 0xff;
  const bb = pb & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0")}`;
}
