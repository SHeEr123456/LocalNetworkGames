/**
 * 飞行棋房间逻辑（服务端）- 按照新矩阵重构
 * 
 * 游戏规则：
 * 1. 基本规则：
 *    - 4名玩家，每位玩家有4枚棋子，颜色：黄、蓝、红、绿
 *    - 棋子从基地出发，按照各自路径移动，最后进入终点
 * 
 * 2. 起飞规则：
 *    - 掷出6点可选择：①从基地起飞一枚棋子到101/201/301/401 ②让已起飞的棋子前进6步
 *    - 掷出6点可额外获得一次掷骰机会（连续三次6点则本轮作废）
 * 
 * 3. 移动路径：
 *    - 黄色：100(基地) → 101(起飞) → 001-054 → 110-150 → 111(终点)
 *    - 蓝色：200(基地) → 201(起飞) → 015-056-001-012 → 210-250 → 222(终点)
 *    - 红色：300(基地) → 301(起飞) → 029-056-001-026 → 310-350 → 333(终点)
 *    - 绿色：400(基地) → 401(起飞) → 043-056-001-040 → 410-450 → 444(终点)
 * 
 * 4. 打飞机规则：
 *    - 通过普通行走到达与自身相同颜色的格子（非x00）时，跳跃4个距离到下一个相同颜色格子
 * 
 * 5. 特殊跳跃：
 *    - 绿色棋子到达006 → 直接跳到018（不触发打飞机）
 *    - 黄色棋子到达020 → 直接跳到032（不触发打飞机）
 *    - 蓝色棋子到达034 → 直接跳到046（不触发打飞机）
 *    - 红色棋子到达048 → 直接跳到004（不触发打飞机）
 * 
 * 6. 特殊格子颜色：
 *    - x00格子与对应棋子颜色一致
 *    - 001-056：从001为绿色起始，按黄、蓝、红、绿循环
 */

// 游戏状态枚举
const GAME_PHASE = {
  WAITING_DICE: "WAITING_DICE",
  SELECTING_PLANE: "SELECTING_PLANE",
  MOVING: "MOVING",
  GAME_OVER: "GAME_OVER",
};

const COLORS = ["yellow", "blue", "red", "green"];
const COLOR_NAMES = {
  yellow: "黄方",
  blue: "蓝方",
  red: "红方",
  green: "绿方",
};

const PIECES_PER_PLAYER = 4;
const MAX_CONSECUTIVE_SIX = 3;

/**
 * 棋盘布局（15行x15列）- 按照提供的矩阵
 * 
 * 格子编号规则：
 * 000 = 空白
 * 001-056 = 主路径（按绿、黄、蓝、红循环着色）
 * 1xx = 黄色区域（100基地，101起飞点，110-150终点通道，111终点）
 * 2xx = 蓝色区域（200基地，201起飞点，210-250终点通道，222终点）
 * 3xx = 红色区域（300基地，301起飞点，310-350终点通道，333终点）
 * 4xx = 绿色区域（400基地，401起飞点，410-450终点通道，444终点）
 * 555 = 中心区域
 */
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

/**
 * 创建格子编号到坐标的映射
 */
function createCellMap() {
  const cellMap = {};
  for (let row = 0; row < BOARD_LAYOUT.length; row++) {
    for (let col = 0; col < BOARD_LAYOUT[row].length; col++) {
      const cellNum = BOARD_LAYOUT[row][col];
      if (cellNum > 0) {
        cellMap[cellNum] = { row, col, cellNum };
      }
    }
  }
  return cellMap;
}

/**
 * 生成各颜色的完整路径
 * 返回：{ yellow: [...], blue: [...], red: [...], green: [...] }
 */
