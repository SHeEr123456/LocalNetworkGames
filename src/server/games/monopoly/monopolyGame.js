/**
 * 大富翁 · 厦门（服务端权威规则引擎）
 * =========================================================
 * 棋盘：40 格环形赛道，主题为厦门景点 / 小吃 / 地标
 *   - 8 组地产（22 格）：鼓浪屿 → 厦门双子塔
 *   - 4 座码头（铁路等价物）：轮渡码头 / 邮轮中心 / 五通码头 / 嵩屿码头
 *   - 2 家公用事业：国家电网厦门 / 厦门水务集团
 *   - 3 格机会 + 3 格命运
 *   - 2 格税收（个人所得税 / 奢侈税）
 *   - 4 个角落：起点 / 华蔚（加班中）/ 环岛路停车场 / 去华蔚加班
 *
 * 采用的经典规则
 *   - 起始资金 ¥1500，经过起点领 ¥200
 *   - 双骰：掷出双数可再掷一次；连续三次双数直接去华蔚加班
 *   - 租金阶梯：空地 → 1~4 栋房屋 → 旅馆；同色组垄断且未盖房时空地租金 ×2
 *   - 码头按持有数量计租（25/50/100/200）；公用事业按点数 ×4（持有 2 家 ×10）
 *   - 同色组垄断后方可盖房；同组必须均匀盖房；房屋可半价变卖
 *   - 抵押：抵押价 = 地价 / 2，抵押期间免租；赎回需支付 抵押价 ×1.1
 *   - 加班：掷出双数即可下班 / 缴纳 ¥50 加班费提前下班 / 使用请假条 / 连续加班满 3 天强制下班
 *   - 资金不足时自动变卖房屋并抵押地产筹资；仍不足则破产，地产过户给债权人
 *   - 最后仅存一名玩家时获胜
 *
 * 与经典规则的已知差异（简化项）
 *   - 不设拍卖：玩家放弃购买时该地产保持无主（流拍）
 *   - 变卖 / 抵押的资产选择由服务端按地价升序自动执行，玩家不能挑拣
 *   - 不实现房屋短缺（银行房屋无限量）
 */

const TOTAL_CELLS = 40;
const START_CASH = 1500;
const GO_SALARY = 200;
const JAIL_BAIL = 50;
const JAIL_INDEX = 10;
const GOTO_JAIL_INDEX = 30;
const MAX_HOUSES = 5; // 5 表示旅馆

const COLORS = ["red", "blue", "green", "yellow"];
const COLOR_NAMES = { red: "红方", blue: "蓝方", green: "绿方", yellow: "黄方" };

const GROUP_NAMES = {
  brown: "棕线",
  lightblue: "浅蓝线",
  pink: "粉线",
  orange: "橙线",
  red: "红线",
  yellow: "黄线",
  green: "绿线",
  darkblue: "深蓝线",
};

const GROUP_HEX = {
  brown: "#8B5E3C",
  lightblue: "#7DD3FC",
  pink: "#F472B6",
  orange: "#FB923C",
  red: "#F87171",
  yellow: "#FACC15",
  green: "#4ADE80",
  darkblue: "#60A5FA",
};

const GROUP_HOUSE_COST = {
  brown: 50,
  lightblue: 50,
  pink: 100,
  orange: 100,
  red: 150,
  yellow: 150,
  green: 200,
  darkblue: 200,
};

function prop(index, name, group, price, rent) {
  return {
    index,
    type: "property",
    name,
    group,
    groupName: GROUP_NAMES[group],
    groupHex: GROUP_HEX[group],
    price,
    rent,
    houseCost: GROUP_HOUSE_COST[group],
  };
}

function rail(index, name) {
  return { index, type: "railroad", name, price: 200 };
}

function util(index, name) {
  return { index, type: "utility", name, price: 150 };
}

function spec(index, type, name, amount) {
  return { index, type, name, amount: amount || 0 };
}

