/**
 * FlyingGameClient：客户端飞行棋 - 16x15格子布局
 * 
 * 棋盘布局：
 * 0 = 空白
 * 1 = 路径（普通格子）
 * 2 = 终点通道
 * 3 = 基地
 * 4 = 起飞点（掷6点起飞的地方）
 * 5 = 跳跃点（可以跳到下一个6的位置）
 * 6 = 跳跃目标点
 * 8 = 红色终点
 * 9 = 黄色终点
 * 10 = 蓝色终点
 * 11 = 绿色终点
 */

// 游戏状态枚举 - 与服务端保持一致
const GAME_PHASE = {
  WAITING_DICE: "WAITING_DICE",
  SELECTING_PLANE: "SELECTING_PLANE",
  MOVING: "MOVING",
  ANIMATING: "ANIMATING",
  CHECKING_EVENTS: "CHECKING_EVENTS",
  NEXT_PLAYER: "NEXT_PLAYER",
  GAME_OVER: "GAME_OVER",
};

// 棋盘布局（15x15）
const BOARD_LAYOUT = [
  [0,0,0,0,1,1,1,1,1,1,1,4,0,0,0],
  [0,3,3,0,1,0,0,1,0,0,1,0,3,3,0],
  [0,3,3,0,1,0,0,1,0,0,1,0,3,3,0],
  [4,0,0,0,95,0,0,1,0,0,96,0,0,0,0],
  [1,1,1,116,1,0,0,1,0,0,1,85,1,1,1],
  [1,0,0,0,0,0,0,1,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,2,10,2,0,0,0,0,0,1],
  [1,1,1,1,1,1,8,2,11,1,1,1,1,1,1],
  [1,0,0,0,0,0,2,9,2,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,1,0,0,0,0,0,0,1],
  [1,1,1,115,1,0,0,1,0,0,1,86,1,1,1],
  [0,0,0,0,106,0,0,1,0,0,105,0,0,0,4],
  [0,3,3,0,1,0,0,1,0,0,1,0,3,3,0],
  [0,3,3,0,1,0,0,1,0,0,1,0,3,3,0],
  [0,0,0,4,1,1,1,1,1,1,1,0,0,0,0],
];

// 跳跃点颜色映射（根据位置判断属于哪个颜色）
// 黄色：跳跃点95，目标点96
// 红色：跳跃点85，目标点86
// 蓝色：跳跃点105，目标点106
// 绿色：跳跃点115，目标点116
const JUMP_POINT_COLORS = {
  '3,4': 'yellow',   // 黄色跳跃点 (95)
  '4,11': 'red',     // 红色跳跃点 (85)
  '11,10': 'blue',   // 蓝色跳跃点 (105)
  '10,3': 'green',   // 绿色跳跃点 (115)
};

const JUMP_TARGET_COLORS = {
  '3,10': 'yellow',  // 黄色目标点 (96)
  '4,11': 'red',     // 红色目标点 (86)
  '11,10': 'blue',   // 蓝色目标点 (106)
  '4,3': 'green',    // 绿色目标点 (116)
};

export class FlyingGameClient {
  constructor({ app, canvas }) {
    this.app = app;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    this.state = null;
    
    // 骰子动画相关
    this.diceAnimation = {
      isAnimating: false,
      currentValue: null,
      rotation: 0,
      animationStartTime: 0,
      duration: 800,
    };

    this._onClick = (e) => this.handleClick(e);
    
    // 棋盘布局参数
    this.boardConfig = {
      cellSize: 50,
      gridSize: 16,
      layout: BOARD_LAYOUT,
      colors: {
        red: "#ff4d4f",
        yellow: "#faad14",
        blue: "#1890ff",
        green: "#52c41a",
      },
    };
  }

  initWithState(state) {
    this.state = state;
    this.canvas.addEventListener("click", this._onClick);
    this.render();
  }

  destroy() {
    this.canvas.removeEventListener("click", this._onClick);
  }

  onGameRestarted(data) {
    this.state = data.gameState;
    this.render();
    this.app.updatePlayerInfo();
  }

