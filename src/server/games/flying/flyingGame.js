/**
 * 飞行棋房间逻辑（服务端）- 经典飞行棋规则实现
 * 
 * 游戏规则：
 * 1. 基本规则：
 *    - 2-4名玩家，每位玩家有4架飞机，颜色：红、黄、蓝、绿
 *    - 棋子从基地出发，按顺时针绕外围一周，最后进入同色终点通道
 *    - 需要精确点数到达终点，超过则倒退
 * 
 * 2. 起飞规则：
 *    - 掷出6点可选择：①从基地起飞一架飞机 ②让已起飞的飞机前进6步
 *    - 掷出6点可额外获得一次掷骰机会（连续三次6点则本轮作废）
 * 
 * 3. 移动规则：
 *    - 飞机只能向前移动
 *    - 落点有敌方飞机则将其击落回基地
 *    - 落点有己方飞机则形成叠子（叠子同时移动且受保护）
 *    - 经过同色跳跃点可跳到下一个同色格子
 *    - 飞机进入终点通道后只能由己方棋子移动
 * 
 * 4. 特殊格子：
 *    - 起飞点（同色大三角）：安全区，不会被击落
 *    - 跳跃点（同色小三角形）：跳跃到下一个同色格子
 *    - 终点通道：只有己方飞机可进入
 *    - 普通格子：可被击落
 */

// 游戏状态枚举
const GAME_PHASE = {
  WAITING_DICE: "WAITING_DICE",       // 等待掷骰子
  SELECTING_PLANE: "SELECTING_PLANE", // 选择要移动的飞机
  MOVING: "MOVING",                   // 执行移动中
  ANIMATING: "ANIMATING",             // 动画播放中
  CHECKING_EVENTS: "CHECKING_EVENTS", // 检查棋盘事件
  NEXT_PLAYER: "NEXT_PLAYER",         // 切换到下一位玩家
  GAME_OVER: "GAME_OVER",             // 游戏结束
};

const COLORS = ["red", "yellow", "blue", "green"];
const COLOR_NAMES = {
  red: "红方",
  yellow: "黄方",
  blue: "蓝方",
  green: "绿方",
};

// 棋盘配置
const GRID_SIZE = 16;                 // 棋盘大小 16x15
const TRACK_LEN = 52;                 // 外围跑道长度（路径格子总数）
const END_PATH_LEN = 3;               // 终点通道长度（到达终点需要走3格2）
const PIECES_PER_PLAYER = 4;          // 每位玩家的飞机数量
const MAX_CONSECUTIVE_SIX = 3;        // 连续三次6则取消本轮

// 特殊格子类型
const CELL_TYPE = {
  NORMAL: "NORMAL",           // 普通格子
  START: "START",             // 起飞点（安全区）
  JUMP: "JUMP",               // 跳跃点
  END_ENTRANCE: "END_ENTRANCE", // 终点通道入口
};

/**
 * 棋盘数据结构 - 15x15格子布局
 * 
 * 格子类型：
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
 * 
 * 棋盘布局（14x15）：
 */
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

/**
 * 获取棋盘配置
 */