/** 40 格棋盘（索引即位置，顺时针） */
const BOARD = [
  spec(0, "go", "起点"),
  prop(1, "鼓浪屿", "brown", 60, [2, 10, 30, 90, 160, 250]),
  spec(2, "chest", "命运"),
  prop(3, "曾厝垵", "brown", 60, [4, 20, 60, 180, 320, 450]),
  spec(4, "tax", "个人所得税", 200),
  rail(5, "轮渡码头"),
  prop(6, "中山路", "lightblue", 100, [6, 30, 90, 270, 400, 550]),
  spec(7, "chance", "机会"),
  prop(8, "八市", "lightblue", 100, [6, 30, 90, 270, 400, 550]),
  prop(9, "沙坡尾", "lightblue", 120, [8, 40, 100, 300, 450, 600]),
  spec(JAIL_INDEX, "jail", "华蔚（加班中）"),
  prop(11, "厦门大学", "pink", 140, [10, 50, 150, 450, 625, 750]),
  util(12, "国家电网厦门"),
  prop(13, "南普陀", "pink", 140, [10, 50, 150, 450, 625, 750]),
  prop(14, "白城沙滩", "pink", 160, [12, 60, 180, 500, 700, 900]),
  rail(15, "邮轮中心"),
  prop(16, "集美学村", "orange", 180, [14, 70, 200, 550, 750, 950]),
  spec(17, "chest", "命运"),
  prop(18, "园博苑", "orange", 180, [14, 70, 200, 550, 750, 950]),
  prop(19, "杏林湾", "orange", 200, [16, 80, 220, 600, 800, 1000]),
  spec(20, "parking", "环岛路停车场"),
  prop(21, "湖里山炮台", "red", 220, [18, 90, 250, 700, 875, 1050]),
  spec(22, "chance", "机会"),
  prop(23, "五缘湾", "red", 220, [18, 90, 250, 700, 875, 1050]),
  prop(24, "观音山", "red", 240, [20, 100, 300, 750, 925, 1100]),
  rail(25, "五通码头"),
  prop(26, "方特梦幻王国", "yellow", 260, [22, 110, 330, 800, 975, 1150]),
  prop(27, "灵玲马戏城", "yellow", 260, [22, 110, 330, 800, 975, 1150]),
  util(28, "厦门水务集团"),
  prop(29, "厦门科技馆", "yellow", 280, [24, 120, 360, 850, 1025, 1200]),
  spec(GOTO_JAIL_INDEX, "gotojail", "去华蔚加班"),
  prop(31, "环岛路", "green", 300, [26, 130, 390, 900, 1100, 1275]),
  prop(32, "椰风寨", "green", 300, [26, 130, 390, 900, 1100, 1275]),
  spec(33, "chest", "命运"),
  prop(34, "五通灯塔", "green", 320, [28, 150, 450, 1000, 1200, 1400]),
  rail(35, "嵩屿码头"),
  spec(36, "chance", "机会"),
  prop(37, "厦门国际会展中心", "darkblue", 350, [35, 175, 500, 1100, 1300, 1500]),
  spec(38, "tax", "奢侈税", 100),
  prop(39, "厦门双子塔", "darkblue", 400, [50, 200, 600, 1400, 1700, 2000]),
];

/** 机会卡 */
const CHANCE_CARDS = [
  { text: "前往「厦门大学」", move: { to: 11 } },
  { text: "前往「鼓浪屿」", move: { to: 1 } },
  { text: "前往「起点」，领取工资 ¥200", move: { to: 0 } },
  { text: "银行分红，收入 ¥50", cash: 50 },
  { text: "房屋统一维修，支出 ¥80", cash: -80 },
  { text: "走错路，后退 3 格", move: { steps: -3 } },
  { text: "上班摸鱼被抓，直接去华蔚加班", jail: true },
  { text: "获得一张「请假条」", jailCard: 1 },
];

/** 命运卡 */
const CHEST_CARDS = [
  { text: "银行结算错误，收入 ¥200", cash: 200 },
  { text: "医药费支出 ¥100", cash: -100 },
  { text: "出售股票获利 ¥50", cash: 50 },
  { text: "退税 ¥20", cash: 20 },
  { text: "生日礼金 ¥50", cash: 50 },
  { text: "学费支出 ¥50", cash: -50 },
  { text: "前往「起点」，领取工资 ¥200", move: { to: 0 } },
  { text: "获得一张「请假条」", jailCard: 1 },
];

