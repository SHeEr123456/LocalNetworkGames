const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 中国象棋规则引擎
class ChessRules {
    static isValidMove(board, fromRow, fromCol, toRow, toCol) {
        if (toRow < 0 || toRow > 9 || toCol < 0 || toCol > 8) return {valid: false};
        if (fromRow === toRow && fromCol === toCol) return {valid: false};
        
        const piece = board[fromRow][fromCol];
        if (!piece) return {valid: false};
        
        const targetPiece = board[toRow][toCol];
        const isRed = piece === piece.toUpperCase();
        
        if (targetPiece) {
            const isTargetRed = targetPiece === targetPiece.toUpperCase();
            if (isRed === isTargetRed) return {valid: false};
        }
        
        const pieceType = piece.toLowerCase();
        let isValid = false;
        
        switch (pieceType) {
            case 'k': isValid = this.isValidKingMove(piece, fromRow, fromCol, toRow, toCol, board); break;
            case 'a': isValid = this.isValidAdvisorMove(piece, fromRow, fromCol, toRow, toCol); break;
            case 'b': isValid = this.isValidElephantMove(piece, fromRow, fromCol, toRow, toCol, board); break;
            case 'n': isValid = this.isValidHorseMove(fromRow, fromCol, toRow, toCol, board); break;
            case 'r': isValid = this.isValidChariotMove(fromRow, fromCol, toRow, toCol, board); break;
            case 'c': isValid = this.isValidCannonMove(fromRow, fromCol, toRow, toCol, board, !!targetPiece); break;
            case 'p': isValid = this.isValidPawnMove(piece, fromRow, fromCol, toRow, toCol); break;
        }
        
        return {
            valid: isValid,
            captures: isValid && targetPiece !== null,
            piece: piece,
            targetPiece: targetPiece
        };
    }
    
    static isValidKingMove(piece, fromRow, fromCol, toRow, toCol, board) {
        const isRed = piece === 'K';
        const rowDiff = Math.abs(toRow - fromRow);
        const colDiff = Math.abs(toCol - fromCol);
        
        if (rowDiff + colDiff !== 1) return false;
        
        if (isRed) {
            if (toRow < 7 || toRow > 9 || toCol < 3 || toCol > 5) return false;
        } else {
            if (toRow < 0 || toRow > 2 || toCol < 3 || toCol > 5) return false;
        }
        
        return !this.isFacingKings(board, toRow, toCol, isRed);
    }
    
    static isFacingKings(board, row, col, isRed) {
        const direction = isRed ? -1 : 1;
        for (let r = row + direction; r >= 0 && r <= 9; r += direction) {
            const piece = board[r][col];
            if (piece) {
                return piece.toLowerCase() === 'k';
            }
        }
        return false;
    }
    
    static isValidAdvisorMove(piece, fromRow, fromCol, toRow, toCol) {
        const isRed = piece === 'A';
        const rowDiff = Math.abs(toRow - fromRow);
        const colDiff = Math.abs(toCol - fromCol);
        
        if (rowDiff !== 1 || colDiff !== 1) return false;
        
        if (isRed) {
            return toRow >= 7 && toRow <= 9 && toCol >= 3 && toCol <= 5;
        } else {
            return toRow >= 0 && toRow <= 2 && toCol >= 3 && toCol <= 5;
        }
    }
    
    static isValidElephantMove(piece, fromRow, fromCol, toRow, toCol, board) {
        const isRed = piece === 'B';
        const rowDiff = Math.abs(toRow - fromRow);
        const colDiff = Math.abs(toCol - fromCol);
        
        if (rowDiff !== 2 || colDiff !== 2) return false;
        
        // 象/相不能过河：红方在下（行数大），黑方在上（行数小）
        // 红象活动范围 5-9 行，不能到 0-4 行
        if (isRed && toRow < 5) return false;
        // 黑相活动范围 0-4 行，不能到 5-9 行
        if (!isRed && toRow > 4) return false;
        
        const eyeRow = (fromRow + toRow) / 2;
        const eyeCol = (fromCol + toCol) / 2;
        return board[eyeRow][eyeCol] === null;
    }
    