function getBoardConfig() {
  // 生成路径序列（按顺时针顺序）
  const trackPath = generateTrackPath();
  
  return {
    layout: BOARD_LAYOUT,
    gridSize: 16,
    
    // 基地位置（行，列）
    basePositions: {
      red: [[1,1], [1,2], [2,1], [2,2]],           // 左上角
      yellow: [[13,1], [13,2], [14,1], [14,2]],    // 左下角
      blue: [[1,12], [1,13], [2,12], [2,13]],      // 右上角
      green: [[13,12], [13,13], [14,12], [14,13]], // 右下角
    },
    
    // 起飞点位置（行，列）
    startPositions: {
      red: [3, 0],      // 左上角起飞点
      yellow: [15, 3],  // 左下角起飞点
      blue: [0, 11],    // 右上角起飞点
      green: [12, 14],  // 右下角起飞点
    },
    
    // 起飞点到最近路径的位置
    startToTrackPositions: {
      red: [4, 0],      // 红色起飞后第一个1的位置
      yellow: [15, 4],  // 黄色起飞后第一个1的位置
      blue: [0, 10],    // 蓝色起飞后第一个1的位置
      green: [11, 14],  // 绿色起飞后第一个1的位置
    },
    
    // 跳跃点配置（格子5的位置和对应的颜色）
    jumpPoints: {
      red: { from: [3, 4], to: [4, 3] },      // 红色跳跃点
      yellow: { from: [11, 3], to: [12, 4] }, // 黄色跳跃点
      blue: { from: [3, 10], to: [4, 11] },   // 蓝色跳跃点
      green: { from: [11, 10], to: [12, 11] },// 绿色跳跃点
    },
    
    // 终点通道入口（进入终点通道前的位置）
    endEntrances: {
      red: [7, 5],      // 红色终点通道入口
      yellow: [8, 7],   // 黄色终点通道入口
      blue: [7, 9],     // 蓝色终点通道入口
      green: [9, 7],    // 绿色终点通道入口
    },
    
    // 终点位置
    endPositions: {
      red: [7, 6],      // 8的位置
      yellow: [8, 7],   // 9的位置
      blue: [7, 8],     // 10的位置
      green: [9, 7],    // 11的位置
    },
    
    // 路径序列（顺时针）
    trackPath: trackPath,
  };
}

/**
 * 生成路径序列（顺时针遍历所有路径格子）
 */
function generateTrackPath() {
  // 手动定义顺时针路径（只包含格子类型为1的格子）
  const pathCoords = [
    // 从红色起飞点附近开始，向下
    [4,0], [5,0], [6,0], [7,0], [8,0], [9,0], [10,0], [11,0],
    // 向右转
    [11,1], [11,2], [11,3],
    // 向上
    [10,3], [9,3], [8,3], [7,3], [6,3], [5,3], [4,3],
    // 继续向上到顶部
    [4,4], [3,4], [2,4], [1,4], [0,4], [0,5], [0,6], [0,7], [0,8], [0,9], [0,10],
    // 蓝色起飞点附近
    [0,11], [1,11], [2,11], [3,11],
    // 向下
    [4,11], [5,11], [6,11], [7,11], [8,11], [9,11], [10,11], [11,11],
    // 向右转
    [11,12], [11,13], [11,14],
    // 绿色起飞点附近，向下
    [12,14], [13,14], [14,14], [15,14],
    // 向左
    [15,13], [15,12], [15,11], [15,10], [15,9], [15,8], [15,7], [15,6], [15,5], [15,4],
    // 黄色起飞点附近
    [15,3], [14,3], [13,3], [12,3],
    // 向上
    [11,3], [10,3], [9,3], [8,3], [7,3], [6,3], [5,3], [4,3],
    // 回到起点附近
    [4,2], [4,1],
  ];
  
  return pathCoords;
}

/**
 * 创建飞行棋初始状态
 * @param {number} maxPlayers
 */
function createFlyingState(maxPlayers = 4) {
  const mp = Math.max(2, Math.min(4, Number(maxPlayers) || 4));
  return {
    gameType: "flying",
    maxPlayers: mp,
    
    // 玩家顺序（clientId 数组）
    order: [],
    
    // clientId -> playerState
    players: {},
    
    // 当前轮到 order[currentIndex] 行动
    currentIndex: 0,
    
    // 当前骰子点数（null 表示还未掷骰）
    dice: null,
    
    // 游戏阶段
    phase: GAME_PHASE.WAITING_DICE,
    
    // 当前轮到的颜色（方便前端展示）
    turn: null,
    
    // 最近一次动作描述（系统提示用）
    lastAction: null,
    
    // 连续掷出6的次数（用于实现"连续三次6取消"规则）
    consecutiveSixCount: 0,
    
    // 当前回合是否因为连续三次6而被取消
    turnCancelled: false,
    
    // 可移动的飞机索引列表
    canMovePlanes: [],
    
    // 当前选中的飞机
    selectedPlane: null,
    
    // 游戏结束标志
    gameOver: false,
    winner: null, // 颜色字符串
    
    // 游戏是否已开始（所有玩家加入后才会开始）
    gameStarted: false,
    
    // 棋盘配置
    board: getBoardConfig(),
  };
}

