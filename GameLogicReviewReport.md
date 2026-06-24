---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: c893416135759a0b6d63fba73930b763_25d714246f8811f1b2f55254006c9bbf
    ReservedCode1: 7cqQtOKCjqdSpEy0OUq9tYhtWi0f57aVOG0pdHWVwPIAELR27HtVRU8i6SG/zjQpRdNm964pqsqs97ncm9m1dS/PvWmz50sVRIkDCH1Q+AvqFqUbiRSt2pxnslN9xxpggdGEM2a9ko9lDH5+GMqdTtNKwLLFOVLXfphzS5QIiBtJw+XBzpV/RvyC6vA=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: c893416135759a0b6d63fba73930b763_25d714246f8811f1b2f55254006c9bbf
    ReservedCode2: 7cqQtOKCjqdSpEy0OUq9tYhtWi0f57aVOG0pdHWVwPIAELR27HtVRU8i6SG/zjQpRdNm964pqsqs97ncm9m1dS/PvWmz50sVRIkDCH1Q+AvqFqUbiRSt2pxnslN9xxpggdGEM2a9ko9lDH5+GMqdTtNKwLLFOVLXfphzS5QIiBtJw+XBzpV/RvyC6vA=
---

# LocalNetworkGames 游戏逻辑审查报告

## 一、项目概述

**项目名称**: LocalNetworkGames  
**仓库地址**: https://github.com/SHeEr123456/LocalNetworkGames  
**技术栈**: Node.js + WebSocket (ws) + 原生 JavaScript (Canvas / DOM)  
**架构模式**: 服务端权威 (Server-Authoritative)，客户端仅负责输入采集与渲染  

**包含游戏**:

| 游戏 | 类型 | 玩家数 | 服务端文件 | 客户端文件 |
|------|------|--------|-----------|-----------|
| 中国象棋 | 回合制策略 | 2人 | `src/server/games/chess/chessGame.js` / `ChessRulesServer.js` | `public/js/games/chess/ChessGameClient.js` / `ChessRulesClient.js` |
| 坦克大战 | 实时动作 | 2人 | `src/server/games/tank/tankGame.js` | `public/js/games/tank/TankGameClient.js` |
| 飞行棋 | 回合制 | 2-4人 | `src/server/games/flying/flyingGame.js` | `public/js/games/flying/FlyingGameClient.js` |

**核心服务端入口**: `src/server/server.js` (GameServer 类)

**审查范围**: 三个游戏的服务端权威逻辑（核心规则校验、状态管理、碰撞检测、胜负判定）

---

## 二、中国象棋 — 逻辑审查

### 2.1 游戏逻辑摘要

服务端通过 `applyChessMove()` 函数处理走子：校验回合 → 调用 `ChessRules.isValidMove()` 验证规则 → 执行棋盘更新 → 记录历史 → 判胜（吃将/帅）→ 换手 → 将军检测 → 广播。

规则引擎 `ChessRules` 实现了所有棋子的走法校验（将/帅、仕/士、象/相、马、车、炮、兵/卒），包括：
- 九宫格限制
- 王不见王（将帅对面）
- 蹩马腿
- 塞象眼
- 炮翻山
- 兵/卒过河前后不同走法

### 2.2 发现的问题

#### 问题1：【严重】走后未检查自身是否被将军（自杀棋漏洞）

**位置**: `src/server/games/chess/chessGame.js` — `applyChessMove()` 函数，第3步"执行移动"之后  
**严重程度**: 严重 — 违反象棋基本规则，破坏游戏公平性

**问题描述**:
当前代码在棋子移动完成后仅检查对方是否被将军（`isCheckAfterMove`），**完全没有验证走棋方自身是否处于被将军状态**。这意味着玩家可以走出让己方将/帅暴露在敌方攻击之下的"自杀棋"，服务端会接受该非法走法。

**示例场景**:
红方将在(9,4)，红仕在(8,3)保护将。若红方移走仕到(9,2)，底线暴露，黑车可直接攻击红将。当前代码不会阻止此走法。

**根本原因**: 缺少经典象棋规则中的"走后自检"环节——任何走棋后，走棋方的将/帅必须处于安全状态（不被将军）。

**所在代码** (`chessGame.js` 第84-100行附近):
```javascript
// 3) 执行移动
state.board[to.row][to.col] = piece;
state.board[from.row][from.col] = null;
// ❌ 此处缺少：验证走棋方自身是否被将军

// 4) 记录历史 ...

// 7) 检查是否将军（走子后，对方是否被将军）
const isCheckAfterMove = ChessRules.isCheck(state.board, room.turn);
// ⚠️ 此处只检查了对方，未检查自身
```

#### 问题2：【严重】被将军时未强制应将

**位置**: `src/server/games/chess/chessGame.js` — `applyChessMove()` 函数  
**严重程度**: 严重 — 违反象棋基本规则

