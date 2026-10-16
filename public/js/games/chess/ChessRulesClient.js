/**
 * 中国象棋：客户端规则（用于“提示可走位置”）
 * 说明：
 * - 服务端才是权威判定（防作弊/一致性）
 * - 客户端规则主要用于交互体验：选中棋子后展示可走点
 */

export class ChessRules {
  /**
   * @returns {{valid:boolean,captures?:boolean,piece?:string,targetPiece?:string|null}}
   */
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

    // 只能走一步（上下左右）— 与服务端统一写法
    const rowDiff = Math.abs(toRow - fromRow);
    const colDiff = Math.abs(toCol - fromCol);
    if (!((rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1))) return false;

    // 王不见王：检查目标位置是否会导致将帅面对面
    return !this.isFacingKings(board, toRow, toCol, isRed);
  }

  /**
   * 检查将帅是否面对面（王不见王规则）
   * 修复：只检查目标位置，确保前进后退都能正常移动
   */
  static isFacingKings(board, row, col, isRed) {
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
   * 查找将/帅位置
   * @returns {[number, number]|null}
   */
  static findKing(board, color) {
    const king = color === "red" ? "K" : "k";
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 9; col++) {
        if (board[row][col] === king) return [row, col];
      }
    }
    return null;
  }

  /**
   * 判断某方是否被将军（与服务端 ChessRules.isCheck 保持一致）
   */
  static isCheck(board, color) {
    const kingPos = this.findKing(board, color);
    if (!kingPos) return false;

    const [kingRow, kingCol] = kingPos;
    const opponentColor = color === "red" ? "black" : "red";

    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 9; col++) {
        const piece = board[row][col];
        if (!piece) continue;

        const pieceColor = piece === piece.toUpperCase() ? "red" : "black";
        if (pieceColor !== opponentColor) continue;

        if (this.isValidMove(board, row, col, kingRow, kingCol).valid) return true;
      }
    }
    return false;
  }

  /**
   * 试走一步并判断走完后走子方是否安全（不被将军）
   * 用于过滤"自杀棋"，与服务端"走后自检"保持一致
   */
  static isSafeMove(board, fromRow, fromCol, toRow, toCol) {
    const piece = board[fromRow][fromCol];
    if (!piece) return false;

    const color = piece === piece.toUpperCase() ? "red" : "black";
    const targetPiece = board[toRow][toCol];

    board[toRow][toCol] = piece;
    board[fromRow][fromCol] = null;
    const safe = !this.isCheck(board, color);
    board[fromRow][fromCol] = piece;
    board[toRow][toCol] = targetPiece;

    return safe;
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

    // 兵卒不能后退
    if (isRed && rowDiff > 0) return false;
    if (!isRed && rowDiff < 0) return false;

    const forwardDiff = Math.abs(rowDiff);
    const isCrossedRiver = isRed ? fromRow <= 4 : fromRow >= 5;

    if (!isCrossedRiver) return forwardDiff === 1 && colDiff === 0;
    if (forwardDiff === 1 && colDiff === 0) return true;
    if (forwardDiff === 0 && colDiff === 1) return true;
    return false;
  }

  static getAllValidMoves(board, row, col) {
    const piece = board[row][col];
    if (!piece) return [];
    const moves = [];
    for (let toRow = 0; toRow < 10; toRow++) {
      for (let toCol = 0; toCol < 9; toCol++) {
        const result = this.isValidMove(board, row, col, toRow, toCol);
        if (!result.valid) continue;
        // 过滤会导致己方被将军的着法（自杀棋 / 未应将），与服务端权威判定对齐
        if (!this.isSafeMove(board, row, col, toRow, toCol)) continue;
        moves.push({ row: toRow, col: toCol, captures: result.captures });
      }
    }
    return moves;
  }
}

