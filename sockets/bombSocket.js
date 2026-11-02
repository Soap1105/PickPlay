const fs = require('fs');
const path = require('path');

// 정적 카테고리/단어 DB를 메모리에 로드
let bombWordsData = [];
try {
    const dataPath = path.join(__dirname, '../data/bombWords.json');
    bombWordsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
} catch (error) {
    console.error("bombWords.json 로드 오류.", error);
    bombWordsData = [{ category: '기본 과일', words: ['사과', '바나나', '포도'] }];
}

// 폭탄 길이 프리셋: 첫 라운드 범위와 하한(초). 라운드마다 BOMB_TIMER_DECAY 비율로 감소
const BOMB_TIMER_PRESETS = {
    short:  { min: 15, max: 30, floor: 8 },
    medium: { min: 25, max: 45, floor: 10 },
    long:   { min: 40, max: 65, floor: 12 }
};
const BOMB_TIMER_DECAY = 0.9;
const BOMB_FLOOR_SPREAD = 4; // 하한 도달 후에도 폭발 시점을 예측할 수 없도록 유지하는 무작위 폭(초)
const BOMB_SUPER_MIN_PLAYERS = 5; // 슈퍼 폭탄(하트 -2) 시스템은 5인 이상 방에서만 가동

function computeBombDuration(range, round) {
    const preset = BOMB_TIMER_PRESETS[range] || BOMB_TIMER_PRESETS.medium;
    const decay = Math.pow(BOMB_TIMER_DECAY, Math.max(0, round - 1));
    const lo = Math.max(preset.floor, Math.round(preset.min * decay));
    const hi = Math.max(lo + BOMB_FLOOR_SPREAD, Math.round(preset.max * decay));
    return lo + Math.floor(Math.random() * (hi - lo + 1));
}

// 5인 이상: 3, 6, 9, 12R 및 13R+ 상시 슈퍼 폭탄 (하트 -2). 2~4인은 항상 일반 폭탄
function getSuperBombInfo(initialCount, roundCount) {
    if ((initialCount || 0) < BOMB_SUPER_MIN_PLAYERS) {
        return { isSuper: false, isIntro: false, damage: 1 };
    }
    if (roundCount >= 13) {
        return { isSuper: true, isIntro: (roundCount === 13), damage: 2 };
    }
    if (roundCount % 3 === 0) {
        return { isSuper: true, isIntro: true, damage: 2 };
    }
    return { isSuper: false, isIntro: false, damage: 1 };
}