/* =========================================================
   状态创建与玩家管理
   ========================================================= */

function createMonopolyState(maxPlayers = 4) {
  return {
    gameType: "monopoly",
    maxPlayers,
    board: BOARD,
    players: {},
    order: [],
    currentIndex: 0,
    turn: null,
    phase: "WAITING_ROLL", // WAITING_ROLL | DECIDING | GAME_OVER
    dice: null,
    extraRoll: false,
    doublesCount: 0,
    pendingBuy: null,
    properties: {},
    cardCursor: { chance: 0, chest: 0 },
    log: [],
    lastAction: "等待玩家加入…",
    gameStarted: false,
    gameOver: false,
    winner: null,
  };
}

function ensureMonopolyPlayer(room, clientId) {
  const state = room.gameState;
  if (!state || state.gameType !== "monopoly") return null;
  if (state.players[clientId]) return state.players[clientId];
  if (state.order.length >= (state.maxPlayers || 4)) return null;

  const used = new Set(Object.values(state.players).map((p) => p.color));
  const color = COLORS.find((c) => !used.has(c)) || COLORS[0];

  const player = {
    id: clientId,
    color,
    name: COLOR_NAMES[color],
    cash: START_CASH,
    position: 0,
    inJail: false,
    jailTurns: 0,
    jailCards: 0,
    bankrupt: false,
  };

  state.players[clientId] = player;
  state.order.push(clientId);

  if (!state.gameStarted && state.order.length >= 2) {
    state.gameStarted = true;
    state.currentIndex = 0;
    state.phase = "WAITING_ROLL";
    state.dice = null;
    pushLog(state, "人数已足够，牌局开始！");
  }
  const current = state.players[state.order[state.currentIndex]];
  state.turn = current ? current.color : null;
  pushLog(state, `${COLOR_NAMES[color]}加入牌局，起始资金 ¥${START_CASH}`);

  return player;
}

function cleanupMonopolyPlayer(room, clientId) {
  const state = room.gameState;
  if (!state || state.gameType !== "monopoly") return;
  if (!state.players[clientId]) return;

  // 名下地产回归银行
  Object.values(state.properties).forEach((p) => {
    if (p.ownerId === clientId) {
      p.ownerId = null;
      p.houses = 0;
      p.mortgaged = false;
    }
  });

  delete state.players[clientId];

  const idx = state.order.indexOf(clientId);
  if (idx !== -1) {
    state.order.splice(idx, 1);
    if (state.currentIndex > idx) state.currentIndex -= 1;
    if (state.currentIndex >= state.order.length) state.currentIndex = 0;
  }

  state.pendingBuy = null;
  state.dice = null;

  if (state.order.length < 2) {
    state.gameStarted = false;
    state.phase = "WAITING_ROLL";
    state.turn = null;
    state.lastAction = "玩家不足 2 人，等待其他玩家加入…";
    pushLog(state, "玩家不足 2 人，牌局暂停");
  } else {
    const current = state.players[state.order[state.currentIndex]];
    state.turn = current ? current.color : null;
    state.phase = "WAITING_ROLL";
    state.lastAction = "有玩家离开，继续牌局";
    pushLog(state, "有玩家离开，其地产已回归银行");
  }
}

/* =========================================================
   工具
   ========================================================= */

function pushLog(state, text) {
  state.log.push(text);
  if (state.log.length > 60) state.log.splice(0, state.log.length - 60);
  state.lastAction = text;
}

function currentPlayer(state) {
  const id = state.order[state.currentIndex];
  return id ? state.players[id] : null;
}

function nextTurn(state) {
  if (!state.order.length) return;
  if (state.order.length === 1) {
    state.gameOver = true;
    state.phase = "GAME_OVER";
    const last = state.players[state.order[0]];
    state.winner = last ? last.color : null;
    return;
  }
  state.currentIndex = (state.currentIndex + 1) % state.order.length;
  const p = currentPlayer(state);
  state.turn = p ? p.color : null;
  state.phase = "WAITING_ROLL";
  state.dice = null;
  state.extraRoll = false;
  state.doublesCount = 0;
  state.pendingBuy = null;
  pushLog(state, `轮到 ${p ? COLOR_NAMES[p.color] : "—"}`);
}

