const { shuffleArray, sortTurnOrder, getSortedUserList, updateReadyStatus } = require('./utils');
const { checkBingoLines, broadcastBingoProgress, endGame, resolveFullBoardWinner } = require('./bingoHelpers');

// [Bug Fix #33] 이벤트 팝업(3초) 후 서버 타이머 시작 지연값 (클라이언트 동기화)
const EVENT_POPUP_DELAY_MS = 3500;

module.exports = (io, socket, gameRooms) => {

    function passTurn(room, roomId, delayMs = 0) {
        if (room.mode !== 'bingo') return;

        // [Bug Fix #31, #32] 턴 넘어갈 때 시간 왼곡 잔류 반드시 초기화
        // passTurn()이 직접 호출될 때 timeWarpRemaining이 남아있으면
        // 다음 플레이어의 단어 선택 시 시간 왼곡이 발동되는 버그 방지
        room.timeWarpRemaining = 0;

        // [유령의 장난] lockedWords 턴 카운트 차감
        if (room.lockedWords && Object.keys(room.lockedWords).length > 0) {
            for (const word of Object.keys(room.lockedWords)) {
                room.lockedWords[word]--;
                if (room.lockedWords[word] <= 0) {
                    delete room.lockedWords[word];
                }
            }
            io.to(roomId).emit('locked words updated', room.lockedWords);
        }

        let loopCount = 0;
        const maxLoops = 500; // 스킵 중첩으로 인한 무한 루프 탈출(Halt) 방지

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

            const nextPlayer = room.players[nextId];
            if (nextPlayer.isIsolated) {
                nextPlayer.isIsolated = false;
                io.to(roomId).emit('system message', `🔓 ${nextPlayer.name}님이 블랙홀 격리에서 복귀했습니다! 내 차례에 보드판을 클릭하여 밀린 단어들을 마킹하세요.`);
                io.to(roomId).emit('update user list', getSortedUserList(room));
            }

            io.to(roomId).emit('turn update', {
                currentTurnId: nextId,
                currentTurnName: room.players[nextId].name,
                turnTimeLimit: room.turnTimeLimit || 0
            });
            // [Bug Fix #33] 이벤트 팝업 시간만큼 서버 타이머 지연 (클라이언트 동기화)
            if (delayMs > 0) {
                setTimeout(() => {
                    if (!gameRooms[roomId] || room.status !== 'PLAYING') return;
                    startTurnTimer(room, roomId, nextId);
                }, delayMs);
            } else {
                startTurnTimer(room, roomId, nextId);
            }
            return;
        }
    }

    function startTurnTimer(room, roomId, playerId) {
        if (room.turnTimer) clearTimeout(room.turnTimer);

        // 유저 요청 반영: 차례가 와도 누를 단어가 전혀 없다면(25칸 이미 다 참)
        // 바보같이 타이머를 돌리지 말고 그 자리에서 즉시 게임을 종료시킵니다.
        const player = room.players[playerId];
        const uncalledWords = player.board.filter(w => !room.calledNumbers.includes(w));
        if (uncalledWords.length === 0) {
            io.to(roomId).emit('system message', `⏰ ${player.name}님은 더 이상 선택할 단어가 없습니다. 빙고판 완료.`);
            endGame(io, room, roomId, resolveFullBoardWinner(room));
            return;
        }

        if (!room.turnTimeLimit || room.turnTimeLimit <= 0) return;

        room.turnTimer = setTimeout(() => {
            if (room.mode !== 'bingo' || room.status !== 'PLAYING') return;
            const currentId = room.turnOrder[room.currentTurnIndex];
            if (currentId !== playerId) return;

            // Auto-select a word
            const player = room.players[playerId];
            const uncalledWords = player.board.filter(w => !room.calledNumbers.includes(w));
            if (uncalledWords.length > 0) {
                const randomWord = uncalledWords[Math.floor(Math.random() * uncalledWords.length)];
                room.calledNumbers.push(randomWord);
                Object.values(room.players).forEach(p => {
                    if (p.isIsolated) {
                        if (!p.ignoredNumbers) p.ignoredNumbers = [];
                        p.ignoredNumbers.push(randomWord);
                    }
                });
                io.to(roomId).emit('number called', randomWord);

                broadcastBingoProgress(io, room, roomId);

                // [Full Board Winner Check]
                let anyBoardFull = false;
                Object.values(room.players).forEach(p => { if (checkBingoLines(p.board, room.calledNumbers) === 12) anyBoardFull = true; });
                const maxTurns = new Set(Object.values(room.players).map(p => p.board).flat()).size;
                if (anyBoardFull || room.calledNumbers.length >= maxTurns) {
                    endGame(io, room, roomId, resolveFullBoardWinner(room));
                    return;
                }

                passTurn(room, roomId);
            } else {
                // 선택할 단어가 없는 상태로 여기까지 왔다면 절대 턴을 넘기지 않고 즉시 게임 종료
                io.to(roomId).emit('system message', `⏰ ${player.name}님은 더 이상 선택할 단어가 없습니다. 빙고판 완료.`);
                endGame(io, room, roomId, resolveFullBoardWinner(room));
            }
        }, room.turnTimeLimit * 1000 + 500); // 0.5s buffer
    }

    function checkReadyAndStart(room, roomId) {
        const playerList = Object.values(room.players);
        const totalCount = playerList.length;
        const readyCount = playerList.filter(p => p.ready).length;

        updateReadyStatus(io, room, roomId);

        if (totalCount > 1 && readyCount === totalCount) {
            io.to(room.hostId).emit('all players ready');
        } else {
            // [Refinement] 전원 준비 상태가 아니면 비활성화 유도
            io.to(room.hostId).emit('not all players ready');
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
        if (Object.keys(room.players).length < 2) {
            socket.emit('action failed', '빙고 게임은 최소 2명 이상이어야 시작할 수 있습니다.');
            return;
        }

        // [작업 3] 아직 결과 확인 중인 플레이어가 있는 경우 방장의 새 게임 생성 차단
        const unconfirmed = Object.values(room.players).filter(p => p.confirmedResult === false);
        if (unconfirmed.length > 0) {
            const names = unconfirmed.map(p => p.name).join(', ');
            socket.emit('action failed', `아직 결과 확인 중인 플레이어가 있습니다: ${names}`);
            return;
        }

        room.status = 'INPUTTING';
        room.mode = 'bingo';
        room.topic = data.topic;
        room.winLines = parseInt(data.winLines) || 3;
        room.turnOrderOption = data.turnOrder || 'host_first';
        room.turnTimeLimit = parseInt(data.turnTimeLimit) || 0;
        room.useEvents = data.useEvents !== undefined ? data.useEvents : true;
        room.calledNumbers = [];
        room.turnTimer = null;
        room.lockedWords = {};
        room.timeWarpRemaining = 0;

        const presetWords = data.presetWords || [];
        Object.values(room.players).forEach(p => {
            p.confirmedResult = true;
            p.ready = false;
            p.usedEventCount = 0;
            p.skipCount = 0;
            p.isIsolated = false;
            p.ignoredNumbers = [];
            io.to(p.id).emit('setup theme input', {
                topic: data.topic,
                winLines: room.winLines,
                useEvents: room.useEvents, // [수정] 이벤트 모드 설정값 누락 해결
                presetWords: presetWords
            });
        });
        io.to(roomId).emit('update user list', getSortedUserList(room));
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

    // 게임 시작 팝업 애니메이션 지속 시간 (클라이언트와 동기화)
    // bingo.js: popupActive = true → setTimeout 3000ms → false → setTimeout 500ms → processTurnUpdate
    const FIRST_TURN_POPUP_DELAY_MS = 3500;

    socket.on('host manual start bingo', () => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        const room = gameRooms[roomId];
        if (socket.id !== room.hostId || room.status !== 'INPUTTING') return;

        const playerList = Object.values(room.players);
        if (playerList.every(p => p.ready)) {
            room.status = 'PLAYING';
            room.gameStarted = true;
            io.to(roomId).emit('game status update', { started: true });

            room.turnOrder = sortTurnOrder(room);
            room.currentTurnIndex = 0;

            room.turnOrder.forEach(socketId => {
                if (room.players[socketId]) {
                    io.to(socketId).emit('start theme game', {
                        board: room.players[socketId].board,
                        winLines: room.winLines
                    });
                }
            });

            io.to(roomId).emit('update user list', getSortedUserList(room));

            const firstPlayerId = room.turnOrder[0];
            io.to(roomId).emit('turn update', {
                currentTurnId: firstPlayerId,
                currentTurnName: room.players[firstPlayerId].name,
                turnTimeLimit: room.turnTimeLimit || 0
            });

            // 첫 턴만 팝업 지속 시간만큼 타이머 시작을 지연시킵니다.
            // 클라이언트의 '게임 시작!' 팝업이 끝난 직후(3.5초) 서버 자동 체크 타이머가 동작하도록 동기화합니다.
            if (room.turnTimeLimit > 0) {
                setTimeout(() => {
                    // 딜레이 도중 방이 사라지거나 게임이 종료됐을 경우 방어
                    if (!gameRooms[roomId] || room.status !== 'PLAYING') return;
                    startTurnTimer(room, roomId, firstPlayerId);
                }, FIRST_TURN_POPUP_DELAY_MS);
            } else {
                startTurnTimer(room, roomId, firstPlayerId);
            }

            broadcastBingoProgress(io, room, roomId);
        }
    });

    socket.on('cancel ready', () => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        const room = gameRooms[roomId];
        if (room.players[socket.id]) {
            room.players[socket.id].ready = false;
            io.to(roomId).emit('update user list', getSortedUserList(room));
            checkReadyAndStart(room, roomId);
        }
    });

    socket.on('theme word selected', (data) => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        const room = gameRooms[roomId];

        if (!room || room.status !== 'PLAYING' || room.mode !== 'bingo') return;
        const currentTurnId = room.turnOrder[room.currentTurnIndex];
        if (socket.id !== currentTurnId) return;

        // [버그 방지] 통신 지연이나 더블 클릭으로 인한 중복 단어 방어
        if (room.calledNumbers.includes(data.word)) {
            // [블랙홀 격리 복구] 격리 기간 동안 무시했던 단어라면 클릭 시 수동 복구 허용 (턴 미소모)
            const player = room.players[socket.id];
            if (player && player.ignoredNumbers && player.ignoredNumbers.includes(data.word)) {
                player.ignoredNumbers = player.ignoredNumbers.filter(w => w !== data.word);
                
                io.to(roomId).emit('update user list', getSortedUserList(room));
                broadcastBingoProgress(io, room, roomId);
                socket.emit('server called numbers', room.calledNumbers); // 내 화면 갱신
                return;
            }
            socket.emit('action failed', '이미 선택된 단어입니다.');
            return;
        }

        // [유령의 장난] 잠긴 단어 선택 차단
        if (room.lockedWords && room.lockedWords[data.word] !== undefined) {
            socket.emit('action failed', `'${data.word}'은(는) 유령에게 잠겨있습니다! (${room.lockedWords[data.word]}턴 후 해제)`);
            return;
        }

        room.calledNumbers.push(data.word);
        Object.values(room.players).forEach(p => {
            if (p.isIsolated) {
                if (!p.ignoredNumbers) p.ignoredNumbers = [];
                p.ignoredNumbers.push(data.word);
            }
        });
        io.to(data.roomId).emit('number called', data.word);

        if (room.turnTimer) clearTimeout(room.turnTimer);
        broadcastBingoProgress(io, room, data.roomId);

        // [Full Board Winner Check]
        let anyBoardFull = false;
        Object.values(room.players).forEach(p => { if (checkBingoLines(p.board, room.calledNumbers) === 12) anyBoardFull = true; });
        const maxTurns = new Set(Object.values(room.players).map(p => p.board).flat()).size;
        if (anyBoardFull || room.calledNumbers.length >= maxTurns) {
            endGame(io, room, data.roomId, resolveFullBoardWinner(room));
            return;
        }

        // [시간 왜곡] 추가 선택 처리
        if (room.timeWarpRemaining > 0) {
            room.timeWarpRemaining--;
            io.to(data.roomId).emit('time warp next');
            startTurnTimer(room, data.roomId, socket.id);
            return;
        }

        passTurn(room, data.roomId);
    });

    socket.on('trigger event', (data) => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        const room = gameRooms[roomId];

        if (room.status !== 'PLAYING' || room.mode !== 'bingo') return;
        if (!room.useEvents) return; // [수정] 이벤트 모드가 꺼져있으면 실행 불가
        if (socket.id !== room.turnOrder[room.currentTurnIndex]) return;

        const player = room.players[socket.id];
        const currentBingos = checkBingoLines(player.board, room.calledNumbers);
        const maxEvents = Math.max(0, room.winLines - 1);

        if (Math.min(currentBingos, maxEvents) <= player.usedEventCount) {
            socket.emit('action failed', '이벤트를 사용할 수 있는 빙고 횟수가 부족합니다!');
            return;
        }

        player.usedEventCount++;
        io.to(roomId).emit('update user list', getSortedUserList(room));

        const playerName = player.name;
        const eventType = Math.floor(Math.random() * 4);

        if (eventType === 0) {
            // 🌀 차원 뒤틀림: 발동자 제외 상대 플레이어 판 셔플 + calledNumbers 고정 2개 삭제
            Object.keys(room.players).forEach(pId => {
                if (pId === socket.id) return; // 발동자 본인은 제외
                if (room.players[pId].isIsolated) return; // 격리된 플레이어도 제외 (이벤트 효과 면제)
                const newBoard = shuffleArray([...room.players[pId].board]);
                room.players[pId].board = newBoard;
                io.to(pId).emit('update board', newBoard);
            });

            const removeCount = Math.min(room.calledNumbers.length, 2);
            const removedWords = [];
            for (let i = 0; i < removeCount; i++) {
                const removeIdx = Math.floor(Math.random() * room.calledNumbers.length);
                removedWords.push(room.calledNumbers.splice(removeIdx, 1)[0]);
            }

            if (removedWords.length > 0) {
                Object.values(room.players).forEach(p => {
                    if (p.isIsolated && p.ignoredNumbers) {
                        p.ignoredNumbers = p.ignoredNumbers.filter(w => !removedWords.includes(w));
                    }
                });
            }

            const removedMsg = removedWords.length > 0
                ? `\n체크된 '${removedWords.join(', ')}' 단어도 사라졌습니다!`
                : '';

            io.to(roomId).emit('event happened', {
                type: 'shuffle', icon: '🌀', title: '차원 뒤틀림!',
                msg: `차원이 꼬여 ${playerName}님이 판을 뒤섞었습니다!${removedMsg}`
            });
            io.to(roomId).emit('system message', `🌀 [이벤트] 모든 빙고판이 섞였습니다!${removedWords.length > 0 ? ` '${removedWords.join(', ')}' 체크가 취소됩니다.` : ''}`);

            if (removedWords.length > 0) {
                io.to(roomId).emit('server called numbers', room.calledNumbers);
            }

            io.to(roomId).emit('update user list', getSortedUserList(room));
            if (room.turnTimer) clearTimeout(room.turnTimer);
            broadcastBingoProgress(io, room, roomId);
            passTurn(room, roomId, EVENT_POPUP_DELAY_MS);

        } else if (eventType === 1) {
            // ⏳ 시간 왜곡: 이번 턴에 단어 2번 선택
            room.timeWarpRemaining = 1;
            if (room.turnTimer) clearTimeout(room.turnTimer);
            io.to(roomId).emit('event happened', {
                type: 'time-warp', icon: '⏳', title: '시간 왜곡!',
                msg: `${playerName}님이 시공간을 비틀어 시간 왜곡을 일으켰습니다!\n이번 차례에 단어를 하나 더 선택하세요!`
            });
            io.to(roomId).emit('system message', `⏳ [이벤트] ${playerName}님이 시간 왜곡을 발동하여 단어를 하나 더 선택할 수 있게 되었습니다!`);
            // [1번 버그 수정] 클라이언트 타이머 리셋을 위해 turn update emit (턴은 현재 플레이어 유지)
            io.to(roomId).emit('turn update', {
                currentTurnId: socket.id,
                currentTurnName: playerName,
                turnTimeLimit: room.turnTimeLimit || 0
            });
            // [Bug Fix #33] 이벤트 팝업 시간만큼 서버 타이머 지연 (클라이언트 동기화)
            if (room.turnTimeLimit > 0) {
                setTimeout(() => {
                    if (!gameRooms[roomId] || room.status !== 'PLAYING') return;
                    startTurnTimer(room, roomId, socket.id);
                }, EVENT_POPUP_DELAY_MS);
            } else {
                startTurnTimer(room, roomId, socket.id);
            }

        } else if (eventType === 2) {
            // 🕳️ 블랙홀: 발동자가 직접 타깃 선택 (자기 자신 제외)
            const candidateIds = Object.keys(room.players).filter(id => id !== socket.id);

            if (candidateIds.length === 0) {
                io.to(roomId).emit('event happened', {
                    type: 'none', icon: '🕳️', title: '블랙홀 실패', msg: '타깃이 없어 블랙홀이 사라졌습니다!'
                });
                passTurn(room, roomId, EVENT_POPUP_DELAY_MS);
            } else {
                const candidates = candidateIds.map(id => ({ id, name: room.players[id].name }));
                room.awaitingBlackholeTarget = true;
                if (room.turnTimer) clearTimeout(room.turnTimer);

                // 15초 타임아웃: 자동 랜덤 선택
                room.blackholeTimer = setTimeout(() => {
                    if (!gameRooms[roomId] || !room.awaitingBlackholeTarget) return;
                    room.awaitingBlackholeTarget = false;

                    const randomId = candidateIds[Math.floor(Math.random() * candidateIds.length)];
                    const targetName = room.players[randomId].name;
                    room.players[randomId].skipCount += 1;
                    room.players[randomId].isIsolated = true;
                    room.players[randomId].ignoredNumbers = [];

                    io.to(roomId).emit('update user list', getSortedUserList(room));
                    io.to(roomId).emit('blackhole target confirmed', { targetName, timedOut: true });
                    io.to(roomId).emit('event happened', {
                        type: 'bomb', icon: '🕳️', title: '블랙홀!',
                        msg: `시간 초과! ${targetName}님이 블랙홀에 빨려들어갔습니다!`
                    });
                    io.to(roomId).emit('system message', `🕳️ [이벤트] 시간 초과 - ${targetName}님이 블랙홀에 빠졌습니다. (누적 스킵: ${room.players[randomId].skipCount}회)`);
                    passTurn(room, roomId, EVENT_POPUP_DELAY_MS);
                }, 15000);

                io.to(socket.id).emit('select skip target', { candidates });
                io.to(roomId).emit('system message', `🕳️ [이벤트] ${playerName}님이 블랙홀을 소환했습니다! 타깃을 선택 중... (15초)`);
            }

        } else {
            // 👻 유령의 장난: calledNumbers에서 고정 2개 삭제 후 2라운드 잠금
            if (room.calledNumbers.length > 0) {
                const removedWords = [];
                for (let i = 0; i < 2; i++) {
                    if (room.calledNumbers.length === 0) break;
                    const removeIdx = Math.floor(Math.random() * room.calledNumbers.length);
                    removedWords.push(room.calledNumbers.splice(removeIdx, 1)[0]);
                }

                if (removedWords.length > 0) {
                    Object.values(room.players).forEach(p => {
                        if (p.isIsolated && p.ignoredNumbers) {
                            p.ignoredNumbers = p.ignoredNumbers.filter(w => !removedWords.includes(w));
                        }
                    });
                }

                if (!room.lockedWords) room.lockedWords = {};
                // 고정 2라운드 동안 잠금 (참여자 수에 비례하여 턴 설정)
                const lockRounds = 2;
                const totalLockTurns = lockRounds * room.turnOrder.length;
                removedWords.forEach(word => {
                    room.lockedWords[word] = totalLockTurns;
                });
                io.to(roomId).emit('locked words updated', room.lockedWords);
                io.to(roomId).emit('server called numbers', room.calledNumbers);

                const wordMsg = removedWords.join(', ');
                io.to(roomId).emit('event happened', { type: 'bad', icon: '👻', title: '유령의 장난!', msg: `'${wordMsg}' 단어가 사라지고\n고정 2라운드 동안 선택 불가 상태가 됩니다!` });
                io.to(roomId).emit('system message', `👻 [이벤트] 유령이 '${wordMsg}' 단어를 훔쳐갔습니다! 잠시 선택 불가 상태입니다.`);

                broadcastBingoProgress(io, room, roomId);
                passTurn(room, roomId, EVENT_POPUP_DELAY_MS);
            } else {
                io.to(roomId).emit('event happened', { type: 'none', icon: '😅', title: '실패', msg: '지울 단어가 없습니다.' });
                passTurn(room, roomId, EVENT_POPUP_DELAY_MS);
            }
        }
    });

    socket.on('skip target selected', (data) => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        const room = gameRooms[roomId];

        if (!room || room.status !== 'PLAYING' || room.mode !== 'bingo') return;
        if (!room.awaitingBlackholeTarget) return; // 이미 처리됨(타임아웃 등) 방어
        if (socket.id !== room.turnOrder[room.currentTurnIndex]) return; // 발동자만 처리

        const targetId = data.targetId;
        if (!room.players[targetId] || targetId === socket.id) {
            socket.emit('action failed', '유효하지 않은 타깃입니다.');
            return;
        }

        // 타임아웃 취소
        if (room.blackholeTimer) {
            clearTimeout(room.blackholeTimer);
            room.blackholeTimer = null;
        }
        room.awaitingBlackholeTarget = false;

        const senderName = room.players[socket.id].name;
        const targetName = room.players[targetId].name;
        room.players[targetId].skipCount += 1;
        room.players[targetId].isIsolated = true;
        room.players[targetId].ignoredNumbers = [];

        io.to(roomId).emit('update user list', getSortedUserList(room));
        io.to(roomId).emit('blackhole target confirmed', { targetName, timedOut: false });
        io.to(roomId).emit('event happened', {
            type: 'bomb', icon: '🕳️', title: '블랙홀!',
            msg: `${senderName}님이 블랙홀을 소환하여\n${targetName}님을 빨아들였습니다!`
        });
        io.to(roomId).emit('system message', `🕳️ [이벤트] ${targetName}님이 블랙홀에 빠졌습니다. (누적 스킵: ${room.players[targetId].skipCount}회)`);
        passTurn(room, roomId, EVENT_POPUP_DELAY_MS);
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

    socket.on('cancel theme generation', () => {
        const roomId = socket.roomId;
        if (!roomId) return;
        io.to(roomId).emit('theme progress', { percent: 0, step: '취소됨' });
    });
};
