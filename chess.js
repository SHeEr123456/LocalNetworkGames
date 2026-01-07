// 象棋规则和辅助函数
class ChessRules {
    static isValidMove(board, fromRow, fromCol, toRow, toCol) {
        const piece = board[fromRow][fromCol];
        if (!piece) return false;
        
        // 基本位置检查
        if (toRow < 0 || toRow > 9 || toCol < 0 || toCol > 8) return false;
        if (fromRow === toRow && fromCol === toCol) return false;
        
        // 检查目标位置是否有己方棋子
        const targetPiece = board[toRow][toCol];
        const isRed = piece === piece.toUpperCase();
        if (targetPiece) {
            const isTargetRed = targetPiece === targetPiece.toUpperCase();
            if (isRed === isTargetRed) return false; // 不能吃己方棋子
        }
        
        // 根据棋子类型检查移动规则
        const pieceType = piece.toLowerCase();
        
        switch (pieceType) {
            case 'k': // 将帅
                return this.isValidKingMove(piece, fromRow, fromCol, toRow, toCol);
            case 'a': // 士仕
                return this.isValidAdvisorMove(piece, fromRow, fromCol, toRow, toCol);
            case 'b': // 象相
                return this.isValidElephantMove(piece, fromRow, fromCol, toRow, toCol, board);
            case 'r': // 车
                return this.isValidChariotMove(fromRow, fromCol, toRow, toCol, board);
            case 'n': // 马
                return this.isValidHorseMove(fromRow, fromCol, toRow, toCol, board);
            case 'c': // 炮
                return this.isValidCannonMove(fromRow, fromCol, toRow, toCol, board);
            case 'p': // 兵卒
                return this.isValidPawnMove(piece, fromRow, fromCol, toRow, toCol);
            default:
                return false;
        }
    }
    
    static isValidKingMove(piece, fromRow, fromCol, toRow, toCol) {
        const isRed = piece === 'K';
        const rowDiff = Math.abs(toRow - fromRow);
        const colDiff = Math.abs(toCol - fromCol);
        
        // 只能在九宫格内移动
        if (isRed) {
            if (toRow < 7 || toRow > 9 || toCol < 3 || toCol > 5) return false;
        } else {
            if (toRow < 0 || toRow > 2 || toCol < 3 || toCol > 5) return false;
        }
        
        // 只能移动一步
        return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
    }
    
    static isValidAdvisorMove(piece, fromRow, fromCol, toRow, toCol) {
        const isRed = piece === 'A';
        const rowDiff = Math.abs(toRow - fromRow);
        const colDiff = Math.abs(toCol - fromCol);
        
        // 只能在九宫格内移动
        if (isRed) {
            if (toRow < 7 || toRow > 9 || toCol < 3 || toCol > 5) return false;
        } else {
            if (toRow < 0 || toRow > 2 || toCol < 3 || toCol > 5) return false;
        }
        
        // 只能斜着移动一步
        return rowDiff === 1 && colDiff === 1;
    }
    
    static isValidElephantMove(piece, fromRow, fromCol, toRow, toCol, board) {
        const isRed = piece === 'B';
        const rowDiff = Math.abs(toRow - fromRow);
        const colDiff = Math.abs(toCol - fromCol);
        
        // 只能田字移动
        if (rowDiff !== 2 || colDiff !== 2) return false;
        
        // 检查象眼是否被挡住
        const eyeRow = (fromRow + toRow) / 2;
        const eyeCol = (fromCol + toCol) / 2;
        if (board[eyeRow][eyeCol]) return false;
        
        // 不能过河
        if (isRed && toRow > 4) return false; // 红象不能过河
        if (!isRed && toRow < 5) return false; // 黑象不能过河
        
        return true;
    }
    