  onFlyingState(nextState) {
    const oldPhase = this.state?.phase;
    const newPhase = nextState?.phase;
    const oldDice = this.state?.dice;
    const newDice = nextState?.dice;
    
    if (oldPhase !== newPhase) {
      console.log(`[客户端] 状态转换: ${oldPhase || "初始"} -> ${newPhase}`);
    }
    
    // 检测到新骰子值时启动动画
    if (newDice && newDice !== oldDice && newPhase === GAME_PHASE.SELECTING_PLANE) {
      this.startDiceAnimation(newDice);
    }
    
    if (nextState?.turn) {
      const colorNames = { red: "红方", yellow: "黄方", blue: "蓝方", green: "绿方" };
      console.log(`[客户端] 当前回合: ${colorNames[nextState.turn] || nextState.turn}`);
    }
    
    if (nextState?.lastAction) {
      console.log(`[客户端] ${nextState.lastAction}`);
    }
    
    this.state = nextState;
    this.render();

    if (this.state?.gameOver) {
      const winner = this.state.winner;
      let text = "游戏结束";
      if (winner) {
        const map = { red: "红方胜利！", yellow: "黄方胜利！", blue: "蓝方胜利！", green: "绿方胜利！" };
        text = map[winner] || "有玩家获胜！";
      }
      console.log(`[客户端] 🎉 ${text}`);
      this.app.addChatMessage("系统", text, true);
    }
  }
  
