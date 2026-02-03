/**
 * 坦克大战房间逻辑（服务端）
 * - state 初始化
 * - 定时 tick：更新坦克、子弹、判胜并广播 tank_state
 */

/**
 * 障碍物定义：矩形区域 {x, y, width, height}
 * 放在地图中间，作为可碰撞的障碍物
 */
function createObstacles() {
  return [
    // 中间的大障碍物
    { x: 300, y: 200, width: 200, height: 200 },
    // 可以添加更多障碍物
    { x: 150, y: 250, width: 80, height: 100 },
    { x: 570, y: 250, width: 80, height: 100 },

    // { x: 50, y: 300, width: 480, height: 10},
    // { x: 50, y: 500, width: 480, height: 10},
    // { x: 370, y: 300, width: 10, height: 240},
  ];
}

function createTankState() {
  const spawnPoints = [
    { x: 100, y: 100, color: "red" },
    { x: 700, y: 100, color: "blue" },
  ];
  return {
    gameType: "tank",
    players: {},
    bullets: [],
    obstacles: createObstacles(), // 添加障碍物
    spawnPoints,
    width: 800,
    height: 600,
    gameOver: false,
    winner: null,
  };
}

function ensureTankPlayers(room) {
  const state = room.gameState;
  if (!state.spawnPoints || state.spawnPoints.length === 0) {
    state.spawnPoints = [
      { x: 100, y: 100, color: "red" },
      { x: 700, y: 100, color: "blue" },
    ];
  }
  if (!state.players) state.players = {};

  Array.from(room.clients).forEach((cid, idx) => {
    if (state.players[cid]) return;
    const spawn = state.spawnPoints[idx % state.spawnPoints.length];
    if (!spawn) return;
    state.players[cid] = {
      id: cid,
      x: spawn.x,
      y: spawn.y,
      direction: 0,
      turretDirection: 0,
      health: 100,
      maxHealth: 100,
      isAlive: true,
      color: spawn.color,
      bullets: [],
      keys: { left: false, right: false, up: false, down: false, shoot: false },
      lastShot: 0,
    };
  });
}

function applyTankInput(room, clientId, keys) {
  const player = room.gameState.players?.[clientId];
  if (!player) return;
  player.keys = {
    left: !!keys?.left,
    right: !!keys?.right,
    up: !!keys?.up,
    down: !!keys?.down,
    shoot: !!keys?.shoot,
  };
}

