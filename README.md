# 局域网游戏对战（中国象棋 / 坦克大战）

这是一个基于 **Node.js + WebSocket** 的局域网对战小项目：支持创建房间、加入房间、聊天与实时同步。

## 快速开始

1. 安装依赖

```bash
npm install
```

2. 启动服务器（默认端口 3000）

```bash
npm start
```

3. 打开页面

- **本机**：`http://localhost:3000`
- **局域网其他设备**：`http://你的电脑IP:3000`

## 目录结构（重构后）

```text
public/                 # 静态资源（浏览器端）
  index.html
  css/main.css
  js/
    main.js             # 浏览器入口
    online/OnlineGameApp.js
    games/
      chess/            # 中国象棋（客户端）
      tank/             # 坦克大战（客户端）

src/
  server/               # 服务端（Node.js）
    index.js            # 服务端入口（被根目录 server.js 引用）
    server.js           # HTTP 静态资源 + WebSocket 房间管理
    games/
      chess/            # 象棋（服务端权威逻辑）
      tank/             # 坦克（服务端 tick / 广播）
```

## 协议简述（WebSocket）

- **create_room**：创建房间（携带 `gameType`）
- **join_room**：加入房间
- **get_rooms**：获取房间列表
- **chat**：聊天
- **move**：象棋走子（服务端校验与广播）
- **tank_input**：坦克输入（客户端周期发送，服务端 tick 后广播 `tank_state`）
- **restart**：重开

## 说明

- **服务端为权威状态**：象棋走子合法性与胜负判定都在服务端完成；客户端规则仅用于“高亮可走位置”的交互提示。
- **认输**：目前仅做了客户端本地提示（未实现服务端结算协议），如需联网结算可在服务端扩展消息类型。