module.exports = (io, socket, gameRooms) => {
    
    // 타이머 헬퍼 함수
    function startBombTimer(roomId, durationSec) {
        const room = gameRooms[roomId];
        if (!room || !room.bombGame) return;

        clearBombTimer(roomId);

        room.bombGame.maxTime = durationSec;
        room.bombGame.timeLeft = durationSec;
        room.bombGame.passHoldUntil = 0;
        
        io.to(roomId).emit('bomb timer tick', { 
            timeLeft: room.bombGame.timeLeft,
            maxTime: room.bombGame.maxTime,
            showTimer: room.bombGameConfig.showTimer
        });

        room.bombGame.timerInterval = setInterval(() => {
            const currentRoom = gameRooms[roomId];
            
            // 방이 사라졌거나 게임 정보가 없으면 타이머 중지
            if (!currentRoom || !currentRoom.bombGame) {
                if (room && room.bombGame && room.bombGame.timerInterval) {
                    clearInterval(room.bombGame.timerInterval);
                    room.bombGame.timerInterval = null;
                }
                return;
            }

            // 폭탄 패스 직후 정지 구간에는 시간을 차감하지 않음 (타이머 위상은 유지하여 연속 패스로 도화선이 멈추는 악용 방지)
            if (Date.now() < (room.bombGame.passHoldUntil || 0)) return;

            room.bombGame.timeLeft--;
            
            if (room.bombGame.timeLeft > 0) {
                io.to(roomId).emit('bomb timer tick', { 
                    timeLeft: room.bombGame.timeLeft,
                    maxTime: room.bombGame.maxTime || durationSec,
                    showTimer: room.bombGameConfig.showTimer
                });
            } else {
                // 정확히 0이 되는 시점에 한 번만 실행되도록 보장
                clearBombTimer(roomId);
                explodeBomb(roomId);
            }
        }, 1000);
    }

    function clearBombTimer(roomId) {
        const room = gameRooms[roomId];
        if (!room || !room.bombGame) return;

        if (room.bombGame.startDelayTimeout) {
            clearTimeout(room.bombGame.startDelayTimeout);
            room.bombGame.startDelayTimeout = null;
        }
        if (room.bombGame.timerInterval) {
            clearInterval(room.bombGame.timerInterval);
            room.bombGame.timerInterval = null;
        }
        if (room.bombGame.turnTimeout) {
            clearTimeout(room.bombGame.turnTimeout);
            room.bombGame.turnTimeout = null;
        }
    }

    function clearNextRoundTimer(roomId) {
        const room = gameRooms[roomId];
        if (!room) return;
        if (room.nextRoundTimeout) {
            clearTimeout(room.nextRoundTimeout);
            clearInterval(room.nextRoundTimeout);
            room.nextRoundTimeout = null;
        }
    }

    // 폭탄 폭발 처리 (하트 차감 방식)
    function explodeBomb(roomId) {
        const room = gameRooms[roomId];
        if (!room || !room.bombGame) return;

        const loserId = room.bombGame.currentTurnId;
        const loserName = room.players[loserId]?.name || "알 수 없음";
        
        const curRound = room.bombGame.roundCount || 1;
        // 하트 차감 (슈퍼 폭탄 라운드에는 2개)
        const superInfo = getSuperBombInfo(room.bombGame.initialPlayerCount, curRound);
        const damage = superInfo.damage;
        if (room.bombGame.hearts[loserId] > 0) {
            const actualDamage = Math.min(damage, room.bombGame.hearts[loserId]);
            room.bombGame.hearts[loserId] -= actualDamage;
        }

        console.log(`[Bomb] Exploded! Loser: ${loserName}(${loserId}). Damage: ${damage}. Remaining Hearts: ${room.bombGame.hearts[loserId]}`);

        // 남은 단어 중 하나를 랜덤으로 공개
        const remainingWords = room.bombGame.wordPool.filter(w => !room.bombGame.usedWords.includes(w));
        const revealWord = remainingWords.length > 0
            ? remainingWords[Math.floor(Math.random() * remainingWords.length)]
            : null;

        // 생존자 체크
        const survivors = Object.keys(room.players).filter(pid => room.bombGame.hearts[pid] > 0);
        let finalWinner = null;
        let isGameOver = false;

        const isEliminated = room.bombGame.hearts[loserId] <= 0;
        if (!room.bombGame.history) room.bombGame.history = [];
        if (!room.bombGame.eliminatedRound) room.bombGame.eliminatedRound = {};

        if (isEliminated && !room.bombGame.eliminatedRound[loserId]) {
            room.bombGame.eliminatedRound[loserId] = curRound;
        }

        // 라운드 복기 히스토리 기록
        room.bombGame.history.push({
            round: `${curRound}R`,
            tag: isEliminated ? '폭발 (탈락)' : '폭발 (하트 차감)',
            tagClass: isEliminated ? 'tag-danger' : 'tag-danger',
            topic: `카테고리: ${room.bombGame.category || '전체'}`,
            desc: `총 ${room.bombGame.roundTurns || 1}턴 경과 후 폭탄 폭발! <strong>${loserName}</strong>의 손에서 터져 ${isEliminated ? '하트 소진 및 탈락' : `하트 차감 (남은 하트: ${room.bombGame.hearts[loserId]}개)`}`
        });

        if (survivors.length === 1) {
            const survivorId = survivors[0];
            finalWinner = { 
                id: survivorId, 
                name: room.players[survivorId].name,
                color: room.players[survivorId].color || '#FC944D',
                costume: room.players[survivorId].costume || []
            };
            isGameOver = true;
        } else if (survivors.length === 0) {
            // 전원 사망 (잠수 등) -> 무승부 처리
            isGameOver = true;
        }

        // 전체 플레이어 하트 상태 전송
        io.to(roomId).emit('bomb hearts updated', {
            hearts: room.bombGame.hearts,
            maxHearts: room.bombGameConfig.maxHearts
        });

        const payload = {
            loserId: loserId,
            loserName: loserName,
            victimHearts: room.bombGame.hearts[loserId],
            damage: damage,
            message: isGameOver
                ? (finalWinner
                    ? `${loserName} 님의 손에서 폭탄이 터졌습니다. 최종 우승: ${finalWinner.name}`
                    : `${loserName} 님의 손에서 폭탄이 터졌습니다. 전원 탈락으로 무승부입니다.`)
                : `${loserName} 님의 손에서 폭탄이 터졌습니다. (남은 하트: ${room.bombGame.hearts[loserId]}개)`,
            isGameOver: isGameOver,
            revealWord: revealWord
        };

        if (isGameOver) {
            room.status = 'WAITING';
            
            // 모든 참여자 확인 미완료 상태로 세팅 (결과 확인 중 배지 표시용)
            Object.values(room.players).forEach(p => {
                p.confirmedResult = false;
            });
            const { getSortedUserList } = require('./utils');
            io.to(roomId).emit('update user list', getSortedUserList(room));

            // 다중 기준 정렬: 1위 우승자 고정 -> 남은 하트 내림차순 -> 탈락 라운드 내림차순 -> 패스 성공 턴 수 내림차순
            const stats = Object.keys(room.players).map(pid => {
                const p = room.players[pid];
                const hearts = room.bombGame.hearts[pid] !== undefined ? room.bombGame.hearts[pid] : 0;
                const elimRound = room.bombGame.eliminatedRound[pid] || 999;
                const passes = (room.bombGame.passCounts && room.bombGame.passCounts[pid]) || 0;
                return {
                    id: pid,
                    name: p.name,
                    color: p.color || '#FC944D',
                    costume: p.costume || [],
                    hearts: hearts,
                    passCount: passes,
                    eliminatedRound: elimRound,
                    isAlive: hearts > 0
                };
            }).sort((a, b) => {
                if (finalWinner && a.id === finalWinner.id) return -1;
                if (finalWinner && b.id === finalWinner.id) return 1;
                if (b.hearts !== a.hearts) return b.hearts - a.hearts;
                if (b.eliminatedRound !== a.eliminatedRound) return b.eliminatedRound - a.eliminatedRound;
                return b.passCount - a.passCount;
            });

            payload.winner = finalWinner;
            payload.stats = stats;
            payload.history = room.bombGame.history;
            room.bombGame.lastExplosionData = payload;
            io.to(roomId).emit('bomb exploded', payload);
        } else {
            room.status = 'ROUND_OVER';
            if (room.bombGame.roundCount) {
                room.bombGame.roundCount++;
            } else {
                room.bombGame.roundCount = 2;
            }
            room.bombGame.lastExplosionData = payload;
            io.to(roomId).emit('bomb exploded', payload);

            // 3초 후 자동 다음 라운드 (불필요한 카운트다운 브로드캐스트 생략)
            const nextRoundTimer = setTimeout(() => {
                const currentRoom = gameRooms[roomId];
                if (!currentRoom || currentRoom.status !== 'ROUND_OVER') return;
                startNewRound(roomId);
            }, 3000);
            room.nextRoundTimeout = nextRoundTimer;
        }
    }

    // 카테고리 목록 클라이언트에 반환
    socket.on('request bomb categories', () => {
        socket.emit('bomb categories', bombWordsData.map(d => d.category));
    });

    // 게임 설정 및 시작 (방장전용)
    socket.on('setup bomb game', (data) => {
        const room = gameRooms[socket.roomId];
        if (!room || room.hostId !== socket.id) return;

        room.explodeBombRef = explodeBomb;
        room.startNewRoundRef = startNewRound;
        room.clearBombTimerRef = clearBombTimer;

        // 결과 확인 중인 플레이어가 있는 경우 시작 차단
        const unconfirmed = Object.values(room.players).filter(p => p.confirmedResult === false);
        if (unconfirmed.length > 0) {
            const names = unconfirmed.map(p => p.name).join(', ');
            socket.emit('action failed', `아직 결과 확인 중인 플레이어가 있습니다: ${names}`);
            return;
        }

        const players = Object.keys(room.players);
        if (players.length < 2) {
            socket.emit('system message', '폭탄 돌리기는 최소 2명 이상이어야 시작할 수 있습니다!');
            return;
        }

        // 설정 저장
        room.bombGameConfig = {
            maxHearts: parseInt(data.hearts) || 3,
            showTimer: data.showTimer !== undefined ? data.showTimer : true,
            timerRange: data.timerRange || 'medium',
            selectedCategories: data.selectedCategories || []
        };

        // 전체 점수 및 통계 초기화
        room.bombGame = {
            hearts: {},
            usedWords: [],
            roundCount: 1,
            passCounts: {},
            eliminatedRound: {},
            roundTurns: 0,
            history: [],
            initialPlayerCount: players.length
        };
        players.forEach(pid => {
            room.bombGame.hearts[pid] = room.bombGameConfig.maxHearts;
            room.bombGame.passCounts[pid] = 0;
            room.bombGame.eliminatedRound[pid] = null;
        });

        // 클라이언트에 초기 승리 조건 및 점수 전송
        io.to(socket.roomId).emit('bomb hearts updated', {
            hearts: room.bombGame.hearts,
            maxHearts: room.bombGameConfig.maxHearts
        });
        
        startNewRound(socket.roomId);
    });

    // 라운드 시작
    function startNewRound(roomId) {
        const room = gameRooms[roomId];
        if (!room) return;

        const players = Object.keys(room.players).filter(pid => room.bombGame.hearts[pid] > 0);
        if (players.length < 2) return;

        clearBombTimer(roomId);

        // 라운드 데이터 초기화
        room.status = 'playing';
        room.bombGame.usedWords = [];
        room.bombGame.wordsExhausted = false;
        room.bombGame.lastWordsByPlayer = {};
        room.bombGame.lastPassedWord = null;
        room.bombGame.roundTurns = 0;
        room.bombGame.lastSuccessPId = null; 
        
        // 카테고리 결정
        let targetPool = bombWordsData;
        
        // 호스트가 카테고리를 선택했다면 해당되는 데이터만 필터링
        if (room.bombGameConfig.selectedCategories && room.bombGameConfig.selectedCategories.length > 0) {
            targetPool = bombWordsData.filter(item => room.bombGameConfig.selectedCategories.includes(item.category));
        }
        
        // 선택된 주제가 없을 경우를 대비한 방어 로직 (데이터가 모두 삭제되었거나 했을 때)
        if (targetPool.length === 0) targetPool = bombWordsData;

        // 카테고리 랜덤 선택
        const pickedObj = targetPool[Math.floor(Math.random() * targetPool.length)];
        room.bombGame.category = pickedObj.category;
        // '//'로 시작하는 주석용 단어 제외
        room.bombGame.wordPool = pickedObj.words.filter(w => !w.startsWith('//'));

        // 첫 턴 무작위 선택
        room.bombGame.currentTurnId = players[Math.floor(Math.random() * players.length)];
        room.bombGame.turnStartTime = Date.now();

        const round = room.bombGame.roundCount || 1;
        const randomDuration = computeBombDuration(room.bombGameConfig.timerRange, round);
        const superInfo = getSuperBombInfo(room.bombGame.initialPlayerCount, round);
        room.bombGame.isSuperBomb = superInfo.isSuper;

        console.log(`[Bomb] Round ${round} started. Range: ${room.bombGameConfig.timerRange}. Duration: ${randomDuration}s. SuperBomb: ${superInfo.isSuper} (intro: ${superInfo.isIntro})`);

        room.bombGame.maxTime = randomDuration;
        room.bombGame.timeLeft = randomDuration;

        // 생존자 수에 따른 록온+곡사포 연출 지속 시간 계산 (1R 및 6인 이상: 3.6초 / 4~5인: 3.0초 / 2~3인: 2.4초)
        let rouletteDuration = 3600;
        if (round !== 1) {
            if (players.length < 4) {
                rouletteDuration = 2400;
            } else if (players.length < 6) {
                rouletteDuration = 3000;
            }
        }

        const totalDelay = superInfo.isIntro ? (2000 + rouletteDuration) : rouletteDuration;

        io.to(roomId).emit('bomb round started', {
            category: room.bombGame.category,
            currentTurnId: room.bombGame.currentTurnId,
            showTimer: room.bombGameConfig.showTimer,
            roundCount: round,
            isSuperBomb: superInfo.isSuper,
            isSuperIntro: superInfo.isIntro,
            rouletteDuration: rouletteDuration,
            maxTime: randomDuration,
            timeLeft: randomDuration,
            hearts: room.bombGame.hearts,
            maxHearts: room.bombGameConfig.maxHearts
        });

        // 룰렛 연출(및 슈퍼 폭탄 인트로) 동안 서버 타이머 일시 락 및 동기화 시작
        room.bombGame.isCountingDown = true;
        room.bombGame.startDelayTimeout = setTimeout(() => {
            const currentRoom = gameRooms[roomId];
            if (!currentRoom || currentRoom.status !== 'playing' || !currentRoom.bombGame) return;
            currentRoom.bombGame.startDelayTimeout = null;
            currentRoom.bombGame.isCountingDown = false;
            currentRoom.bombGame.turnStartTime = Date.now();
            startBombTimer(roomId, randomDuration);
            startTurnTimeout(roomId);
        }, totalDelay);
    }

    function startTurnTimeout(roomId) {
        const room = gameRooms[roomId];
        if (!room || !room.bombGame) return;
        
        if (room.bombGame.turnTimeout) clearTimeout(room.bombGame.turnTimeout);
        
        // 15초 동안 입력 없으면 잠수 처리로 폭발
        room.bombGame.turnStartTime = Date.now();
        room.bombGame.turnTimeout = setTimeout(() => {
            const currentRoom = gameRooms[roomId];
            if (currentRoom && currentRoom.status === 'playing') {
                clearBombTimer(roomId);
                explodeBomb(roomId);
            }
        }, 15000);
    }

    // 실시간 타이핑 중계 (방식 A: 관전 연출용이므로 카운트다운 락에 의해 패킷이 드랍되지 않도록 완화)
    socket.on('bomb typing', (rawText) => {
        const room = gameRooms[socket.roomId];
        if (!room || room.status !== 'playing' || !room.bombGame) return;
        // 현재 차례가 아닌 유저의 스팸만 차단
        if (room.bombGame.currentTurnId !== socket.id) return;

        const cleanText = String(rawText || '').slice(0, 15);
        socket.to(socket.roomId).emit('bomb typing update', {
            playerId: socket.id,
            text: cleanText
        });
    });

    // 단어 제출
    socket.on('submit bomb word', (input) => {
        const room = gameRooms[socket.roomId];
        if (!room || room.status !== 'playing' || !room.bombGame) return;
        if (room.bombGame.isCountingDown) return;
        if (Date.now() < (room.bombGame.passHoldUntil || 0)) return;
        if (room.bombGame.wordsExhausted) return;
        if (room.bombGame.currentTurnId !== socket.id) return;

        const word = String(input || '').trim();

        const normalizedInput = word.replace(/\s+/g, '').toLowerCase();
        
        // 정답 여부 확인 (DB의 단어들도 공백 제거 후 비교)
        const matchedWord = room.bombGame.wordPool.find(w => 
            w.replace(/\s+/g, '').toLowerCase() === normalizedInput
        );

        if (!matchedWord) {
            socket.emit('bomb invalid word', '해당 주제의 단어 리스트에 없습니다.');
            io.to(socket.roomId).emit('bomb word rejected', {
                playerId: socket.id,
                word: word.slice(0, 15),
                reason: 'not_found'
            });
            return;
        }

        // 중복 체크
        if (room.bombGame.usedWords.includes(matchedWord)) {
            socket.emit('bomb invalid word', '이미 사용된 단어입니다.');
            io.to(socket.roomId).emit('bomb word rejected', {
                playerId: socket.id,
                word: matchedWord,
                reason: 'duplicate'
            });
            return;
        }

        // 성공!
        const cleanWord = matchedWord;
        room.bombGame.usedWords.push(cleanWord);
        if (!room.bombGame.lastWordsByPlayer) room.bombGame.lastWordsByPlayer = {};
        room.bombGame.lastWordsByPlayer[socket.id] = cleanWord;
        room.bombGame.lastPassedWord = cleanWord;

        const survivors = Object.keys(room.players).filter(pid => room.bombGame.hearts[pid] > 0);
        const others = survivors.filter(id => id !== socket.id);
        const nextPId = others.length > 0 ? others[Math.floor(Math.random() * others.length)] : socket.id;

        // 단어 수락 - 잠수 타임아웃만 해제 (메인 타이머는 정지 구간 플래그로 처리)
        if (room.bombGame.turnTimeout) {
            clearTimeout(room.bombGame.turnTimeout);
            room.bombGame.turnTimeout = null;
        }

        if (!room.bombGame.passCounts) room.bombGame.passCounts = {};
        room.bombGame.passCounts[socket.id] = (room.bombGame.passCounts[socket.id] || 0) + 1;
        room.bombGame.roundTurns = (room.bombGame.roundTurns || 0) + 1;

        // 성공 이벤트 먼저 전송 (화면에 단어 표시)
        io.to(socket.roomId).emit('bomb word accepted', {
            word: cleanWord,
            senderId: socket.id,
            senderName: room.players[socket.id].name,
            nextTurnId: nextPId
        });

        // 모든 단어 소진 체크
        if (room.bombGame.usedWords.length >= room.bombGame.wordPool.length) {
            clearBombTimer(socket.roomId);
            room.bombGame.wordsExhausted = true;

            // 마지막 단어를 낸 유저가 아닌, 폭탄을 넘겨받은 다음 유저가 폭발 대상이 되도록 턴 이전
            room.bombGame.currentTurnId = nextPId;
            io.to(socket.roomId).emit('bomb turn changed', {
                nextTurnId: nextPId,
            });
            
            io.to(socket.roomId).emit('bomb all words used', { 
                message: '모든 단어가 소진되어 폭탄이 곧 폭발합니다.' 
            });

            setTimeout(() => {
                const currentRoom = gameRooms[socket.roomId];
                if (currentRoom && currentRoom.status === 'playing') {
                    explodeBomb(socket.roomId);
                }
            }, 2200);
            return; 
        }

        // 즉시 다음 사람에게 폭탄 이동 + 도화선 정지 (위기 구간 5초 이하는 0.25초, 그 외 0.4초)
        const holdMs = room.bombGame.timeLeft <= 5 ? 250 : 400;
        room.bombGame.passHoldUntil = Date.now() + holdMs;
        room.bombGame.currentTurnId = nextPId;
        io.to(socket.roomId).emit('bomb turn changed', {
            nextTurnId: nextPId,
            holdMs: holdMs
        });
        startTurnTimeout(socket.roomId);
    });

    // 라운드 재시작 또는 다음 라운드
    socket.on('next bomb round', () => {
        const room = gameRooms[socket.roomId];
        if (!room || room.hostId !== socket.id) return;
        clearNextRoundTimer(socket.roomId);
        startNewRound(socket.roomId);
    });

    socket.on('return to lobby from bomb', () => {
        const room = gameRooms[socket.roomId];
        if (!room || room.hostId !== socket.id) return;
        
        clearBombTimer(socket.roomId);
        clearNextRoundTimer(socket.roomId);
        
        // [이슈 6] 결과 확인 배지 초기화 (확인 안 누르고 로비 복귀 시 배지 잔류 버그 방지)
        Object.values(room.players).forEach(p => {
            p.confirmedResult = true;
        });
        
        // 게임 데이터 완전 삭제
        delete room.bombGame;
        room.status = 'WAITING';
        
        // 모든 클러이언트의 UI를 로비(테마 선택)로 강제 전환
        io.to(socket.roomId).emit('game changed', 'lobby');
    });

};

