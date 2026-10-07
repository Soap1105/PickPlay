const { getSortedUserList, updateReadyStatus } = require('./utils');

function checkBingoLines(board, calledNumbers) {
    const normalize = (str) => String(str).replace(/\s+/g, '').trim().toLowerCase();
    const calledSet = new Set(calledNumbers.map(normalize));
    const isLine = (indices) => indices.every(idx => calledSet.has(normalize(board[idx])));
    let lines = 0;
    for (let i = 0; i < 5; i++) if (isLine([i * 5, i * 5 + 1, i * 5 + 2, i * 5 + 3, i * 5 + 4])) lines++;
    for (let i = 0; i < 5; i++) if (isLine([i, i + 5, i + 10, i + 15, i + 20])) lines++;
    if (isLine([0, 6, 12, 18, 24])) lines++;
    if (isLine([4, 8, 12, 16, 20])) lines++;
    return lines;
}

function broadcastBingoProgress(io, room, roomId) {
    const progressMap = {};
    Object.values(room.players).forEach(p => {
        if (p.board) progressMap[p.id] = checkBingoLines(p.board, room.calledNumbers);
    });
    io.to(roomId).emit('bingo progress update', progressMap);
}

function endGame(io, room, roomId, winnerName) {
    if (room.numberInterval) clearInterval(room.numberInterval);
    if (room.turnTimer) clearTimeout(room.turnTimer);

    // 우승자 객체 찾기
    const winnerPlayer = Object.values(room.players).find(p => p.name === winnerName);
    const winnerColor = winnerPlayer ? (winnerPlayer.color || '#FC944D') : '#FC944D';

    // Collect stats with multi-tier sorting
    const stats = Object.values(room.players).map(p => ({
        id: p.id,
        name: p.name,
        color: p.color || '#FC944D',
        bingoCount: checkBingoLines(p.board, room.calledNumbers),
        eventUsed: p.usedEventCount || 0
    })).sort((a, b) => {
        if (a.name === winnerName) return -1;
        if (b.name === winnerName) return 1;
        if (b.bingoCount !== a.bingoCount) return b.bingoCount - a.bingoCount;
        if (a.eventUsed !== b.eventUsed) return a.eventUsed - b.eventUsed;
        const orderA = room.joinOrder ? room.joinOrder.indexOf(a.id) : 0;
        const orderB = room.joinOrder ? room.joinOrder.indexOf(b.id) : 0;
        return orderA - orderB;
    });

    io.to(roomId).emit('game over', { 
        winner: { name: winnerName, color: winnerColor }, 
        stats 
    });

    room.gameStarted = false;
    room.status = 'WAITING';
    room.readyCount = 0;
    room.calledNumbers = [];
    room.turnTimer = null;

    Object.values(room.players).forEach(p => {
        p.ready = false;
        p.board = [];
        p.isSkipped = false;
        p.skipCount = 0;
        p.usedEventCount = 0;
        p.confirmedResult = false; // [작업 3] 게임 종료 시 모든 참여자 확인 미완료 상태로 세팅
    });

    io.to(roomId).emit('update user list', getSortedUserList(room));
    io.to(roomId).emit('game status update', { started: false });
    updateReadyStatus(io, room, roomId);
}

function resolveFullBoardWinner(room) {
    let maxLines = -1;
    let leaders = [];

    Object.values(room.players).forEach(p => {
        const lines = checkBingoLines(p.board, room.calledNumbers);
        if (lines > maxLines) {
            maxLines = lines;
            leaders = [p.name];
        } else if (lines === maxLines) {
            leaders.push(p.name);
        }
    });

    if (leaders.length === 1) {
        return leaders[0]; // 빙고 줄 수가 가장 많은 단독 1등 승리
    }
    return '무승부'; // 빙고 줄 수가 같은 공동 1등이면 무승부
}

module.exports = {
    checkBingoLines,
    broadcastBingoProgress,
    endGame,
    resolveFullBoardWinner
};
