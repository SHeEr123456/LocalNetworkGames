/**
 * ChessGameClient：客户端中国象棋
 * - 负责渲染棋盘、处理点击选子/走子、展示可走提示
 * - 不做最终判定：移动发送给服务端，服务端广播权威结果
 */

import { ChessRules } from "./chessRules.js";

export class ChessGameClient {
  constructor({ app, boardEl }) {
    this.app = app;
    this.boardEl = boardEl;

    this.gameState = null; // { board, turn, moveHistory, gameOver?, winner? }
    this.selectedPiece = null; // { piece, row, col }
    this.validMoves = []; // [ [row,col], ... ]

    this.pieceMap = {
      K: "帅",
      A: "仕",
      B: "象",
      R: "車",
      N: "马",
      C: "炮",
      P: "兵",
      k: "将",
      a: "士",
      b: "相",
      r: "车",
      n: "马",
      c: "炮",
      p: "卒",
    };
  }

  initWithState(state) {
    this.gameState = state;
    this.clearSelection();
    this.renderBoard();
    this.app.updatePlayerInfo();
  }

  destroy() {
    // 当前实现没有绑定全局监听器，不需要额外清理
  }

  gameActive() {
    return this.gameState && !this.gameState.gameOver;
  }

  onGameRestarted(data) {
    this.gameState = data.gameState;
    this.clearSelection();
    this.renderBoard();
    this.app.updatePlayerInfo();
  }

  onServerMove(data) {
    const { from, to, piece, captures, board, turn, clientId, gameOver, winner, isCheck } = data;

    // 1) 用服务端棋盘（权威）
    if (board) this.gameState.board = board;
    else {
      // 兼容模式：无 board 时按移动更新
      this.gameState.board[to.row][to.col] = piece;
      this.gameState.board[from.row][from.col] = null;
    }

    // 2) 更新回合/结束状态
    if (typeof turn !== "undefined") this.gameState.turn = turn;
    if (typeof gameOver !== "undefined") {
      this.gameState.gameOver = !!gameOver;
      this.gameState.winner = winner || null;
    }

    // 3) 记录与提示
    const pieceName = this.pieceMap[piece] || piece;
    const fromPos = `(${9 - from.row}, ${from.col})`;
    const toPos = `(${9 - to.row}, ${to.col})`;
    const captureText = captures ? " 吃子" : "";
    this.app.addMoveToHistory(`${pieceName} ${fromPos} → ${toPos}${captureText}`);

    const who = clientId === this.app.clientId ? "你" : "对手";
    this.app.addChatMessage("系统", `${who}${pieceName}${fromPos}→${toPos}${captures ? "，并吃子！" : ""}`, true);

    // 4) 将军提醒
    if (isCheck) {
      const checkedColor = turn === "red" ? "红方" : "黑方";
      this.app.addChatMessage("系统", `⚠️ 将军！${checkedColor}被将军！`, true);
      this.app.playSound("capture"); // 使用吃子音效作为将军提醒
    }

    // 5) 重新渲染
    this.clearSelection();
    this.renderBoard();
    this.app.updatePlayerInfo();

    // 6) 音效
    if (!isCheck) {
      this.app.playSound(captures ? "capture" : "move");
    }

    if (this.gameState.gameOver) {
      const winText =
        this.gameState.winner === "red"
          ? "红方胜利！"
          : this.gameState.winner === "black"
            ? "黑方胜利！"
            : "游戏结束";
      this.app.addChatMessage("系统", winText, true);
    }
  }