// ================= 세션 복구 및 예외 방어 외부 노출 헬퍼 =================

function buildBombRecoveryData(room, socketId) {
    if (!room || !room.bombGame) return null;

    const bg = room.bombGame;
    const cfg = room.bombGameConfig || {};
    const currentTurnPlayer = bg.currentTurnId ? room.players[bg.currentTurnId] : null;

    return {
        status: room.status,
        category: bg.category || '--',
        currentTurnId: bg.currentTurnId,
        currentTurnName: currentTurnPlayer ? currentTurnPlayer.name : '',
        isMyTurn: (bg.currentTurnId === socketId),
        hearts: bg.hearts || {},
        maxHearts: cfg.maxHearts || 3,
        showTimer: cfg.showTimer !== undefined ? cfg.showTimer : true,
        timeLeft: bg.timeLeft || 0,
        maxTime: bg.maxTime || 30,
        usedWords: bg.usedWords || [],
        roundCount: bg.roundCount || 1,
        isSuperBomb: !!bg.isSuperBomb,
        lastWordsByPlayer: bg.lastWordsByPlayer || {},
        lastPassedWord: bg.lastPassedWord || null,
        lastExplosionData: (room.status === 'ROUND_OVER') ? (bg.lastExplosionData || null) : null
    };
}

