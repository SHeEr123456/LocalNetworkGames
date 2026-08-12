/**
 * 大富翁（环球之旅风格）— 服务端权威逻辑
 * 长方形环绕棋盘：掷骰 → 落地买地/交租/机会卡，最后存活者获胜
 */

const GAME_PHASE = {
  WAITING_PLAYERS: "WAITING_PLAYERS",
  WAITING_DICE: "WAITING_DICE",
  DECISION: "DECISION", // 可买地：买或跳过
  GAME_OVER: "GAME_OVER",
};

const COLORS = ["red", "blue", "green", "yellow"];
const COLOR_NAMES = {
  red: "红方",
  blue: "蓝方",
  green: "绿方",
  yellow: "黄方",
};

const START_MONEY = 1500;
const SALARY = 200;
const JAIL_FINE = 50;

/** 28 格环绕棋盘（台湾之旅 / 法国之旅式） */
const BOARD_SQUARES = [
  { id: 0, name: "起点", type: "start" },
  { id: 1, name: "北京", type: "property", price: 100, colorGroup: "a" },
  { id: 2, name: "机会", type: "chance" },
  { id: 3, name: "上海", type: "property", price: 120, colorGroup: "a" },
  { id: 4, name: "广州", type: "property", price: 140, colorGroup: "a" },
  { id: 5, name: "所得税", type: "tax", amount: 100 },
  { id: 6, name: "深圳", type: "property", price: 160, colorGroup: "b" },
  { id: 7, name: "监狱", type: "jail" },
  { id: 8, name: "杭州", type: "property", price: 180, colorGroup: "b" },
  { id: 9, name: "机会", type: "chance" },
  { id: 10, name: "成都", type: "property", price: 200, colorGroup: "b" },
  { id: 11, name: "武汉", type: "property", price: 220, colorGroup: "c" },
  { id: 12, name: "西安", type: "property", price: 200, colorGroup: "c" },
  { id: 13, name: "南京", type: "property", price: 240, colorGroup: "c" },
  { id: 14, name: "免费停车", type: "parking" },
  { id: 15, name: "重庆", type: "property", price: 260, colorGroup: "d" },
  { id: 16, name: "机会", type: "chance" },
  { id: 17, name: "天津", type: "property", price: 280, colorGroup: "d" },
  { id: 18, name: "苏州", type: "property", price: 300, colorGroup: "d" },
  { id: 19, name: "奢侈税", type: "tax", amount: 150 },
  { id: 20, name: "厦门", type: "property", price: 320, colorGroup: "e" },
  { id: 21, name: "去坐牢", type: "goto_jail" },
  { id: 22, name: "青岛", type: "property", price: 340, colorGroup: "e" },
  { id: 23, name: "机会", type: "chance" },
  { id: 24, name: "大连", type: "property", price: 360, colorGroup: "e" },
  { id: 25, name: "哈尔滨", type: "property", price: 380, colorGroup: "f" },
  { id: 26, name: "机场", type: "property", price: 300, colorGroup: "f" },
  { id: 27, name: "香港", type: "property", price: 400, colorGroup: "f" },
];

const CHANCE_CARDS = [
  { text: "银行分红，获得 $100", money: 100 },
  { text: "中奖！获得 $150", money: 150 },
  { text: "缴纳罚款 $50", money: -50 },
  { text: "医疗费 $80", money: -80 },
  { text: "前进到起点并领取工资", goTo: 0, salary: true },
  { text: "前进 3 格", move: 3 },
  { text: "后退 2 格", move: -2 },
  { text: "去坐牢！", goToJail: true },
  { text: "路费返还，获得 $50", money: 50 },
  { text: "房屋维修，支付 $100", money: -100 },
];

function rentOf(price) {
  return Math.max(20, Math.floor(price / 5));
}

function createMonopolyState(maxPlayers = 4) {
  const mp = Math.max(2, Math.min(4, Number(maxPlayers) || 4));
  return {
    gameType: "monopoly",
    maxPlayers: mp,
    order: [],
    players: {},
    currentIndex: 0,
    dice: null,
    phase: GAME_PHASE.WAITING_PLAYERS,
    turn: null,
    lastAction: "等待玩家加入（至少 2 人开始）",
    pendingSquare: null, // 待决策的地产格 id
    gameOver: false,
    winner: null,
    gameStarted: false,
    board: BOARD_SQUARES,
    owners: {}, // squareId -> clientId
  };
}

