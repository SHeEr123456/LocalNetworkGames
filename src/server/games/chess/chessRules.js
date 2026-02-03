/**
 * 中国象棋规则引擎（服务端权威判定）
 * - 用 CommonJS 导出，供 Node.js 服务端使用
 * - 客户端也有一份用于“提示走法”，但最终以服务端为准
 */

class ChessRules {
  static isValidMove(board, fromRow, fromCol, toRow, toCol) {
    if (toRow < 0 || toRow > 9 || toCol < 0 || toCol > 8) return { valid: false };
    if (fromRow === toRow && fromCol === toCol) return { valid: false };

    const piece = board[fromRow][fromCol];
    if (!piece) return { valid: false };

    const targetPiece = board[toRow][toCol];
    const isRed = piece === piece.toUpperCase();
    if (targetPiece) {
      const isTargetRed = targetPiece === targetPiece.toUpperCase();
      if (isRed === isTargetRed) return { valid: false };
    }

    const pieceType = piece.toLowerCase();
    let isValid = false;

    switch (pieceType) {
      case "k":
        isValid = this.isValidKingMove(piece, fromRow, fromCol, toRow, toCol, board);
        break;
      case "a":
        isValid = this.isValidAdvisorMove(piece, fromRow, fromCol, toRow, toCol);
        break;
      case "b":
        isValid = this.isValidElephantMove(piece, fromRow, fromCol, toRow, toCol, board);
        break;
      case "n":
        isValid = this.isValidHorseMove(fromRow, fromCol, toRow, toCol, board);
        break;
      case "r":
        isValid = this.isValidChariotMove(fromRow, fromCol, toRow, toCol, board);
        break;
      case "c":
        isValid = this.isValidCannonMove(fromRow, fromCol, toRow, toCol, board, !!targetPiece);
        break;
      case "p":
        isValid = this.isValidPawnMove(piece, fromRow, fromCol, toRow, toCol);
        break;
    }

    return {
      valid: isValid,
      captures: isValid && targetPiece !== null,
      piece,
      targetPiece,
    };
  }

  static isValidKingMove(piece, fromRow, fromCol, toRow, toCol, board) {
    const isRed = piece === "K";
    // 九宫范围
    if (isRed) {
      if (toRow < 7 || toRow > 9 || toCol < 3 || toCol > 5) return false;
    } else {
      if (toRow < 0 || toRow > 2 || toCol < 3 || toCol > 5) return false;
    }

    // 只能走一步（上下左右）
    const rowDiff = Math.abs(toRow - fromRow);
    const colDiff = Math.abs(toCol - fromCol);
    if (!((rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1))) return false;

    // 王不见王：检查目标位置是否会导致将帅面对面
    // 注意：只检查目标位置，不检查移动路径
    return !this.isFacingKings(board, toRow, toCol, isRed);
  }

  /**
   * 检查将帅是否面对面（王不见王规则）
   * @param {Array} board - 棋盘
   * @param {number} row - 目标行
   * @param {number} col - 目标列
   * @param {boolean} isRed - 是否是红方
   * @returns {boolean} - true表示会面对面（不能走）
   */
  static isFacingKings(board, row, col, isRed) {
    // 将帅面对面：必须在同一列，且中间没有棋子
    const direction = isRed ? -1 : 1;
    for (let r = row + direction; r >= 0 && r <= 9; r += direction) {
      const p = board[r][col];
      if (p) {
        // 如果遇到棋子，检查是否是对方的将/帅
        const isOpponentKing = (isRed && p === "k") || (!isRed && p === "K");
        return isOpponentKing;
      }
    }
    return false;
  }

