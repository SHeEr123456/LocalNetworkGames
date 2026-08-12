/**
 * 象棋房间逻辑（服务端）
 * - 初始化棋盘
 * - 处理走子并广播权威结果
 */

const { ChessRules } = require("./ChessRulesServer");

function createInitialBoard() {
  const board = Array(10)
    .fill(null)
    .map(() => Array(9).fill(null));

  // 修正后的初始位置
  const initialPositions = [
    // 黑方 (row 0-4)
    ["r", 0, 0],
    ["n", 0, 1],
    ["b", 0, 2],
    ["a", 0, 3],
    ["k", 0, 4],
    ["a", 0, 5],
    ["b", 0, 6],
    ["n", 0, 7],
    ["r", 0, 8],
    ["c", 2, 1],
    ["c", 2, 7],
    ["p", 3, 0],
    ["p", 3, 2],
    ["p", 3, 4],
    ["p", 3, 6],
    ["p", 3, 8],

    // 红方 (row 5-9)
    ["R", 9, 0],
    ["N", 9, 1],
    ["B", 9, 2],
    ["A", 9, 3],
    ["K", 9, 4],
    ["A", 9, 5],
    ["B", 9, 6],
    ["N", 9, 7],
    ["R", 9, 8],
    ["C", 7, 1],
    ["C", 7, 7],
    ["P", 6, 0],
    ["P", 6, 2],
    ["P", 6, 4],
    ["P", 6, 6],
    ["P", 6, 8],
  ];

  initialPositions.forEach(([piece, row, col]) => {
    board[row][col] = piece;
  });

  return board;
}

function createChessState() {
  return {
    gameType: "chess",
    board: createInitialBoard(),
    turn: "red",
    moveHistory: [],
    gameOver: false,
    winner: null,
  };
}

/**
 * 处理象棋走子
 * @returns {{ok:true, payload:object}|{ok:false, error:string}}
 */
function applyChessMove(room, client, data) {
  // 1) 回合验证（本地热座：同一人轮流下双方）
  const movingColor = room.localMultiplayer ? room.turn : client.color;
  if (room.turn !== movingColor) return { ok: false, error: "不是你的回合" };

  const { from, to } = data;
  const state = room.gameState;
  const piece = state.board[from.row]?.[from.col];
  const targetPiece = state.board[to.row]?.[to.col] ?? null;
  if (!piece) return { ok: false, error: "没有选中棋子" };

  const isRedPiece = piece === piece.toUpperCase();
  if ((movingColor === "red") !== isRedPiece) {
    return { ok: false, error: "只能移动己方棋子" };
  }

  // 2) 规则验证（服务端权威）
  const moveResult = ChessRules.isValidMove(state.board, from.row, from.col, to.row, to.col);
  if (!moveResult.valid) return { ok: false, error: "非法移动" };

  // 3) 执行移动
  state.board[to.row][to.col] = piece;
  state.board[from.row][from.col] = null;

  // 3.5) 走后自检：验证走子方自身是否被将军（防自杀棋+强制应将）
  // 若走后己方将被将军，回退移动并拒绝
  if (ChessRules.isCheck(state.board, movingColor)) {
    state.board[from.row][from.col] = piece;
    state.board[to.row][to.col] = targetPiece;
    return { ok: false, error: "走棋后己方将被将军，非法移动" };
  }

  // 3.6) 走后自检：将帅是否面对面（王不见王）
  // 检查走子方的将/帅是否暴露在对方将/帅对面
  const kingPos = ChessRules.findKing(state.board, movingColor);
  if (kingPos) {
    const isRedKing = movingColor === "red";
    if (ChessRules.isFacingKings(state.board, kingPos[0], kingPos[1], isRedKing)) {
      state.board[from.row][from.col] = piece;
      state.board[to.row][to.col] = targetPiece;
      return { ok: false, error: "走棋后将帅面对面，非法移动" };
    }
  }

  // 4) 记录历史
  state.moveHistory.push({
    from,
    to,
    piece,
    captures: moveResult.captures,
    targetPiece: moveResult.targetPiece,
  });

  // 5) 判胜：吃掉将/帅
  let gameOver = false;
  let winner = null;
  if (moveResult.captures && moveResult.targetPiece && moveResult.targetPiece.toLowerCase() === "k") {
    gameOver = true;
    winner = movingColor;
    state.gameOver = true;
    state.winner = winner;
  }

  // 6) 换手
  if (!gameOver) {
    room.turn = room.turn === "red" ? "black" : "red";
  }
  state.turn = room.turn;

  // 7) 检查是否将军（走子后，对方是否被将军）
  const isCheckAfterMove = ChessRules.isCheck(state.board, room.turn);

  return {
    ok: true,
    payload: {
      type: "move",
      gameType: "chess",
      from,
      to,
      piece,
      clientId: client.clientId,
      captures: moveResult.captures,
      targetPiece,
      turn: room.turn,
      board: state.board,
      gameOver,
      winner,
      isCheck: isCheckAfterMove, // 是否将军
    },
  };
}

module.exports = {
  createChessState,
  applyChessMove,
};