function groupProps(state, group) {
  return BOARD.filter((c) => c.type === "property" && c.group === group).map((c) => ({
    cell: c,
    prop: state.properties[c.index],
  }));
}

function hasMonopoly(state, ownerId, group) {
  const members = BOARD.filter((c) => c.type === "property" && c.group === group);
  return members.every((c) => state.properties[c.index]?.ownerId === ownerId);
}

function countOwnedByType(state, ownerId, type) {
  return Object.values(state.properties).filter((p) => {
    if (p.ownerId !== ownerId) return false;
    return BOARD[p.cellIndex]?.type === type;
  }).length;
}

function rentFor(state, cellIndex, diceSum) {
  const cell = BOARD[cellIndex];
  const info = state.properties[cellIndex];
  if (!info || !info.ownerId || info.mortgaged) return 0;

  if (cell.type === "property") {
    if (info.houses > 0) return cell.rent[info.houses];
    const monopoly = hasMonopoly(state, info.ownerId, cell.group);
    return cell.rent[0] * (monopoly ? 2 : 1);
  }
  if (cell.type === "railroad") {
    const count = countOwnedByType(state, info.ownerId, "railroad");
    return [0, 25, 50, 100, 200][count] || 0;
  }
  if (cell.type === "utility") {
    const count = countOwnedByType(state, info.ownerId, "utility");
    return diceSum * (count === 2 ? 10 : 4);
  }
  return 0;
}

/* =========================================================
   移动与资金
   ========================================================= */

function moveSteps(state, player, steps) {
  for (let i = 0; i < steps; i++) {
    player.position = (player.position + 1) % TOTAL_CELLS;
    if (player.position === 0) {
      player.cash += GO_SALARY;
      pushLog(state, `${COLOR_NAMES[player.color]}经过起点，领取工资 ¥${GO_SALARY}`);
    }
  }
}

function moveBackward(state, player, steps) {
  player.position = (player.position - steps + TOTAL_CELLS) % TOTAL_CELLS;
}

function moveTo(state, player, target) {
  if (target === 0) {
    player.cash += GO_SALARY;
    pushLog(state, `${COLOR_NAMES[player.color]}前往起点，领取工资 ¥${GO_SALARY}`);
  }
  player.position = target;
  pushLog(state, `${COLOR_NAMES[player.color]}移动到「${BOARD[target].name}」`);
}

function sendToJail(state, player) {
  player.position = JAIL_INDEX;
  player.inJail = true;
  player.jailTurns = 0;
  state.extraRoll = false;
  state.doublesCount = 0;
  pushLog(
    state,
    `${COLOR_NAMES[player.color]}来到华蔚开始加班（掷出双数即可下班，或缴纳 ¥${JAIL_BAIL} 加班费提前走）`,
  );
}

/**
 * 自动筹资：先按地价升序变卖房屋，再按地价升序抵押未抵押地产
 * @returns {number} 实际筹得金额
 */
function autoLiquidate(state, player, need) {
  let raised = 0;
  const owned = Object.values(state.properties)
    .filter((p) => p.ownerId === player.id)
    .sort((a, b) => (BOARD[a.cellIndex].price || 0) - (BOARD[b.cellIndex].price || 0));

  // 1) 变卖房屋（半价回收）
  for (const info of owned) {
    const cell = BOARD[info.cellIndex];
    while (info.houses > 0 && raised < need) {
      info.houses -= 1;
      const back = Math.floor((cell.houseCost || 0) / 2);
      player.cash += back;
      raised += back;
      pushLog(state, `变卖「${cell.name}」房屋，回收 ¥${back}`);
    }
    if (raised >= need) return raised;
  }

  // 2) 抵押地产（无房方可抵押）
  for (const info of owned) {
    if (info.mortgaged || info.houses > 0) continue;
    const cell = BOARD[info.cellIndex];
    const value = Math.floor((cell.price || 0) / 2);
    if (value <= 0) continue;
    info.mortgaged = true;
    player.cash += value;
    raised += value;
    pushLog(state, `抵押「${cell.name}」，获得 ¥${value}`);
    if (raised >= need) return raised;
  }

  return raised;
}