**问题描述**:
当一方处于被将军状态时，该方必须走出解除将军的棋步（应将）。当前代码在进入 `applyChessMove` 时没有检查走棋方是否正在被将军，也没有在走棋后验证将军是否被解除。这意味着被将军的一方可以走无关棋子而不应将。

**根本原因**: 缺少"走棋前检查当前是否被将军 → 走棋后验证将军是否解除"的完整应将流程。

#### 问题3：【中等】isFacingKings 仅检查目标位置，未排除路径经过的中间位置

**位置**: `src/server/games/chess/ChessRulesServer.js` — `isFacingKings()`  
**严重程度**: 中等 — 边界情况可能漏判

**问题描述**:
`isFacingKings` 函数从目标位置沿同一列扫描到棋盘边界，判断是否会与对方将/帅面对面。但对于将/帅的移动，该函数**只检查目标位置**（`toRow, toCol`），未考虑移动路径上的中间位置。不过由于将/帅每次只移动一步，且前后两步的"面对面"检测结果在绝大多数情况下一致，此问题在实战中触发概率极低。

#### 问题4：【低】服务端与客户端 isValidKingMove 实现有细微差异

**位置**: 服务端 `ChessRulesServer.js` vs 客户端 `ChessRulesClient.js`  
**严重程度**: 低 — 服务端为权威，客户端仅用于提示

**问题描述**:
- 服务端: `if (!((rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1))) return false;`
- 客户端: `if (rowDiff + colDiff !== 1) return false;`

两者逻辑等价，但语义不同。客户端写法更简洁，但若未来维护时修改了服务端的步数限制逻辑（例如加入"将帅见面飞将"特殊规则），客户端可能不同步更新。建议统一。

### 2.3 修复建议

#### 修复问题1 & 问题2（应合并修复）

在 `applyChessMove` 中，执行移动后立即增加"走后自检"环节。同时，应在走棋前检测当前是否被将军，若被将军则走后必须解除。

**修改文件**: `src/server/games/chess/chessGame.js`

**修改位置**: 在步骤3"执行移动"之后、步骤4"记录历史"之前，增加以下代码：

```javascript
// 3) 执行移动
state.board[to.row][to.col] = piece;
state.board[from.row][from.col] = null;

// 【新增】3.5) 走后自检：验证走棋方自身是否被将军
const movingColor = client.color; // 走棋方颜色
if (ChessRules.isCheck(state.board, movingColor)) {
  // 回退移动
  state.board[from.row][from.col] = piece;
  state.board[to.row][to.col] = targetPiece;
  return { ok: false, error: "走棋后己方将被将军，非法移动" };
}
```

**说明**: 此修复同时覆盖了"自杀棋禁止"和"应将验证"两个问题。如果走棋前己方已被将军，走出任何不解除将军的棋步都会在自检中被拦截。

#### 修复问题3

**修改文件**: `src/server/games/chess/ChessRulesServer.js`

当前 `isValidKingMove` 中 `isFacingKings` 的调用已经正确（检查目标位置），无需修改函数本身。但建议在函数注释中明确说明只检查目标位置，且由于将/帅每次只移动一格，路径中间检查等价。

#### 修复问题4

**修改文件**: `public/js/games/chess/ChessRulesClient.js` 或 `src/server/games/chess/ChessRulesServer.js`

建议将客户端步数验证改为与服务端完全一致的写法：
```javascript
if (!((rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1))) return false;
```

---

## 三、坦克大战 — 逻辑审查

### 3.1 游戏逻辑摘要

服务端通过 `tickTankRoom()` 以 20 FPS (50ms 间隔) 运行游戏循环：处理玩家输入 → 移动坦克（含障碍物碰撞检测）→ 生成子弹 → 更新子弹（含边界/障碍物反弹）→ 碰撞检测（子弹 vs 坦克）→ 判胜 → 广播状态。

### 3.2 发现的问题

#### 问题1：【严重】判胜逻辑使用比较运算符而非赋值运算符

**位置**: `src/server/games/tank/tankGame.js` — `tickTankRoom()` 函数末尾  
**严重程度**: 严重 — 导致游戏无法正常宣告胜利方

**问题描述**:
```javascript
if (alive.length === 1) {
  state.gameOver = true;
  state.winner === "red" ? "red" : "blue";  // ❌ === 是比较运算符，不是赋值！
}
```

`===` 是严格相等比较运算符，此行代码计算 `state.winner === "red"`（结果必然是 `false`），然后对整个三元表达式求值得出 `"blue"`，但该值**未被赋值给任何变量**。`state.winner` 始终保持 `null`。

**后果**: 当一方被击败时，`state.gameOver` 被正确设为 `true`，客户端会显示游戏结束画面，但胜利方永远显示"平局"或空值。