function handleBombPlayerDisconnect(io, gameRooms, roomId, leavingSocketId, leavingPlayerName) {
    const room = gameRooms[roomId];
    if (!room || !room.bombGame || room.status === 'WAITING') return;

    const bg = room.bombGame;

    // 이탈자 하트 0 처리 및 탈락 기록
    if (bg.hearts && bg.hearts[leavingSocketId] !== undefined) {
        bg.hearts[leavingSocketId] = 0;
    }
    if (!bg.eliminatedRound) bg.eliminatedRound = {};
    if (!bg.eliminatedRound[leavingSocketId]) {
        bg.eliminatedRound[leavingSocketId] = bg.roundCount || 1;
    }

    // 현재 턴 보유자가 진짜 이탈(1.5초 유예 만료)한 경우 폭탄 즉시 폭발 처리
    if (room.status === 'playing' && bg.currentTurnId === leavingSocketId) {
        if (room.clearBombTimerRef) room.clearBombTimerRef(roomId);
        if (room.explodeBombRef) {
            room.explodeBombRef(roomId);
        }
        return;
    }

    // 현재 턴이 아닌 유저가 이탈했는데 생존자가 1명만 남은 경우 즉시 우승 처리
    const survivors = Object.keys(room.players).filter(pid => bg.hearts && bg.hearts[pid] > 0);
    if (survivors.length === 1 && room.status === 'playing') {
        if (room.clearBombTimerRef) room.clearBombTimerRef(roomId);
        const survivorId = survivors[0];
        const finalWinner = {
            id: survivorId,
            name: room.players[survivorId].name,
            color: room.players[survivorId].color || '#FC944D',
            costume: room.players[survivorId].costume || []
        };
        room.status = 'WAITING';
        Object.values(room.players).forEach(p => { p.confirmedResult = false; });
        const { getSortedUserList } = require('./utils');
        io.to(roomId).emit('update user list', getSortedUserList(room));

        const stats = Object.keys(room.players).map(pid => {
            const p = room.players[pid];
            const hearts = bg.hearts[pid] !== undefined ? bg.hearts[pid] : 0;
            const elimRound = bg.eliminatedRound[pid] || 999;
            const passes = (bg.passCounts && bg.passCounts[pid]) || 0;
            return {
                id: pid,
                name: p.name,
                color: p.color || '#FC944D',
                costume: p.costume || [],
                hearts: hearts,
                passCount: passes,
                eliminatedRound: elimRound,
                isAlive: hearts > 0
            };
        });

        io.to(roomId).emit('bomb exploded', {
            loserId: leavingSocketId,
            loserName: leavingPlayerName,
            victimHearts: 0,
            message: `${leavingPlayerName} 님의 연결 종료로 최종 우승: ${finalWinner.name}`,
            isGameOver: true,
            winner: finalWinner,
            stats: stats,
            history: bg.history || [],
            revealWord: null
        });
    } else {
        io.to(roomId).emit('bomb hearts updated', {
            hearts: bg.hearts,
            maxHearts: room.bombGameConfig ? room.bombGameConfig.maxHearts : 3
        });
    }
}

module.exports.buildBombRecoveryData = buildBombRecoveryData;
module.exports.handleBombPlayerDisconnect = handleBombPlayerDisconnect;
