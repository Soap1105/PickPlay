const { AVATARS, getSortedUserList, updateReadyStatus } = require('./utils');
const bingoHelpers = require('./bingoHelpers');

const MAX_PLAYERS = 8;

module.exports = (io, socket, gameRooms) => {
    socket.on('join room', (data) => {
        const roomId = data.roomId;
        let nickname = data.name || "익명";
        if (nickname.length > 6) nickname = nickname.substring(0, 6);

        if (!gameRooms[roomId]) {
            gameRooms[roomId] = {
                hostId: socket.id, players: {}, status: 'WAITING', mode: data.gameType || 'bingo',
                winLines: 3, turnOrderOption: 'host_first', calledNumbers: [], allNumbers: [],
                numberInterval: null, turnOrder: [], currentTurnIndex: 0, joinOrder: [],
                liarGame: { scores: {} } // 라이어 게임용 초기화
            };
        }

        const room = gameRooms[roomId];

        if (room.status !== 'WAITING') {
            socket.emit('join failed', '이미 게임이 진행 중입니다.');
            return;
        }

        if (Object.keys(room.players).length >= MAX_PLAYERS) {
            socket.emit('room full', '방이 꽉 찼습니다. (최대 8명)');
            return;
        }

        socket.join(roomId);
        socket.roomId = roomId;

        room.players[socket.id] = {
            id: socket.id, board: [], ready: false, name: nickname,
            avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
            isSkipped: false, skipCount: 0, usedEventCount: 0
        };

        room.joinOrder.push(socket.id);

        io.to(socket.id).emit('role update', { isHost: socket.id === room.hostId });
        io.to(roomId).emit('update user list', getSortedUserList(room));
        updateReadyStatus(io, room, roomId);
        io.to(roomId).emit('system message', `👋 ${nickname}님이 입장하셨습니다.`);
    });

    socket.on('chat message', (msgData) => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        msgData.socketId = socket.id;
        if (!msgData.sender) msgData.sender = gameRooms[roomId].players[socket.id].name;
        io.to(roomId).emit('chat message', msgData);
    });

    socket.on('kick user', (targetId) => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        const room = gameRooms[roomId];
        if (socket.id !== room.hostId) return;
        if (room.status !== 'WAITING') return;

        const kickedName = room.players[targetId]?.name || "유저";
        io.to(targetId).emit('kicked');
        io.to(roomId).emit('system message', `🚫 ${kickedName}님이 방장에 의해 강퇴되었습니다.`);

        const targetSocket = io.sockets.sockets.get(targetId);
        if (targetSocket) targetSocket.disconnect(true);
    });

    socket.on('disconnect', () => {
        const roomId = socket.roomId;
        if (roomId && gameRooms[roomId]) {
            const room = gameRooms[roomId];
            const leavingPlayerName = room.players[socket.id] ? room.players[socket.id].name : "누군가";
            delete room.players[socket.id];
            room.joinOrder = room.joinOrder.filter(id => id !== socket.id);

            io.to(roomId).emit('system message', `💨 ${leavingPlayerName}님이 퇴장하셨습니다.`);

            if (room.mode === 'bingo') {
                if (room.status === 'PLAYING') {
                    const remainingPlayers = Object.keys(room.players);
                    if (remainingPlayers.length === 1) {
                        bingoHelpers.endGame(io, room, roomId, room.players[remainingPlayers[0]].name);
                        io.to(roomId).emit('system message', `🏆 남은 플레이어가 1명뿐이라 ${room.players[remainingPlayers[0]].name}님이 자동 승리했습니다!`);
                    } else if (remainingPlayers.length === 0) {
                        bingoHelpers.endGame(io, room, roomId, '없음');
                    } else {
                        bingoHelpers.broadcastBingoProgress(io, room, roomId);
                    }
                } else {
                    updateReadyStatus(io, room, roomId);
                }
            } else if (room.mode === 'liar') {
                // handle liar specific disconnect later
            }

            io.to(roomId).emit('update user list', getSortedUserList(room));
            if (socket.id === room.hostId && gameRooms[roomId]) {
                const remainingPlayers = Object.keys(room.players);
                if (remainingPlayers.length > 0) {
                    room.hostId = remainingPlayers[0];
                    io.to(room.hostId).emit('role update', { isHost: true });
                    io.to(roomId).emit('system message', `👑 방장이 ${room.players[room.hostId].name}님으로 변경되었습니다.`);
                }
            }
            if (Object.keys(room.players).length === 0) {
                if (room.numberInterval) clearInterval(room.numberInterval);
                delete gameRooms[roomId];
            }
        }
    });
};