**修复**:
```javascript
if (alive.length === 1) {
  state.gameOver = true;
  state.winner = alive[0].color; // ✅ 直接取唯一存活者的颜色
} else if (alive.length === 0) {
  state.gameOver = true;
  state.winner = null; // 平局
}
```

#### 问题2：【低】tick 要求至少2人，不支持单人练习

**位置**: `src/server/games/tank/tankGame.js` — `tickTankRoom()` 第52行  
**严重程度**: 低 — 取决于是否有单人练习需求

**问题描述**:
```javascript
if (room.clients.size < 2) return;
```
当房间只有1人时，tick 不运行，坦克无法移动或射击。如果预期支持单人练习，需要移除此限制或将其改为可配置选项。

#### 问题3：【低】子弹近距离豁免机制可能漏判

**位置**: `src/server/games/tank/tankGame.js` — 子弹碰撞检测  
**严重程度**: 低 — 极端边界情况

**问题描述**:
```javascript
if (p.id === b.owner && dist < 25 && b.bounces === 0) return;
```
子弹发射后25像素内且未反弹时不伤害发射者。但如果两辆坦克位置高度重叠（如出生点相同或故意贴近），敌方坦克在25像素内可能被错误豁免。建议改为仅豁免发射者本人，不受距离限制（基于 `dist` 阈值 + `bounces` 双重判断已足够）。

### 3.3 修复建议汇总

| 问题 | 文件 | 修改方式 |
|------|------|----------|
| 判胜赋值错误 | `tankGame.js` | `state.winner = alive[0].color` |
| 单人练习支持 | `tankGame.js` | 移除 `clients.size < 2` 限制或加 `minPlayers` 配置 |
| 子弹豁免精确化 | `tankGame.js` | 降低豁免距离阈值至 `12`（坦克半径） |

---

## 四、飞行棋 — 逻辑审查

### 4.1 游戏逻辑摘要

服务端管理完整的状态机：`WAITING_DICE → SELECTING_PLANE → MOVING → WAITING_DICE`（或 `GAME_OVER`）。

核心流程:
1. 当前玩家掷骰 → `handleRollDice()`
2. 计算合法移动 → `getLegalMoves()`
3. 玩家选择棋子 → `handleMovePlane()` → `applyMove()`
4. 移动过程中处理：特殊跳跃（006→018等）、打飞机（颜色跳跃+4）、碰撞（打回基地）
5. 判胜（4枚棋子全部到达终点）

### 4.2 发现的问题

#### 问题1：【中等】叠子保护规则未实现

**位置**: `src/server/games/flying/flyingGame.js` — `checkCollision()` 函数  
**严重程度**: 中等 — 与 README 声明的规则不一致

**问题描述**:
README 明确声明：**"落点有己方飞机则形成叠子（叠子受保护不会被击落）"**。

但 `checkCollision` 函数的实现：
```javascript
Object.values(state.players).forEach(pl => {
  if (pl.id === player.id) return;  // 跳过自己
  pl.pieces.forEach((opPiece, opIdx) => {
    if (opPiece.position === "track" && opPiece.cellNum === piece.cellNum) {
      opPiece.position = "home"; // 打回基地
      ...
    }
  });
});
```

当对手在同一格有2枚棋子（叠子）时，两枚都会被逐一打回基地，与规则声明的"叠子受保护"矛盾。

**修复**: 在打回之前检查目标格子上该玩家的棋子数量：
```javascript
// 在 checkCollision 中，打回之前先统计该玩家在此格上的棋子数
const sameCellPieces = pl.pieces.filter(
  op => op.position === "track" && op.cellNum === piece.cellNum
);
if (sameCellPieces.length >= 2) return; // 叠子受保护，不击落
```

或者更精确地实现为：如果走到的格子上对手有2枚及以上己方叠子，不击落。

#### 问题2：【中等】noMoves 定时器存在竞态条件

**位置**: `src/server/games/flying/flyingGame.js` — `handleFlyingAction()` 函数末尾  
**严重程度**: 中等 — 可能导致状态异常

**问题描述**:
当掷骰后无子可走时，服务端设置2.5秒延迟自动切换玩家：
```javascript
if (result.noMoves) {
  setTimeout(() => {
    const state = room.gameState;
    if (state && state.phase === "SELECTING_PLANE") {
      // ... 自动切换玩家
    }
  }, 2500);
}
```

虽然回调中有 `state.phase === "SELECTING_PLANE"` 检查，但如果在这2.5秒内发生以下事件，状态可能不一致：
- 另一个玩家断开连接
- 游戏被重启（restart）
- 客户端延迟收到 `flying_state` 后的竞态