function ensureMonopolyPlayer(room, clientId, options = {}) {
  const autoStart = options.autoStart !== false;
  const state = room.gameState;
  if (!state || state.gameType !== "monopoly") return;
  if (!state.players) state.players = {};
  if (!state.order) state.order = [];
  if (state.players[clientId]) return;
  if (state.order.length >= state.maxPlayers) return;

  const color = COLORS[state.order.length];
  state.order.push(clientId);
  state.players[clientId] = {
    id: clientId,
    color,
    money: START_MONEY,
    position: 0,
    inJail: false,
    skipTurns: 0,
    bankrupt: false,
  };

  if (autoStart && state.order.length >= 2 && !state.gameStarted) {
    startMonopolyGame(state);
  } else if (!state.gameStarted) {
    state.lastAction = `已有 ${state.order.length} 人，等待更多玩家…`;
  }
}

function startMonopolyGame(state) {
  for (let i = state.order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.order[i], state.order[j]] = [state.order[j], state.order[i]];
  }

  state.currentIndex = 0;
  state.gameStarted = true;
  state.phase = GAME_PHASE.WAITING_DICE;
  state.owners = {};
  state.dice = null;
  state.pendingSquare = null;
  state.gameOver = false;
  state.winner = null;

  for (const id of state.order) {
    const p = state.players[id];
    p.money = START_MONEY;
    p.position = 0;
    p.inJail = false;
    p.skipTurns = 0;
    p.bankrupt = false;
  }

  const first = state.players[state.order[0]];
  state.turn = first.color;
  state.lastAction = `游戏开始！${COLOR_NAMES[first.color]} 先手`;
}

function applyMonopolyAction(room, clientId, data) {
  const state = room.gameState;
  if (!state || state.gameType !== "monopoly") {
    return { ok: false, error: "房间不是大富翁" };
  }
  if (state.gameOver) return { ok: false, error: "游戏已结束" };
  if (!state.gameStarted) return { ok: false, error: "游戏尚未开始（至少 2 人）" };

  const currentPlayerId = state.order[state.currentIndex];
  // 本地热座：同一连接可代替当前回合玩家行动
  const actingId = room.localMultiplayer ? currentPlayerId : clientId;
  if (currentPlayerId !== actingId) {
    return { ok: false, error: "还没轮到你" };
  }

  const player = state.players[actingId];
  if (!player || player.bankrupt) {
    return { ok: false, error: "无法行动" };
  }

  if (data.action === "roll") return handleRoll(state, player);
  if (data.action === "buy") return handleBuy(state, player);
  if (data.action === "skip") return handleSkipBuy(state, player);

  return { ok: false, error: "未知操作" };
}

function payload(state) {
  return { ok: true, payload: { type: "monopoly_state", gameType: "monopoly", state } };
}

function handleRoll(state, player) {
  if (state.phase !== GAME_PHASE.WAITING_DICE) {
    return { ok: false, error: "当前不能掷骰子" };
  }

  // 出狱：付罚款或跳过一轮（已在 skipTurns 处理）
  if (player.inJail) {
    if (player.skipTurns > 0) {
      player.skipTurns -= 1;
      if (player.skipTurns <= 0) {
        player.inJail = false;
        state.lastAction = `${COLOR_NAMES[player.color]} 出狱，下回合可行动`;
      } else {
        state.lastAction = `${COLOR_NAMES[player.color]} 仍在监狱，跳过本回合`;
      }
      advanceTurn(state);
      return payload(state);
    }
    // 付罚款出狱再掷骰
    if (player.money < JAIL_FINE) {
      bankruptPlayer(state, player, null);
      if (checkWin(state)) return payload(state);
      advanceTurn(state);
      return payload(state);
    }
    player.money -= JAIL_FINE;
    player.inJail = false;
    state.lastAction = `${COLOR_NAMES[player.color]} 支付 $${JAIL_FINE} 出狱`;
  }

  const dice = Math.floor(Math.random() * 6) + 1;
  state.dice = dice;

  const boardLen = state.board.length;
  const from = player.position;
  let to = (from + dice) % boardLen;
  let passedGo = from + dice >= boardLen;

  player.position = to;
  if (passedGo) {
    player.money += SALARY;
    state.lastAction = `${COLOR_NAMES[player.color]} 掷出 ${dice}，经过起点领取 $${SALARY}`;
  } else {
    state.lastAction = `${COLOR_NAMES[player.color]} 掷出 ${dice}`;
  }

  return resolveLanding(state, player);
}