  renderBoard() {
    if (!this.gameState?.board) return;
    const board = this.boardEl;
    board.innerHTML = '<div class="river">楚河 汉界</div>';

    this.drawBoardGrid();

    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 9; col++) {
        const piece = this.gameState.board[row][col];
        if (piece) this.createPieceElement(piece, row, col);
      }
    }

    this.renderValidMoves();
  }

  drawBoardGrid() {
    const board = this.boardEl;
    const gridSpacing = 60; // 网格间距（与棋子位置计算保持一致）

    // 垂直线：画在列交叉点上，共9条（列索引0-8，对应位置0, 60, 120, ..., 480）
    // 河界位置（第4行和第5行之间，即240px到300px）的竖线要去掉
    const riverTop = 4 * gridSpacing; // 240px
    const riverBottom = 5 * gridSpacing; // 300px
    
    // 画在列0-8的位置（对应col=0到col=8的交叉点）
    for (let col = 0; col <= 8; col++) {
      const x = col * gridSpacing;
      
      // 边界的两条竖线（col=0和col=8）需要贯穿整个棋盘
      if (col === 0 || col === 8) {
        const line = document.createElement("div");
        line.className = "grid-line grid-line-vertical";
        line.style.left = `${x}px`;
        line.style.top = "0";
        line.style.width = "2px";
        line.style.height = "540px";
        board.appendChild(line);
      } else {
        // 中间的竖线需要在河界处断开
        // 上半部分（0到河界上方）
        const lineTop = document.createElement("div");
        lineTop.className = "grid-line grid-line-vertical";
        lineTop.style.left = `${x}px`;
        lineTop.style.top = "0";
        lineTop.style.width = "2px";
        lineTop.style.height = `${riverTop}px`;
        board.appendChild(lineTop);
        
        // 下半部分（河界下方到棋盘底部）
        const lineBottom = document.createElement("div");
        lineBottom.className = "grid-line grid-line-vertical";
        lineBottom.style.left = `${x}px`;
        lineBottom.style.top = `${riverBottom}px`;
        lineBottom.style.width = "2px";
        lineBottom.style.height = `${540 - riverBottom}px`;
        board.appendChild(lineBottom);
      }
    }

    // 水平线：画在行交叉点上，共10条（行索引0-9，对应位置0, 60, 120, ..., 540）
    // 画在行0-9的位置（对应row=0到row=9的交叉点）
    for (let row = 0; row <= 9; row++) {
      const y = row * gridSpacing;
      const line = document.createElement("div");
      line.className = "grid-line grid-line-horizontal";
      line.style.left = "0";
      line.style.top = `${y}px`;
      line.style.width = "100%";
      line.style.height = "2px";
      board.appendChild(line);
    }

    // 绘制九宫格斜线
    // 红方九宫格（下方，row 7-9, col 3-5）
    this.drawPalaceLines(board, 7, 9, 3, 5, gridSpacing);
    // 黑方九宫格（上方，row 0-2, col 3-5）
    this.drawPalaceLines(board, 0, 2, 3, 5, gridSpacing);
  }

  /**
   * 绘制九宫格斜线
   * @param {HTMLElement} board - 棋盘元素
   * @param {number} startRow - 起始行
   * @param {number} endRow - 结束行
   * @param {number} startCol - 起始列
   * @param {number} endCol - 结束列
   * @param {number} gridSpacing - 网格间距
   */
  drawPalaceLines(board, startRow, endRow, startCol, endCol, gridSpacing) {
    // 左上角交叉点到右下角交叉点
    const x1 = startCol * gridSpacing;
    const y1 = startRow * gridSpacing;
    const x2 = endCol * gridSpacing;
    const y2 = endRow * gridSpacing;
    const length = Math.hypot(x2 - x1, y2 - y1);
    const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    
    const diag1 = document.createElement("div");
    diag1.className = "palace-line";
    diag1.style.left = `${x1}px`;
    diag1.style.top = `${y1}px`;
    diag1.style.width = `${length}px`;
    diag1.style.height = "2px";
    diag1.style.transform = `rotate(${angle}deg)`;
    diag1.style.transformOrigin = "0 0";
    board.appendChild(diag1);

    // 右上角交叉点到左下角交叉点
    const x3 = endCol * gridSpacing;
    const y3 = startRow * gridSpacing;
    const x4 = startCol * gridSpacing;
    const y4 = endRow * gridSpacing;
    const length2 = Math.hypot(x4 - x3, y4 - y3);
    const angle2 = (Math.atan2(y4 - y3, x4 - x3) * 180) / Math.PI;
    
    const diag2 = document.createElement("div");
    diag2.className = "palace-line";
    diag2.style.left = `${x3}px`;
    diag2.style.top = `${y3}px`;
    diag2.style.width = `${length2}px`;
    diag2.style.height = "2px";
    diag2.style.transform = `rotate(${angle2}deg)`;
    diag2.style.transformOrigin = "0 0";
    board.appendChild(diag2);
  }

  createPieceElement(pieceCode, row, col) {
    const pieceElement = document.createElement("div");
    pieceElement.className = `piece ${pieceCode === pieceCode.toUpperCase() ? "red" : "black"}`;
    pieceElement.textContent = this.pieceMap[pieceCode] || pieceCode;
    pieceElement.dataset.row = String(row);
    pieceElement.dataset.col = String(col);
    pieceElement.dataset.piece = pieceCode;

    // 棋子应该画在交叉点上，以交叉点为中心
    // 交叉点坐标：col * 60, row * 60
    // 棋子大小：56px，所以需要减去一半（28px）来居中
    const pieceSize = 56;
    const gridSpacing = 60;
    pieceElement.style.left = `${col * gridSpacing - pieceSize / 2}px`;
    pieceElement.style.top = `${row * gridSpacing - pieceSize / 2}px`;

    pieceElement.addEventListener("click", () => this.handlePieceClick(pieceCode, row, col));
    this.boardEl.appendChild(pieceElement);
  }

  handlePieceClick(piece, row, col) {
    // 还未选子，或点击自己棋子：走“选子”
    if (!this.selectedPiece || this.isSameColor(this.selectedPiece.piece, piece)) {
      this.selectPiece(piece, row, col);
      return;
    }

    // 已选中自己的棋子，点击对方棋子：若该点可走则吃子
    const canCapture = this.validMoves.some(([r, c]) => r === row && c === col);
    if (canCapture) this.movePiece(row, col);
    else this.app.playSound("invalid");
  }

  isSameColor(pieceA, pieceB) {
    return pieceA === pieceA.toUpperCase() ? pieceB === pieceB.toUpperCase() : pieceB === pieceB.toLowerCase();
  }

  selectPiece(piece, row, col) {
    if (!this.gameActive()) return;

    const isRed = piece === piece.toUpperCase();
    const pieceColor = isRed ? "red" : "black";

    // 回合与阵营校验
    if (pieceColor !== this.app.playerColor || this.gameState.turn !== this.app.playerColor) {
      this.app.playSound("invalid");
      return;
    }

    document.querySelectorAll(".piece.selected").forEach((el) => el.classList.remove("selected"));
    const el = this.boardEl.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (el) {
      el.classList.add("selected");
      this.app.playSound("select");
    }

    this.selectedPiece = { piece, row, col };
    this.validMoves = this.calculateValidMoves(row, col);
    this.renderValidMoves();
  }

  calculateValidMoves(row, col) {
    const moves = [];
    const validMoves = ChessRules.getAllValidMoves(this.gameState.board, row, col);
    validMoves.forEach((m) => moves.push([m.row, m.col]));
    return moves;
  }

  renderValidMoves() {
    this.boardEl.querySelectorAll(".valid-move").forEach((el) => el.remove());
    this.validMoves.forEach(([row, col]) => {
      const indicator = document.createElement("div");
      indicator.className = "valid-move";
      // 可走位置指示器也应该以交叉点为中心
      // 指示器大小：16px（从CSS），所以减去一半（8px）来居中
      const gridSpacing = 60;
      const indicatorSize = 16;
      indicator.style.left = `${col * gridSpacing - indicatorSize / 2}px`;
      indicator.style.top = `${row * gridSpacing - indicatorSize / 2}px`;
      indicator.addEventListener("click", () => this.movePiece(row, col));
      this.boardEl.appendChild(indicator);
    });
  }

  movePiece(toRow, toCol) {
    if (!this.selectedPiece) return;
    const { piece, row: fromRow, col: fromCol } = this.selectedPiece;
    this.app.sendChessMove({ row: fromRow, col: fromCol }, { row: toRow, col: toCol }, piece);
  }

  clearSelection() {
    this.selectedPiece = null;
    this.validMoves = [];
    this.boardEl.querySelectorAll(".piece.selected").forEach((el) => el.classList.remove("selected"));
    this.boardEl.querySelectorAll(".valid-move").forEach((el) => el.remove());
  }
}

