class ChineseChessGame {
    constructor() {
        this.socket = null;
        this.clientId = null;
        this.roomId = null;
        this.color = null;
        this.gameState = null;
        this.selectedPiece = null;
        this.validMoves = [];
        this.boardElement = document.getElementById('chessboard');
        this.statusElement = document.getElementById('status');
        this.moveHistoryElement = document.getElementById('moveHistory');
        this.chatMessagesElement = document.getElementById('chatMessages');
        this.playerColorElement = document.getElementById('playerColor');
        this.turnInfoElement = document.getElementById('turnInfo');
        
        this.initEventListeners();
        this.renderBoard();
    }
    
    initEventListeners() {
        document.getElementById('connectBtn').addEventListener('click', () => this.connectToServer());
        document.getElementById('createRoomBtn').addEventListener('click', () => this.createRoom());
        document.getElementById('restartBtn').addEventListener('click', () => this.restartGame());
        document.getElementById('undoBtn').addEventListener('click', () => this.undoMove());
        document.getElementById('surrenderBtn').addEventListener('click', () => this.surrender());
        document.getElementById('sendBtn').addEventListener('click', () => this.sendChatMessage());
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage();
        });
    }
    
    connectToServer() {
        const serverIp = document.getElementById('serverIp').value || window.location.hostname;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${serverIp}:3000`;
        
        this.socket = new WebSocket(wsUrl);
        
        this.socket.onopen = () => {
            this.updateStatus('已连接到服务器');
            console.log('WebSocket连接已建立');
        };
        
        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (error) {
                console.error('消息处理错误:', error);
            }
        };
        
        this.socket.onclose = () => {
            this.updateStatus('连接已断开');
        };
        
        this.socket.onerror = (error) => {
            console.error('WebSocket错误:', error);
            this.updateStatus('连接错误');
        };
    }
    
    createRoom() {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            alert('请先连接到服务器');
            return;
        }
        
        const roomName = prompt('请输入房间名称:', '象棋房间');
        if (roomName) {
            this.socket.send(JSON.stringify({
                type: 'create_room',
                roomName: roomName
            }));
        }
    }
    
    handleMessage(data) {
        switch (data.type) {
            case 'welcome':
                this.clientId = data.clientId;
                break;
                
            case 'room_created':
                this.roomId = data.roomId;
                this.color = data.color;
                this.gameState = data.gameState;
                this.updateStatus(`房间已创建 (${this.roomId}) - 您是${this.color === 'red' ? '红方' : '黑方'}`);
                this.updatePlayerInfo();
                this.renderBoard();
                break;
                
            case 'room_joined':
                this.roomId = data.roomId;
                this.color = data.color;
                this.gameState = data.gameState;
                this.updateStatus(`已加入房间 - 您是${this.color === 'red' ? '红方' : '黑方'}`);
                this.updatePlayerInfo();
                this.renderBoard();
                break;
                
            case 'move':
                this.handleServerMove(data);
                break;
                
            case 'chat':
                this.addChatMessage(data.sender, data.message, data.timestamp);
                break;
                
            case 'game_state':
                this.gameState = data.state;
                this.renderBoard();
                break;
                
            case 'player_joined':
                this.updateStatus(`玩家 ${data.clientId} 已加入，游戏开始！`);
                break;
                
            case 'player_left':
                this.updateStatus(`玩家 ${data.clientId} 已离开`);
                break;
                
            case 'error':
                alert(data.message);
                break;
        }
    }
    
    updateStatus(message) {
        this.statusElement.textContent = message;
        this.statusElement.style.color = '#333';
    }
    
    updatePlayerInfo() {
        if (this.color) {
            this.playerColorElement.textContent = `颜色: ${this.color === 'red' ? '红方' : '黑方'}`;
            this.playerColorElement.style.color = this.color === 'red' ? '#B22222' : '#000000';
        }
    }
    
    renderBoard() {
        if (!this.gameState || !this.gameState.board) return;
        
        this.boardElement.innerHTML = '';
        this.drawBoardGrid();
        
        const board = this.gameState.board;
        const pieceMap = {
            'K': '帅', 'A': '仕', 'B': '象', 'R': '車', 'N': '马', 'C': '炮', 'P': '兵',
            'k': '将', 'a': '士', 'b': '相', 'r': '车', 'n': '马', 'c': '炮', 'p': '卒'
        };
        
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 9; col++) {
                const piece = board[row][col];
                if (piece) {
                    this.createPieceElement(piece, row, col, pieceMap[piece]);
                }
            }
        }
        
        // 绘制有效移动位置
        this.validMoves.forEach(([row, col]) => {
            const x = col * 66.67 + 23;
            const y = row * 66.67 + 23;
            const moveIndicator = document.createElement('div');
            moveIndicator.className = 'valid-move';
            moveIndicator.style.left = `${x}px`;
            moveIndicator.style.top = `${y}px`;
            moveIndicator.addEventListener('click', () => this.movePiece(this.selectedPiece, [row, col]));
            this.boardElement.appendChild(moveIndicator);
        });
        
        // 更新回合信息
        if (this.gameState.turn) {
            this.turnInfoElement.textContent = `当前回合: ${this.gameState.turn === 'red' ? '红方' : '黑方'}`;
            this.turnInfoElement.style.color = this.gameState.turn === 'red' ? '#B22222' : '#000000';
        }
    }
    
    drawBoardGrid() {
        // 绘制楚河汉界
        const river = document.createElement('div');
        river.style.position = 'absolute';
        river.style.top = '334px';
        river.style.left = '30px';
        river.style.width = '540px';
        river.style.height = '66px';
        river.style.backgroundColor = 'rgba(139, 0, 0, 0.1)';
        river.style.display = 'flex';
        river.style.alignItems = 'center';
        river.style.justifyContent = 'center';
        river.style.fontSize = '20px';
        river.style.fontWeight = 'bold';
        river.style.color = '#8B0000';
        river.textContent = '楚河        汉界';
        this.boardElement.appendChild(river);
        
        // 绘制网格线
        for (let i = 0; i <= 9; i++) {
            const line = document.createElement('div');
            line.style.position = 'absolute';
            line.style.left = `${30 + i * 60}px`;
            line.style.top = '30px';
            line.style.width = '1px';
            line.style.height = '600px';
            line.style.backgroundColor = '#8B4513';
            this.boardElement.appendChild(line);
        }
        
        for (let i = 0; i <= 10; i++) {
            const line = document.createElement('div');
            line.style.position = 'absolute';
            line.style.left = '30px';
            line.style.top = `${30 + i * 60}px`;
            line.style.width = '540px';
            line.style.height = '1px';
            line.style.backgroundColor = '#8B4513';
            this.boardElement.appendChild(line);
        }
    }
    
    createPieceElement(pieceCode, row, col, pieceChar) {
        const pieceElement = document.createElement('div');
        pieceElement.className = `chess-piece ${pieceCode === pieceCode.toUpperCase() ? 'red' : 'black'}`;
        pieceElement.textContent = pieceChar;
        pieceElement.dataset.row = row;
        pieceElement.dataset.col = col;
        pieceElement.dataset.piece = pieceCode;
        
        const x = col * 66.67;
        const y = row * 66.67;
        pieceElement.style.left = `${x}px`;
        pieceElement.style.top = `${y}px`;
        
        pieceElement.addEventListener('click', () => this.selectPiece(pieceCode, row, col));
        
        this.boardElement.appendChild(pieceElement);
    }
    
    selectPiece(piece, row, col) {
        // 检查是否是当前玩家的回合
        const isRed = piece === piece.toUpperCase();
        const currentPlayerColor = isRed ? 'red' : 'black';
        
        if (this.color !== currentPlayerColor || this.gameState.turn !== this.color) {
            return; // 不是当前玩家的棋子或不是该玩家的回合
        }
        
        this.selectedPiece = { piece, row, col };
        this.clearValidMoves();
        
        // 移除之前选中的样式
        document.querySelectorAll('.chess-piece.selected').forEach(p => p.classList.remove('selected'));
        
        // 添加选中样式
        const pieceElement = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        if (pieceElement) {
            pieceElement.classList.add('selected');
        }
        
        // 计算并显示有效移动位置
        this.validMoves = this.calculateValidMoves(piece, row, col);
        this.renderBoard();
    }
    
    calculateValidMoves(piece, row, col) {
        const moves = [];
        const isRed = piece === piece.toUpperCase();
        
        switch (piece.toLowerCase()) {
            case 'k': // 将/帅
                // 九宫格移动
                const kingMoves = [[-1, 0], [1, 0], [0, -1], [0, 1]];
                kingMoves.forEach(([dr, dc]) => {
                    const newRow = row + dr;
                    const newCol = col + dc;
                    if (this.isValidKingMove(isRed, newRow, newCol)) {
                        moves.push([newRow, newCol]);
                    }
                });
                break;
                
            case 'a': // 士/仕
                const advisorMoves = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
                advisorMoves.forEach(([dr, dc]) => {
                    const newRow = row + dr;
                    const newCol = col + dc;
                    if (this.isValidAdvisorMove(isRed, newRow, newCol)) {
                        moves.push([newRow, newCol]);
                    }
                });
                break;
                
            case 'b': // 象/相
                const elephantMoves = [[-2, -2], [-2, 2], [2, -2], [2, 2]];
                elephantMoves.forEach(([dr, dc]) => {
                    const newRow = row + dr;
                    const newCol = col + dc;
                    if (this.isValidElephantMove(isRed, newRow, newCol, row, col)) {
                        moves.push([newRow, newCol]);
                    }
                });
                break;
                
            case 'r': // 车
                this.addStraightMoves(moves, row, col);
                break;
                
            case 'n': // 马
                const horseMoves = [
                    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
                    [1, -2], [1, 2], [2, -1], [2, 1]
                ];
                horseMoves.forEach(([dr, dc]) => {
                    const newRow = row + dr;
                    const newCol = col + dc;
                    if (this.isValidHorseMove(row, col, newRow, newCol)) {
                        moves.push([newRow, newCol]);
                    }
                });
                break;
                
            case 'c': // 炮
                this.addCannonMoves(moves, row, col);
                break;
                
            case 'p': // 兵/卒
                const direction = isRed ? -1 : 1; // 红方向上，黑方向下
                const forwardMove = [row + direction, col];
                if (this.isValidPosition(forwardMove[0], forwardMove[1])) {
                    moves.push(forwardMove);
                }
                
                // 过河后可以左右移动
                if ((isRed && row <= 4) || (!isRed && row >= 5)) {
                    const sideMoves = [[row, col - 1], [row, col + 1]];
                    sideMoves.forEach(([newRow, newCol]) => {
                        if (this.isValidPosition(newRow, newCol)) {
                            moves.push([newRow, newCol]);
                        }
                    });
                }
                break;
        }
        
        return moves.filter(([r, c]) => {
            const targetPiece = this.gameState.board[r][c];
            return !targetPiece || 
                   (isRed && targetPiece === targetPiece.toLowerCase()) ||
                   (!isRed && targetPiece === targetPiece.toUpperCase());
        });
    }
    
    isValidPosition(row, col) {
        return row >= 0 && row < 10 && col >= 0 && col < 9;
    }
    
    isValidKingMove(isRed, row, col) {
        if (!this.isValidPosition(row, col)) return false;
        
        // 检查是否在九宫格内
        if (isRed) {
            return row >= 7 && row <= 9 && col >= 3 && col <= 5;
        } else {
            return row >= 0 && row <= 2 && col >= 3 && col <= 5;
        }
    }
    
    isValidAdvisorMove(isRed, row, col) {
        if (!this.isValidPosition(row, col)) return false;
        
        // 检查是否在九宫格内并且是斜线移动
        if (isRed) {
            return row >= 7 && row <= 9 && col >= 3 && col <= 5 && 
                   Math.abs(row - col) % 2 !== 0;
        } else {
            return row >= 0 && row <= 2 && col >= 3 && col <= 5 &&
                   Math.abs(row - col) % 2 !== 0;
        }
    }
    
    isValidElephantMove(isRed, row, col, fromRow, fromCol) {
        if (!this.isValidPosition(row, col)) return false;
        
        // 检查是否过河
        if (isRed && row < 5) return false;
        if (!isRed && row > 4) return false;
        
        // 检查象眼是否被挡住
        const eyeRow = (fromRow + row) / 2;
        const eyeCol = (fromCol + col) / 2;
        if (this.gameState.board[eyeRow][eyeCol]) return false;
        
        return true;
    }
    
    isValidHorseMove(fromRow, fromCol, toRow, toCol) {
        if (!this.isValidPosition(toRow, toCol)) return false;
        
        const rowDiff = Math.abs(toRow - fromRow);
        const colDiff = Math.abs(toCol - fromCol);
        
        if (!((rowDiff === 2 && colDiff === 1) || (rowDiff === 1 && colDiff === 2))) {
            return false;
        }
        
        // 检查马腿
        if (rowDiff === 2) {
            const middleRow = (fromRow + toRow) / 2;
            if (this.gameState.board[middleRow][fromCol]) return false;
        } else {
            const middleCol = (fromCol + toCol) / 2;
            if (this.gameState.board[fromRow][middleCol]) return false;
        }
        
        return true;
    }
    
    addStraightMoves(moves, row, col) {
        // 上下左右四个方向
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        const piece = this.gameState.board[row][col];
        const isRed = piece === piece.toUpperCase();
        
        directions.forEach(([dr, dc]) => {
            let newRow = row + dr;
            let newCol = col + dc;
            
            while (this.isValidPosition(newRow, newCol)) {
                const targetPiece = this.gameState.board[newRow][newCol];
                
                if (!targetPiece) {
                    moves.push([newRow, newCol]);
                } else {
                    // 可以吃掉对方棋子
                    if ((isRed && targetPiece === targetPiece.toLowerCase()) ||
                        (!isRed && targetPiece === targetPiece.toUpperCase())) {
                        moves.push([newRow, newCol]);
                    }
                    break;
                }
                
                newRow += dr;
                newCol += dc;
            }
        });
    }
    
    addCannonMoves(moves, row, col) {
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        const piece = this.gameState.board[row][col];
        const isRed = piece === piece.toUpperCase();
        
        directions.forEach(([dr, dc]) => {
            let newRow = row + dr;
            let newCol = col + dc;
            let hasJumped = false;
            
            while (this.isValidPosition(newRow, newCol)) {
                const targetPiece = this.gameState.board[newRow][newCol];
                
                if (!targetPiece) {
                    if (!hasJumped) {
                        moves.push([newRow, newCol]);
                    }
                } else {
                    if (!hasJumped) {
                        hasJumped = true;
                    } else {
                        // 可以吃掉对方棋子
                        if ((isRed && targetPiece === targetPiece.toLowerCase()) ||
                            (!isRed && targetPiece === targetPiece.toUpperCase())) {
                            moves.push([newRow, newCol]);
                        }
                        break;
                    }
                }
                
                newRow += dr;
                newCol += dc;
            }
        });
    }
    
    movePiece(from, to) {
        if (!this.selectedPiece || !this.socket) return;
        
        const [toRow, toCol] = to;
        const fromRow = this.selectedPiece.row;
        const fromCol = this.selectedPiece.col;
        const piece = this.selectedPiece.piece;
        
        // 发送移动消息到服务器，等待服务器权威反馈
        this.socket.send(JSON.stringify({
            type: 'move',
            from: { row: fromRow, col: fromCol },
            to: { row: toRow, col: toCol },
            piece: piece
        }));

        this.clearSelection();
    }
    
    handleServerMove(data) {
        const { from, to, piece, board, turn } = data;

        // 使用服务器的权威棋盘；若未提供则按位置更新
        if (board) {
            this.gameState.board = board;
        } else {
            this.gameState.board[to.row][to.col] = piece;
            this.gameState.board[from.row][from.col] = null;
        }

        if (turn) {
            this.gameState.turn = turn;
        }

        this.addMoveToHistory(piece, from.row, from.col, to.row, to.col);

        this.clearSelection();
        this.renderBoard();
    }
    
    addMoveToHistory(piece, fromRow, fromCol, toRow, toCol) {
        const pieceMap = {
            'K': '帅', 'A': '仕', 'B': '象', 'R': '車', 'N': '马', 'C': '炮', 'P': '兵',
            'k': '将', 'a': '士', 'b': '相', 'r': '车', 'n': '马', 'c': '炮', 'p': '卒'
        };
        
        const pieceChar = pieceMap[piece];
        const fromPos = `(${9-fromRow}, ${fromCol})`;
        const toPos = `(${9-toRow}, ${toCol})`;
        const moveText = `${pieceChar} ${fromPos} → ${toPos}`;
        
        const moveElement = document.createElement('div');
        moveElement.textContent = moveText;
        this.moveHistoryElement.appendChild(moveElement);
        this.moveHistoryElement.scrollTop = this.moveHistoryElement.scrollHeight;
    }
    
    clearSelection() {
        this.selectedPiece = null;
        this.clearValidMoves();
        document.querySelectorAll('.chess-piece.selected').forEach(p => p.classList.remove('selected'));
    }
    
    clearValidMoves() {
        this.validMoves = [];
        document.querySelectorAll('.valid-move').forEach(el => el.remove());
    }
    
    sendChatMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        
        if (message && this.socket) {
            this.socket.send(JSON.stringify({
                type: 'chat',
                message: message
            }));
            
            this.addChatMessage('我', message, new Date().toLocaleTimeString());
            input.value = '';
        }
    }
    
    addChatMessage(sender, message, timestamp) {
        const messageElement = document.createElement('div');
        messageElement.innerHTML = `<strong>${sender}:</strong> ${message} <span style="color:#666;font-size:12px">${timestamp}</span>`;
        this.chatMessagesElement.appendChild(messageElement);
        this.chatMessagesElement.scrollTop = this.chatMessagesElement.scrollHeight;
    }
    
    restartGame() {
        if (this.socket) {
            this.socket.send(JSON.stringify({
                type: 'restart'
            }));
        }
    }
    
    undoMove() {
        // 悔棋功能（需要服务器支持）
        alert('悔棋功能需要服务器支持');
    }
    
    surrender() {
        if (confirm('确定要认输吗？')) {
            this.addChatMessage('系统', `${this.color === 'red' ? '红方' : '黑方'}认输，游戏结束！`, new Date().toLocaleTimeString());
        }
    }
}

// 初始化游戏
function initGame() {
    window.game = new ChineseChessGame();
}