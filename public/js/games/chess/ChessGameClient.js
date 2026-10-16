/**
 * ChessGameClient：客户端中国象棋
 * - 负责渲染棋盘、处理点击选子/走子、展示可走提示
 * - 不做最终判定：移动发送给服务端，服务端广播权威结果
 */

import { ChessRules } from "./ChessRulesClient.js";

/** 棋盘几何：横向 8 个间隔、纵向 9 个间隔，两侧各留半个间隔作为棋子半径的余量 */
const COLS = 8;
const ROWS = 9;
const H_RATIO = COLS + 0.5;
const V_RATIO = ROWS + 0.5;
const PIECE_SCALE = 0.86;

export class ChessGameClient {
  constructor({ app, boardEl }) {
    this.app = app;
    this.boardEl = boardEl;

    this.gameState = null; // { board, turn, moveHistory, gameOver?, winner? }
    this.selectedPiece = null; // { piece, row, col }
    this.validMoves = []; // [ [row,col], ... ]

    this._onBoardClick = (e) => this._handleBoardClick(e);
    this._onResize = () => this.renderBoard();

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
    this.boardEl.addEventListener("click", this._onBoardClick);
    window.addEventListener("resize", this._onResize);
    this.app.updatePlayerInfo();
  }

  destroy() {
    this.boardEl.removeEventListener("click", this._onBoardClick);
    window.removeEventListener("resize", this._onResize);
  }

