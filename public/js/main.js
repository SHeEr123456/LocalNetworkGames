/**
 * 浏览器入口文件
 * - 负责读取 DOM、绑定按钮事件
 * - 创建 OnlineGameApp 并启动
 */

import { OnlineGameApp } from "./online/OnlineGameApp.js";

const app = new OnlineGameApp({
  el: {
    connectionPanel: document.getElementById("connectionPanel"),
    gameContainer: document.getElementById("gameContainer"),
    serverAddress: document.getElementById("serverAddress"),
    connectBtn: document.getElementById("connectBtn"),
    gameSelect: document.getElementById("gameSelect"),
    createRoomBtn: document.getElementById("createRoomBtn"),
    refreshRoomBtn: document.getElementById("refreshRoomBtn"),
    roomListContainer: document.getElementById("roomListContainer"),
    roomList: document.getElementById("roomList"),
    connectionStatus: document.getElementById("connectionStatus"),
    restartBtn: document.getElementById("restartBtn"),
    surrenderBtn: document.getElementById("surrenderBtn"),
    toggleSoundBtn: document.getElementById("toggleSoundBtn"),
    playerColor: document.getElementById("playerColor"),
    currentTurn: document.getElementById("currentTurn"),
    roomId: document.getElementById("roomId"),
    chatMessages: document.getElementById("chatMessages"),
    chatInput: document.getElementById("chatInput"),
    sendChatBtn: document.getElementById("sendChatBtn"),
    moveHistory: document.getElementById("moveHistory"),
    chessboard: document.getElementById("chessboard"),
    tankContainer: document.getElementById("tankContainer"),
    tankCanvas: document.getElementById("tankCanvas"),
  },
});

app.init();

// 页面加载时尝试填充 serverAddress（便于局域网访问时直接用当前 host）
window.addEventListener("load", () => {
  const host = window.location.hostname;
  if (host && host !== "localhost" && host !== "127.0.0.1") {
    app.el.serverAddress.value = `${host}:3000`;
  }
});

