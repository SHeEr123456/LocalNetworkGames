/**
 * FlyingGameClient：客户端飞行棋 - 按照新矩阵重构
 * 
 * 棋盘布局：
 * 000 = 空白
 * 001-056 = 主路径（按绿、黄、蓝、红循环着色）
 * 1xx = 黄色区域（100基地，101起飞点，110-150终点通道，111终点）
 * 2xx = 蓝色区域（200基地，201起飞点，210-250终点通道，222终点）
 * 3xx = 红色区域（300基地，301起飞点，310-350终点通道，333终点）
 * 4xx = 绿色区域（400基地，401起飞点，410-450终点通道，444终点）
 * 555 = 中心区域
 */

import { fitCanvas, onCanvasResize } from "../../core/canvasFit.js";

// 游戏状态枚举
const GAME_PHASE = {
  WAITING_DICE: "WAITING_DICE",
  SELECTING_PLANE: "SELECTING_PLANE",
  MOVING: "MOVING",
  GAME_OVER: "GAME_OVER",
};

// 棋盘布局（15x15）- 按照提供的矩阵
const BOARD_LAYOUT = [
  [0,0,0,0,8,9,10,11,12,13,14,201,0,0,0],
  [0,100,100,0,7,0,0,210,0,0,15,0,200,200,0],
  [0,100,100,0,6,0,0,220,0,0,16,0,200,200,0],
  [101,0,0,0,5,0,0,230,0,0,17,0,0,0,0],
  [1,2,3,4,0,0,0,240,0,0,0,18,19,20,21],
  [52,0,0,0,0,0,0,250,0,0,0,0,0,0,22],
  [51,0,0,0,0,0,555,222,555,0,0,0,0,0,23],
  [50,110,120,130,140,150,111,555,333,350,340,330,320,310,24],
  [49,0,0,0,0,0,555,444,555,0,0,0,0,0,25],
  [48,0,0,0,0,0,0,450,0,0,0,0,0,0,26],
  [47,46,45,44,0,0,0,440,0,0,0,30,29,28,27],
  [0,0,0,0,43,0,0,430,0,0,31,0,0,0,301],
  [0,400,400,0,42,0,0,420,0,0,32,0,300,300,0],
  [0,400,400,0,41,0,0,410,0,0,33,0,300,300,0],
  [0,0,0,401,40,39,38,37,36,35,34,0,0,0,0]
];

export class FlyingGameClient {
  constructor({ app, canvas }) {
    this.app = app;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.state = null;
    this._unbindResize = null;
    
    // 骰子动画（已移除，不再需要）
    // this.diceAnimation = { ... };

    this._onClick = (e) => this.handleClick(e);
    
    // 棋盘配置（配色与平台暗色主题协调：降低饱和度，提高在深色底上的可读性）
    this.boardConfig = {
      cellSize: 50,
      layout: BOARD_LAYOUT,
      colors: {
        yellow: "#E5B84A",
        blue: "#4F8FE8",
        red: "#E05C55",
        green: "#4FB477",
      },
    };
    
    // 生成主路径颜色映射（001-056）
    this.mainPathColors = this.generateMainPathColors();
  }
  
  generateMainPathColors() {
    const colors = {};
    const colorCycle = ["green", "yellow", "blue", "red"]; // 001是绿色
    
    for (let i = 1; i <= 52; i++) {
      colors[i] = colorCycle[(i - 1) % 4];
    }
    
    return colors;
  }

  initWithState(state) {
    this.state = state;
    this.canvas.addEventListener("click", this._onClick);
    this._unbindResize = onCanvasResize(() => this.render());
    this.render();
  }

  destroy() {
    this.canvas.removeEventListener("click", this._onClick);
    this._unbindResize?.();
    this._unbindResize = null;
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
    this.state = this.state || {};
    this.state.gameOver = true;
    this.state.winner = data.winner || null;
    this.state.phase = GAME_PHASE.GAME_OVER;
    this.render();
    this.app.updatePlayerInfo();
    if (data.message) this.app.addChatMessage("系统", data.message, true);
  }