    static isValidHorseMove(fromRow, fromCol, toRow, toCol, board) {
        const rowDiff = Math.abs(toRow - fromRow);
        const colDiff = Math.abs(toCol - fromCol);
        
        if (!((rowDiff === 2 && colDiff === 1) || (rowDiff === 1 && colDiff === 2))) {
            return false;
        }
        
        if (rowDiff === 2) {
            const middleRow = (fromRow + toRow) / 2;
            if (board[middleRow][fromCol]) return false;
        } else {
            const middleCol = (fromCol + toCol) / 2;
            if (board[fromRow][middleCol]) return false;
        }
        
        return true;
    }
    
    static isValidChariotMove(fromRow, fromCol, toRow, toCol, board) {
        if (fromRow !== toRow && fromCol !== toCol) return false;
        
        let step, steps;
        if (fromRow === toRow) {
            step = fromCol < toCol ? 1 : -1;
            steps = Math.abs(toCol - fromCol);
            for (let i = 1; i < steps; i++) {
                if (board[fromRow][fromCol + i * step]) return false;
            }
        } else {
            step = fromRow < toRow ? 1 : -1;
            steps = Math.abs(toRow - fromRow);
            for (let i = 1; i < steps; i++) {
                if (board[fromRow + i * step][fromCol]) return false;
            }
        }
        
        return true;
    }
    
    static isValidCannonMove(fromRow, fromCol, toRow, toCol, board, isCapture) {
        if (fromRow !== toRow && fromCol !== toCol) return false;
        
        let obstacles = 0;
        let row = fromRow;
        let col = fromCol;
        
        while (row !== toRow || col !== toCol) {
            if (row < toRow) row++;
            else if (row > toRow) row--;
            if (col < toCol) col++;
            else if (col > toCol) col--;
            
            if ((row !== toRow || col !== toCol) && board[row][col]) {
                obstacles++;
            }
        }
        
        if (isCapture) {
            return obstacles === 1;
        } else {
            return obstacles === 0;
        }
    }
    
    static isValidPawnMove(piece, fromRow, fromCol, toRow, toCol) {
        const isRed = piece === 'P';
        const rowDiff = toRow - fromRow;
        const colDiff = Math.abs(toCol - fromCol);
        
        if (isRed && rowDiff > 0) return false;
        if (!isRed && rowDiff < 0) return false;
        
        const forwardDiff = Math.abs(rowDiff);
        const isCrossedRiver = isRed ? fromRow <= 4 : fromRow >= 5;
        
        if (!isCrossedRiver) {
            return forwardDiff === 1 && colDiff === 0;
        } else {
            if (forwardDiff === 1 && colDiff === 0) return true;
            if (forwardDiff === 0 && colDiff === 1) return true;
            return false;
        }
    }
    
    static getAllValidMoves(board, row, col) {
        const piece = board[row][col];
        if (!piece) return [];
        
        const moves = [];
        
        for (let toRow = 0; toRow < 10; toRow++) {
            for (let toCol = 0; toCol < 9; toCol++) {
                const result = this.isValidMove(board, row, col, toRow, toCol);
                if (result.valid) {
                    moves.push({row: toRow, col: toCol, captures: result.captures});
                }
            }
        }
        
        return moves;
    }
}

class ChessServer {
    constructor(port = 3000) {
        this.port = port;
        this.server = http.createServer(this.handleHttpRequest.bind(this));
        this.wss = new WebSocket.Server({ server: this.server });
        
        this.clients = new Map();
        this.rooms = new Map();
        
        // Tank 模式定时器（20 FPS）
        this.tankTick = setInterval(() => this.updateTankRooms(), 50);

        this.setupWebSocket();
    }
    