/**
 * 确保房间中存在指定玩家的飞行棋信息
 * - 按加入顺序分配颜色：红、黄、蓝、绿
 * - 当所有玩家加入后，随机打乱顺序并开始游戏
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
    // 初始化所有飞机在基地
    pieces: Array.from({ length: PIECES_PER_PLAYER }, () => ({
      position: "home",    // 'home' | 'track' | 'end_path' | 'finished'
      row: -1,             // 在棋盘上的行位置
      col: -1,             // 在棋盘上的列位置
      trackIndex: -1,      // 在路径序列中的索引
      stackedWith: [],     // 叠子：与哪些飞机叠在一起（存储 {playerId, pieceIndex}）
    })),
    finished: 0,           // 已到达终点的飞机数量
  };

  // 当所有玩家加入后，随机确定顺序并开始游戏
  if (state.order.length === state.maxPlayers && !state.gameStarted) {
    startFlyingGame(state);
  }
}

/**
 * 游戏开始时，随机确定玩家顺序并初始化所有飞机在基地
 */
function startFlyingGame(state) {
  console.log("[飞行棋] 所有玩家已加入，开始游戏初始化...");
  
  // 随机打乱玩家顺序
  for (let i = state.order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.order[i], state.order[j]] = [state.order[j], state.order[i]];
  }
  
  console.log("[飞行棋] 玩家顺序已随机确定:", state.order.map(id => {
    const p = state.players[id];
    return `${COLOR_NAMES[p.color]}(${id.slice(0, 8)})`;
  }).join(" -> "));
  
  // 确保所有飞机都在基地
  Object.values(state.players).forEach(player => {
    player.pieces.forEach(piece => {
      piece.position = "home";
      piece.row = -1;
      piece.col = -1;
      piece.trackIndex = -1;
      piece.stackedWith = [];
    });
    player.finished = 0;
  });
  
  // 设置第一个玩家的回合
  state.currentIndex = 0;
  state.dice = null;
  state.phase = GAME_PHASE.WAITING_DICE;
  state.consecutiveSixCount = 0;
  state.turnCancelled = false;
  state.canMovePlanes = [];
  state.selectedPlane = null;
  state.gameStarted = true;
  
  const firstPlayer = state.players[state.order[0]];
  state.turn = firstPlayer.color;
  state.lastAction = `游戏开始！${COLOR_NAMES[firstPlayer.color]} 先手`;
  
  console.log(`[飞行棋] 游戏开始！当前回合: ${COLOR_NAMES[state.turn]}`);
  console.log(`[飞行棋] 状态: ${state.phase}`);
}

/**
 * 服务端处理飞行棋行动 - 严格的状态机流程
 * 核心循环：掷骰子→判断起飞条件→选择移动的飞机→执行移动→触发格子事件→检查是否到达终点→切换到下一位玩家
 * data: { action: 'roll' } 或 { action: 'move', pieceIndex:number }
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
    return { ok: false, error: "游戏尚未开始，等待所有玩家加入" };
  }

  const currentPlayerId = state.order[state.currentIndex] || null;
  if (!currentPlayerId || currentPlayerId !== clientId) {
    return { ok: false, error: "还没轮到你行动" };
  }

  const player = state.players[clientId];
  if (!player) {
    return { ok: false, error: "玩家信息不存在" };
  }

  const action = data.action;
  
  // 阶段1 - 掷骰子
  if (action === "roll") {
    return handleRollDice(state, player);
  } 
  // 阶段2-6 - 选择并移动飞机
  else if (action === "move") {
    return handleMovePlane(state, player, data);
  } else {
    return { ok: false, error: "未知操作" };
  }
}

/**
 * 阶段1 - 掷骰子
 * 规则：掷出6获得额外回合；连续三次6则本轮行动取消
 */