  onFlyingState(nextState) {
    const oldDice = this.state?.dice;
    const newDice = nextState?.dice;
    
    console.log('[飞行棋客户端] 收到状态更新:', {
      oldDice,
      newDice,
      phase: nextState.phase,
      turn: nextState.turn
    });
    
    // 检测到新骰子值时播放GIF动画（不论点数，只要有变化就播放）
    if (newDice !== null && newDice !== undefined && newDice !== oldDice) {
      console.log('[飞行棋客户端] 触发骰子动画:', newDice);
      this.showDiceAnimation(newDice);
      
      // 在聊天区域显示掷骰子结果
      const colorNames = {
        yellow: "黄方",
        blue: "蓝方",
        red: "红方",
        green: "绿方",
      };
      const playerColor = nextState.turn;
      const playerName = colorNames[playerColor] || "玩家";
      this.app.addChatMessage("游戏", `${playerName} 掷出 ${newDice} 点`, true);
    }
    
    this.state = nextState;
    this.render();
    
    // 将其他游戏信息输出到棋谱记录（排除掷骰子信息，因为已经单独处理）
    if (nextState.lastAction && !nextState.lastAction.includes("掷出")) {
      this.app.addChatMessage("游戏", nextState.lastAction, true);
    }

    if (this.state?.gameOver) {
      const winner = this.state.winner;
      if (winner) {
        const map = { yellow: "黄方胜利！", blue: "蓝方胜利！", red: "红方胜利！", green: "绿方胜利！" };
        const text = map[winner] || "有玩家获胜！";
        this.app.addChatMessage("系统", text, true);
      }
    }
  }
  
  /**
   * 掷骰子弹窗：用 DOM + CSS 自绘骰子点数，不依赖任何外部图片资源
   * （原实现引用 ./gif/<点数>.gif，仓库中并无该目录，必然 404 后降级为文字）
   */
  showDiceAnimation(diceValue) {
    const existing = document.querySelector(".dice-overlay");
    if (existing) existing.remove();

    // 1-6 点在 3x3 网格中的位置索引
    const PIP_LAYOUT = {
      1: [4],
      2: [0, 8],
      3: [0, 4, 8],
      4: [0, 2, 6, 8],
      5: [0, 2, 4, 6, 8],
      6: [0, 2, 3, 5, 6, 8],
    };
    const pips = PIP_LAYOUT[diceValue] || [];

    const overlay = document.createElement("div");
    overlay.className = "dice-overlay";

    const dice = document.createElement("div");
    dice.className = "dice rolling";

    for (let i = 0; i < 9; i++) {
      const cell = document.createElement("span");
      cell.className = "dice-cell";
      if (pips.includes(i)) cell.classList.add("pip");
      dice.appendChild(cell);
    }

    overlay.appendChild(dice);
    document.body.appendChild(overlay);

    // 短暂滚动动画后定格到实际点数
    setTimeout(() => dice.classList.remove("rolling"), 600);
    setTimeout(() => {
      if (document.body.contains(overlay)) overlay.remove();
    }, 1800);
  }
  