    handleHttpRequest(req, res) {
        const url = req.url === '/' ? '/index.html' : req.url;
        const filePath = path.join(__dirname, url);
        
        const mimeTypes = {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.json': 'application/json'
        };
        
        const extname = path.extname(filePath);
        const contentType = mimeTypes[extname] || 'application/octet-stream';
        
        fs.readFile(filePath, (error, content) => {
            if (error) {
                if (error.code === 'ENOENT') {
                    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
                        if (err) {
                            res.writeHead(500);
                            res.end('Error loading index.html');
                        } else {
                            res.writeHead(200, { 'Content-Type': 'text/html' });
                            res.end(data, 'utf-8');
                        }
                    });
                } else {
                    res.writeHead(500);
                    res.end('Server Error: ' + error.code);
                }
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content, 'utf-8');
            }
        });
    }
    
    setupWebSocket() {
        this.wss.on('connection', (ws, req) => {
            const clientId = this.generateClientId();
            console.log(`新客户端连接: ${clientId}`);
            
            this.clients.set(clientId, {
                ws: ws,
                roomId: null,
                color: null,
                clientId: clientId
            });
            
            ws.send(JSON.stringify({
                type: 'welcome',
                clientId: clientId,
                message: '连接到象棋服务器'
            }));
            
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    this.handleMessage(clientId, data);
                } catch (error) {
                    console.error('消息解析错误:', error);
                }
            });
            
            ws.on('close', () => {
                console.log(`客户端断开: ${clientId}`);
                this.handleDisconnect(clientId);
            });
            
            ws.on('error', (error) => {
                console.error(`客户端错误 ${clientId}:`, error);
            });
        });
    }
    
    handleMessage(clientId, data) {
        const client = this.clients.get(clientId);
        if (!client) return;
        
        console.log(`收到消息从 ${clientId}:`, data.type);
        
        switch (data.type) {
            case 'create_room':
                this.createRoom(clientId, data.gameType || 'chess');
                break;
            case 'join_room':
                this.joinRoom(clientId, data.roomId);
                break;
            case 'move':
                this.handleMove(clientId, data);
                break;
            case 'tank_input':
                this.handleTankInput(clientId, data);
                break;
            case 'chat':
                this.handleChat(clientId, data);
                break;
            case 'restart':
                this.handleRestart(clientId);
                break;
            case 'get_rooms':
                this.sendRoomList(clientId);
                break;
        }
    }
    
    createRoom(clientId, gameType = 'chess') {
        const client = this.clients.get(clientId);
        if (!client) return;
        
        if (client.roomId) {
            this.leaveRoom(clientId);
        }
        
        const roomId = this.generateRoomId();
        const room = {
            id: roomId,
            clients: new Set([clientId]),
            gameType: gameType || 'chess',
            gameState: this.initializeGameState(gameType || 'chess'),
            turn: 'red',
            created: Date.now()
        };
        
        this.rooms.set(roomId, room);
        
        client.roomId = roomId;
        client.color = 'red';
        
        client.ws.send(JSON.stringify({
            type: 'room_created',
            roomId: roomId,
            color: 'red',
            gameType: room.gameType,
            gameState: room.gameState,
            message: '房间创建成功，等待其他玩家加入...'
        }));
        
        console.log(`房间创建: ${roomId} 由 ${clientId}`);
        this.broadcastRoomList();
    }
    
    joinRoom(clientId, roomId) {
        const client = this.clients.get(clientId);
        if (!client) return;
        
        const room = this.rooms.get(roomId);
        if (!room) {
            client.ws.send(JSON.stringify({
                type: 'error',
                message: '房间不存在'
            }));
            return;
        }
        
        if (room.clients.size >= 2) {
            client.ws.send(JSON.stringify({
                type: 'error',
                message: '房间已满'
            }));
            return;
        }
        
        if (client.roomId) {
            this.leaveRoom(clientId);
        }
        
        room.clients.add(clientId);
        client.roomId = roomId;
        client.color = room.gameType === 'chess' ? 'black' : 'blue';
        
        // 如果是 Tank 模式，确保玩家被初始化
        if (room.gameType === 'tank' && room.gameState) {
            const state = room.gameState;
            if (!state.spawnPoints || state.spawnPoints.length === 0) {
                state.spawnPoints = [
                    { x: 100, y: 100, color: 'red' },
                    { x: 700, y: 500, color: 'blue' }
                ];
            }
            if (!state.players) {
                state.players = {};
            }
            // 初始化新加入的玩家
            if (!state.players[clientId]) {
                const clientArray = Array.from(room.clients);
                const idx = clientArray.indexOf(clientId);
                const spawn = state.spawnPoints[idx % state.spawnPoints.length];
                if (spawn) {
                    state.players[clientId] = {
                        id: clientId,
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
                        lastShot: 0
                    };
                }
            }
        }
        
        client.ws.send(JSON.stringify({
            type: 'room_joined',
            roomId: roomId,
            color: client.color,
            gameType: room.gameType,
            gameState: room.gameState,
            opponent: Array.from(room.clients).find(id => id !== clientId),
            message: '加入房间成功，游戏开始！'
        }));
        
        this.broadcastToRoom(roomId, {
            type: 'player_joined',
            clientId: clientId,
            color: client.color,
            gameType: room.gameType,
            message: '新玩家已加入，游戏开始！'
        }, clientId);
        
        console.log(`玩家加入: ${clientId} 加入房间 ${roomId}`);
    }
    
    handleMove(clientId, data) {
        const client = this.clients.get(clientId);
        if (!client || !client.roomId) return;

        const room = this.rooms.get(client.roomId);
        if (!room) return;

        // Tank 模式不走象棋逻辑
        if (room.gameType !== 'chess') return;

        // 1. 验证回合
        if (room.turn !== client.color) {
            client.ws.send(JSON.stringify({
                type: 'error',
                message: '不是你的回合'
            }));
            return;
        }

        const { from, to } = data;
        const piece = room.gameState.board[from.row][from.col];
        const targetPiece = room.gameState.board[to.row][to.col]; // 获取目标位置的棋子（可能为null）

        if (!piece) {
            client.ws.send(JSON.stringify({
                type: 'error',
                message: '没有选中棋子'
            }));
            return;
        }

        // 2. 使用规则引擎验证移动
        const moveResult = ChessRules.isValidMove(
            room.gameState.board,
            from.row, from.col,
            to.row, to.col
        );

        if (!moveResult.valid) {
            client.ws.send(JSON.stringify({
                type: 'error',
                message: '非法移动'
            }));
            return;
        }

        // 3. 执行移动（服务端为权威状态）
        room.gameState.board[to.row][to.col] = piece;      // 覆盖/吃子
        room.gameState.board[from.row][from.col] = null;   // 清空原位

        // 4. 记录移动历史
        room.gameState.moveHistory.push({
            from, to, piece,
            captures: moveResult.captures,
            targetPiece: moveResult.targetPiece // 记录被吃的棋子
        });

        // 5. 判断是否吃掉将/帅，设置胜负
        let gameOver = false;
        let winner = null;
        if (moveResult.captures && moveResult.targetPiece && moveResult.targetPiece.toLowerCase() === 'k') {
            gameOver = true;
            winner = client.color; // 当前走子方获胜
            room.gameState.gameOver = true;
            room.gameState.winner = winner;
        }

        // 若未结束，对调回合
        if (!gameOver) {
            room.turn = room.turn === 'red' ? 'black' : 'red';
        }
        room.gameState.turn = room.turn;

        // 6. 广播移动结果给房间内所有玩家
        this.broadcastToRoom(room.id, {
            type: 'move',
            from: from,
            to: to,
            piece: piece,
            clientId: clientId,
            captures: moveResult.captures,
            targetPiece: targetPiece, // 发送被吃的棋子信息
            turn: room.turn,
            board: room.gameState.board,
            gameOver: gameOver,
            winner: winner
        });

        console.log(`移动: ${clientId} ${piece}(${from.row},${from.col}) -> (${to.row},${to.col}) ${moveResult.captures ? `吃子(${targetPiece})` : ''}`);
    }

    handleTankInput(clientId, data) {
        const client = this.clients.get(clientId);
        if (!client || !client.roomId) return;
        const room = this.rooms.get(client.roomId);
        if (!room || room.gameType !== 'tank') return;

        const player = room.gameState.players[clientId];
        if (!player) return;

        player.keys = {
            left: !!data.keys?.left,
            right: !!data.keys?.right,
            up: !!data.keys?.up,
            down: !!data.keys?.down,
            shoot: !!data.keys?.shoot
        };
    }
    
    handleChat(clientId, data) {
        const client = this.clients.get(clientId);
        if (!client || !client.roomId) return;
        
        this.broadcastToRoom(client.roomId, {
            type: 'chat',
            clientId: clientId,
            message: data.message,
            timestamp: new Date().toLocaleTimeString()
        });
    }
    
    handleRestart(clientId) {
        const client = this.clients.get(clientId);
        if (!client || !client.roomId) return;
        
        const room = this.rooms.get(client.roomId);
        if (!room) return;
        
        room.gameState = this.initializeGameState(room.gameType || 'chess');
        room.turn = 'red';
        
        this.broadcastToRoom(room.id, {
            type: 'game_restarted',
            gameState: room.gameState,
            turn: room.turn,
            message: '游戏已重新开始'
        });
    }
    
    handleDisconnect(clientId) {
        const client = this.clients.get(clientId);
        if (!client) return;
        
        if (client.roomId) {
            this.leaveRoom(clientId);
        }
        
        this.clients.delete(clientId);
        console.log(`客户端 ${clientId} 已完全移除`);
    }
    
    leaveRoom(clientId) {
        const client = this.clients.get(clientId);
        if (!client || !client.roomId) return;
        
        const room = this.rooms.get(client.roomId);
        if (room) {
            room.clients.delete(clientId);
            
            this.broadcastToRoom(room.id, {
                type: 'player_left',
                clientId: clientId,
                message: '玩家已离开房间'
            }, clientId);
            
            if (room.clients.size === 0) {
                this.rooms.delete(room.id);
                console.log(`房间 ${room.id} 已被删除`);
            }
            
            this.broadcastRoomList();
        }
        
        client.roomId = null;
        client.color = null;
        
        console.log(`客户端 ${clientId} 离开房间`);
    }
    
    broadcastToRoom(roomId, message, excludeClientId = null) {
        const room = this.rooms.get(roomId);
        if (!room) return;
        
        room.clients.forEach(clientId => {
            if (clientId !== excludeClientId) {
                const client = this.clients.get(clientId);
                if (client && client.ws.readyState === WebSocket.OPEN) {
                    client.ws.send(JSON.stringify(message));
                }
            }
        });
    }
    
    broadcastRoomList() {
        const roomList = Array.from(this.rooms.values()).map(room => ({
            id: room.id,
            playerCount: room.clients.size,
            created: room.created,
            gameType: room.gameType || 'chess'
        }));
        
        this.clients.forEach(client => {
            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify({
                    type: 'room_list',
                    rooms: roomList
                }));
            }
        });
    }
    
    sendRoomList(clientId) {
        const client = this.clients.get(clientId);
        if (!client) return;
        
        const roomList = Array.from(this.rooms.values()).map(room => ({
            id: room.id,
            playerCount: room.clients.size,
            created: room.created,
            gameType: room.gameType || 'chess'
        }));
        
        client.ws.send(JSON.stringify({
            type: 'room_list',
            rooms: roomList
        }));
    }
    
    initializeGameState(gameType = 'chess') {
        if (gameType === 'tank') {
            return this.initializeTankState();
        }

        const board = Array(10).fill().map(() => Array(9).fill(null));
        
        // 修正后的初始位置
        const initialPositions = [
            // 黑方 (row 0-4)
            ['r', 0, 0], ['n', 0, 1], ['b', 0, 2], ['a', 0, 3], ['k', 0, 4], 
            ['a', 0, 5], ['b', 0, 6], ['n', 0, 7], ['r', 0, 8],
            ['c', 2, 1], ['c', 2, 7],
            ['p', 3, 0], ['p', 3, 2], ['p', 3, 4], ['p', 3, 6], ['p', 3, 8],
            
            // 红方 (row 5-9)
            ['R', 9, 0], ['N', 9, 1], ['B', 9, 2], ['A', 9, 3], ['K', 9, 4],
            ['A', 9, 5], ['B', 9, 6], ['N', 9, 7], ['R', 9, 8],
            ['C', 7, 1], ['C', 7, 7],
            ['P', 6, 0], ['P', 6, 2], ['P', 6, 4], ['P', 6, 6], ['P', 6, 8]
        ];
        
        initialPositions.forEach(([piece, row, col]) => {
            board[row][col] = piece;
        });
        
        return {
            board: board,
            turn: 'red',
            moveHistory: []
        };
    }

    initializeTankState() {
        const spawnPoints = [
            { x: 100, y: 100, color: 'red' },
            { x: 700, y: 500, color: 'blue' }
        ];
        return {
            gameType: 'tank',
            players: {},
            bullets: [],
            spawnPoints,
            width: 800,
            height: 600,
            gameOver: false,
            winner: null
        };
    }

    updateTankRooms() {
        const now = Date.now();
        this.rooms.forEach(room => {
            if (room.gameType !== 'tank') return;
            const state = room.gameState;
            if (!state || state.gameOver) return;
            if (room.clients.size < 2) return;

            // 确保 spawnPoints 存在
            if (!state.spawnPoints || state.spawnPoints.length === 0) {
                state.spawnPoints = [
                    { x: 100, y: 100, color: 'red' },
                    { x: 700, y: 500, color: 'blue' }
                ];
            }

            // 初始化玩家 - 使用 Array.from 获取正确的索引
            Array.from(room.clients).forEach((cid, idx) => {
                if (!state.players[cid]) {
                    const spawn = state.spawnPoints[idx % state.spawnPoints.length];
                    if (!spawn) {
                        console.error(`Spawn point ${idx} is undefined for client ${cid}`);
                        return;
                    }
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
                        lastShot: 0
                    };
                }
            });

            const players = state.players;

            // 更新坦克
            Object.values(players).forEach(p => {
                if (!p.isAlive) return;
                const speed = 3;
                let dx = 0, dy = 0;
                if (p.keys.left) dx -= 1;
                if (p.keys.right) dx += 1;
                if (p.keys.up) dy -= 1;
                if (p.keys.down) dy += 1;
                if (dx !== 0 && dy !== 0) {
                    dx *= 0.7071;
                    dy *= 0.7071;
                }
                p.x += dx * speed;
                p.y += dy * speed;
                const r = 12;
                p.x = Math.max(20 + r, Math.min(state.width - 20 - r, p.x));
                p.y = Math.max(20 + r, Math.min(state.height - 20 - r, p.y));

                if (dx !== 0 || dy !== 0) {
                    p.direction = Math.atan2(dy, dx) * 180 / Math.PI;
                    p.turretDirection = p.direction;
                }

                if (p.keys.shoot && now - p.lastShot > 500) {
                    const turretLen = 18;
                    const rad = p.turretDirection * Math.PI / 180;
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
                        active: true
                    });
                    p.lastShot = now;
                }
            });

            // 更新子弹
            state.bullets.forEach(b => {
                if (!b.active) return;
                const rad = b.direction * Math.PI / 180;
                let nx = b.x + b.speed * Math.cos(rad);
                let ny = b.y + b.speed * Math.sin(rad);
                const radius = 4;

                // 边界反弹
                if (nx - radius <= 20 || nx + radius >= state.width - 20) {
                    b.direction = 180 - b.direction;
                    b.bounces += 1;
                    nx = Math.max(20 + radius, Math.min(state.width - 20 - radius, nx));
                }
                if (ny - radius <= 20 || ny + radius >= state.height - 20) {
                    b.direction = -b.direction;
                    b.bounces += 1;
                    ny = Math.max(20 + radius, Math.min(state.height - 20 - radius, ny));
                }

                b.x = nx;
                b.y = ny;

                if (b.bounces >= b.maxBounces) b.active = false;

                // 碰撞玩家
                Object.values(players).forEach(p => {
                    if (!p.isAlive || p.id === b.owner || !b.active) return;
                    const dist = Math.hypot(p.x - b.x, p.y - b.y);
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

            state.bullets = state.bullets.filter(b => b.active);

            // 判胜
            const alive = Object.values(players).filter(p => p.isAlive);
            if (!state.gameOver) {
                if (alive.length === 1) {
                    state.gameOver = true;
                    state.winner = alive[0].color === 'red' ? 'red' : 'blue';
                } else if (alive.length === 0) {
                    state.gameOver = true;
                    state.winner = null;
                }
            }

            // 广播
            this.broadcastToRoom(room.id, {
                type: 'tank_state',
                gameType: 'tank',
                players: state.players,
                bullets: state.bullets,
                gameOver: state.gameOver,
                winner: state.winner
            });
        });
    }
    
    generateClientId() {
        return 'client_' + Math.random().toString(36).substr(2, 9);
    }
    
    generateRoomId() {
        return 'room_' + Math.random().toString(36).substr(2, 6).toUpperCase();
    }
    
    start() {
        this.server.listen(this.port, () => {
            const os = require('os');
            const interfaces = os.networkInterfaces();
            let localIP = 'localhost';
            
            for (const name in interfaces) {
                for (const iface of interfaces[name]) {
                    if (iface.family === 'IPv4' && !iface.internal) {
                        // localIP = iface.address;
                        localIP = '192.168.20.108';
                        break;
                    }
                }
            }
            
            console.log('========================================');
            console.log('象棋对战服务器已启动！');
            console.log(`本地访问: http://localhost:${this.port}`);
            console.log(`局域网访问: http://${localIP}:${this.port}`);
            console.log('========================================');
            console.log('\n使用说明:');
            console.log('1. 在一台电脑上运行服务器');
            console.log('2. 在同一局域网的设备上访问上述地址');
            console.log('3. 一人创建房间，另一人加入即可开始对战');
            console.log('========================================');
        });
    }
}

const server = new ChessServer(3000);
server.start();