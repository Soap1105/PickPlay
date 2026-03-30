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
                hostId: socket.id, players: {}, status: 'WAITING', mode: 'lobby', // [수정] 기본 모드를 로비로 설정
                winLines: 3, turnOrderOption: 'host_first', calledNumbers: [], allNumbers: [],
                numberInterval: null, turnOrder: [], currentTurnIndex: 0, joinOrder: [],
                liarGame: { scores: {}, votes: {}, submissions: {} }, // 라이어 게임용 초기화
                lobbyVotes: { bingo: 0, liar: 0 }, votedUsers: {}, // 로비 투표 초기화
                emojiCooldowns: {} // 이모지 폭죽 쿨다운
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
        
        const gameName = selectedGame === 'bingo' ? '테마 빙고' : '라이어 게임';
        io.to(roomId).emit('system message', `방장이 ${gameName}을(를) 선택했습니다. 게임 세팅을 준비합니다.`);
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
        io.to(roomId).emit('system message', '방장이 대기실로 복귀했습니다. 잠시 쉬어갑시다!');
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
                if (room.voteTimer) clearInterval(room.voteTimer); // [추가] 방 삭제 시 타이머 정리
                delete gameRooms[roomId];
            }
        }
    });
};
