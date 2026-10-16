/**
 * MonopolyGameClient：客户端「大富翁 · 厦门」
 * - 渲染 40 格环形棋盘（Canvas，11×11 网格，经典大富翁布局）
 * - 渲染骰子、操作按钮、玩家资金面板、我的地产面板、行动日志（DOM）
 * - 只上报意图，所有判定以服务端广播的权威状态为准
 */

import { fitCanvas, onCanvasResize } from "../../core/canvasFit.js";

const CELL = 80;
const BOARD_PX = CELL * 11; // 880

const PLAYER_HEX = {
  red: "#F87171",
  blue: "#60A5FA",
  green: "#4ADE80",
  yellow: "#FBBF24",
};

const PLAYER_NAMES = {
  red: "红方",
  blue: "蓝方",
  green: "绿方",
  yellow: "黄方",
};

/** 侧边格竖排用的简称（避免字号过小） */
const SHORT_NAME = {
  厦门国际会展中心: "会展中心",
  方特梦幻王国: "方特",
  灵玲马戏城: "马戏城",
  厦门科技馆: "科技馆",
  国家电网厦门: "电网",
  厦门水务集团: "水务",
  湖里山炮台: "炮台",
  白城沙滩: "白城",
  集美学村: "学村",
  五通灯塔: "灯塔",
};

const CORNER_LABEL = {
  0: { big: "起", sub: "经过领 ¥200" },
  10: { big: "蔚", sub: "华蔚加班中" },
  20: { big: "停", sub: "免费停车" },
  30: { big: "班", sub: "去华蔚加班" },
};

/** 棋盘索引 → 11×11 网格坐标（经典大富翁：0 在右下角，逆时针） */
function gridOf(index) {
  if (index === 0) return [10, 10];
  if (index < 10) return [10, 10 - index];
  if (index === 10) return [10, 0];
  if (index < 20) return [10 - (index - 10), 0];
  if (index === 20) return [0, 0];
  if (index < 30) return [0, index - 20];
  if (index === 30) return [0, 10];
  return [index - 30, 10];
}