function handleRollDice(state, player) {
  if (state.phase !== GAME_PHASE.WAITING_DICE) {
    return { ok: false, error: `当前不能掷骰子，状态: ${state.phase}` };
  }
  
  console.log(`[飞行棋] ${COLOR_NAMES[player.color]} 开始掷骰子...`);
  
  const dice = Math.floor(Math.random() * 6) + 1;
  state.dice = dice;
  
  console.log(`[飞行棋] ${COLOR_NAMES[player.color]} 掷出了 ${dice} 点`);
  
  // 检查连续三次6的规则
  if (dice === 6) {
    state.consecutiveSixCount += 1;
    console.log(`[飞行棋] 连续6的次数: ${state.consecutiveSixCount}`);
    
    if (state.consecutiveSixCount >= MAX_CONSECUTIVE_SIX) {
      // 连续三次6，取消本轮行动
      state.turnCancelled = true;
      state.lastAction = `${COLOR_NAMES[player.color]} 连续三次掷出6点，本轮行动取消！`;
      console.log(`[飞行棋] ⚠️ ${COLOR_NAMES[player.color]} 连续三次6，本轮行动取消！`);
      
      // 重置状态并切换到下一位玩家
      state.dice = null;
      state.consecutiveSixCount = 0;
      state.turnCancelled = false;
      state.canMovePlanes = [];
      state.phase = GAME_PHASE.WAITING_DICE;
      advanceTurn(state);
      updateTurnInfo(state);
      
      return {
        ok: true,
        payload: {
          type: "flying_state",
          gameType: "flying",
          state,
        },
      };
    } else {
      state.lastAction = `${COLOR_NAMES[player.color]} 掷出了 6 点！可以起飞或移动，且获得额外回合`;
    }
  } else {
    // 非6点，重置连续6计数
    state.consecutiveSixCount = 0;
    state.lastAction = `${COLOR_NAMES[player.color]} 掷出了 ${dice} 点`;
  }
  
  // 判断起飞条件 - 检查是否有可移动的棋子
  const legalMoves = getLegalMoves(state, player, dice);
  state.canMovePlanes = legalMoves;
  
  if (legalMoves.length === 0) {
    console.log(`[飞行棋] ${COLOR_NAMES[player.color]} 无子可走，自动跳过`);
    state.lastAction = `${COLOR_NAMES[player.color]} 无子可走，轮到下一位玩家`;
    
    // 重置状态并切换到下一位玩家
    state.dice = null;
    state.consecutiveSixCount = 0;
    state.canMovePlanes = [];
    state.phase = GAME_PHASE.WAITING_DICE;
    
    // 如果掷出的是6，也不获得额外回合（因为无子可走）
    advanceTurn(state);
    updateTurnInfo(state);
    
    return {
      ok: true,
      payload: {
        type: "flying_state",
        gameType: "flying",
        state,
      },
    };
  }
  
  // 如果只有一个可移动的棋子，自动选择并移动
  if (legalMoves.length === 1) {
    console.log(`[飞行棋] ${COLOR_NAMES[player.color]} 只有一个可移动的棋子，自动移动`);
    state.phase = GAME_PHASE.SELECTING_PLANE;
    return handleMovePlane(state, player, { pieceIndex: legalMoves[0] });
  }
  
  console.log(`[飞行棋] ${COLOR_NAMES[player.color]} 可移动的棋子: ${legalMoves.map(i => i + 1).join(", ")}`);
  state.phase = GAME_PHASE.SELECTING_PLANE;
  
  return {
    ok: true,
    payload: {
      type: "flying_state",
      gameType: "flying",
      state,
    },
  };
}

