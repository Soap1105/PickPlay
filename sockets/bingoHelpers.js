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
    io.to(roomId).emit('game over', { winner: winnerName });
    io.to(roomId).emit('system message', `🏆 게임 종료! 승자는 ${winnerName}님입니다!`);

    room.gameStarted = false;
    room.status = 'WAITING';
    room.readyCount = 0;
    room.calledNumbers = [];

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

module.exports = {
    checkBingoLines,
    broadcastBingoProgress,
    endGame
};