function declareBankrupt(state, player, creditor) {
  player.bankrupt = true;
  player.cash = 0;

  Object.values(state.properties).forEach((info) => {
    if (info.ownerId !== player.id) return;
    if (creditor) {
      info.ownerId = creditor.id;
    } else {
      info.ownerId = null;
      info.houses = 0;
      info.mortgaged = false;
    }
  });

  pushLog(
    state,
    creditor
      ? `${COLOR_NAMES[player.color]}破产出局，名下地产全部过户给 ${COLOR_NAMES[creditor.color]}`
      : `${COLOR_NAMES[player.color]}破产出局，名下地产被银行收回`,
  );

  const idx = state.order.indexOf(player.id);
  if (idx !== -1) {
    state.order.splice(idx, 1);
    if (state.currentIndex > idx) state.currentIndex -= 1;
    if (state.currentIndex >= state.order.length) state.currentIndex = 0;
  }

  if (state.order.length <= 1) {
    state.gameOver = true;
    state.phase = "GAME_OVER";
    state.pendingBuy = null;
    const last = state.order[0] ? state.players[state.order[0]] : null;
    state.winner = last ? last.color : null;
    pushLog(state, last ? `${COLOR_NAMES[last.color]}成为最后的赢家！` : "本局结束");
  }
}

/**
 * 付款：资金不足时自动变卖 / 抵押筹资，仍不足则破产
 */
function payMoney(state, payer, payee, amount, reason) {
  if (!payer || amount <= 0) return;
  if (payer.cash < amount) {
    autoLiquidate(state, payer, amount - payer.cash);
  }
  if (payer.cash < amount) {
    const short = amount - payer.cash;
    pushLog(state, `${COLOR_NAMES[payer.color]}资金不足（尚缺 ¥${short}），宣告破产`);
    const paid = payer.cash;
    payer.cash = 0;
    if (payee) payee.cash += paid;
    declareBankrupt(state, payer, payee);
    return;
  }
  payer.cash -= amount;
  if (payee) payee.cash += amount;
}

/* =========================================================
   落格结算
   ========================================================= */

function resolveLanding(state, player, diceSum, depth) {
  const cell = BOARD[player.position];
  const info = state.properties[player.position];

  if (cell.type === "property" || cell.type === "railroad" || cell.type === "utility") {
    if (!info || !info.ownerId) {
      if (player.cash >= cell.price) {
        state.pendingBuy = { cellIndex: cell.index, price: cell.price };
        pushLog(state, `「${cell.name}」尚无人拥有，售价 ¥${cell.price}，等待决定`);
      } else {
        pushLog(state, `「${cell.name}」尚无人拥有，但你现金不足，无法购买`);
      }
      return;
    }
    if (info.ownerId === player.id) {
      pushLog(state, `「${cell.name}」是你自己的地产`);
      return;
    }
    if (info.mortgaged) {
      pushLog(state, `「${cell.name}」处于抵押状态，本次免租`);
      return;
    }
    const owner = state.players[info.ownerId];
    const rent = rentFor(state, cell.index, diceSum);
    if (rent <= 0 || !owner) return;
    pushLog(state, `需向 ${COLOR_NAMES[owner.color]} 支付「${cell.name}」租金 ¥${rent}`);
    payMoney(state, player, owner, rent, "租金");
    return;
  }

  if (cell.type === "tax") {
    pushLog(state, `缴纳${cell.name} ¥${cell.amount}`);
    payMoney(state, player, null, cell.amount, cell.name);
    return;
  }

  if (cell.type === "chance" || cell.type === "chest") {
    if (depth >= 3) return; // 防止卡片链式移动无限递归
    drawCard(state, player, cell.type, depth);
    return;
  }

  if (cell.type === "gotojail") {
    pushLog(state, `${COLOR_NAMES[player.color]}被拉去华蔚加班`);
    sendToJail(state, player);
    return;
  }

  // go / jail / parking：无事发生
}