**修复**: 在回调中增加更多校验，或使用 `room` 引用而非依赖全局状态：
```javascript
const roomId = room.id;
setTimeout(() => {
  const currentRoom = this.rooms.get(roomId);
  const currentState = currentRoom?.gameState;
  if (!currentState || currentState.gameOver || currentState.phase !== "SELECTING_PLANE") return;
  // ... 自动切换
}, 2500);
```

#### 问题3：【低】打飞机（颜色跳跃+4）的排除格子列表可能不完整

**位置**: `src/server/games/flying/flyingGame.js` — `applyMove()` 函数  
**严重程度**: 低 — 规则细微偏差

**问题描述**:
代码中排除了4个不触发打飞机的格子（011, 024, 037, 050）：
```javascript
if (piece.cellNum !== 11 && piece.cellNum !== 24 && 
    piece.cellNum !== 37 && piece.cellNum !== 50)
```

但飞行棋标准规则中，是否所有这4个位置都应排除取决于具体棋盘设计。由于无法获取标准棋盘验证，建议在代码注释中明确说明这些数字的来源和依据，便于后续维护。

#### 问题4：【低】startFlyingGame 在 maxPlayers 不满时也可能需要启动

**位置**: `src/server/games/flying/flyingGame.js` — `ensureFlyingPlayer()` 函数  
**严重程度**: 低 — 影响2人以下模式的可用性

**问题描述**:
```javascript
if (state.order.length >= 2 && state.order.length === state.maxPlayers && !state.gameStarted) {
  startFlyingGame(state);
}
```

此逻辑要求 `order.length === maxPlayers`，即必须满员才启动游戏。但如果 `maxPlayers=4` 而实际只有3人，游戏永远不会自动启动。虽然 README 说2-4人对战，但未说明是否需要满员。建议改为允许房主手动开始或降低启动条件。

### 4.3 修复建议汇总

| 问题 | 文件 | 修改方式 |
|------|------|----------|
| 叠子保护缺失 | `flyingGame.js` | `checkCollision` 中增加叠子数 >= 2 的豁免 |
| noMoves 竞态 | `flyingGame.js` | 回调中使用 roomId 定位，增加 gameOver 等检查 |
| 排除格子注释 | `flyingGame.js` | 添加注释说明011/024/037/050的排除依据 |
| 非满员启动 | `flyingGame.js` | 提供手动开始机制或降低自动启动条件 |

---

## 五、问题清单汇总

| 编号 | 游戏 | 严重程度 | 问题简述 | 状态 |
|------|------|----------|----------|------|
| C1 | 中国象棋 | **严重** | 走后未检查自身是否被将军（自杀棋漏洞） | 需修复 |
| C2 | 中国象棋 | **严重** | 被将军时未强制应将 | 需修复（与C1合并修复） |
| C3 | 中国象棋 | 中等 | isFacingKings 注释不清晰 | 建议改进 |
| C4 | 中国象棋 | 低 | 服务端/客户端步数验证写法不统一 | 建议统一 |
| T1 | 坦克大战 | **严重** | 判胜逻辑 `===` 应为 `=` | 需修复 |
| T2 | 坦克大战 | 低 | 不支持单人练习模式 | 按需处理 |
| T3 | 坦克大战 | 低 | 子弹近距离豁免精度可提升 | 建议优化 |
| F1 | 飞行棋 | 中等 | 叠子保护规则未实现 | 需修复 |
| F2 | 飞行棋 | 中等 | noMoves 定时器竞态条件 | 需修复 |
| F3 | 飞行棋 | 低 | 排除格子缺少注释说明 | 建议改进 |
| F4 | 飞行棋 | 低 | 非满员时无法启动游戏 | 按需处理 |

---

## 六、总结

### 6.1 整体评价

该项目是一个结构清晰、逻辑较为完整的局域网多人游戏集合。服务端权威架构保证了基本的防作弊能力，状态机设计合理，代码可读性良好。

### 6.2 关键风险

**三个游戏中各有一个严重级别的逻辑缺陷**：

1. **中国象棋**：缺少走后自检将军的核心规则，允许玩家走出自杀棋。这是象棋规则中最基本的约束之一，缺失会导致游戏完全失去竞技意义。
2. **坦克大战**：一个低级但影响严重的编码错误——`===` 误写为赋值，导致胜利方永远无法被正确识别。
3. **飞行棋**：叠子保护规则在 README 中声明但未在代码中实现，与实际游戏行为不一致。

### 6.3 建议修复优先级

| 优先级 | 问题编号 | 修复工作量 |
|--------|----------|-----------|
| P0（立即修复） | C1/C2, T1 | 小（<10行代码） |
| P1（尽快修复） | F1, F2 | 中（10-30行代码） |
| P2（计划修复） | C3, C4, T2, T3, F3, F4 | 小 |

---

*报告生成时间: 2026-06-24*  
*审查范围: 全量服务端权威逻辑（三个游戏的核心规则、状态管理、胜负判定）*
*（内容由AI生成，仅供参考）*
