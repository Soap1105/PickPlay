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

    // Collect stats
    const stats = Object.values(room.players).map(p => ({
        name: p.name,
        bingoCount: checkBingoLines(p.board, room.calledNumbers),
        eventUsed: p.usedEventCount || 0
    }));

    io.to(roomId).emit('game over', { winner: winnerName, stats });
    if (winnerName === '무승부') {
        io.to(roomId).emit('system message', `🤝 게임 종료! 모든 칸이 채워져 무승부로 처리되었습니다.`);
    } else {
        io.to(roomId).emit('system message', `🏆 게임 종료! 승자는 ${winnerName}님입니다!`);
    }

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