function drawCard(state, player, kind, depth) {
  const deck = kind === "chance" ? CHANCE_CARDS : CHEST_CARDS;
  const cursor = state.cardCursor[kind] % deck.length;
  const card = deck[cursor];
  state.cardCursor[kind] = (cursor + 1) % deck.length;

  pushLog(state, `${kind === "chance" ? "机会" : "命运"}：${card.text}`);

  if (card.cash) {
    if (card.cash > 0) player.cash += card.cash;
    else payMoney(state, player, null, -card.cash, "卡片支出");
  }
  if (card.jailCard) player.jailCards += 1;
  if (card.jail) {
    sendToJail(state, player);
    return;
  }
  if (card.move) {
    if (card.move.to !== undefined) moveTo(state, player, card.move.to);
    else if (card.move.steps > 0) moveSteps(state, player, card.move.steps);
    else if (card.move.steps < 0) {
      moveBackward(state, player, -card.move.steps);
      pushLog(state, `${COLOR_NAMES[player.color]}后退到「${BOARD[player.position].name}」`);
    }
    resolveLanding(state, player, 0, depth + 1);
  }
}

/* =========================================================
   动作处理
   ========================================================= */

function isMyTurn(state, player) {
  return currentPlayer(state)?.id === player.id;
}

function doRoll(state, player) {
  if (!isMyTurn(state, player)) return { ok: false, error: "还没轮到你" };
  if (state.pendingBuy) return { ok: false, error: "请先决定是否购买该地产" };
  const canRoll = state.phase === "WAITING_ROLL" || (state.phase === "DECIDING" && state.extraRoll);
  if (!canRoll) return { ok: false, error: "当前不能掷骰" };

  const d1 = 1 + Math.floor(Math.random() * 6);
  const d2 = 1 + Math.floor(Math.random() * 6);
  const isDouble = d1 === d2;
  const diceSum = d1 + d2;

  state.dice = [d1, d2];
  state.extraRoll = false;

  pushLog(state, `${COLOR_NAMES[player.color]}掷出 ${d1} + ${d2} = ${diceSum}${isDouble ? "（双数）" : ""}`);

  let justReleased = false;

  if (player.inJail) {
    if (isDouble) {
      player.inJail = false;
      player.jailTurns = 0;
      state.doublesCount = 0;
      justReleased = true;
      pushLog(state, `${COLOR_NAMES[player.color]}掷出双数，准时下班`);
    } else {
      player.jailTurns += 1;
      if (player.jailTurns >= 3) {
        pushLog(state, `${COLOR_NAMES[player.color]}连续加班满 3 天，缴纳 ¥${JAIL_BAIL} 加班费才被放走`);
        payMoney(state, player, null, JAIL_BAIL, "加班费");
        player.inJail = false;
        player.jailTurns = 0;
      } else {
        pushLog(state, `${COLOR_NAMES[player.color]}未掷出双数，继续加班（第 ${player.jailTurns} 天）`);
        state.phase = "DECIDING";
        state.extraRoll = false;
        return { ok: true };
      }
    }
  } else if (isDouble) {
    state.doublesCount += 1;
    if (state.doublesCount >= 3) {
      pushLog(state, `${COLOR_NAMES[player.color]}连续三次双数，被拉去华蔚连轴加班！`);
      sendToJail(state, player);
      state.phase = "DECIDING";
      state.extraRoll = false;
      return { ok: true };
    }
  }

  moveSteps(state, player, diceSum);
  pushLog(state, `${COLOR_NAMES[player.color]}停在「${BOARD[player.position].name}」`);
  resolveLanding(state, player, diceSum, 0);

  state.phase = state.gameOver ? "GAME_OVER" : "DECIDING";
  // 双数可再掷一次（刚出狱的双数除外）
  state.extraRoll = isDouble && !justReleased && !state.gameOver && !state.pendingBuy;

  if (!state.gameOver && !state.pendingBuy && !state.extraRoll) {
    pushLog(state, "本回合结束，可点击「结束回合」交给下一位");
  }
  return { ok: true };
}