  /**
   * 检查是否将军（检查对方将/帅是否被攻击）
   * @param {Array} board - 棋盘
   * @param {string} color - 'red' 或 'black'，检查该颜色是否被将军
   * @returns {boolean} - true表示被将军
   */
  static isCheck(board, color) {
    const kingPos = this.findKing(board, color);
    if (!kingPos) return false;

    const [kingRow, kingCol] = kingPos;
    const opponentColor = color === "red" ? "black" : "red";

    // 检查所有对方棋子是否可以攻击到将/帅
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 9; col++) {
        const piece = board[row][col];
        if (!piece) continue;

        const pieceColor = piece === piece.toUpperCase() ? "red" : "black";
        if (pieceColor !== opponentColor) continue;

        // 检查这个棋子是否能攻击到将/帅
        const moveResult = this.isValidMove(board, row, col, kingRow, kingCol);
        if (moveResult.valid) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 查找将/帅的位置
   * @param {Array} board - 棋盘
   * @param {string} color - 'red' 或 'black'
   * @returns {[number, number]|null} - [row, col] 或 null
   */
  static findKing(board, color) {
    const king = color === "red" ? "K" : "k";
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 9; col++) {
        if (board[row][col] === king) {
          return [row, col];
        }
      }
    }
    return null;
  }

  static isValidAdvisorMove(piece, fromRow, fromCol, toRow, toCol) {
    const isRed = piece === "A";
    const rowDiff = Math.abs(toRow - fromRow);
    const colDiff = Math.abs(toCol - fromCol);
    if (rowDiff !== 1 || colDiff !== 1) return false;
    if (isRed) return toRow >= 7 && toRow <= 9 && toCol >= 3 && toCol <= 5;
    return toRow >= 0 && toRow <= 2 && toCol >= 3 && toCol <= 5;
  }

  static isValidElephantMove(piece, fromRow, fromCol, toRow, toCol, board) {
    const isRed = piece === "B";
    const rowDiff = Math.abs(toRow - fromRow);
    const colDiff = Math.abs(toCol - fromCol);
    if (rowDiff !== 2 || colDiff !== 2) return false;

    // 象/相不能过河：红方在下（行数大），黑方在上（行数小）
    if (isRed && toRow < 5) return false;
    if (!isRed && toRow > 4) return false;

    const eyeRow = (fromRow + toRow) / 2;
    const eyeCol = (fromCol + toCol) / 2;
    return board[eyeRow][eyeCol] === null;
  }

  static isValidHorseMove(fromRow, fromCol, toRow, toCol, board) {
    const rowDiff = Math.abs(toRow - fromRow);
    const colDiff = Math.abs(toCol - fromCol);
    if (!((rowDiff === 2 && colDiff === 1) || (rowDiff === 1 && colDiff === 2))) return false;

    // 蹩马腿
    if (rowDiff === 2) {
      const middleRow = (fromRow + toRow) / 2;
      if (board[middleRow][fromCol]) return false;
    } else {
      const middleCol = (fromCol + toCol) / 2;
      if (board[fromRow][middleCol]) return false;
    }
    return true;
  }

  static isValidChariotMove(fromRow, fromCol, toRow, toCol, board) {
    if (fromRow !== toRow && fromCol !== toCol) return false;
    let step, steps;
    if (fromRow === toRow) {
      step = fromCol < toCol ? 1 : -1;
      steps = Math.abs(toCol - fromCol);
      for (let i = 1; i < steps; i++) if (board[fromRow][fromCol + i * step]) return false;
    } else {
      step = fromRow < toRow ? 1 : -1;
      steps = Math.abs(toRow - fromRow);
      for (let i = 1; i < steps; i++) if (board[fromRow + i * step][fromCol]) return false;
    }
    return true;
  }

  static isValidCannonMove(fromRow, fromCol, toRow, toCol, board, isCapture) {
    if (fromRow !== toRow && fromCol !== toCol) return false;

    let obstacles = 0;
    let row = fromRow;
    let col = fromCol;
    while (row !== toRow || col !== toCol) {
      if (row < toRow) row++;
      else if (row > toRow) row--;
      if (col < toCol) col++;
      else if (col > toCol) col--;
      if ((row !== toRow || col !== toCol) && board[row][col]) obstacles++;
    }
    return isCapture ? obstacles === 1 : obstacles === 0;
  }

  static isValidPawnMove(piece, fromRow, fromCol, toRow, toCol) {
    const isRed = piece === "P";
    const rowDiff = toRow - fromRow;
    const colDiff = Math.abs(toCol - fromCol);

    if (isRed && rowDiff > 0) return false;
    if (!isRed && rowDiff < 0) return false;

    const forwardDiff = Math.abs(rowDiff);
    const isCrossedRiver = isRed ? fromRow <= 4 : fromRow >= 5;
    if (!isCrossedRiver) return forwardDiff === 1 && colDiff === 0;
    if (forwardDiff === 1 && colDiff === 0) return true;
    if (forwardDiff === 0 && colDiff === 1) return true;
    return false;
  }
}

module.exports = { ChessRules };

