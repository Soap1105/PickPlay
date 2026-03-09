const { shuffleArray, sortTurnOrder, getSortedUserList, updateReadyStatus } = require('./utils');
const { checkBingoLines, broadcastBingoProgress, endGame } = require('./bingoHelpers');

module.exports = (io, socket, gameRooms) => {

    function passTurn(room, roomId) {
        if (room.mode !== 'bingo') return;

        let loopCount = 0;
        const maxLoops = room.turnOrder.length + 5;

        while (loopCount < maxLoops) {
            room.currentTurnIndex = (room.currentTurnIndex + 1) % room.turnOrder.length;
            const nextId = room.turnOrder[room.currentTurnIndex];

            if (!room.players[nextId]) { loopCount++; continue; }

            if (room.players[nextId].skipCount > 0) {
                room.players[nextId].skipCount -= 1;
                const skippedName = room.players[nextId].name;
                const remain = room.players[nextId].skipCount;

                io.to(roomId).emit('system message', `⏳ ${skippedName}님의 턴이 건너뛰어졌습니다. (남은 스킵: ${remain}회)`);
                io.to(roomId).emit('update user list', getSortedUserList(room));
                loopCount++;
                continue;
            }

            io.to(roomId).emit('turn update', { currentTurnId: nextId, currentTurnName: room.players[nextId].name });
            return;
        }
    }

    function checkReadyAndStart(room, roomId) {
        const playerList = Object.values(room.players);
        const totalCount = playerList.length;
        const readyCount = playerList.filter(p => p.ready).length;

        updateReadyStatus(io, room, roomId);

        if (totalCount > 0 && readyCount === totalCount) {
            room.status = 'PLAYING';
            room.gameStarted = true;
            io.to(roomId).emit('game status update', { started: true });
            io.to(roomId).emit('system message', `🚀 빙고 출발! (주제: ${room.topic})`);

            room.turnOrder = sortTurnOrder(room);
            room.currentTurnIndex = 0;
            io.to(roomId).emit('update user list', getSortedUserList(room));

            room.turnOrder.forEach(socketId => {
                if (room.players[socketId]) {
                    io.to(socketId).emit('start theme game', {
                        board: room.players[socketId].board,
                        winLines: room.winLines
                    });
                }
            });

            const firstPlayerId = room.turnOrder[0];
            io.to(roomId).emit('turn update', { currentTurnId: firstPlayerId, currentTurnName: room.players[firstPlayerId].name });
            broadcastBingoProgress(io, room, roomId);
        }
    }

    // Classic game event (for backward compatibility before full UI swap)
    socket.on('start classic game', (data) => {
        // We removed classic mode in plan, so we will not include this block.
        socket.emit('action failed', '클래식 모드는 삭제되었습니다.');
    });

    socket.on('init theme mode', (data) => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        const room = gameRooms[roomId];
        if (socket.id !== room.hostId || room.status !== 'WAITING') return;
        if (Object.keys(room.players).length < 2) return;

        room.status = 'INPUTTING';
        room.mode = 'bingo';
        room.topic = data.topic;
        room.winLines = parseInt(data.winLines) || 3;
        room.turnOrderOption = data.turnOrder || 'host_first';
        room.calledNumbers = [];

        const presetWords = data.presetWords || [];
        Object.values(room.players).forEach(p => {
            p.ready = false;
            p.usedEventCount = 0;
            p.skipCount = 0;
            io.to(p.id).emit('setup theme input', {
                topic: data.topic,
                winLines: room.winLines,
                presetWords: presetWords
            });
        });
        io.to(roomId).emit('update user list', getSortedUserList(room));
        io.to(roomId).emit('system message', `🎨 주제 모드 설정: ${data.topic} (입력 시작!)`);
        updateReadyStatus(io, room, roomId);
    });

    socket.on('submit theme board', (data) => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        const room = gameRooms[roomId];

        if (room.players[socket.id]) {
            room.players[socket.id].board = data.board;
            room.players[socket.id].name = data.name;
            room.players[socket.id].ready = true;
            io.to(data.roomId).emit('update user list', getSortedUserList(room));
            updateReadyStatus(io, room, roomId);
        }
        checkReadyAndStart(room, data.roomId);
    });

    socket.on('cancel ready', () => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        const room = gameRooms[roomId];
        if (room.players[socket.id]) {
            room.players[socket.id].ready = false;
            io.to(roomId).emit('update user list', getSortedUserList(room));
            updateReadyStatus(io, room, roomId);
        }
    });

    socket.on('theme word selected', (data) => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        const room = gameRooms[roomId];

        if (!room || room.status !== 'PLAYING' || room.mode !== 'bingo') return;
        const currentTurnId = room.turnOrder[room.currentTurnIndex];
        if (socket.id !== currentTurnId) return;

        room.calledNumbers.push(data.word);
        io.to(data.roomId).emit('number called', data.word);

        broadcastBingoProgress(io, room, data.roomId);
        passTurn(room, data.roomId);
    });

    socket.on('trigger event', (data) => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        const room = gameRooms[roomId];

        if (room.status !== 'PLAYING' || room.mode !== 'bingo') return;
        if (socket.id !== room.turnOrder[room.currentTurnIndex]) return;

        const player = room.players[socket.id];
        const currentBingos = checkBingoLines(player.board, room.calledNumbers);

        if (currentBingos <= player.usedEventCount) {
            socket.emit('action failed', '이벤트를 사용할 수 있는 빙고 횟수가 부족합니다!');
            return;
        }

        player.usedEventCount++;
        io.to(roomId).emit('update user list', getSortedUserList(room));

        const playerName = player.name;
        const eventType = Math.floor(Math.random() * 4);

        if (eventType === 0) {
            io.to(roomId).emit('event happened', { type: 'shuffle', icon: '🌀', title: '차원 뒤틀림!', msg: `차원이 꼬여 ${playerName}님이 판을 뒤섞었습니다!` });
            io.to(roomId).emit('system message', `🌀 [이벤트] 시공간이 뒤틀려 모든 빙고판이 섞였습니다!`);
            Object.keys(room.players).forEach(pId => {
                const newBoard = shuffleArray([...room.players[pId].board]);
                room.players[pId].board = newBoard;
                io.to(pId).emit('update board', newBoard);
            });
            broadcastBingoProgress(io, room, roomId);
            passTurn(room, roomId);

        } else if (eventType === 1) {
            let globalPool = [];
            Object.values(room.players).forEach(p => {
                const pUncalled = p.board.filter(w => !room.calledNumbers.includes(w));
                globalPool.push(...pUncalled);
            });
            globalPool = [...new Set(globalPool)];

            if (globalPool.length > 0) {
                const luckyWord = globalPool[Math.floor(Math.random() * globalPool.length)];
                room.calledNumbers.push(luckyWord);
                io.to(roomId).emit('event happened', { type: 'bonus', icon: '🎲', title: '운명의 단어!', msg: `${playerName}님이 '${luckyWord}'를 뽑았습니다!` });
                io.to(roomId).emit('system message', `🎲 [이벤트] ${playerName}님이 운명의 단어 '${luckyWord}'를 뽑았습니다!`);
                io.to(roomId).emit('number called', luckyWord);
                broadcastBingoProgress(io, room, roomId);
                passTurn(room, roomId);
            } else {
                io.to(roomId).emit('event happened', { type: 'none', icon: '😅', title: '꽝!', msg: '빈 칸이 없네요.' });
                passTurn(room, roomId);
            }

        } else if (eventType === 2) {
            const allPlayerIds = Object.keys(room.players);
            const targetId = allPlayerIds[Math.floor(Math.random() * allPlayerIds.length)];
            const targetName = room.players[targetId].name;

            room.players[targetId].skipCount += 1;

            io.to(roomId).emit('update user list', getSortedUserList(room));
            io.to(roomId).emit('event happened', {
                type: 'bomb',
                icon: '🕳️',
                title: '블랙홀!',
                msg: `${playerName}님이 블랙홀을 소환하여 ${targetName}님을 빨아들였습니다!`
            });
            io.to(roomId).emit('system message', `🕳️ [이벤트] ${targetName}님이 블랙홀에 빠졌습니다. (누적 스킵: ${room.players[targetId].skipCount}회)`);
            passTurn(room, roomId);

        } else {
            if (room.calledNumbers.length > 0) {
                const removedWords = [];
                for (let i = 0; i < 3; i++) {
                    if (room.calledNumbers.length === 0) break;
                    const removeIdx = Math.floor(Math.random() * room.calledNumbers.length);
                    removedWords.push(room.calledNumbers.splice(removeIdx, 1)[0]);
                }

                io.to(roomId).emit('server called numbers', room.calledNumbers);

                const wordMsg = removedWords.join(', ');
                io.to(roomId).emit('event happened', { type: 'bad', icon: '👻', title: '유령의 장난!', msg: `체크된 단어 ${removedWords.length}개가 사라집니다!` });
                io.to(roomId).emit('system message', `👻 [이벤트] 유령이 '${wordMsg}' 단어를 훔쳐갔습니다!`);

                broadcastBingoProgress(io, room, roomId);
                passTurn(room, roomId);
            } else {
                io.to(roomId).emit('event happened', { type: 'none', icon: '😅', title: '실패', msg: '지울 단어가 없습니다.' });
                passTurn(room, roomId);
            }
        }
    });

    socket.on('bingo declared', (data) => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        const room = gameRooms[roomId];
        if (!room || room.status !== 'PLAYING' || room.mode !== 'bingo') return;

        const playerBoard = room.players[socket.id].board;
        if (checkBingoLines(playerBoard, room.calledNumbers) >= room.winLines) {
            endGame(io, room, roomId, data.name);
        } else {
            socket.emit('action failed', `아직 ${room.winLines}줄 빙고가 아닙니다!`);
        }
    });
};