  handleClick(e) {
    if (!this.state || this.app.gameType !== "flying") return;
    
    const rect = this.canvas.getBoundingClientRect();
    // 画布按显示尺寸做高清重绘，需换算回 15×cellSize 的逻辑坐标再做命中判定
    const VIEW = 15 * this.boardConfig.cellSize;
    const cssW = this.canvas.clientWidth || rect.width || VIEW;
    const scale = VIEW / cssW;
    const x = (e.clientX - rect.left) * scale;
    const y = (e.clientY - rect.top) * scale;
    
    // 检查是否点击了棋子
    if (this.state.phase !== GAME_PHASE.SELECTING_PLANE || !this.state.dice) {
      return;
    }
    
    const currentPlayerId = this.state.order?.[this.state.currentIndex];
    if (currentPlayerId !== this.app.clientId) {
      return;
    }

    const hits = this.computeHitAreas();
    const myId = this.app.clientId;
    let picked = null;
    hits.forEach((h) => {
      if (h.ownerId !== myId) return;
      const dist = Math.hypot(h.x - x, h.y - y);
      if (dist <= h.r) picked = h;
    });

    if (picked) {
      this.app.sendFlyingAction({ action: "move", pieceIndex: picked.pieceIndex });
    }
  }

  getPiecePosition(piece, color, pieceIndex) {
    const { cellSize } = this.boardConfig;
    const board = this.state?.board;
    
    if (piece.position === "home") {
      if (!board || !board.basePositions) return { x: 0, y: 0 };
      const baseCoords = board.basePositions[color];
      if (!baseCoords || pieceIndex >= baseCoords.length) return { x: 0, y: 0 };
      
      const coord = baseCoords[pieceIndex];
      return {
        x: coord[1] * cellSize + cellSize / 2,
        y: coord[0] * cellSize + cellSize / 2,
      };
    } else if (piece.position === "track" || piece.position === "finished") {
      if (piece.row >= 0 && piece.col >= 0) {
        return {
          x: piece.col * cellSize + cellSize / 2,
          y: piece.row * cellSize + cellSize / 2,
        };
      }
    }
    
    return { x: 0, y: 0 };
  }

  computeHitAreas() {
    const areas = [];
    if (!this.state || !this.state.players) return areas;

    Object.values(this.state.players).forEach((p) => {
      p.pieces.forEach((piece, idx) => {
        if (piece.position === "finished") return;
        
        const pos = this.getPiecePosition(piece, p.color, idx);
        
        areas.push({
          ownerId: p.id,
          pieceIndex: idx,
          x: pos.x,
          y: pos.y,
          r: this.boardConfig.cellSize * 0.3,
        });
      });
    });

    return areas;
  }

  render() {
    const ctx = this.ctx;
    const { cellSize } = this.boardConfig;
    const VIEW = 15 * cellSize; // 750：逻辑坐标系边长

    // 位图对齐 CSS 显示尺寸 × dpr，保证像素级清晰
    fitCanvas(this.canvas, ctx, VIEW, VIEW);
    
    ctx.clearRect(0, 0, VIEW, VIEW);

    // 背景：暗色石板（与平台视觉一致）
    ctx.fillStyle = "#14171C";
    ctx.fillRect(0, 0, VIEW, VIEW);

    const state = this.state || {};
    const players = state.players || {};

    this.drawBoard(ctx);
    this.drawPieces(ctx, players);
  }
  
  drawBoard(ctx) {
    const { cellSize, layout, colors } = this.boardConfig;
    const rows = layout.length;
    const cols = layout[0].length;
    
    // 绘制网格
    ctx.strokeStyle = "rgba(255,255,255,.05)";
    ctx.lineWidth = 1;
    
    for (let i = 0; i <= cols; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cellSize, 0);
      ctx.lineTo(i * cellSize, rows * cellSize);
      ctx.stroke();
    }
    