function resolveLanding(state, player) {
  const square = state.board[player.position];
  const name = square.name;

  if (square.type === "start") {
    state.lastAction += `，停在起点`;
    endTurnAfterResolve(state);
    return payload(state);
  }

  if (square.type === "jail") {
    state.lastAction += `，路过监狱`;
    endTurnAfterResolve(state);
    return payload(state);
  }

  if (square.type === "parking") {
    state.lastAction += `，免费停车休息`;
    endTurnAfterResolve(state);
    return payload(state);
  }

  if (square.type === "goto_jail") {
    player.position = 7;
    player.inJail = true;
    player.skipTurns = 1;
    state.lastAction += `，被送进监狱！下回合跳过`;
    endTurnAfterResolve(state);
    return payload(state);
  }

  if (square.type === "tax") {
    const amount = square.amount || 100;
    state.lastAction += `，缴纳${name} $${amount}`;
    const ok = takeMoney(state, player, amount, null);
    if (!ok && checkWin(state)) return payload(state);
    endTurnAfterResolve(state);
    return payload(state);
  }

  if (square.type === "chance") {
    return applyChance(state, player);
  }

  if (square.type === "property") {
    const ownerId = state.owners[String(square.id)];
    if (!ownerId) {
      if (player.money >= square.price) {
        state.phase = GAME_PHASE.DECISION;
        state.pendingSquare = square.id;
        state.lastAction += `，到达「${name}」（$${square.price}），可购买或跳过`;
        return payload(state);
      }
      state.lastAction += `，到达「${name}」，现金不足无法购买`;
      endTurnAfterResolve(state);
      return payload(state);
    }
    if (ownerId === player.id) {
      state.lastAction += `，到达自己的「${name}」`;
      endTurnAfterResolve(state);
      return payload(state);
    }
    const owner = state.players[ownerId];
    if (!owner || owner.bankrupt) {
      // 业主已破产，地产归银行，可买
      delete state.owners[String(square.id)];
      if (player.money >= square.price) {
        state.phase = GAME_PHASE.DECISION;
        state.pendingSquare = square.id;
        state.lastAction += `，到达「${name}」，可购买`;
        return payload(state);
      }
      endTurnAfterResolve(state);
      return payload(state);
    }
    const rent = rentOf(square.price);
    state.lastAction += `，到达「${name}」，向${COLOR_NAMES[owner.color]}支付租金 $${rent}`;
    const ok = takeMoney(state, player, rent, owner);
    if (!ok && checkWin(state)) return payload(state);
    endTurnAfterResolve(state);
    return payload(state);
  }

  endTurnAfterResolve(state);
  return payload(state);
}

function applyChance(state, player) {
  const card = CHANCE_CARDS[Math.floor(Math.random() * CHANCE_CARDS.length)];
  state.lastAction += `，抽到机会卡：「${card.text}」`;

  if (card.goToJail) {
    player.position = 7;
    player.inJail = true;
    player.skipTurns = 1;
    endTurnAfterResolve(state);
    return payload(state);
  }

  if (typeof card.goTo === "number") {
    const from = player.position;
    player.position = card.goTo;
    if (card.salary || card.goTo < from) {
      player.money += SALARY;
      state.lastAction += `，领取工资 $${SALARY}`;
    }
    // 若落到地产等，继续结算（避免无限递归机会卡：落地后再 resolve，但 chance 再抽会叠）
    if (card.goTo === 0) {
      endTurnAfterResolve(state);
      return payload(state);
    }
    return resolveLanding(state, player);
  }

  if (typeof card.move === "number") {
    const boardLen = state.board.length;
    let next = player.position + card.move;
    if (next < 0) next += boardLen;
    if (next >= boardLen) {
      player.money += SALARY;
      next %= boardLen;
      state.lastAction += `，经过起点 +$${SALARY}`;
    }
    player.position = next;
    return resolveLanding(state, player);
  }

  if (typeof card.money === "number") {
    if (card.money >= 0) {
      player.money += card.money;
    } else {
      const ok = takeMoney(state, player, -card.money, null);
      if (!ok && checkWin(state)) return payload(state);
    }
  }

  endTurnAfterResolve(state);
  return payload(state);
}

