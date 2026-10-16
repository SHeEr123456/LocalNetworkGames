/**
 * 浏览器入口文件
 * - 负责读取 DOM、绑定按钮事件
 * - 创建 OnlineGameApp 并启动
 */

import { OnlineGameApp } from "./online/OnlineGameApp.js";

const app = new OnlineGameApp({
  el: {
    // 侧栏
    connectionPanel: document.getElementById("connectionPanel"),
    serverAddress: document.getElementById("serverAddress"),
    connectBtn: document.getElementById("connectBtn"),
    gameSelectSection: document.getElementById("gameSelectSection"),
    gameNav: document.getElementById("gameNav"),
    gameSelect: document.getElementById("gameSelect"),
    createRoomSection: document.getElementById("createRoomSection"),
    playerCountSelect: document.getElementById("playerCountSelect"),
    createRoomBtn: document.getElementById("createRoomBtn"),
    refreshRoomBtn: document.getElementById("refreshRoomBtn"),
    connectionStatus: document.getElementById("connectionStatus"),

    // 大厅
    lobbyView: document.getElementById("lobbyView"),
    gameGrid: document.getElementById("gameGrid"),
    quickCreateBtn: document.getElementById("quickCreateBtn"),
    roomListContainer: document.getElementById("roomListContainer"),
    roomList: document.getElementById("roomList"),

    // 房间
    gameContainer: document.getElementById("gameContainer"),
    backBtn: document.getElementById("backBtn"),
    roomGameName: document.getElementById("roomGameName"),
    roomStateTag: document.getElementById("roomStateTag"),
    roomId: document.getElementById("roomId"),
    roomIdEcho: document.getElementById("roomIdEcho"),
    restartBtn: document.getElementById("restartBtn"),
    surrenderBtn: document.getElementById("surrenderBtn"),
    toggleSoundBtn: document.getElementById("toggleSoundBtn"),
    rollDiceBtn: document.getElementById("rollDiceBtn"),
    playerColor: document.getElementById("playerColor"),
    currentTurn: document.getElementById("currentTurn"),
    chatMessages: document.getElementById("chatMessages"),
    chatInput: document.getElementById("chatInput"),
    sendChatBtn: document.getElementById("sendChatBtn"),
    moveHistory: document.getElementById("moveHistory"),

    // 各游戏容器
    chessboard: document.getElementById("chessboard"),
    tankContainer: document.getElementById("tankContainer"),
    tankCanvas: document.getElementById("tankCanvas"),
    tankTouchPad: document.getElementById("tankTouchPad"),
    flyingContainer: document.getElementById("flyingContainer"),
    flyingCanvas: document.getElementById("flyingCanvas"),
    monopolyContainer: document.getElementById("monopolyContainer"),
    monopolyCanvas: document.getElementById("monopolyCanvas"),
    monopolyBar: document.getElementById("monopolyBar"),
    monopolyActions: document.getElementById("monopolyActions"),
    monopolyPlayers: document.getElementById("monopolyPlayers"),
    monopolyOwn: document.getElementById("monopolyOwn"),
    monopolyLog: document.getElementById("monopolyLog"),
  },
});

app.init();

// 页面加载时用当前页面地址（含端口）填充服务器地址，
// 这样无论服务端跑在 3000 还是自动切换后的其它端口，都能直接连上
window.addEventListener("load", () => {
  if (window.location.host && app.el.serverAddress && !app.el.serverAddress.value) {
    app.el.serverAddress.value = window.location.host;
  }
});
