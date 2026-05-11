const { AVATARS, getSortedUserList, updateReadyStatus } = require('./utils');
const bingoHelpers = require('./bingoHelpers');

const MAX_PLAYERS = 8;

module.exports = (io, socket, gameRooms) => {
    socket.on('join room', (data) => {
        const roomId = data.roomId;
        let nickname = (data.name || '익명').trim();
        if (nickname.length > 10) nickname = nickname.substring(0, 10);
        const clientId = data.clientId || null;
        const avatar = data.avatar || '🐱';

        if (!gameRooms[roomId]) {
            gameRooms[roomId] = {
                hostId: socket.id, players: {}, status: 'WAITING', mode: 'lobby',
                winLines: 3, turnOrderOption: 'host_first', calledNumbers: [], allNumbers: [],
                numberInterval: null, turnOrder: [], currentTurnIndex: 0, joinOrder: [],
                liarGame: { scores: {}, votes: {}, submissions: {} },
                lobbyVotes: { bingo: 0, liar: 0 }, votedUsers: {},
                emojiCooldowns: {},
                clientIds: {} // clientId → socketId 매핑
            };
        }

        const room = gameRooms[roomId];

        // clientIds가 없는 기존 방 호환성 처리
        if (!room.clientIds) room.clientIds = {};

        if (room.status !== 'WAITING') {
            socket.emit('join failed', '이미 게임이 진행 중입니다.');
            return;
        }

        if (Object.keys(room.players).length >= MAX_PLAYERS) {
            socket.emit('room full', '방이 꽉 찼습니다. (최대 8명)');
            return;
        }

        // clientId 중복 접속 처리: 같은 clientId가 이미 방에 있으면 기존 소켓 교체
        if (clientId && room.clientIds[clientId]) {
            const oldSocketId = room.clientIds[clientId];
            if (oldSocketId !== socket.id && room.players[oldSocketId]) {
                // 기존 연결 정리
                const oldSocket = io.sockets.sockets.get(oldSocketId);
                if (oldSocket) {
                    oldSocket.emit('kicked');
                    oldSocket.disconnect(true);
                }
                delete room.players[oldSocketId];
                room.joinOrder = room.joinOrder.filter(id => id !== oldSocketId);
                if (room.hostId === oldSocketId) {
                    room.hostId = socket.id; // 방장 교체
                }
            }
        }
        if (clientId) room.clientIds[clientId] = socket.id;

        socket.join(roomId);
        socket.roomId = roomId;
        socket.clientId = clientId;

        room.players[socket.id] = {
            id: socket.id, board: [], ready: false, name: nickname,
            avatar: avatar,
            isSkipped: false, skipCount: 0, usedEventCount: 0
        };

        room.joinOrder.push(socket.id);

        io.to(socket.id).emit('role update', { isHost: socket.id === room.hostId });
        io.to(socket.id).emit('game changed', room.mode); // 접속 시 현재 방의 게임 상태 전달
        io.to(socket.id).emit('vote update', room.lobbyVotes); // 접속 시 투표 현황 전달
        
        // [Bug 1-1 FIX] 투표 진행 중일 때 새로운 참가자에게 타이머 정보 전송
        if (room.voteTimer && room.voteTimeLeft > 0) {
            io.to(socket.id).emit('vote timer', { 
                status: 'started', 
                timeLeft: room.voteTimeLeft 
            });
        }

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

    // --- 새로운 통합 방 이벤트 ---
    socket.on('host select game', (selectedGame) => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        const room = gameRooms[roomId];
        if (socket.id !== room.hostId) return;

        room.mode = selectedGame;
        room.status = 'WAITING'; // 게임 시작 전 준비 상태로 변경
        
        io.to(roomId).emit('game changed', selectedGame);
        io.to(roomId).emit('update user list', getSortedUserList(room));
    });

    socket.on('return to lobby', () => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        const room = gameRooms[roomId];
        if (socket.id !== room.hostId) return;

        room.mode = 'lobby';
        room.status = 'WAITING';
        room.lobbyVotes = { bingo: 0, liar: 0 };
        room.votedUsers = {};
        
        // [Bug 1-2 FIX] 대기실 복귀 시 기존 투표 타이머 확실히 중지
        if (room.voteTimer) {
            clearInterval(room.voteTimer);
            room.voteTimer = null;
        }
        room.voteTimeLeft = 0;
        
        io.to(roomId).emit('game changed', 'lobby');
        io.to(roomId).emit('vote update', room.lobbyVotes);
        io.to(roomId).emit('update user list', getSortedUserList(room));
    });

    socket.on('host start vote', (data) => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        const room = gameRooms[roomId];
        if (socket.id !== room.hostId) return;
        if (room.mode !== 'lobby') return;
        if (room.voteTimer) return;

        room.lobbyVotes = { bingo: 0, liar: 0 };
        room.votedUsers = {};
        room.voteTimeLeft = data.duration || 30;
        
        io.to(roomId).emit('vote timer', { status: 'started', timeLeft: room.voteTimeLeft });
        io.to(roomId).emit('vote update', room.lobbyVotes);
        io.to(roomId).emit('system message', `방장이 게임 투표를 시작했습니다! ${room.voteTimeLeft}초 안에 투표해주세요.`);

        room.voteTimer = setInterval(() => {
            room.voteTimeLeft--;

            if (room.voteTimeLeft <= 0) {
                clearInterval(room.voteTimer);
                room.voteTimer = null;

                let winner = 'tie';
                if (room.lobbyVotes.bingo > room.lobbyVotes.liar) winner = 'bingo';
                else if (room.lobbyVotes.liar > room.lobbyVotes.bingo) winner = 'liar';

                io.to(roomId).emit('vote timer', { status: 'ended', winner });
                
                if (winner !== 'tie') {
                    // [Refinement] Don't switch game automatically anymore. 
                    // Just show the result in the lobby.
                    const gameName = winner === 'bingo' ? '테마 빙고' : '라이어 게임';
                    io.to(roomId).emit('system message', `투표 결과, ${gameName}이(가) 선택되었습니다! 게임을 시작하려면 방장이 게임을 선택해 주세요.`);
                }
            } else {
                io.to(roomId).emit('vote timer', { status: 'running', timeLeft: room.voteTimeLeft });
            }
        }, 1000);
    });

    // 이모지 폭죽 이벤트 (대기실 전용)
    socket.on('emoji reaction', (emoji) => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        const room = gameRooms[roomId];
        if (room.status !== 'WAITING') return; // 게임 중 비활성

        const ALLOWED = ['🎉', '🔥', '❤️', '😂', '👏', '💀', '🎮', '⭐'];
        if (!ALLOWED.includes(emoji)) return;

        const now = Date.now();
        const cooldowns = room.emojiCooldowns;
        if (cooldowns[socket.id] && now - cooldowns[socket.id] < 2500) return; // 2.5초 쿨다운
        cooldowns[socket.id] = now;

        const sender = room.players[socket.id]?.name || '익명';
        io.to(roomId).emit('emoji reaction', { emoji, sender });
    });

    socket.on('vote game', (game) => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        const room = gameRooms[roomId];
        if (room.mode !== 'lobby') return;
        if (room.votedUsers[socket.id] || !room.voteTimer) return;

        if (room.lobbyVotes[game] !== undefined) {
            room.lobbyVotes[game]++;
            room.votedUsers[socket.id] = game;
            socket.emit('voted', game);
            io.to(roomId).emit('vote update', room.lobbyVotes);

            // [Refinement] 전원 투표 완료 시 즉시 종료
            const totalPlayers = Object.keys(room.players).length;
            const votedCount = Object.keys(room.votedUsers).length;
            if (votedCount >= totalPlayers && room.voteTimer) {
                clearInterval(room.voteTimer);
                room.voteTimer = null;
                
                let winner = 'tie';
                if (room.lobbyVotes.bingo > room.lobbyVotes.liar) winner = 'bingo';
                else if (room.lobbyVotes.liar > room.lobbyVotes.bingo) winner = 'liar';

                io.to(roomId).emit('vote timer', { status: 'ended', winner });

                if (winner !== 'tie') {
                    const gameName = winner === 'bingo' ? '테마 빙고' : '라이어 게임';
                    io.to(roomId).emit('system message', `투표 결과, ${gameName}이(가) 선택되었습니다! 게임을 시작하려면 방장이 게임을 선택해 주세요.`);
                }
            }
        }
    });

    socket.on('disconnect', () => {
        const roomId = socket.roomId;
        if (roomId && gameRooms[roomId]) {
            const room = gameRooms[roomId];

            // 이 소켓이 이미 다른 소켓으로 교체된 경우 (새 탭/새로고침으로 재접속 시)
            // clientId가 있고, 현재 room.clientIds[clientId]가 이 소켓이 아니면 stale disconnect → 무시
            const cid = socket.clientId;
            if (cid && room.clientIds && room.clientIds[cid] !== socket.id) {
                // 이미 교체된 소켓의 disconnect → 아무것도 하지 않음
                return;
            }

            // clientIds 맵에서도 정리
            if (cid && room.clientIds) delete room.clientIds[cid];

            const leavingPlayerName = room.players[socket.id] ? room.players[socket.id].name : '누군가';
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
                const remainingPlayers = Object.keys(room.players);
                if (room.status !== 'WAITING' && remainingPlayers.length < 3) {
                    if (room.liarGame && room.liarGame.timerInterval) {
                        clearInterval(room.liarGame.timerInterval);
                        room.liarGame.timerInterval = null;
                    }
                    io.to(roomId).emit('liar timer clear');
                    room.status = 'WAITING';
                    io.to(roomId).emit('round over', {
                        isFinalGameOver: true,
                        message: '인원수 부족 (강제 종료)',
                        finalMessage: '게임 진행 최소 인원(3명)에 미달하여 대기실 상태로 롤백됩니다.',
                        liarName: '-', word: '-', citizensWon: false
                    });
                }
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
                if (room.voteTimer) clearInterval(room.voteTimer);
                delete gameRooms[roomId];
            }
        }
    });
};