/**
 * 阶段2-6 - 选择并移动飞机
 * 流程：选择移动的飞机→执行移动→触发格子事件→检查是否到达终点→切换到下一位玩家
 */
function handleMovePlane(state, player, data) {
  if (state.phase !== GAME_PHASE.SELECTING_PLANE) {
    return { ok: false, error: `当前不能移动飞机，状态: ${state.phase}` };
  }
  if (typeof state.dice !== "number") {
    return { ok: false, error: "请先掷骰子" };
  }
  
  const pieceIndex = Number(data.pieceIndex);
  if (!Number.isInteger(pieceIndex) || pieceIndex < 0 || pieceIndex >= PIECES_PER_PLAYER) {
    return { ok: false, error: "棋子编号不合法" };
  }
  
  // 检查该棋子是否在可移动列表中
  if (state.canMovePlanes.length > 0 && !state.canMovePlanes.includes(pieceIndex)) {
    return { ok: false, error: "该棋子不能移动" };
  }
  
  console.log(`[飞行棋] ${COLOR_NAMES[player.color]} 选择移动第 ${pieceIndex + 1} 枚棋子`);
  state.phase = GAME_PHASE.MOVING;
  state.selectedPlane = pieceIndex;
  
  // 阶段3 - 执行移动
  const moveResult = applyFlyingMove(state, player, pieceIndex, state.dice);
  if (!moveResult.ok) {
    // 移动失败，回到选择阶段
    state.phase = GAME_PHASE.SELECTING_PLANE;
    state.selectedPlane = null;
    return { ok: false, error: moveResult.error || "该棋子不能这样走" };
  }
  
  console.log(`[飞行棋] ${moveResult.message}`);
  
  // 阶段4 - 触发格子事件（打飞机、跳跃等）
  if (moveResult.hitPlayers && moveResult.hitPlayers.length > 0) {
    moveResult.hitPlayers.forEach(hp => {
      console.log(`[飞行棋] 触发事件: ${COLOR_NAMES[player.color]} 打回了 ${COLOR_NAMES[hp.color]} 的棋子`);
    });
  }
  
  if (moveResult.jumped) {
    console.log(`[飞行棋] 触发跳跃: ${COLOR_NAMES[player.color]} 的棋子跳跃到新位置`);
  }
  
  state.lastAction = moveResult.message;
  
  // 阶段5 - 检查是否到达终点
  const reachedFinish = moveResult.reachedFinish;
  if (reachedFinish) {
    console.log(`[飞行棋] ${COLOR_NAMES[player.color]} 第 ${pieceIndex + 1} 枚棋子到达终点！已完成: ${player.finished}/${PIECES_PER_PLAYER}`);
  }
  
  // 阶段6 - 切换到下一位玩家（或继续当前玩家回合，如果掷出6）
  const diceWasSix = state.dice === 6;
  const shouldGetExtraTurn = diceWasSix && !state.turnCancelled;
  
  // 重置状态
  state.dice = null;
  state.canMovePlanes = [];
  state.selectedPlane = null;
  state.phase = GAME_PHASE.WAITING_DICE;
  
  // 判胜：该玩家 4 子全部到家
  if (player.finished >= PIECES_PER_PLAYER) {
    state.gameOver = true;
    state.winner = player.color;
    state.phase = GAME_PHASE.GAME_OVER;
    console.log(`[飞行棋] 🎉 游戏结束！${COLOR_NAMES[player.color]} 获胜！`);
  } else if (shouldGetExtraTurn) {
    // 掷出6，获得额外回合（不切换玩家）
    console.log(`[飞行棋] ${COLOR_NAMES[player.color]} 掷出6点，获得额外回合！`);
    // 注意：consecutiveSixCount 已在 handleRollDice 中更新，这里不需要重置
  } else {
    // 正常切换玩家
    state.consecutiveSixCount = 0; // 重置连续6计数
    advanceTurn(state);
  }
  
  updateTurnInfo(state);
  
  return {
    ok: true,
    payload: {
      type: "flying_state",
      gameType: "flying",
      state,
    },
  };
}