function generateColorPaths() {
  const cellMap = createCellMap();
  
  // 黄色路径：101 → 001-050 → 110-150 → 111
  const yellowPath = [
    101, // 起飞点
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
    41, 42, 43, 44, 45, 46, 47, 48, 49, 50,
    110, 120, 130, 140, 150, // 终点通道
    111 // 终点
  ];
  
  // 蓝色路径：201 → 014-052-001-010 → 210-250 → 222
  const bluePath = [
    201, // 起飞点
    14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
    31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50,
    51, 52,
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    210, 220, 230, 240, 250, // 终点通道
    222 // 终点
  ];
  
  // 红色路径：301 → 027-052-001-024 → 310-350 → 333
  const redPath = [
    301, // 起飞点
    27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50,
    51, 52,
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
    310, 320, 330, 340, 350, // 终点通道
    333 // 终点
  ];
  
  // 绿色路径：401 → 040-052-001-037 → 410-450 → 444
  const greenPath = [
    401, // 起飞点
    40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52,
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37,
    410, 420, 430, 440, 450, // 终点通道
    444 // 终点
  ];
  
  // 转换为带坐标的路径
  const convertPath = (path) => {
    return path.map((cellNum, index) => {
      const cell = cellMap[cellNum];
      return {
        cellNum,
        row: cell.row,
        col: cell.col,
        index
      };
    });
  };
  
  return {
    yellow: convertPath(yellowPath),
    blue: convertPath(bluePath),
    red: convertPath(redPath),
    green: convertPath(greenPath)
  };
}

/**
 * 生成001-052的颜色循环（从001为绿色起始，按黄、蓝、红、绿循环）
 */
function generateMainPathColors() {
  const colors = {};
  const colorCycle = ["green", "yellow", "blue", "red"]; // 001是绿色
  
  for (let i = 1; i <= 52; i++) {
    colors[i] = colorCycle[(i - 1) % 4];
  }
  
  return colors;
}

/**
 * 获取棋盘配置
 */
function getBoardConfig() {
  const colorPaths = generateColorPaths();
  const mainPathColors = generateMainPathColors();
  const cellMap = createCellMap();
  
  return {
    layout: BOARD_LAYOUT,
    colorPaths,
    mainPathColors,
    cellMap,
    
    // 基地位置（4个格子）
    basePositions: {
      yellow: [[1,1], [1,2], [2,1], [2,2]],
      blue: [[1,12], [1,13], [2,12], [2,13]],
      red: [[12,12], [12,13], [13,12], [13,13]],
      green: [[12,1], [12,2], [13,1], [13,2]],
    },
    
    // 起飞点
    startCells: {
      yellow: 101,
      blue: 201,
      red: 301,
      green: 401,
    },
    
    // 终点
    endCells: {
      yellow: 111,
      blue: 222,
      red: 333,
      green: 444,
    },
    
    // 特殊跳跃点映射（颜色 → {from: to}）
    specialJumps: {
      green: { 6: 18 },   // 绿色棋子006→018
      yellow: { 20: 32 }, // 黄色棋子020→032
      blue: { 34: 46 },   // 蓝色棋子034→046
      red: { 48: 4 },     // 红色棋子048→004
    },
  };
}

/**
 * 创建飞行棋初始状态
 */
function createFlyingState(maxPlayers = 4) {
  const mp = Math.max(2, Math.min(4, Number(maxPlayers) || 4));
  return {
    gameType: "flying",
    maxPlayers: mp, // 2-4人
    order: [],
    players: {},
    currentIndex: 0,
    dice: null,
    phase: GAME_PHASE.WAITING_DICE,
    turn: null,
    lastAction: null,
    consecutiveSixCount: 0,
    canMovePlanes: [],
    gameOver: false,
    winner: null,
    gameStarted: false,
    board: getBoardConfig(),
  };
}

/**
 * 确保玩家存在
 */
function ensureFlyingPlayer(room, clientId) {
  const state = room.gameState;
  if (!state || state.gameType !== "flying") return;
  if (!state.players) state.players = {};
  if (!state.order) state.order = [];

  if (state.players[clientId]) return;
  if (state.order.length >= state.maxPlayers) return;

  const color = COLORS[state.order.length];
  state.order.push(clientId);
  state.players[clientId] = {
    id: clientId,
    color,
    pieces: Array.from({ length: PIECES_PER_PLAYER }, () => ({
      position: "home",
      row: -1,
      col: -1,
      pathIndex: -1,
      cellNum: -1,
    })),
    finished: 0,
  };

  // 至少2人即可开始游戏（无需满员）
  if (state.order.length >= 2 && !state.gameStarted) {
    startFlyingGame(state);
  }
}

/**
 * 开始游戏
 */