function doBuy(state, player) {
  if (!isMyTurn(state, player)) return { ok: false, error: "还没轮到你" };
  if (!state.pendingBuy) return { ok: false, error: "当前没有可购买的地产" };
  const cell = BOARD[state.pendingBuy.cellIndex];
  if (player.cash < cell.price) return { ok: false, error: "现金不足，无法购买" };

  player.cash -= cell.price;
  state.properties[cell.index] = {
    cellIndex: cell.index,
    ownerId: player.id,
    houses: 0,
    mortgaged: false,
  };
  pushLog(state, `${COLOR_NAMES[player.color]}以 ¥${cell.price} 买下「${cell.name}」`);
  state.pendingBuy = null;
  return { ok: true };
}

function doEndTurn(state, player) {
  if (!isMyTurn(state, player)) return { ok: false, error: "还没轮到你" };
  if (state.pendingBuy) {
    pushLog(state, `${COLOR_NAMES[player.color]}放弃购买「${BOARD[state.pendingBuy.cellIndex].name}」`);
    state.pendingBuy = null;
  }
  nextTurn(state);
  return { ok: true };
}

function doBuild(state, player, cellIndex) {
  if (!isMyTurn(state, player)) return { ok: false, error: "只能在自己回合盖房" };
  const info = state.properties[cellIndex];
  const cell = BOARD[cellIndex];
  if (!cell || cell.type !== "property") return { ok: false, error: "该地块不能盖房" };
  if (!info || info.ownerId !== player.id) return { ok: false, error: "这不是你的地产" };
  if (!hasMonopoly(state, player.id, cell.group)) return { ok: false, error: "需先拥有该颜色组全部地产" };
  if (info.mortgaged) return { ok: false, error: "抵押中的地产不能盖房" };
  if (info.houses >= MAX_HOUSES) return { ok: false, error: "已经建到旅馆，无法再加盖" };

  const members = groupProps(state, cell.group);
  const minHouses = Math.min(...members.map((m) => m.prop?.houses || 0));
  if (info.houses > minHouses) return { ok: false, error: "同组地产必须均匀盖房" };
  if (player.cash < cell.houseCost) return { ok: false, error: "现金不足" };

  player.cash -= cell.houseCost;
  info.houses += 1;
  pushLog(
    state,
    `${COLOR_NAMES[player.color]}在「${cell.name}」${info.houses === MAX_HOUSES ? "建起旅馆" : `盖起第 ${info.houses} 栋房屋`}`,
  );
  return { ok: true };
}

function doSellHouse(state, player, cellIndex) {
  if (!isMyTurn(state, player)) return { ok: false, error: "只能在自己回合操作" };
  const info = state.properties[cellIndex];
  const cell = BOARD[cellIndex];
  if (!info || info.ownerId !== player.id) return { ok: false, error: "这不是你的地产" };
  if (cell.type !== "property" || info.houses <= 0) return { ok: false, error: "没有可变卖的房屋" };

  const members = groupProps(state, cell.group);
  const maxHouses = Math.max(...members.map((m) => m.prop?.houses || 0));
  if (info.houses < maxHouses) return { ok: false, error: "同组地产必须均匀变卖" };

  const back = Math.floor(cell.houseCost / 2);
  info.houses -= 1;
  player.cash += back;
  pushLog(state, `${COLOR_NAMES[player.color]}变卖「${cell.name}」房屋，回收 ¥${back}`);
  return { ok: true };
}

function doMortgage(state, player, cellIndex) {
  if (!isMyTurn(state, player)) return { ok: false, error: "只能在自己回合操作" };
  const info = state.properties[cellIndex];
  const cell = BOARD[cellIndex];
  if (!info || info.ownerId !== player.id) return { ok: false, error: "这不是你的地产" };
  if (info.mortgaged) return { ok: false, error: "该地产已抵押" };
  if (info.houses > 0) return { ok: false, error: "请先变卖房屋再抵押" };

  const value = Math.floor(cell.price / 2);
  info.mortgaged = true;
  player.cash += value;
  pushLog(state, `${COLOR_NAMES[player.color]}抵押「${cell.name}」，获得 ¥${value}`);
  return { ok: true };
}