/**
 * 获取当前玩家可以合法移动的棋子列表
 */
function getLegalMoves(state, player, dice) {
  const legal = [];
  const board = state.board;
  
  player.pieces.forEach((piece, idx) => {
    // 检查该棋子是否可以移动
    if (piece.position === "home") {
      // 在基地，只有6点才能起飞
      if (dice === 6) {
        legal.push(idx);
      }
    } else if (piece.position === "track") {
      // 在跑道上，检查移动后的位置
      const nextPos = calculateNextPosition(state, player, piece, dice);
      if (nextPos.valid) {
        legal.push(idx);
      }
    } else if (piece.position === "end_path") {
      // 在终点通道上，检查是否能到达终点
      // 简化：终点通道只需要走到终点格子即可
      legal.push(idx);
    }
    // finished 状态的棋子不能移动
  });
  
  return legal;
}

/**
 * 计算飞机移动后的位置
 * 返回 { valid: boolean, row: number, col: number, trackIndex: number, reachedEnd: boolean }
 */
function calculateNextPosition(state, player, piece, dice) {
  const board = state.board;
  const trackPath = board.trackPath;
  const layout = board.layout;
  
  if (piece.position === "track") {
    const currentIndex = piece.trackIndex;
    let newIndex = currentIndex + dice;
    
    // 检查是否超出路径
    if (newIndex >= trackPath.length) {
      // 检查是否进入终点通道
      const endPos = board.endPositions[player.color];
      if (endPos) {
        // 进入终点通道或到达终点
        return { valid: true, reachedEnd: true, row: endPos[0], col: endPos[1] };
      }
      return { valid: false };
    }
    
    // 检查跳跃点
    const newCoord = trackPath[newIndex];
    const cellType = layout[newCoord[0]][newCoord[1]];
    
    if (cellType === 5) {
      // 跳跃点，找到下一个6的位置
      for (let i = newIndex + 1; i < trackPath.length; i++) {
        const coord = trackPath[i];
        if (layout[coord[0]][coord[1]] === 6) {
          newIndex = i;
          break;
        }
      }
    }
    
    const finalCoord = trackPath[newIndex];
    return {
      valid: true,
      row: finalCoord[0],
      col: finalCoord[1],
      trackIndex: newIndex,
      reachedEnd: false,
    };
  }
  
  return { valid: false };
}

/**
 * 阶段3 - 根据骰子尝试移动棋子
 * 包含：判断起飞条件、执行移动、触发格子事件（打飞机、跳跃）
 */