    for (let i = 0; i <= rows; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * cellSize);
      ctx.lineTo(cols * cellSize, i * cellSize);
      ctx.stroke();
    }
    
    // 绘制格子
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cellNum = layout[row][col];
        const x = col * cellSize;
        const y = row * cellSize;
        
        if (cellNum === 0) {
          // 空白格子
          continue;
        } else if (cellNum >= 1 && cellNum <= 52) {
          // 主路径（001-052）
          const cellColor = this.mainPathColors[cellNum];
          ctx.fillStyle = colors[cellColor] + "3A";
          ctx.strokeStyle = colors[cellColor];
          ctx.lineWidth = 2;
          ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
          ctx.strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
        } else if (cellNum >= 100 && cellNum < 200) {
          // 黄色区域
          this.drawColorCell(ctx, x, y, cellSize, cellNum, "yellow");
        } else if (cellNum >= 200 && cellNum < 300) {
          // 蓝色区域
          this.drawColorCell(ctx, x, y, cellSize, cellNum, "blue");
        } else if (cellNum >= 300 && cellNum < 400) {
          // 红色区域
          this.drawColorCell(ctx, x, y, cellSize, cellNum, "red");
        } else if (cellNum >= 400 && cellNum < 500) {
          // 绿色区域
          this.drawColorCell(ctx, x, y, cellSize, cellNum, "green");
        } else if (cellNum === 555) {
          // 中心区域
          ctx.fillStyle = "#1A1E24";
          ctx.fillRect(x, y, cellSize, cellSize);
        }
      }
    }
  }
  
  drawColorCell(ctx, x, y, cellSize, cellNum, color) {
    const { colors } = this.boardConfig;
    const colorHex = colors[color];
    
    if (cellNum % 100 === 0) {
      // 基地（x00）
      ctx.fillStyle = colorHex + "2A";
      ctx.strokeStyle = colorHex;
      ctx.lineWidth = 3;
      ctx.fillRect(x, y, cellSize, cellSize);
      ctx.strokeRect(x, y, cellSize, cellSize);
    } else if (cellNum % 100 === 1) {
      // 起飞点（x01）
      ctx.fillStyle = colorHex + "55";
      ctx.strokeStyle = colorHex;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#fff";
      ctx.font = "bold 14px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("起", x + cellSize / 2, y + cellSize / 2);
    } else if (cellNum % 100 >= 10 && cellNum % 100 <= 50) {
      // 终点通道（x10-x50）
      ctx.fillStyle = colorHex + "5A";
      ctx.strokeStyle = colorHex;
      ctx.lineWidth = 2;
      ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
      ctx.strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
    } else if (cellNum === 111 || cellNum === 222 || cellNum === 333 || cellNum === 444) {
      // 终点
      ctx.fillStyle = colorHex;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      ctx.fillStyle = "#fff";
      ctx.font = "bold 18px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("终", x + cellSize / 2, y + cellSize / 2);
    }
  }
  
  drawPieces(ctx, players) {
    const { cellSize, colors } = this.boardConfig;
    const areas = this.computeHitAreas();
    
    areas.forEach((hArea) => {
      const player = players[hArea.ownerId];
      if (!player) return;
      
      const color = colors[player.color] || "#666";
      
      ctx.save();
      ctx.translate(hArea.x, hArea.y);
      
      ctx.fillStyle = color;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      
      ctx.beginPath();
      ctx.arc(0, 0, cellSize * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      // 高亮可移动的棋子
      if (this.state?.phase === GAME_PHASE.SELECTING_PLANE && 
          this.state?.dice &&
          this.state?.canMovePlanes &&
          this.state.canMovePlanes.includes(hArea.pieceIndex) &&
          hArea.ownerId === this.app.clientId) {
        ctx.strokeStyle = "#D9A441";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, cellSize * 0.35, 0, Math.PI * 2);
        ctx.stroke();
      }
      
      ctx.restore();
    });
    
    // 绘制已完成的棋子
    Object.values(players).forEach((player) => {
      player.pieces.forEach((piece, idx) => {
        if (piece.position === "finished" && piece.row >= 0 && piece.col >= 0) {
          const x = piece.col * cellSize + cellSize / 2;
          const y = piece.row * cellSize + cellSize / 2;
          
          ctx.save();
          ctx.translate(x, y);
          
          ctx.fillStyle = colors[player.color] || "#666";
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          
          ctx.beginPath();
          ctx.arc(0, 0, cellSize * 0.25, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          
          ctx.restore();
        }
      });
    });
  }
}