    static isValidChariotMove(fromRow, fromCol, toRow, toCol, board) {
        // 车只能直线移动
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
    
    static isValidHorseMove(fromRow, fromCol, toRow, toCol, board) {
        const rowDiff = Math.abs(toRow - fromRow);
        const colDiff = Math.abs(toCol - fromCol);
        
        // 马走日字
        if (!((rowDiff === 2 && colDiff === 1) || (rowDiff === 1 && colDiff === 2))) {
            return false;
        }
        
        // 检查马腿
        if (rowDiff === 2) {
            const middleRow = (fromRow + toRow) / 2;
            if (board[middleRow][fromCol]) return false;
        } else {
            const middleCol = (fromCol + toCol) / 2;
            if (board[fromRow][middleCol]) return false;
        }
        
        return true;
    }
    
    static isValidCannonMove(fromRow, fromCol, toRow, toCol, board) {
        // 炮只能直线移动
        if (fromRow !== toRow && fromCol !== toCol) return false;
        
        const targetPiece = board[toRow][toCol];
        let step, steps, obstacles = 0;
        
        if (fromRow === toRow) {
            step = fromCol < toCol ? 1 : -1;
            steps = Math.abs(toCol - fromCol);
            for (let i = 1; i < steps; i++) {
                if (board[fromRow][fromCol + i * step]) obstacles++;
            }
        } else {
            step = fromRow < toRow ? 1 : -1;
            steps = Math.abs(toRow - fromRow);
            for (let i = 1; i < steps; i++) {
                if (board[fromRow + i * step][fromCol]) obstacles++;
            }
        }
        
        // 炮的移动规则
        if (!targetPiece) {
            // 移动到空位，中间不能有棋子
            return obstacles === 0;
        } else {
            // 吃子，中间必须恰好有一个棋子
            return obstacles === 1;
        }
    }
    
    static isValidPawnMove(piece, fromRow, fromCol, toRow, toCol) {
        const isRed = piece === 'P';
        const rowDiff = toRow - fromRow;
        const colDiff = Math.abs(toCol - fromCol);
        
        // 兵卒不能后退
        if (isRed && rowDiff > 0) return false;
        if (!isRed && rowDiff < 0) return false;
        
        // 移动距离
        const forwardDiff = Math.abs(rowDiff);
        if (forwardDiff > 1 || colDiff > 1) return false;
        
        // 移动方式
        if (forwardDiff === 1 && colDiff === 0) {
            // 向前移动
            return true;
        } else if (forwardDiff === 0 && colDiff === 1) {
            // 横向移动，必须过河
            if (isRed && fromRow <= 4) return true; // 红兵过河
            if (!isRed && fromRow >= 5) return true; // 黑卒过河
            return false;
        }
        
        return false;
    }
    
    static isCheckmate(board, color) {
        // 检查是否将死（简化版本）
        const kingPos = this.findKing(board, color);
        if (!kingPos) return false;
        
        const [kingRow, kingCol] = kingPos;
        
        // 检查所有对方棋子是否可以攻击到将/帅
        const opponentColor = color === 'red' ? 'black' : 'red';
        
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 9; col++) {
                const piece = board[row][col];
                if (piece && this.getPieceColor(piece) === opponentColor) {
                    if (this.isValidMove(board, row, col, kingRow, kingCol)) {
                        return true;
                    }
                }
            }
        }
        
        return false;
    }
    
    static findKing(board, color) {
        const king = color === 'red' ? 'K' : 'k';
        
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 9; col++) {
                if (board[row][col] === king) {
                    return [row, col];
                }
            }
        }
        
        return null;
    }
    
    static getPieceColor(piece) {
        return piece === piece.toUpperCase() ? 'red' : 'black';
    }
    
    static getPieceName(piece) {
        const map = {
            'K': '帅', 'A': '仕', 'B': '象', 'R': '車', 'N': '马', 'C': '炮', 'P': '兵',
            'k': '将', 'a': '士', 'b': '相', 'r': '车', 'n': '马', 'c': '炮', 'p': '卒'
        };
        return map[piece] || piece;
    }
}