function wrapText(text, perLine) {
  const lines = [];
  for (let i = 0; i < text.length; i += perLine) lines.push(text.slice(i, i + perLine));
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export class MonopolyGameClient {
  constructor({ app, canvas, barEl, actionsEl, playersEl, ownEl, logEl }) {
    this.app = app;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.barEl = barEl;
    this.actionsEl = actionsEl;
    this.playersEl = playersEl;
    this.ownEl = ownEl;
    this.logEl = logEl;

    this.state = null;
    this._onActionClick = (e) => this._handleActionClick(e);
    this._unbindResize = null;
  }

  /* ==================== 生命周期 ==================== */

  initWithState(state) {
    this.state = state;
    this.actionsEl.addEventListener("click", this._onActionClick);
    this.ownEl.addEventListener("click", this._onActionClick);
    this._unbindResize = onCanvasResize(() => this.render());
    this.render();
    this.app.updatePlayerInfo();
  }

  destroy() {
    this.actionsEl.removeEventListener("click", this._onActionClick);
    this.ownEl.removeEventListener("click", this._onActionClick);
    this._unbindResize?.();
    this._unbindResize = null;
  }

  onMonopolyState(state) {
    if (!state) return;
    this.state = state;
    this.render();
    this.app.updatePlayerInfo();

    if (state.gameOver) {
      const winner = state.winner;
      this.app.addChatMessage(
        "系统",
        winner ? `${PLAYER_NAMES[winner] || winner}成为最后的赢家！` : "牌局结束",
        true,
      );
    }
  }

  onGameRestarted(data) {
    this.state = data.gameState;
    this.render();
    this.app.updatePlayerInfo();
  }

  onGameOver(data) {
    if (!this.state) return;
    this.state.gameOver = true;
    this.state.winner = data.winner || null;
    this.render();
    this.app.updatePlayerInfo();
    if (data.message) this.app.addChatMessage("系统", data.message, true);
  }

  /* ==================== 对外动作 ==================== */

  sendAction(payload) {
    this.app.sendMonopolyAction(payload);
  }

  myId() {
    return this.app.clientId;
  }

  me() {
    return this.state?.players?.[this.myId()] || null;
  }

  isMyTurn() {
    const s = this.state;
    if (!s || s.gameOver) return false;
    return s.order?.[s.currentIndex] === this.myId();
  }

  canRoll() {
    const s = this.state;
    if (!s || !this.isMyTurn() || s.pendingBuy) return false;
    return s.phase === "WAITING_ROLL" || (s.phase === "DECIDING" && s.extraRoll);
  }

  /* ==================== 渲染入口 ==================== */

  render() {
    this.renderBoard();
    this.renderBar();
    this.renderActions();
    this.renderPlayers();
    this.renderOwn();
    this.renderLog();
  }

  /* ==================== Canvas 棋盘 ==================== */

  renderBoard() {
    const ctx = this.ctx;

    // 位图对齐 CSS 显示尺寸 × dpr，保证像素级清晰（窗口缩放时自动跟随）
    fitCanvas(this.canvas, ctx, BOARD_PX, BOARD_PX);

    ctx.clearRect(0, 0, BOARD_PX, BOARD_PX);

    ctx.fillStyle = "#14171C";
    ctx.fillRect(0, 0, BOARD_PX, BOARD_PX);

    const board = this.state?.board;
    if (!board) return;

    board.forEach((cell) => this.drawCell(cell));
    this.drawCenter();
    this.drawPieces();
  }

  cellBg(cell) {
    switch (cell.type) {
      case "property":
        return "#1B2027";
      case "railroad":
        return "rgba(217,164,65,.10)";
      case "utility":
        return "rgba(96,165,250,.10)";
      case "chance":
        return "rgba(74,222,128,.09)";
      case "chest":
        return "rgba(251,191,36,.09)";
      case "tax":
        return "rgba(248,113,113,.09)";
      case "gotojail":
        return "rgba(248,113,113,.14)";
      case "jail":
        return "rgba(148,163,184,.10)";
      case "go":
        return "rgba(217,164,65,.14)";
      default:
        return "#191D24";
    }
  }

  drawCell(cell) {
    const ctx = this.ctx;
    const [row, col] = gridOf(cell.index);
    const x = col * CELL;
    const y = row * CELL;

    ctx.fillStyle = this.cellBg(cell);
    ctx.fillRect(x, y, CELL, CELL);
    ctx.strokeStyle = "rgba(255,255,255,.10)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);

    const info = this.state.properties?.[cell.index];
    const BAR = 10;

    // 顶部组色条（朝向棋盘外侧）
    if (cell.type === "property") {
      ctx.fillStyle = cell.groupHex || "#666";
      if (row === 0) ctx.fillRect(x, y + CELL - BAR, CELL, BAR);
      else if (row === 10) ctx.fillRect(x, y, CELL, BAR);
      else if (col === 0) ctx.fillRect(x + CELL - BAR, y, BAR, CELL);
      else if (col === 10) ctx.fillRect(x, y, BAR, CELL);
    }

    const isCorner = cell.index % 10 === 0;
    if (isCorner) this.drawCorner(cell, x, y);
    else this.drawLabel(cell, x, y);

    // 抵押标记
    if (info?.mortgaged) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = "#0E1013";
      ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      ctx.restore();
      ctx.fillStyle = "#F87171";
      ctx.font = "600 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("抵押", x + CELL / 2, y + CELL / 2);
    }

    // 房屋 / 旅馆
    if (info && info.houses > 0 && !info.mortgaged) this.drawHouses(info, x, y, row, col);

    // 所有权描边
    if (info?.ownerId && !info.mortgaged) {
      const owner = this.state.players[info.ownerId];
      const hex = owner ? PLAYER_HEX[owner.color] : "#999";
      ctx.strokeStyle = hex;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
    }
  }

  drawCorner(cell, x, y) {
    const ctx = this.ctx;
    const conf = CORNER_LABEL[cell.index] || { big: "?", sub: "" };

    ctx.fillStyle = "#D9A441";
    ctx.font = "700 26px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(conf.big, x + CELL / 2, y + CELL / 2 - 12);

    ctx.fillStyle = "#99A1AD";
    ctx.font = "9px system-ui, sans-serif";
    wrapText(conf.sub, 5).forEach((ln, i) => {
      ctx.fillText(ln, x + CELL / 2, y + CELL / 2 + 14 + i * 10);
    });

    if (cell.index === 30) {
      ctx.strokeStyle = "rgba(248,113,113,.5)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 3, y + 3, CELL - 6, CELL - 6);
    }
  }

  drawLabel(cell, x, y) {
    const ctx = this.ctx;
    const [row, col] = gridOf(cell.index);
    const BAR = 10;
    const isSide = (col === 0 || col === 10) && row !== 0 && row !== 10;

    if (isSide) {
      // 侧边格：名称竖排（贴外侧），价格横排于内侧底角
      const label = SHORT_NAME[cell.name] || cell.name;
      const chars = label.split("");
      const inner = col === 0 ? x + CELL - BAR : x + BAR;
      const cx = inner + (col === 0 ? -(CELL - BAR) / 2 : (CELL - BAR) / 2);
      const maxH = CELL - 16;
      const fs = Math.max(9, Math.min(13, maxH / chars.length));
      const lh = fs + 1.5;
      const startY = y + CELL / 2 - ((chars.length - 1) * lh) / 2;

      ctx.fillStyle = "#E7EAEF";
      ctx.font = `600 ${fs}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      chars.forEach((ch, i) => ctx.fillText(ch, cx, startY + i * lh));

      if (cell.price) {
        ctx.fillStyle = "#6B7280";
        ctx.font = "9px system-ui, sans-serif";
        ctx.fillText(String(cell.price), inner + (col === 0 ? -12 : 12), y + CELL - 10);
      }
      return;
    }

    // 上下边格：名称横排 + 价格
    const top = row === 0;
    const areaTop = top ? y + 6 : y + BAR + 6;
    const lines = wrapText(cell.name, 4);
    const lh = 12;
    const startY = areaTop + lh / 2;

    ctx.fillStyle = "#E7EAEF";
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    lines.forEach((ln, i) => ctx.fillText(ln, x + CELL / 2, startY + i * lh));

    if (cell.price) {
      ctx.fillStyle = "#D9A441";
      ctx.font = "600 10px system-ui, sans-serif";
      ctx.fillText(`¥${cell.price}`, x + CELL / 2, y + CELL - (top ? 14 : BAR + 12));
    }
  }

  drawHouses(info, x, y, row, col) {
    const ctx = this.ctx;
    const count = info.houses; // 1-4 房屋，5 旅馆
    const size = 7;

    // 房屋排列在内侧（朝向棋盘中心）
    const vertical = (col === 0 || col === 10) && row !== 0 && row !== 10;
    const cells = count === 5 ? 1 : count;
    const span = cells * (size + 3);
    const baseX = vertical ? x + CELL / 2 : x + CELL / 2 - span / 2 + size / 2;
    const baseY = vertical ? y + CELL / 2 - span / 2 + size / 2 : y + CELL / 2;

    for (let i = 0; i < cells; i++) {
      const w = count === 5 ? size * 2.2 : size;
      const h = size;
      const px = vertical ? baseX - w / 2 : baseX + i * (size + 3) - w / 2;
      const py = vertical ? baseY + i * (size + 3) - h / 2 : baseY - h / 2;
      ctx.fillStyle = count === 5 ? "#F87171" : "#4ADE80";
      ctx.fillRect(px, py, w, h);
      ctx.strokeStyle = "rgba(0,0,0,.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
    }
  }

  drawCenter() {
    const ctx = this.ctx;
    const s = this.state;
    const x = CELL + 8;
    const y = CELL + 8;
    const w = CELL * 9 - 16;
    const h = CELL * 9 - 16;

    ctx.fillStyle = "#101318";
    roundRect(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = "rgba(217,164,65,.18)";
    ctx.lineWidth = 1;
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 14);
    ctx.stroke();

    const cx = x + w / 2;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillStyle = "#D9A441";
    ctx.font = "700 32px system-ui, sans-serif";
    ctx.fillText("大富翁 · 厦门", cx, y + h / 2 - 96);

    ctx.fillStyle = "#6B7280";
    ctx.font = "14px system-ui, sans-serif";
    ctx.fillText("环岛 40 格 · 买地盖楼 · 最后存活者胜", cx, y + h / 2 - 60);

    // 当前回合玩家
    const cur = s.order?.[s.currentIndex];
    const curP = cur ? s.players[cur] : null;
    if (curP) {
      ctx.fillStyle = PLAYER_HEX[curP.color];
      ctx.beginPath();
      ctx.arc(cx - 58, y + h / 2 - 4, 9, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#E7EAEF";
      ctx.font = "600 20px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`轮到 ${PLAYER_NAMES[curP.color]}`, cx - 42, y + h / 2 - 4);
      ctx.textAlign = "center";
    }

    // 骰子
    if (s.dice) {
      const [d1, d2] = s.dice;
      const boxSize = 52;
      const gap = 16;
      const totalW = boxSize * 2 + gap;
      const bx = cx - totalW / 2;
      const by = y + h / 2 + 28;

      [d1, d2].forEach((val, i) => {
        const px = bx + i * (boxSize + gap);
        ctx.fillStyle = "#1D222A";
        roundRect(ctx, px, by, boxSize, boxSize, 8);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.12)";
        ctx.lineWidth = 1;
        roundRect(ctx, px + 0.5, by + 0.5, boxSize - 1, boxSize - 1, 8);
        ctx.stroke();

        // 使用 DOM 面板中的点位代替（这里仅显示数字，保证可读性）
        ctx.fillStyle = "#D9A441";
        ctx.font = "700 26px system-ui, sans-serif";
        ctx.fillText(String(val), px + boxSize / 2, by + boxSize / 2 + 1);
      });

      ctx.fillStyle = "#99A1AD";
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText(`合计 ${d1 + d2} 步${d1 === d2 ? "（双数可再掷）" : ""}`, cx, by + boxSize + 20);
    }

    // 最近动作
    if (s.lastAction) {
      ctx.fillStyle = "#99A1AD";
      ctx.font = "13px system-ui, sans-serif";
      const lines = wrapText(s.lastAction, 22).slice(-2);
      lines.forEach((ln, i) => {
        ctx.fillText(ln, cx, y + h - 74 + i * 20);
      });
    }

    if (s.gameOver) {
      ctx.fillStyle = "#D9A441";
      ctx.font = "700 22px system-ui, sans-serif";
      ctx.fillText(
        s.winner ? `${PLAYER_NAMES[s.winner] || s.winner}获胜` : "牌局结束",
        cx,
        y + h - 28,
      );
    }
  }

  drawPieces() {
    const ctx = this.ctx;
    const s = this.state;
    const alive = Object.values(s.players || {}).filter((p) => !p.bankrupt);
    const byPos = {};
    alive.forEach((p) => {
      (byPos[p.position] = byPos[p.position] || []).push(p);
    });

    Object.entries(byPos).forEach(([pos, list]) => {
      const idx = Number(pos);
      const [row, col] = gridOf(idx);
      const x = col * CELL;
      const y = row * CELL;
      const n = list.length;
      const vertical = col === 0 || col === 10;

      // 棋子落在格子靠内侧的区域，避免遮挡地名
      const inset = 24;
      const spacing = Math.min(16, (CELL - inset * 2) / Math.max(1, n - 1 || 1));

      list.forEach((p, i) => {
        const offset = (i - (n - 1) / 2) * spacing;
        const cx = vertical ? x + CELL / 2 + (col === 0 ? inset : -inset) : x + CELL / 2 + offset;
        const cy = vertical ? y + CELL / 2 + offset : y + CELL / 2 + (row === 0 ? inset : -inset);

        const isCurrent = s.order?.[s.currentIndex] === p.id;

        ctx.beginPath();
        ctx.fillStyle = PLAYER_HEX[p.color] || "#999";
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = isCurrent ? "#D9A441" : "rgba(0,0,0,.65)";
        ctx.lineWidth = isCurrent ? 3 : 2;
        ctx.stroke();

        if (p.inJail) {
          ctx.fillStyle = "#0E1013";
          ctx.font = "700 9px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("班", cx, cy + 0.5);
        }
      });
    });
  }

  /* ==================== DOM 面板 ==================== */

  renderBar() {
    const s = this.state;
    if (!s) return;

    const d = s.dice;
    const pipCls = d ? "mono-pip" : "mono-pip blank";
    this.barEl.innerHTML = `
      <span class="mono-dice">
        骰子
        <span class="${pipCls}">${d ? d[0] : "-"}</span>
        <span class="${pipCls}">${d ? d[1] : "-"}</span>
        ${d ? `<b style="color:var(--text)">${d[0] + d[1]}</b>` : ""}
      </span>
      <span class="tag ${s.gameOver ? "tag-over" : this.isMyTurn() ? "tag-live" : "tag-wait"}">
        ${s.gameOver ? "已结束" : !s.gameStarted ? "等待玩家" : this.isMyTurn() ? "你的回合" : "等待对手"}
      </span>
    `;
  }

  renderActions() {
    const s = this.state;
    if (!s) return;

    const btn = (action, label, cls = "btn", extra = "") =>
      `<button class="${cls}" type="button" data-action="${action}" ${extra}>${label}</button>`;

    const parts = [];

    if (s.gameOver) {
      parts.push('<span style="color:var(--text-3);font-size:.8125rem">本局已结束，可点击「重新开始」</span>');
    } else if (!s.gameStarted) {
      parts.push('<span style="color:var(--text-3);font-size:.8125rem">等待更多玩家加入（至少 2 人）</span>');
    } else {
      const me = this.me();
      const myTurn = this.isMyTurn();

      if (myTurn && s.pendingBuy) {
        const cell = s.board[s.pendingBuy.cellIndex];
        parts.push(btn("buy", `买入「${cell.name}」¥${cell.price}`, "btn btn-solid"));
        parts.push(btn("end_turn", "放弃购买"));
      } else {
        if (this.canRoll()) {
          parts.push(btn("roll", "掷骰子", "btn btn-solid"));
        }
        if (myTurn && !s.pendingBuy) {
          parts.push(btn("end_turn", "结束回合"));
        }
      }

      if (myTurn && me?.inJail) {
        if (me.jailCards > 0) parts.push(btn("use_jail_card", `使用请假条（${me.jailCards}）`));
        parts.push(btn("pay_bail", "交加班费 ¥50 下班"));
      }

      if (!myTurn) {
        parts.push(
          `<span style="color:var(--text-3);font-size:.8125rem">${
            s.phase === "DECIDING" ? "等待对手操作…" : "等待对手掷骰…"
          }</span>`,
        );
      }
    }

    this.actionsEl.innerHTML = parts.join("");
  }

  renderPlayers() {
    const s = this.state;
    if (!s) return;

    const rows = Object.values(s.players).map((p) => {
      const isCur = s.order?.[s.currentIndex] === p.id;
      const tags = [];
      if (p.id === this.myId()) tags.push("你");
      if (p.inJail) tags.push("加班中");
      if (p.jailCards > 0) tags.push(`请假条×${p.jailCards}`);
      if (p.bankrupt) tags.push("已出局");

      const cellName = s.board?.[p.position]?.name || "—";

      return `
        <div class="mono-p ${isCur ? "turn" : ""} ${p.bankrupt ? "out" : ""}">
          <span class="sw" style="background:${PLAYER_HEX[p.color] || "#999"}"></span>
          <span class="who">${PLAYER_NAMES[p.color] || p.color}${tags.length ? ` · ${tags.join(" ")}` : ""}<br><small style="color:var(--text-3)">${cellName}</small></span>
          <span class="cash">¥${p.cash}</span>
        </div>
      `;
    });

    this.playersEl.innerHTML = rows.join("");
  }

  renderOwn() {
    const s = this.state;
    if (!s) return;

    const myProps = Object.values(s.properties || {})
      .filter((info) => info.ownerId === this.myId())
      .map((info) => ({ info, cell: s.board[info.cellIndex] }));

    if (!myProps.length) {
      this.ownEl.innerHTML =
        '<span style="color:var(--text-3);font-size:.75rem">你还没有地产，掷骰走格踩到空地即可购买</span>';
      return;
    }

    const canOperate = this.isMyTurn() && !s.gameOver;

    this.ownEl.innerHTML = myProps
      .map(({ info, cell }) => {
        const owned = Object.values(s.properties).filter(
          (x) => x.ownerId === this.myId() && s.board[x.cellIndex]?.group === cell.group,
        ).length;
        const groupTotal = s.board.filter(
          (c) => c.type === "property" && c.group === cell.group,
        ).length;
        const monopoly = owned === groupTotal;

        const ops = [];
        if (canOperate) {
          if (info.mortgaged) {
            ops.push(
              `<button class="btn btn-sm" type="button" data-action="unmortgage" data-cell="${cell.index}">赎回</button>`,
            );
          } else {
            if (cell.type === "property" && monopoly && info.houses < 5) {
              ops.push(
                `<button class="btn btn-sm" type="button" data-action="build" data-cell="${cell.index}">盖房 ¥${cell.houseCost}</button>`,
              );
            }
            if (cell.type === "property" && info.houses > 0) {
              ops.push(
                `<button class="btn btn-sm" type="button" data-action="sell_house" data-cell="${cell.index}">卖房</button>`,
              );
            }
            if (info.houses === 0) {
              ops.push(
                `<button class="btn btn-sm" type="button" data-action="mortgage" data-cell="${cell.index}">抵押 ¥${Math.floor(cell.price / 2)}</button>`,
              );
            }
          }
        }

        const houseText =
          cell.type === "property"
            ? info.houses === 5
              ? "旅馆"
              : info.houses > 0
                ? `${info.houses} 栋`
                : "空地"
            : cell.type === "railroad"
              ? "码头"
              : "公用";

        return `
          <div class="own-row ${info.mortgaged ? "mortgaged" : ""}">
            <span class="own-dot" style="background:${cell.groupHex || "#8A94A3"}"></span>
            <span class="own-name">${cell.name}<small>${houseText}${monopoly ? " · 垄断" : ""}${info.mortgaged ? " · 已抵押" : ""}</small></span>
            <span class="own-ops">${ops.join("")}</span>
          </div>
        `;
      })
      .join("");
  }

  renderLog() {
    const s = this.state;
    if (!s) return;
    const lines = (s.log || []).slice(-30);
    this.logEl.innerHTML = lines.map((t) => `<div>${this.escape(t)}</div>`).join("");
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  escape(text) {
    return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }

  _handleActionClick(e) {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    const cellIndex = el.dataset.cell !== undefined ? Number(el.dataset.cell) : undefined;

    this.app.playSound(action === "roll" ? "select" : "move");
    this.sendAction(cellIndex === undefined ? { action } : { action, cellIndex });
  }
}