function tickTankRoom(room, now) {
  const state = room.gameState;
  if (!state || state.gameOver) return;
  // 允许1人以上开始游戏（支持单人练习或多人对战）
  if (room.clients.size < 2) return;

  ensureTankPlayers(room);
  const players = state.players;

  // 更新坦克
  Object.values(players).forEach((p) => {
    if (!p.isAlive) return;
    const speed = 3;
    let dx = 0,
      dy = 0;
    if (p.keys.left) dx -= 1;
    if (p.keys.right) dx += 1;
    if (p.keys.up) dy -= 1;
    if (p.keys.down) dy += 1;
    if (dx !== 0 && dy !== 0) {
      dx *= 0.7071;
      dy *= 0.7071;
    }
    
    // 保存原位置
    const oldX = p.x;
    const oldY = p.y;
    
    // 尝试移动
    p.x += dx * speed;
    p.y += dy * speed;
    const r = 12;
    p.x = Math.max(20 + r, Math.min(state.width - 20 - r, p.x));
    p.y = Math.max(20 + r, Math.min(state.height - 20 - r, p.y));

    // 检查是否与障碍物碰撞
    if (state.obstacles) {
      let collided = false;
      for (const obs of state.obstacles) {
        // 检查坦克（圆形，半径r）是否与障碍物（矩形）碰撞
        const closestX = Math.max(obs.x, Math.min(p.x, obs.x + obs.width));
        const closestY = Math.max(obs.y, Math.min(p.y, obs.y + obs.height));
        const distX = p.x - closestX;
        const distY = p.y - closestY;
        const distSq = distX * distX + distY * distY;
        
        if (distSq < r * r) {
          // 碰撞了，回退到原位置
          p.x = oldX;
          p.y = oldY;
          collided = true;
          break;
        }
      }
    }

    if (dx !== 0 || dy !== 0) {
      p.direction = (Math.atan2(dy, dx) * 180) / Math.PI;
      p.turretDirection = p.direction;
    }

    // 射击
    if (p.keys.shoot && now - p.lastShot > 500) {
      const turretLen = 18;
      const rad = (p.turretDirection * Math.PI) / 180;
      const bx = p.x + turretLen * Math.cos(rad);
      const by = p.y + turretLen * Math.sin(rad);
      state.bullets.push({
        x: bx,
        y: by,
        direction: p.turretDirection,
        owner: p.id,
        bounces: 0,
        maxBounces: 5,
        speed: 8,
        color: p.color,
        active: true,
      });
      p.lastShot = now;
    }
  });

  // 更新子弹
  state.bullets.forEach((b) => {
    if (!b.active) return;
    const rad = (b.direction * Math.PI) / 180;
    let nx = b.x + b.speed * Math.cos(rad);
    let ny = b.y + b.speed * Math.sin(rad);
    const radius = 4;

    // 边界反弹
    let bounced = false;
    if (nx - radius <= 20 || nx + radius >= state.width - 20) {
      b.direction = 180 - b.direction;
      b.bounces += 1;
      nx = Math.max(20 + radius, Math.min(state.width - 20 - radius, nx));
      bounced = true;
    }
    if (ny - radius <= 20 || ny + radius >= state.height - 20) {
      b.direction = -b.direction;
      b.bounces += 1;
      ny = Math.max(20 + radius, Math.min(state.height - 20 - radius, ny));
      bounced = true;
    }

    // 障碍物碰撞检测（如果还没反弹）
    if (!bounced && state.obstacles) {
      for (const obs of state.obstacles) {
        // 检查子弹是否进入障碍物区域
        if (
          nx + radius >= obs.x &&
          nx - radius <= obs.x + obs.width &&
          ny + radius >= obs.y &&
          ny - radius <= obs.y + obs.height
        ) {
          // 计算碰撞边：根据子弹进入的方向判断
          const prevX = b.x;
          const prevY = b.y;
          const dx = nx - prevX;
          const dy = ny - prevY;

          // 判断碰撞的是哪一边
          const leftDist = Math.abs(nx - obs.x);
          const rightDist = Math.abs(nx - (obs.x + obs.width));
          const topDist = Math.abs(ny - obs.y);
          const bottomDist = Math.abs(ny - (obs.y + obs.height));

          const minDist = Math.min(leftDist, rightDist, topDist, bottomDist);

          if (minDist === leftDist || minDist === rightDist) {
            // 左右碰撞：水平反弹
            b.direction = 180 - b.direction;
          } else {
            // 上下碰撞：垂直反弹
            b.direction = -b.direction;
          }

          b.bounces += 1;
          // 将子弹推出障碍物
          if (minDist === leftDist) nx = obs.x - radius;
          else if (minDist === rightDist) nx = obs.x + obs.width + radius;
          else if (minDist === topDist) ny = obs.y - radius;
          else ny = obs.y + obs.height + radius;

          bounced = true;
          break;
        }
      }
    }

    b.x = nx;
    b.y = ny;
    if (b.bounces >= b.maxBounces) b.active = false;

    // 碰撞玩家（包括发射者自己）
    Object.values(players).forEach((p) => {
      if (!p.isAlive || !b.active) return;
      const dist = Math.hypot(p.x - b.x, p.y - b.y);
      // 如果距离太近（小于25像素），可能是刚发射的子弹，避免立即伤害发射者
      // 但允许反弹后的子弹伤害到发射者
      if (p.id === b.owner && dist < 25 && b.bounces === 0) return;
      
      if (dist < radius + 12) {
        p.health -= 33.4;
        if (p.health <= 0) {
          p.health = 0;
          p.isAlive = false;
        }
        b.active = false;
      }
    });
  });

  state.bullets = state.bullets.filter((b) => b.active);

  // 判胜：只剩一人或无人存活时游戏结束
  const alive = Object.values(players).filter((p) => p.isAlive);
  if (!state.gameOver) {
    if (alive.length === 1) {
      state.gameOver = true;
      state.winner === "red" ? "red" : "blue";
    } else if (alive.length === 0) {
      state.gameOver = true;
      state.winner = null;
    }
  }
}

function makeTankBroadcastPayload(room) {
  const state = room.gameState;
  return {
    type: "tank_state",
    gameType: "tank",
    players: state.players,
    bullets: state.bullets,
    obstacles: state.obstacles || [], // 广播障碍物
    gameOver: state.gameOver,
    winner: state.winner,
  };
}

module.exports = {
  createTankState,
  ensureTankPlayers,
  applyTankInput,
  tickTankRoom,
  makeTankBroadcastPayload,
};