function startFlyingGame(state) {
  console.log("[飞行棋] 游戏开始");
  
  // 随机打乱顺序
  for (let i = state.order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.order[i], state.order[j]] = [state.order[j], state.order[i]];
  }
  
  state.currentIndex = 0;
  state.gameStarted = true;
  state.phase = GAME_PHASE.WAITING_DICE;
  
  const firstPlayer = state.players[state.order[0]];
  state.turn = firstPlayer.color;
  state.lastAction = `游戏开始！${COLOR_NAMES[firstPlayer.color]} 先手`;
}

/**
 * 处理飞行棋行动
 */
function applyFlyingAction(room, clientId, data) {
  const state = room.gameState;
  if (!state || state.gameType !== "flying") {
    return { ok: false, error: "房间不是飞行棋" };
  }
  if (state.gameOver) {
    return { ok: false, error: "游戏已结束" };
  }
  if (!state.gameStarted) {
    return { ok: false, error: "游戏尚未开始" };
  }

  const currentPlayerId = state.order[state.currentIndex];
  if (currentPlayerId !== clientId) {
    return { ok: false, error: "还没轮到你行动" };
  }

  const player = state.players[clientId];
  if (!player) {
    return { ok: false, error: "玩家信息不存在" };
  }

  if (data.action === "roll") {
    return handleRollDice(state, player);
  } else if (data.action === "move") {
    return handleMovePlane(state, player, data);
  }
  
  return { ok: false, error: "未知操作" };
}

/**
 * 掷骰子
 */
function handleRollDice(state, player) {
  if (state.phase !== GAME_PHASE.WAITING_DICE) {
    return { ok: false, error: "当前不能掷骰子" };
  }
  
  const dice = Math.floor(Math.random() * 6) + 1;
  state.dice = dice;
  
  console.log(`[飞行棋] ${COLOR_NAMES[player.color]} 掷出 ${dice} 点`);
  
  // 检查连续6
  if (dice === 6) {
    state.consecutiveSixCount += 1;
    if (state.consecutiveSixCount >= MAX_CONSECUTIVE_SIX) {
      state.lastAction = `${COLOR_NAMES[player.color]} 连续三次6，本轮取消！`;
      state.dice = null;
      state.consecutiveSixCount = 0;
      state.canMovePlanes = [];
      advanceTurn(state);
      return { ok: true, payload: { type: "flying_state", gameType: "flying", state } };
    }
  } else {
    state.consecutiveSixCount = 0;
  }
  
  state.lastAction = `${COLOR_NAMES[player.color]} 掷出 ${dice} 点`;
  
  // 检查可移动的棋子
  const legalMoves = getLegalMoves(state, player, dice);
  state.canMovePlanes = legalMoves;
  
  if (legalMoves.length === 0) {
    state.lastAction = `${COLOR_NAMES[player.color]} 无子可走`;
    // 先进入选择阶段，让客户端显示骰子
    state.phase = GAME_PHASE.SELECTING_PLANE;
    
    // 返回状态，让客户端显示骰子动画
    return { ok: true, payload: { type: "flying_state", gameType: "flying", state }, noMoves: true };
  }
  
  // 进入选择棋子阶段
  state.phase = GAME_PHASE.SELECTING_PLANE;
  
  // 不论有几个可移动棋子，都先返回状态让客户端显示骰子
  return { ok: true, payload: { type: "flying_state", gameType: "flying", state } };
}

/**
 * 移动棋子
 */
function handleMovePlane(state, player, data) {
  if (state.phase !== GAME_PHASE.SELECTING_PLANE) {
    return { ok: false, error: "当前不能移动" };
  }
  
  const pieceIndex = Number(data.pieceIndex);
  if (!state.canMovePlanes.includes(pieceIndex)) {
    return { ok: false, error: "该棋子不能移动" };
  }
  
  state.phase = GAME_PHASE.MOVING;
  
  const moveResult = applyMove(state, player, pieceIndex, state.dice);
  if (!moveResult.ok) {
    state.phase = GAME_PHASE.SELECTING_PLANE;
    return { ok: false, error: moveResult.error };
  }
  
  state.lastAction = moveResult.message;
  
  // 检查胜利
  if (player.finished >= PIECES_PER_PLAYER) {
    state.gameOver = true;
    state.winner = player.color;
    state.phase = GAME_PHASE.GAME_OVER;
    state.lastAction = `🎉 ${COLOR_NAMES[player.color]} 获胜！`;
  } else {
    // 检查是否获得额外回合
    const shouldGetExtraTurn = state.dice === 6;
    state.dice = null;
    state.canMovePlanes = [];
    state.phase = GAME_PHASE.WAITING_DICE;
    
    if (!shouldGetExtraTurn) {
      state.consecutiveSixCount = 0;
      advanceTurn(state);
    }
  }
  
  return { ok: true, payload: { type: "flying_state", gameType: "flying", state } };
}