function applyFlyingMove(state, player, pieceIndex, dice) {
  const piece = player.pieces[pieceIndex];
  if (!piece) return { ok: false, error: "棋子不存在" };

  const board = state.board;
  let hitPlayers = [];
  let reachedFinish = false;
  let jumped = false;

  // 判断起飞条件
  if (piece.position === "home") {
    if (dice !== 6) {
      return { ok: false, error: "只有掷出 6 点才能起飞" };
    }
    // 起飞：进入起飞点
    const startPos = board.startPositions[player.color];
    console.log(`[飞行棋] ${COLOR_NAMES[player.color]} 第 ${pieceIndex + 1} 枚棋子起飞到起飞点！`);
    piece.position = "track";
    piece.row = startPos[0];
    piece.col = startPos[1];
    piece.trackIndex = -1; // 起飞点不在路径序列中
    
    // 检查起飞点是否有敌方飞机（起飞点是安全区，不会打飞机）
    checkStacking(state, player, piece, pieceIndex);
    
  } else if (piece.position === "track") {
    // 在跑道上移动
    let stepsToMove = dice;
    
    // 如果当前在起飞点（trackIndex === -1），先移动到最近的1路径
    if (piece.trackIndex === -1) {
      const startToTrack = board.startToTrackPositions[player.color];
      piece.row = startToTrack[0];
      piece.col = startToTrack[1];
      
      // 找到这个位置在路径序列中的索引
      const trackPath = board.trackPath;
      for (let i = 0; i < trackPath.length; i++) {
        if (trackPath[i][0] === piece.row && trackPath[i][1] === piece.col) {
          piece.trackIndex = i;
          break;
        }
      }
      
      stepsToMove = dice - 1; // 已经走了1步到路径上
      console.log(`[飞行棋] ${COLOR_NAMES[player.color]} 第 ${pieceIndex + 1} 枚棋子从起飞点移动到路径，还需移动 ${stepsToMove} 步`);
    }
    
    if (stepsToMove > 0) {
      const nextPos = calculateNextPosition(state, player, piece, stepsToMove);
      if (!nextPos.valid) {
        return { ok: false, error: "无法移动到该位置" };
      }

      const oldRow = piece.row;
      const oldCol = piece.col;
      
      if (nextPos.reachedEnd) {
        // 到达终点
        piece.position = "finished";
        piece.row = nextPos.row;
        piece.col = nextPos.col;
        piece.trackIndex = -1;
        player.finished += 1;
        reachedFinish = true;
        console.log(`[飞行棋] ${COLOR_NAMES[player.color]} 第 ${pieceIndex + 1} 枚棋子到达终点！`);
      } else {
        // 仍在跑道上
        piece.row = nextPos.row;
        piece.col = nextPos.col;
        piece.trackIndex = nextPos.trackIndex;
        console.log(`[飞行棋] ${COLOR_NAMES[player.color]} 第 ${pieceIndex + 1} 枚棋子从 (${oldRow},${oldCol}) 移动到 (${nextPos.row},${nextPos.col})`);
        
        // 检查是否触发跳跃
        const cellType = board.layout[piece.row][piece.col];
        if (cellType === 6) {
          jumped = true;
          console.log(`[飞行棋] 触发跳跃！到达跳跃目标点`);
        }
        
        // 检查是否打飞机或形成叠子
        hitPlayers = checkCollision(state, player, piece, pieceIndex);
      }
    }
    
  } else if (piece.position === "end_path") {
    // 在终点通道上，直接到达终点
    const endPos = board.endPositions[player.color];
    piece.position = "finished";
    piece.row = endPos[0];
    piece.col = endPos[1];
    player.finished += 1;
    reachedFinish = true;
    console.log(`[飞行棋] ${COLOR_NAMES[player.color]} 第 ${pieceIndex + 1} 枚棋子到达终点！`);
    
  } else if (piece.position === "finished") {
    return { ok: false, error: "该棋子已经到家了" };
  }

  const colorName = COLOR_NAMES[player.color] || "玩家";
  let message = `${colorName} 移动了第 ${pieceIndex + 1} 枚棋子（骰子：${dice} 点）`;
  
  if (hitPlayers.length > 0) {
    const hitNames = hitPlayers.map(hp => COLOR_NAMES[hp.color]).join("、");
    message += `，打回了 ${hitNames} 的棋子`;
  }
  
  if (jumped) {
    message += `，触发跳跃`;
  }
  
  if (reachedFinish) {
    message += `，到达终点！`;
  }
  
  return {
    ok: true,
    message,
    hitPlayers,
    reachedFinish,
    jumped,
  };
}

/**
 * 检查碰撞：打飞机或形成叠子
 */