  /**
   * 启动骰子动画
   */
  startDiceAnimation(finalValue) {
    this.diceAnimation.isAnimating = true;
    this.diceAnimation.currentValue = null;
    this.diceAnimation.rotation = 0;
    this.diceAnimation.animationStartTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - this.diceAnimation.animationStartTime;
      const progress = Math.min(elapsed / this.diceAnimation.duration, 1);
      
      this.diceAnimation.rotation = progress * 360 * 3;
      
      if (progress < 0.9) {
        this.diceAnimation.currentValue = Math.floor(Math.random() * 6) + 1;
      } else {
        this.diceAnimation.currentValue = finalValue;
      }
      
      this.render();
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.diceAnimation.isAnimating = false;
        this.diceAnimation.currentValue = finalValue;
        this.render();
      }
    };
    
    animate();
  }

  handleClick(e) {
    if (!this.state || this.app.gameType !== "flying") return;
    
    if (this.state.phase !== GAME_PHASE.SELECTING_PLANE || !this.state.dice) {
      console.log(`[客户端] 当前状态 ${this.state.phase} 不允许选择棋子`);
      return;
    }
    
    const currentPlayerId = this.state.order?.[this.state.currentIndex];
    if (currentPlayerId !== this.app.clientId) {
      console.log(`[客户端] 还没轮到你行动`);
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hits = this.computeHitAreas();
    const myId = this.app.clientId;
    let picked = null;
    hits.forEach((h) => {
      if (h.ownerId !== myId) return;
      const dist = Math.hypot(h.x - x, h.y - y);
      if (dist <= h.r) picked = h;
    });

    if (picked) {
      console.log(`[客户端] 选择移动第 ${picked.pieceIndex + 1} 枚棋子`);
      this.app.sendFlyingAction({ action: "move", pieceIndex: picked.pieceIndex });
    }
  }

  /**
   * 获取棋子的屏幕坐标
   */
  getPiecePosition(piece, color, pieceIndex) {
    const { cellSize, layout } = this.boardConfig;
    const board = this.state?.board;
    
    if (piece.position === "home") {
      // 在基地
      if (!board || !board.basePositions) return { x: 0, y: 0 };
      const baseCoords = board.basePositions[color];
      if (!baseCoords || pieceIndex >= baseCoords.length) return { x: 0, y: 0 };
      
      const coord = baseCoords[pieceIndex];
      return {
        x: coord[1] * cellSize + cellSize / 2,
        y: coord[0] * cellSize + cellSize / 2,
      };
    } else if (piece.position === "track" || piece.position === "end_path" || piece.position === "finished") {
      // 在跑道上、终点通道或已完成
      if (piece.row >= 0 && piece.col >= 0) {
        return {
          x: piece.col * cellSize + cellSize / 2,
          y: piece.row * cellSize + cellSize / 2,
        };
      }
    }
    
    return { x: 0, y: 0 };
  }

  /**
   * 计算可点击区域
   */
  computeHitAreas() {
    const areas = [];
    if (!this.state || !this.state.players) return areas;

    Object.values(this.state.players).forEach((p) => {
      p.pieces.forEach((piece, idx) => {
        if (piece.position === "finished") return; // 已完成的棋子不显示
        
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

  /**
   * 主渲染函数
   */
  render() {
    const ctx = this.ctx;
    const canvas = this.canvas;
    const { cellSize, gridSize } = this.boardConfig;
    
    // 设置画布大小
    canvas.width = 15 * cellSize;
    canvas.height = 16 * cellSize;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 背景
    ctx.fillStyle = "#fef8e8";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const state = this.state || {};
    const players = state.players || {};

    // 绘制棋盘元素
    this.drawBoard(ctx);
    this.drawPieces(ctx, players);
    this.drawDice(ctx);
    this.drawInfoPanel(ctx, state);
  }
  
  /**
   * 绘制棋盘
   */
  drawBoard(ctx) {
    const { cellSize, layout, colors } = this.boardConfig;
    const rows = layout.length;
    const cols = layout[0].length;
    
    // 绘制网格
    ctx.strokeStyle = "#ddd";
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
        const cellType = layout[row][col];
        const x = col * cellSize;
        const y = row * cellSize;
        const key = `${row},${col}`;
        
        switch (cellType) {
          case 0: // 空白
            break;
            
          case 1: // 路径
            ctx.fillStyle = "#fff";
            ctx.strokeStyle = "#999";
            ctx.lineWidth = 1;
            ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
            ctx.strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
            break;
            
          case 2: // 终点通道
            ctx.fillStyle = "#ffe0b2";
            ctx.strokeStyle = "#ff9800";
            ctx.lineWidth = 2;
            ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
            ctx.strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
            break;
            
          case 3: // 基地
            // 基地由颜色区域绘制
            break;
            
          case 4: // 起飞点
            ctx.fillStyle = "#e3f2fd";
            ctx.strokeStyle = "#2196f3";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize * 0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            break;
            
          case 85: // 红色跳跃点
            ctx.fillStyle = colors.red + '60';
            ctx.strokeStyle = colors.red;
            ctx.lineWidth = 3;
            const redSize = cellSize * 0.35;
            ctx.beginPath();
            ctx.moveTo(x + cellSize / 2, y + cellSize / 2 - redSize);
            ctx.lineTo(x + cellSize / 2 - redSize, y + cellSize / 2 + redSize);
            ctx.lineTo(x + cellSize / 2 + redSize, y + cellSize / 2 + redSize);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('红', x + cellSize / 2, y + cellSize / 2);
            break;
            
          case 86: // 红色目标点
            ctx.fillStyle = colors.red + '40';
            ctx.strokeStyle = colors.red;
            ctx.lineWidth = 3;
            ctx.fillRect(x + 5, y + 5, cellSize - 10, cellSize - 10);
            ctx.strokeRect(x + 5, y + 5, cellSize - 10, cellSize - 10);
            ctx.fillStyle = colors.red;
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('红', x + cellSize / 2, y + cellSize / 2);
            break;
            
          case 95: // 黄色跳跃点
            ctx.fillStyle = colors.yellow + '60';
            ctx.strokeStyle = colors.yellow;
            ctx.lineWidth = 3;
            const yellowSize = cellSize * 0.35;
            ctx.beginPath();
            ctx.moveTo(x + cellSize / 2, y + cellSize / 2 - yellowSize);
            ctx.lineTo(x + cellSize / 2 - yellowSize, y + cellSize / 2 + yellowSize);
            ctx.lineTo(x + cellSize / 2 + yellowSize, y + cellSize / 2 + yellowSize);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('黄', x + cellSize / 2, y + cellSize / 2);
            break;
            
          case 96: // 黄色目标点
            ctx.fillStyle = colors.yellow + '40';
            ctx.strokeStyle = colors.yellow;
            ctx.lineWidth = 3;
            ctx.fillRect(x + 5, y + 5, cellSize - 10, cellSize - 10);
            ctx.strokeRect(x + 5, y + 5, cellSize - 10, cellSize - 10);
            ctx.fillStyle = colors.yellow;
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('黄', x + cellSize / 2, y + cellSize / 2);
            break;
            
          case 105: // 蓝色跳跃点
            ctx.fillStyle = colors.blue + '60';
            ctx.strokeStyle = colors.blue;
            ctx.lineWidth = 3;
            const blueSize = cellSize * 0.35;
            ctx.beginPath();
            ctx.moveTo(x + cellSize / 2, y + cellSize / 2 - blueSize);
            ctx.lineTo(x + cellSize / 2 - blueSize, y + cellSize / 2 + blueSize);
            ctx.lineTo(x + cellSize / 2 + blueSize, y + cellSize / 2 + blueSize);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('蓝', x + cellSize / 2, y + cellSize / 2);
            break;
            
          case 106: // 蓝色目标点
            ctx.fillStyle = colors.blue + '40';
            ctx.strokeStyle = colors.blue;
            ctx.lineWidth = 3;
            ctx.fillRect(x + 5, y + 5, cellSize - 10, cellSize - 10);
            ctx.strokeRect(x + 5, y + 5, cellSize - 10, cellSize - 10);
            ctx.fillStyle = colors.blue;
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('蓝', x + cellSize / 2, y + cellSize / 2);
            break;
            
          case 115: // 绿色跳跃点
            ctx.fillStyle = colors.green + '60';
            ctx.strokeStyle = colors.green;
            ctx.lineWidth = 3;
            const greenSize = cellSize * 0.35;
            ctx.beginPath();
            ctx.moveTo(x + cellSize / 2, y + cellSize / 2 - greenSize);
            ctx.lineTo(x + cellSize / 2 - greenSize, y + cellSize / 2 + greenSize);
            ctx.lineTo(x + cellSize / 2 + greenSize, y + cellSize / 2 + greenSize);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('绿', x + cellSize / 2, y + cellSize / 2);
            break;
            
          case 116: // 绿色目标点
            ctx.fillStyle = colors.green + '40';
            ctx.strokeStyle = colors.green;
            ctx.lineWidth = 3;
            ctx.fillRect(x + 5, y + 5, cellSize - 10, cellSize - 10);
            ctx.strokeRect(x + 5, y + 5, cellSize - 10, cellSize - 10);
            ctx.fillStyle = colors.green;
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('绿', x + cellSize / 2, y + cellSize / 2);
            break;
            
          case 8: // 红色终点
            ctx.fillStyle = colors.red + "80";
            ctx.strokeStyle = colors.red;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize * 0.45, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#fff";
            ctx.font = "bold 20px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("红", x + cellSize / 2, y + cellSize / 2);
            break;
            
          case 9: // 黄色终点
            ctx.fillStyle = colors.yellow + "80";
            ctx.strokeStyle = colors.yellow;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize * 0.45, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#fff";
            ctx.font = "bold 20px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("黄", x + cellSize / 2, y + cellSize / 2);
            break;
            
          case 10: // 蓝色终点
            ctx.fillStyle = colors.blue + "80";
            ctx.strokeStyle = colors.blue;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize * 0.45, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#fff";
            ctx.font = "bold 20px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("蓝", x + cellSize / 2, y + cellSize / 2);
            break;
            
          case 11: // 绿色终点
            ctx.fillStyle = colors.green + "80";
            ctx.strokeStyle = colors.green;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize * 0.45, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#fff";
            ctx.font = "bold 20px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("绿", x + cellSize / 2, y + cellSize / 2);
            break;
        }
      }
    }
    
    // 绘制基地区域
    this.drawBases(ctx);
  }
  
  /**
   * 绘制基地
   */
  drawBases(ctx) {
    const { cellSize, colors } = this.boardConfig;
    const board = this.state?.board;
    if (!board || !board.basePositions) return;
    
    Object.entries(board.basePositions).forEach(([color, coords]) => {
      if (coords.length === 0) return;
      
      // 找到基地的边界
      let minRow = Infinity, maxRow = -Infinity;
      let minCol = Infinity, maxCol = -Infinity;
      
      coords.forEach(coord => {
        minRow = Math.min(minRow, coord[0]);
        maxRow = Math.max(maxRow, coord[0]);
        minCol = Math.min(minCol, coord[1]);
        maxCol = Math.max(maxCol, coord[1]);
      });
      
      const colorHex = colors[color] || "#ccc";
      ctx.fillStyle = colorHex + "20";
      ctx.strokeStyle = colorHex;
      ctx.lineWidth = 3;
      
      ctx.fillRect(
        minCol * cellSize,
        minRow * cellSize,
        (maxCol - minCol + 1) * cellSize,
        (maxRow - minRow + 1) * cellSize
      );
      ctx.strokeRect(
        minCol * cellSize,
        minRow * cellSize,
        (maxCol - minCol + 1) * cellSize,
        (maxRow - minRow + 1) * cellSize
      );
    });
  }
  
  /**
   * 绘制棋子
   */
  drawPieces(ctx, players) {
    const { cellSize, colors } = this.boardConfig;
    const areas = this.computeHitAreas();
    
    areas.forEach((hArea) => {
      const player = players[hArea.ownerId];
      if (!player) return;
      
      const color = colors[player.color] || "#666";
      
      ctx.save();
      ctx.translate(hArea.x, hArea.y);
      
      // 绘制棋子主体
      ctx.fillStyle = color;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      
      ctx.beginPath();
      ctx.arc(0, 0, cellSize * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      // 如果是当前玩家且可以移动，高亮显示
      if (this.state?.phase === GAME_PHASE.SELECTING_PLANE && 
          this.state?.dice &&
          this.state?.canMovePlanes &&
          this.state.canMovePlanes.includes(hArea.pieceIndex) &&
          hArea.ownerId === this.app.clientId) {
        ctx.strokeStyle = "#ffd700";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, cellSize * 0.35, 0, Math.PI * 2);
        ctx.stroke();
      }
      
      ctx.restore();
    });
  }
  
  /**
   * 绘制骰子
   */
  drawDice(ctx) {
    const w = this.canvas.width;
    const diceX = w - 80;
    const diceY = 80;
    const diceSize = 60;
    
    ctx.save();
    ctx.translate(diceX, diceY);
    
    if (this.diceAnimation.isAnimating) {
      ctx.rotate((this.diceAnimation.rotation * Math.PI) / 180);
    }
    
    // 绘制骰子背景
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 3;
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    
    const radius = 8;
    ctx.beginPath();
    ctx.roundRect(-diceSize / 2, -diceSize / 2, diceSize, diceSize, radius);
    ctx.fill();
    ctx.stroke();
    
    ctx.shadowColor = "transparent";
    
    // 显示点数
    const displayValue = this.diceAnimation.isAnimating 
      ? (this.diceAnimation.currentValue || "?")
      : (this.state?.dice || "?");
    
    if (displayValue !== "?") {
      ctx.fillStyle = "#d32f2f";
      ctx.font = "bold 36px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(displayValue, 0, 0);
    } else {
      ctx.fillStyle = "#999";
      ctx.font = "24px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", 0, 0);
    }
    
    ctx.restore();
  }
  
  /**
   * 绘制信息面板
   */
  drawInfoPanel(ctx, state) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.fillRect(10, 10, 220, 140);
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, 220, 140);
    
    ctx.fillStyle = "#333";
    ctx.font = "16px Microsoft YaHei";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    
    let y = 25;
    
    // 游戏标题
    ctx.font = "bold 18px Microsoft YaHei";
    ctx.fillText("🎲 飞行棋", 20, y);
    y += 30;
    
    ctx.font = "14px Microsoft YaHei";
    
    // 当前回合
    if (state.turn) {
      const colorNames = {
        red: "红方",
        yellow: "黄方",
        blue: "蓝方",
        green: "绿方",
      };
      const colors = this.boardConfig.colors;
      ctx.fillStyle = colors[state.turn] || "#333";
      ctx.fillText(`当前回合: ${colorNames[state.turn] || state.turn}`, 20, y);
      y += 25;
    }
    
    // 游戏状态
    ctx.fillStyle = "#333";
    const phaseNames = {
      [GAME_PHASE.WAITING_DICE]: "等待掷骰",
      [GAME_PHASE.SELECTING_PLANE]: "选择飞机",
      [GAME_PHASE.MOVING]: "移动中",
      [GAME_PHASE.GAME_OVER]: "游戏结束",
    };
    const phaseText = phaseNames[state.phase] || state.phase || "等待中";
    ctx.fillText(`状态: ${phaseText}`, 20, y);
    y += 25;
    
    // 连续6的次数
    if (state.consecutiveSixCount > 0) {
      ctx.fillStyle = "#f44336";
      ctx.fillText(`连续6: ${state.consecutiveSixCount}次`, 20, y);
      y += 25;
    }
    
    // 游戏开始状态
    if (!state.gameStarted) {
      ctx.fillStyle = "#ff9800";
      ctx.fillText("等待玩家加入...", 20, y);
    }
  }
}