  /**
   * 依据棋盘实际尺寸换算出交叉点间距与边距，保证棋子始终居中落在交叉点内
   */
  computeMetrics() {
    const el = this.boardEl;
    const paddingWidth = el.clientWidth || 512;
    const grid = paddingWidth / H_RATIO;
    return {
      grid,
      margin: grid / 2,
      pieceSize: grid * PIECE_SCALE,
    };
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
    const { from, to, piece, captures, board, turn, clientId, gameOver, winner, isCheck, endReason } = data;

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
      this.announceGameOver(endReason);
    }
  }

  /**
   * 公布对局结果
   * @param {string} [endReason] - 'checkmate' 绝杀 | 'stalemate' 困毙 | 'surrender' 认输
   */
  announceGameOver(endReason) {
    const winner = this.gameState?.winner;
    const winText =
      winner === "red" ? "红方胜利！" : winner === "black" ? "黑方胜利！" : "游戏结束";
    const reasonText =
      endReason === "checkmate"
        ? "（绝杀）"
        : endReason === "stalemate"
          ? "（困毙，无子可动）"
          : endReason === "surrender"
            ? "（对方认输）"
            : "";
    this.app.addChatMessage("系统", `${winText}${reasonText}`, true);
  }

  /**
   * 服务端宣布对局结束（认输 / 其他终止情形）
   */
  onGameOver(data) {
    if (!this.gameState) return;
    this.gameState.gameOver = true;
    this.gameState.winner = data.winner || null;
    this.clearSelection();
    this.renderBoard();
    this.app.updatePlayerInfo();
    if (data.message) this.app.addChatMessage("系统", data.message, true);
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

    // 尺寸变化后重绘时保留选中态
    if (this.selectedPiece) {
      const selectedEl = this.boardEl.querySelector(
        `[data-row="${this.selectedPiece.row}"][data-col="${this.selectedPiece.col}"]`,
      );
      if (selectedEl) selectedEl.classList.add("selected");
    }
  }

  drawBoardGrid() {
    const board = this.boardEl;
    const { grid, margin } = this.computeMetrics();
    const gridSize = Math.max(1.5, grid * 0.035);

    // 河界（第 4 行与第 5 行之间）文字位置随棋盘尺寸自适应
    const riverEl = board.querySelector(".river");
    if (riverEl) {
      riverEl.style.top = `${margin + 4 * grid}px`;
      riverEl.style.height = `${grid}px`;
      riverEl.style.fontSize = `${Math.max(14, grid * 0.44)}px`;
      riverEl.style.letterSpacing = `${Math.max(4, grid * 0.2)}px`;
    }

    // 垂直线：col 0-8 共 9 条，中间 7 条在河界处断开
    for (let col = 0; col <= COLS; col++) {
      const x = margin + col * grid;

      if (col === 0 || col === COLS) {
        const line = document.createElement("div");
        line.className = "grid-line grid-line-vertical";
        line.style.left = `${x}px`;
        line.style.top = `${margin}px`;
        line.style.width = `${gridSize}px`;
        line.style.height = `${ROWS * grid}px`;
        board.appendChild(line);
      } else {
        const lineTop = document.createElement("div");
        lineTop.className = "grid-line grid-line-vertical";
        lineTop.style.left = `${x}px`;
        lineTop.style.top = `${margin}px`;
        lineTop.style.width = `${gridSize}px`;
        lineTop.style.height = `${4 * grid}px`;
        board.appendChild(lineTop);

        const lineBottom = document.createElement("div");
        lineBottom.className = "grid-line grid-line-vertical";
        lineBottom.style.left = `${x}px`;
        lineBottom.style.top = `${margin + 5 * grid}px`;
        lineBottom.style.width = `${gridSize}px`;
        lineBottom.style.height = `${4 * grid}px`;
        board.appendChild(lineBottom);
      }
    }

    // 水平线：row 0-9 共 10 条
    for (let row = 0; row <= ROWS; row++) {
      const y = margin + row * grid;
      const line = document.createElement("div");
      line.className = "grid-line grid-line-horizontal";
      line.style.left = `${margin}px`;
      line.style.top = `${y}px`;
      line.style.width = `${COLS * grid}px`;
      line.style.height = `${gridSize}px`;
      board.appendChild(line);
    }

    // 九宫格斜线：红方（下）与黑方（上）
    this.drawPalaceLines(board, 7, 9, 3, 5, grid, margin);
    this.drawPalaceLines(board, 0, 2, 3, 5, grid, margin);
  }

  /**
   * 绘制九宫格斜线
   * @param {HTMLElement} board - 棋盘元素
   * @param {number} startRow - 起始行
   * @param {number} endRow - 结束行
   * @param {number} startCol - 起始列
   * @param {number} endCol - 结束列
   * @param {number} grid - 交叉点间距
   * @param {number} margin - 棋盘内边距
   */
  drawPalaceLines(board, startRow, endRow, startCol, endCol, grid, margin) {
    // 左上角交叉点到右下角交叉点
    const x1 = margin + startCol * grid;
    const y1 = margin + startRow * grid;
    const x2 = margin + endCol * grid;
    const y2 = margin + endRow * grid;
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
    const x3 = margin + endCol * grid;
    const y3 = margin + startRow * grid;
    const x4 = margin + startCol * grid;
    const y4 = margin + endRow * grid;
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
    const { grid, margin, pieceSize } = this.computeMetrics();

    const pieceElement = document.createElement("div");
    pieceElement.className = `piece ${pieceCode === pieceCode.toUpperCase() ? "red" : "black"}`;
    pieceElement.textContent = this.pieceMap[pieceCode] || pieceCode;
    pieceElement.dataset.row = String(row);
    pieceElement.dataset.col = String(col);
    pieceElement.dataset.piece = pieceCode;

    // 棋子以交叉点为中心，尺寸随棋盘自适应，保证不越出棋盘边框
    pieceElement.style.width = `${pieceSize}px`;
    pieceElement.style.height = `${pieceSize}px`;
    pieceElement.style.fontSize = `${Math.max(12, pieceSize * 0.44)}px`;
    pieceElement.style.left = `${margin + col * grid - pieceSize / 2}px`;
    pieceElement.style.top = `${margin + row * grid - pieceSize / 2}px`;

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
    const { grid, margin } = this.computeMetrics();
    const indicatorSize = Math.max(10, grid * 0.3);

    this.validMoves.forEach(([row, col]) => {
      const indicator = document.createElement("div");
      indicator.className = "valid-move";
      indicator.style.width = `${indicatorSize}px`;
      indicator.style.height = `${indicatorSize}px`;
      indicator.style.left = `${margin + col * grid - indicatorSize / 2}px`;
      indicator.style.top = `${margin + row * grid - indicatorSize / 2}px`;
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

  _handleBoardClick(e) {
    // 跳过棋子元素和走法指示器的点击（它们有自己的处理器）
    if (e.target.classList.contains("piece") || e.target.classList.contains("valid-move")) {
      return;
    }

    if (!this.gameActive() || !this.selectedPiece) return;

    const el = this.boardEl;
    const boardRect = el.getBoundingClientRect();
    // 兼容边框与 CSS 缩放：把视口坐标换算回棋盘内部坐标
    const scaleX = boardRect.width ? el.offsetWidth / boardRect.width : 1;
    const scaleY = boardRect.height ? el.offsetHeight / boardRect.height : 1;
    const borderX = (el.offsetWidth - el.clientWidth) / 2;
    const borderY = (el.offsetHeight - el.clientHeight) / 2;

    const { grid, margin } = this.computeMetrics();
    const localX = (e.clientX - boardRect.left) * scaleX - borderX;
    const localY = (e.clientY - boardRect.top) * scaleY - borderY;

    const col = Math.round((localX - margin) / grid);
    const row = Math.round((localY - margin) / grid);

    if (row < 0 || row > ROWS || col < 0 || col > COLS) return;

    // 检查点击的交叉点是否是合法走法
    const canMove = this.validMoves.some(([r, c]) => r === row && c === col);
    if (canMove) {
      this.movePiece(row, col);
      return;
    }

    // 检查是否点击了自己的另一枚棋子 → 重新选中
    const clickedPiece = this.gameState.board[row][col];
    if (clickedPiece && this.isSameColor(this.selectedPiece.piece, clickedPiece)) {
      this.selectPiece(clickedPiece, row, col);
    } else {
      // 无效位置 → 取消选中
      this.clearSelection();
    }
  }
}

