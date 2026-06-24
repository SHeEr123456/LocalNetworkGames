const path = require("path");
const { GameServer } = require("./server");

// publicDir 指向项目根目录下的 public/
const publicDir = path.join(__dirname, "..", "..", "public");
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const server = new GameServer({ port, publicDir });
server.start();