function checkCollision(state, player, piece, pieceIndex) {
  const hitPlayers = [];
  const board = state.board;
  const layout = board.layout;
  
  // 检查当前格子类型
  const cellType = layout[piece.row][piece.col];
  
  // 检查是否在起飞点（安全区，格子类型为4）
  const isOnStartPoint = cellType === 4;
  
  Object.values(state.players).forEach((pl) => {
    pl.pieces.forEach((opPiece, opIdx) => {
      if (opPiece.position === "track" && 
          opPiece.row === piece.row && 
          opPiece.col === piece.col &&
          !(pl.id === player.id && opIdx === pieceIndex)) {
        
        if (pl.id === player.id) {
          // 己方飞机，形成叠子
          if (!piece.stackedWith) piece.stackedWith = [];
          if (!opPiece.stackedWith) opPiece.stackedWith = [];
          
          piece.stackedWith.push({ playerId: pl.id, pieceIndex: opIdx });
          opPiece.stackedWith.push({ playerId: player.id, pieceIndex });
          
          console.log(`[飞行棋] ${COLOR_NAMES[player.color]} 的棋子形成叠子`);
        } else {
          // 敌方飞机
          // 检查对方是否在起飞点（安全区）
          const opCellType = layout[opPiece.row][opPiece.col];
          const isOpOnStartPoint = opCellType === 4;
          
          // 如果对方在起飞点（安全区），不能打飞机
          if (!isOpOnStartPoint) {
            // 检查对方是否有叠子保护
            if (!opPiece.stackedWith || opPiece.stackedWith.length === 0) {
              // 打回基地
              opPiece.position = "home";
              opPiece.row = -1;
              opPiece.col = -1;
              opPiece.trackIndex = -1;
              opPiece.stackedWith = [];
              hitPlayers.push(pl);
              console.log(`[飞行棋] ${COLOR_NAMES[player.color]} 打回了 ${COLOR_NAMES[pl.color]} 的棋子！`);
            } else {
              console.log(`[飞行棋] ${COLOR_NAMES[pl.color]} 的棋子有叠子保护，无法打回`);
            }
          }
        }
      }
    });
  });
  
  return hitPlayers;
}

/**
 * 检查叠子
 */
function checkStacking(state, player, piece, pieceIndex) {
  Object.values(state.players).forEach((pl) => {
    if (pl.id !== player.id) return;
    
    pl.pieces.forEach((opPiece, opIdx) => {
      if (opPiece.position === "track" && 
          opPiece.row === piece.row && 
          opPiece.col === piece.col &&
          opIdx !== pieceIndex) {
        // 己方飞机，形成叠子
        if (!piece.stackedWith) piece.stackedWith = [];
        if (!opPiece.stackedWith) opPiece.stackedWith = [];
        
        piece.stackedWith.push({ playerId: pl.id, pieceIndex: opIdx });
        opPiece.stackedWith.push({ playerId: player.id, pieceIndex });
        
        console.log(`[飞行棋] ${COLOR_NAMES[player.color]} 的棋子形成叠子`);
      }
    });
  });
}

/**
 * 切换到下一位玩家
 */
function advanceTurn(state) {
  if (!state.order || state.order.length === 0) return;
  const oldIndex = state.currentIndex;
  state.currentIndex = (state.currentIndex + 1) % state.order.length;
  
  const oldPlayer = state.players[state.order[oldIndex]];
  const newPlayer = state.players[state.order[state.currentIndex]];
  
  if (oldPlayer && newPlayer) {
    console.log(`[飞行棋] 回合切换: ${COLOR_NAMES[oldPlayer.color]} -> ${COLOR_NAMES[newPlayer.color]}`);
  }
}

/**
 * 更新当前回合信息（方便前端显示）
 */
function updateTurnInfo(state) {
  if (state.gameOver) return;
  
  const currentId = state.order[state.currentIndex];
  const currentPlayer = state.players[currentId];
  if (currentPlayer) {
    state.turn = currentPlayer.color;
    console.log(`[飞行棋] 当前回合: ${COLOR_NAMES[state.turn]}, 状态: ${state.phase}`);
  }
}

module.exports = {
  createFlyingState,
  ensureFlyingPlayer,
  applyFlyingAction,
};