/**
 * 获取可移动的棋子
 */
function getLegalMoves(state, player, dice) {
  const legal = [];
  const board = state.board;
  const path = board.colorPaths[player.color];
  
  player.pieces.forEach((piece, idx) => {
    if (piece.position === "finished") return;
    
    if (piece.position === "home") {
      // 只有掷出6才能起飞
      if (dice === 6) legal.push(idx);
    } else if (piece.position === "track") {
      // 检查是否能移动（不会超出终点）
      const newIndex = piece.pathIndex + dice;
      if (newIndex < path.length) {
        legal.push(idx);
      } else {
        // 超出终点，需要反弹
        const overflow = newIndex - (path.length - 1);
        const finalIndex = (path.length - 1) - overflow;
        if (finalIndex >= 0) {
          legal.push(idx);
        }
      }
    }
  });
  
  return legal;
}

/**
 * 执行移动
 */
function applyMove(state, player, pieceIndex, dice) {
  const piece = player.pieces[pieceIndex];
  const board = state.board;
  const path = board.colorPaths[player.color];
  let message = `${COLOR_NAMES[player.color]} 移动第 ${pieceIndex + 1} 枚棋子`;
  
  // 从基地起飞
  if (piece.position === "home") {
    if (dice !== 6) {
      return { ok: false, error: "只有6点才能起飞" };
    }
    
    const startCell = board.startCells[player.color];
    const startPos = board.cellMap[startCell];
    
    piece.position = "track";
    piece.pathIndex = 0;
    piece.cellNum = startCell;
    piece.row = startPos.row;
    piece.col = startPos.col;
    
    message += "，起飞！";
    checkCollision(state, player, piece, pieceIndex);
    
    return { ok: true, message };
  }
  
  // 在路径上移动
  if (piece.position === "track") {
    let currentIndex = piece.pathIndex;
    let stepsRemaining = dice;
    let jumpMessages = [];
    let hasJumped = false; // 标记是否已经触发过打飞机
    
    while (stepsRemaining > 0) {
      currentIndex++;
      stepsRemaining--;
      
      // 检查是否超出终点
      if (currentIndex >= path.length) {
        // 超出终点，反弹
        const overflow = currentIndex - (path.length - 1);
        currentIndex = (path.length - 1) - overflow;
        
        if (currentIndex < 0) {
          return { ok: false, error: "移动距离过远" };
        }
      }
      
      const currentCell = path[currentIndex];
      piece.pathIndex = currentIndex;
      piece.cellNum = currentCell.cellNum;
      piece.row = currentCell.row;
      piece.col = currentCell.col;
    }
    
    // 所有移动完成后，检查是否到达终点
    if (piece.cellNum === board.endCells[player.color]) {
      piece.position = "finished";
      player.finished++;
      message += "，到达终点！";
      return { ok: true, message };
    }
    
    // 检查特殊规则
    // 1. 检查特殊跳跃（006→018等）
    const specialJump = board.specialJumps[player.color];
    if (specialJump && specialJump[piece.cellNum]) {
      const targetCell = specialJump[piece.cellNum];
      
      // 在路径中找到目标格子
      for (let i = currentIndex + 1; i < path.length; i++) {
        if (path[i].cellNum === targetCell) {
          piece.pathIndex = i;
          piece.cellNum = path[i].cellNum;
          piece.row = path[i].row;
          piece.col = path[i].col;
          jumpMessages.push(`特殊跳跃→${targetCell}`);
          
          // 检查是否到达终点
          if (piece.cellNum === board.endCells[player.color]) {
            piece.position = "finished";
            player.finished++;
            message += `，${jumpMessages.join('，')}，到达终点！`;
            return { ok: true, message };
          }
          break;
        }
      }
    }
    
    // 2. 检查打飞机（颜色跳跃）- 只在普通行走时触发一次
    // 判断当前格子是否是自己颜色的格子（001-052范围内）
    // 排除011、024、037、050这四个格子
    if (!hasJumped && piece.cellNum >= 1 && piece.cellNum <= 52) {
      // 排除不触发打飞机的格子
      if (piece.cellNum !== 11 && piece.cellNum !== 24 && piece.cellNum !== 37 && piece.cellNum !== 50) {
        const cellColor = board.mainPathColors[piece.cellNum];
        if (cellColor === player.color) {
          // 跳跃4格
          jumpMessages.push("打飞机+4");
          hasJumped = true; // 标记已触发，防止再次触发
          
          // 继续移动4格
          currentIndex = piece.pathIndex;
          for (let i = 0; i < 4; i++) {
            currentIndex++;
            
            // 检查是否超出终点
            if (currentIndex >= path.length) {
              // 超出终点，反弹
              const overflow = currentIndex - (path.length - 1);
              currentIndex = (path.length - 1) - overflow;
              
              if (currentIndex < 0) {
                return { ok: false, error: "移动距离过远" };
              }
            }
            
            const jumpCell = path[currentIndex];
            piece.pathIndex = currentIndex;
            piece.cellNum = jumpCell.cellNum;
            piece.row = jumpCell.row;
            piece.col = jumpCell.col;
            
            // 检查是否到达终点
            if (piece.cellNum === board.endCells[player.color]) {
              piece.position = "finished";
              player.finished++;
              message += `，${jumpMessages.join('，')}，到达终点！`;
              return { ok: true, message };
            }
          }
        }
      }
    }
    
    if (jumpMessages.length > 0) {
      message += `，${jumpMessages.join('，')}`;
    }
    
    // 检查碰撞
    checkCollision(state, player, piece, pieceIndex);
    
    return { ok: true, message };
  }
  
  return { ok: false, error: "无法移动" };
}