function handleBuy(state, player) {
  if (state.phase !== GAME_PHASE.DECISION || state.pendingSquare == null) {
    return { ok: false, error: "当前不能购买" };
  }
  const square = state.board[state.pendingSquare];
  if (!square || square.type !== "property") {
    return { ok: false, error: "无效地产" };
  }
  if (state.owners[String(square.id)]) {
    return { ok: false, error: "地产已被购买" };
  }
  if (player.money < square.price) {
    return { ok: false, error: "现金不足" };
  }

  player.money -= square.price;
  state.owners[String(square.id)] = player.id;
  state.lastAction = `${COLOR_NAMES[player.color]} 购买了「${square.name}」（$${square.price}）`;
  state.pendingSquare = null;
  endTurnAfterResolve(state);
  return payload(state);
}

function handleSkipBuy(state, player) {
  if (state.phase !== GAME_PHASE.DECISION || state.pendingSquare == null) {
    return { ok: false, error: "当前无需跳过" };
  }
  const square = state.board[state.pendingSquare];
  state.lastAction = `${COLOR_NAMES[player.color]} 放弃购买「${square?.name || "地产"}」`;
  state.pendingSquare = null;
  endTurnAfterResolve(state);
  return payload(state);
}

function takeMoney(state, player, amount, creditor) {
  if (player.money >= amount) {
    player.money -= amount;
    if (creditor && !creditor.bankrupt) creditor.money += amount;
    return true;
  }
  // 破产：剩余钱给债主，地产转给债主或归银行
  const left = player.money;
  player.money = 0;
  if (creditor && !creditor.bankrupt) creditor.money += left;
  bankruptPlayer(state, player, creditor);
  return false;
}

function bankruptPlayer(state, player, creditor) {
  player.bankrupt = true;
  player.inJail = false;
  state.lastAction += `；${COLOR_NAMES[player.color]} 破产出局！`;

  for (const [sqId, ownerId] of Object.entries(state.owners)) {
    if (ownerId === player.id) {
      if (creditor && !creditor.bankrupt) {
        state.owners[sqId] = creditor.id;
      } else {
        delete state.owners[sqId];
      }
    }
  }
}

function checkWin(state) {
  const alive = state.order.filter((id) => state.players[id] && !state.players[id].bankrupt);
  if (alive.length <= 1) {
    state.gameOver = true;
    state.phase = GAME_PHASE.GAME_OVER;
    if (alive.length === 1) {
      const w = state.players[alive[0]];
      state.winner = w.color;
      state.lastAction += ` 🎉 ${COLOR_NAMES[w.color]} 获胜！`;
    } else {
      state.winner = null;
      state.lastAction += ` 无人获胜`;
    }
    return true;
  }
  return false;
}

function endTurnAfterResolve(state) {
  if (state.gameOver) return;
  state.phase = GAME_PHASE.WAITING_DICE;
  state.dice = null;
  state.pendingSquare = null;
  advanceTurn(state);
}

function advanceTurn(state) {
  if (state.gameOver) return;
  const n = state.order.length;
  for (let i = 0; i < n; i++) {
    state.currentIndex = (state.currentIndex + 1) % n;
    const p = state.players[state.order[state.currentIndex]];
    if (p && !p.bankrupt) {
      state.turn = p.color;
      return;
    }
  }
  checkWin(state);
}

module.exports = {
  createMonopolyState,
  ensureMonopolyPlayer,
  applyMonopolyAction,
  startMonopolyGame,
};