function doUnmortgage(state, player, cellIndex) {
  if (!isMyTurn(state, player)) return { ok: false, error: "只能在自己回合操作" };
  const info = state.properties[cellIndex];
  const cell = BOARD[cellIndex];
  if (!info || info.ownerId !== player.id) return { ok: false, error: "这不是你的地产" };
  if (!info.mortgaged) return { ok: false, error: "该地产未抵押" };

  // 赎回价 = 抵押价 × 1.1 = 地价 × 0.55
  // 用整数运算避免 price/2*1.1 的浮点误差（如 200*1.1 = 220.00000000000003，ceil 后会多收 1 元）
  const cost = Math.ceil((cell.price * 11) / 20);
  if (player.cash < cost) return { ok: false, error: `赎回需要 ¥${cost}，现金不足` };

  player.cash -= cost;
  info.mortgaged = false;
  pushLog(state, `${COLOR_NAMES[player.color]}赎回「${cell.name}」，支付 ¥${cost}`);
  return { ok: true };
}

function doPayBail(state, player) {
  if (!player.inJail) return { ok: false, error: "你不在华蔚加班" };
  if (player.cash < JAIL_BAIL) {
    autoLiquidate(state, player, JAIL_BAIL - player.cash);
  }
  if (player.cash < JAIL_BAIL) return { ok: false, error: "现金不足，付不起加班费" };
  player.cash -= JAIL_BAIL;
  player.inJail = false;
  player.jailTurns = 0;
  pushLog(state, `${COLOR_NAMES[player.color]}缴纳 ¥${JAIL_BAIL} 加班费，提前打卡下班`);
  return { ok: true };
}

function doUseJailCard(state, player) {
  if (!player.inJail) return { ok: false, error: "你不在华蔚加班" };
  if (player.jailCards <= 0) return { ok: false, error: "没有请假条" };
  player.jailCards -= 1;
  player.inJail = false;
  player.jailTurns = 0;
  pushLog(state, `${COLOR_NAMES[player.color]}使用请假条，提前打卡下班`);
  return { ok: true };
}

/**
 * 统一动作入口
 * @returns {{ok:true, payload?:object}|{ok:false, error:string}}
 */
function applyMonopolyAction(room, clientId, data) {
  const state = room.gameState;
  if (!state || state.gameType !== "monopoly") return { ok: false, error: "房间类型不匹配" };

  const player = state.players[clientId];
  if (!player) return { ok: false, error: "你不在本局中" };
  if (state.gameOver) return { ok: false, error: "本局已结束" };
  if (!state.gameStarted) return { ok: false, error: "人数不足 2 人，等待其他玩家加入" };

  const action = data.action;
  let result;

  switch (action) {
    case "roll":
      result = doRoll(state, player);
      break;
    case "buy":
      result = doBuy(state, player);
      break;
    case "end_turn":
      result = doEndTurn(state, player);
      break;
    case "build":
      result = doBuild(state, player, data.cellIndex);
      break;
    case "sell_house":
      result = doSellHouse(state, player, data.cellIndex);
      break;
    case "mortgage":
      result = doMortgage(state, player, data.cellIndex);
      break;
    case "unmortgage":
      result = doUnmortgage(state, player, data.cellIndex);
      break;
    case "pay_bail":
      result = doPayBail(state, player);
      break;
    case "use_jail_card":
      result = doUseJailCard(state, player);
      break;
    default:
      return { ok: false, error: "未知操作" };
  }

  if (!result.ok) return result;

  return {
    ok: true,
    payload: {
      type: "monopoly_state",
      gameType: "monopoly",
      state,
      message: state.lastAction,
    },
  };
}

function makeMonopolyBroadcastPayload(room) {
  return {
    type: "monopoly_state",
    gameType: "monopoly",
    state: room.gameState,
  };
}

module.exports = {
  BOARD,
  GROUP_HEX,
  createMonopolyState,
  ensureMonopolyPlayer,
  cleanupMonopolyPlayer,
  applyMonopolyAction,
  makeMonopolyBroadcastPayload,
};