/**
 * 检查碰撞
 */
function checkCollision(state, player, piece, pieceIndex) {
  const board = state.board;
  
  // 起飞点（x01）和终点通道（x10-x50）是安全区
  const cellNum = piece.cellNum;
  if (cellNum === 101 || cellNum === 201 || cellNum === 301 || cellNum === 401) {
    return; // 起飞点安全
  }
  if ((cellNum >= 110 && cellNum <= 150) || 
      (cellNum >= 210 && cellNum <= 250) || 
      (cellNum >= 310 && cellNum <= 350) || 
      (cellNum >= 410 && cellNum <= 450)) {
    return; // 终点通道安全
  }
  
  // 检查是否有其他玩家的棋子在同一个格子
  Object.values(state.players).forEach(pl => {
    if (pl.id === player.id) return;
    
    // 统计该玩家在此格上有几枚棋子：>=2 枚即为叠子，受保护不被击落
    const sameCellCount = pl.pieces.filter(
      op => op.position === "track" && op.cellNum === piece.cellNum
    ).length;
    if (sameCellCount >= 2) {
      console.log(`[飞行棋] ${COLOR_NAMES[player.color]} 遇到 ${COLOR_NAMES[pl.color]} 的叠子保护，不击落`);
      return;
    }
    
    pl.pieces.forEach((opPiece, opIdx) => {
      if (opPiece.position === "track" && 
          opPiece.cellNum === piece.cellNum) {
        // 打回基地
        opPiece.position = "home";
        opPiece.row = -1;
        opPiece.col = -1;
        opPiece.pathIndex = -1;
        opPiece.cellNum = -1;
        console.log(`[飞行棋] ${COLOR_NAMES[player.color]} 打回了 ${COLOR_NAMES[pl.color]} 的棋子`);
      }
    });
  });
}

/**
 * 切换玩家
 */
function advanceTurn(state) {
  state.currentIndex = (state.currentIndex + 1) % state.order.length;
  const currentPlayer = state.players[state.order[state.currentIndex]];
  state.turn = currentPlayer.color;
}

module.exports = {
  createFlyingState,
  ensureFlyingPlayer,
  applyFlyingAction,
};
