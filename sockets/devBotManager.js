const fs = require('fs');
const path = require('path');
const { io: Client } = require('socket.io-client');
const { checkBingoLines } = require('./bingoHelpers');

// 폭탄 돌리기 단어 DB 로드
let bombWordsData = [];
try {
    const dataPath = path.join(__dirname, '../data/bombWords.json');
    bombWordsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
} catch (err) {
    bombWordsData = [{ category: '기본 과일', words: ['사과', '바나나', '포도', '딸기', '수박', '참외', '복숭아', '자두'] }];
}

// 라이어 게임 단어 DB 로드 (최후 변론 추리용)
let liarWordsData = [];
try {
    const liarPath = path.join(__dirname, '../data/liarWords.json');
    liarWordsData = JSON.parse(fs.readFileSync(liarPath, 'utf8'));
} catch (err) {
    liarWordsData = [];
}

const BOT_NAMES = ['알파봇', '베타봇', '감마봇', '델타봇', '네오봇', '제타봇', '오메가봇'];
const BOT_COLORS = ['#55B4E0', '#50C9A0', '#A78BFA', '#F472B6', '#FBBF24', '#4ADE80', '#F87171'];
const BOT_COSTUMES = [
    ['crown'],
    ['sunglasses'],
    ['halo'],
    ['cap'],
    ['ribbon'],
    [' glasses'],
    []
];

const CITIZEN_HINTS = [
    '주변에서 꽤 흔하게 접할 수 있는 것 같아요.',
    '특징이 뚜렷해서 다들 바로 떠올리실 듯합니다.',
    '생각보다 호불호가 크게 갈리지 않는 편이에요.',
    '일상생활이나 미디어에서 자주 본 기억이 나네요.',
    '이름만 들어도 어떤 느낌인지 바로 감이 옵니다.',
    '계절이나 상황에 상관없이 꾸준히 언급되는 대상이에요.',
    '특유의 이미지가 확실해서 설명하기 조심스럽네요.',
    '비슷한 종류 중에서도 인지도가 꽤 높은 편입니다.',
    '어릴 때부터 익숙하게 알고 있던 거라 반갑네요.',
    '한 번쯤은 직접 경험해봤거나 자세히 본 적이 있을 거예요.'
];

const LIAR_BLUFF_HINTS = [
    '음, 다들 생각하시는 그 이미지가 맞는 것 같아요.',
    '너무 구체적으로 말하면 라이어가 눈치챌까 봐 아끼겠습니다.',
    '앞분들이 말씀하신 특징에 저도 공감하는 편이에요.',
    '생각보다 범위가 넓을 수 있는데 대표적인 걸 떠올려보세요.',
    '어렵지 않은 제시어라 금방 구분할 수 있을 것 같습니다.',
    '자주 접하는 거라 딱히 덧붙일 설명이 많지 않네요.'
];

// 방별 활성화된 봇 인스턴스 저장소: roomId -> { bots: [], difficulty: 'normal' }
const activeRoomBots = {};

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 빙고 5x5 최적 칸(Greedy) 선택 휴리스틱
function chooseBestBingoWord(board, calledNumbers, lockedWords = {}) {
    if (!Array.isArray(board) || board.length < 25) return null;
    const normalize = (s) => String(s).replace(/\s+/g, '').trim().toLowerCase();
    const calledSet = new Set((calledNumbers || []).map(normalize));

    const lines = [
        [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [15, 16, 17, 18, 19], [20, 21, 22, 23, 24],
        [0, 5, 10, 15, 20], [1, 6, 11, 16, 21], [2, 7, 12, 17, 22], [3, 8, 13, 18, 23], [4, 9, 14, 19, 24],
        [0, 6, 12, 18, 24], [4, 8, 12, 16, 20]
    ];

    let bestIdx = -1;
    let bestScore = -1;

    for (let idx = 0; idx < 25; idx++) {
        const word = board[idx];
        if (!word) continue;
        if (calledSet.has(normalize(word))) continue;
        if (lockedWords && lockedWords[word] !== undefined) continue;

        let score = 0;
        // 정중앙 및 대각선 교차 가중치
        if (idx === 12) score += 8;
        else if ([0, 4, 20, 24, 6, 8, 16, 18].includes(idx)) score += 3;

        for (const line of lines) {
            if (!line.includes(idx)) continue;
            const markedCount = line.filter(i => calledSet.has(normalize(board[i]))).length;
            // 이미 4칸이 채워진 줄이면 최우선(즉시 1줄 완성)
            if (markedCount === 4) score += 100;
            else if (markedCount === 3) score += 25;
            else if (markedCount === 2) score += 8;
            else if (markedCount === 1) score += 2;
        }

        // 약간의 랜덤성 추가
        score += Math.random() * 1.5;

        if (score > bestScore) {
            bestScore = score;
            bestIdx = idx;
        }
    }

    return bestIdx !== -1 ? board[bestIdx] : null;
}

function createBotInstance(roomId, botIndex, gameRooms, difficulty = 'normal') {
    const port = process.env.PORT || 80;
    const url = `http://127.0.0.1:${port}`;
    const botName = BOT_NAMES[botIndex % BOT_NAMES.length];
    const botColor = BOT_COLORS[botIndex % BOT_COLORS.length];
    const botCostume = BOT_COSTUMES[botIndex % BOT_COSTUMES.length];
    const clientId = `devbot_${roomId}_${botIndex}_${Date.now()}`;

    const botSocket = Client(url, {
        reconnection: false,
        forceNew: true,
        transports: ['websocket']
    });

    const state = {
        socket: botSocket,
        name: botName,
        clientId: clientId,
        timers: new Set(),
        // 빙고 상태
        bingoBoard: [],
        calledNumbers: [],
        lockedWords: {},
        winLines: 3,
        // 라이어 상태
        isLiar: false,
        liarCategory: '',
        liarWord: '',
        // 폭탄 상태
        bombCategory: '',
        bombSubMode: 'random',
        bombUsedWords: [],
        bombHearts: {}
    };

    function addTimer(fn, delay) {
        const t = setTimeout(() => {
            state.timers.delete(t);
            if (botSocket.connected) fn();
        }, delay);
        state.timers.add(t);
        return t;
    }

    function clearAllBotTimers() {
        for (const t of state.timers) {
            clearTimeout(t);
        }
        state.timers.clear();
    }

    botSocket.on('connect', () => {
        botSocket.emit('join room', {
            roomId: roomId,
            name: botName,
            color: botColor,
            costume: botCostume,
            clientId: clientId
        });
    });

    // 투표 시작 시 자동 참여
    botSocket.on('vote timer', (data) => {
        if (data && data.status === 'started') {
            addTimer(() => {
                const pick = Math.random() < 0.5 ? 'bingo' : 'liar';
                botSocket.emit('vote game', pick);
            }, randInt(600, 1800));
        }
    });

    // =========================================================
    // 1. 빙고 게임 (Bingo) 자동 플레이
    // =========================================================
    botSocket.on('setup theme input', (data) => {
        clearAllBotTimers();
        state.winLines = data.winLines || 3;
        state.calledNumbers = [];
        state.lockedWords = {};

        let words = Array.isArray(data.presetWords) ? [...data.presetWords] : [];
        if (words.length < 25) {
            const fallback = ['사과', '바나나', '포도', '수박', '딸기', '참외', '복숭아', '자두', '키위', '망고', '파인애플', '오렌지', '레몬', '체리', '블루베리', '라즈베리', '멜론', '석류', '자몽', '감', '배', '귤', '코코넛', '아보카도', '무화과'];
            words = [...new Set([...words, ...fallback])];
        }
        // 셔플 후 25개 선택
        words.sort(() => Math.random() - 0.5);
        state.bingoBoard = words.slice(0, 25);

        addTimer(() => {
            botSocket.emit('submit theme board', {
                roomId: roomId,
                board: state.bingoBoard,
                name: botName
            });
        }, randInt(600, 1400));
    });

    botSocket.on('start theme game', (data) => {
        if (Array.isArray(data.board) && data.board.length === 25) {
            state.bingoBoard = data.board;
        }
        if (data.winLines) state.winLines = data.winLines;
        state.calledNumbers = [];
        state.lockedWords = {};
    });

    botSocket.on('update board', (newBoard) => {
        if (Array.isArray(newBoard) && newBoard.length === 25) {
            state.bingoBoard = newBoard;
        }
    });

    botSocket.on('number called', (word) => {
        if (!state.calledNumbers.includes(word)) {
            state.calledNumbers.push(word);
        }
        checkAndDeclareBingo();
    });

    botSocket.on('server called numbers', (list) => {
        state.calledNumbers = Array.isArray(list) ? [...list] : [];
        checkAndDeclareBingo();
    });

    botSocket.on('locked words updated', (locked) => {
        state.lockedWords = locked || {};
    });

    function checkAndDeclareBingo() {
        if (!state.bingoBoard || state.bingoBoard.length < 25) return;
        const lines = checkBingoLines(state.bingoBoard, state.calledNumbers);
        if (lines >= state.winLines) {
            addTimer(() => {
                botSocket.emit('bingo declared', { name: botName });
            }, randInt(300, 700));
        }
    }

    botSocket.on('turn update', (data) => {
        if (!data || data.currentTurnId !== botSocket.id) return;

        // 첫 턴 팝업이나 이벤트 팝업 지연을 고려해 1.3~2.2초 후 액션
        addTimer(() => {
            const room = gameRooms[roomId];
            if (!room || room.mode !== 'bingo' || room.status !== 'PLAYING') return;
            if (room.turnOrder[room.currentTurnIndex] !== botSocket.id) return;

            const lines = checkBingoLines(state.bingoBoard, room.calledNumbers || []);
            if (lines >= (room.winLines || state.winLines)) {
                botSocket.emit('bingo declared', { name: botName });
                return;
            }

            // [사람다운 이벤트 플레이] 기회가 있고 이벤트 모드 ON이면 35% 확률로 이벤트 우선 사용
            const player = room.players[botSocket.id];
            const maxEvents = Math.max(0, (room.winLines || state.winLines) - 1);
            const usedEvents = (player && player.usedEventCount) || 0;
            const canUseEvent = room.useEvents && (Math.min(lines, maxEvents) > usedEvents);

            if (canUseEvent && Math.random() < 0.35) {
                botSocket.emit('trigger event');
                return;
            }

            const word = chooseBestBingoWord(state.bingoBoard, room.calledNumbers || [], room.lockedWords || {});
            if (word) {
                botSocket.emit('theme word selected', { roomId: roomId, word: word });
            }
        }, randInt(1300, 2200));
    });

    botSocket.on('select skip target', (data) => {
        if (data && Array.isArray(data.candidates) && data.candidates.length > 0) {
            addTimer(() => {
                const room = gameRooms[roomId];
                let bestTargetId = data.candidates[0].id;

                // 인간 유저이거나 빙고 줄 수가 높은 플레이어를 지능적으로 우선 타겟팅
                if (room && room.players) {
                    let maxScore = -1;
                    data.candidates.forEach(c => {
                        const targetPlayer = room.players[c.id];
                        if (targetPlayer) {
                            const bLines = checkBingoLines(targetPlayer.board || [], room.calledNumbers || []);
                            const isHuman = !botSocketIds.has(c.id);
                            const score = bLines + (isHuman ? 2 : 0);
                            if (score > maxScore) {
                                maxScore = score;
                                bestTargetId = c.id;
                            }
                        }
                    });
                } else {
                    bestTargetId = data.candidates[Math.floor(Math.random() * data.candidates.length)].id;
                }

                botSocket.emit('skip target selected', { targetId: bestTargetId });
            }, randInt(900, 1600));
        }
    });

    botSocket.on('game over', () => {
        clearAllBotTimers();
        addTimer(() => {
            botSocket.emit('confirm result');
        }, randInt(500, 1000));
    });

    // =========================================================
    // 2. 라이어 게임 (Liar) 자동 플레이
    // =========================================================
    botSocket.on('liar role assigned', (data) => {
        clearAllBotTimers();
        state.isLiar = !!data.isLiar;
        state.liarCategory = data.category || '';
        state.liarWord = data.word || '';
    });

    botSocket.on('liar next turn', (data) => {
        if (!data || !data.isMyTurn || data.playerId !== botSocket.id) return;

        addTimer(() => {
            const room = gameRooms[roomId];
            if (!room || room.mode !== 'liar' || room.status !== 'submission') return;

            let desc = '';
            if (state.isLiar && state.liarWord === '?') {
                desc = LIAR_BLUFF_HINTS[Math.floor(Math.random() * LIAR_BLUFF_HINTS.length)];
            } else {
                const base = CITIZEN_HINTS[Math.floor(Math.random() * CITIZEN_HINTS.length)];
                desc = base;
            }
            botSocket.emit('submit description', desc);
        }, randInt(1200, 2200));
    });

    botSocket.on('liar voting phase start', () => {
        addTimer(() => {
            const room = gameRooms[roomId];
            if (!room || room.mode !== 'liar' || room.status !== 'playing' || !room.liarGame) return;

            const candidates = (room.liarGame.turnOrder || []).filter(pid => pid !== botSocket.id && room.players[pid]);
            if (candidates.length === 0) return;

            let targetId = candidates[Math.floor(Math.random() * candidates.length)];
            // [밸런스 패치] 시민 봇의 컨닝 투표율 너프 (기존 55% -> 18%) 및 자연스러운 분산 투표
            if (!state.isLiar && room.liarGame.liarId && candidates.includes(room.liarGame.liarId)) {
                const roll = Math.random();
                if (roll < 0.18) {
                    // 18% 확률로 실제 라이어 지목
                    targetId = room.liarGame.liarId;
                } else if (roll < 0.53) {
                    // 35% 확률로 직전 발언자 의심 (인간적인 흐름)
                    const turnOrder = room.liarGame.turnOrder || [];
                    const myIdx = turnOrder.indexOf(botSocket.id);
                    const prevId = myIdx > 0 ? turnOrder[myIdx - 1] : turnOrder[turnOrder.length - 1];
                    if (prevId && prevId !== botSocket.id && candidates.includes(prevId)) {
                        targetId = prevId;
                    }
                }
                // 나머지 47%는 candidates 중 무작위 분산 투표로 몰표 방지
            }
            botSocket.emit('vote liar', targetId);
        }, randInt(1200, 2600));
    });

    botSocket.on('final guess phase', (data) => {
        if (!data || data.liarId !== botSocket.id) return;

        const room = gameRooms[roomId];
        const realWord = room && room.liarGame ? room.liarGame.word : '사과';
        // [밸런스 패치] 20% 확률로만 정답 추리, 80% 확률로 같은 카테고리의 다른 단어 제출 (과도한 승률 억제)
        let guessWord = realWord;
        if (Math.random() >= 0.20 && liarWordsData.length > 0) {
            const catObj = liarWordsData.find(c => c.category === data.category);
            if (catObj && Array.isArray(catObj.words)) {
                const others = catObj.words.filter(w => w !== realWord);
                if (others.length > 0) {
                    guessWord = others[Math.floor(Math.random() * others.length)];
                }
            }
        }

        // 실시간 타이핑 연출 후 제출
        let step = 0;
        function typeGuessStep() {
            step++;
            const partial = guessWord.slice(0, step);
            botSocket.emit('final guess typing', partial);
            if (step < guessWord.length) {
                addTimer(typeGuessStep, randInt(180, 300));
            } else {
                addTimer(() => {
                    botSocket.emit('submit final guess', guessWord);
                }, 450);
            }
        }
        addTimer(typeGuessStep, 900);
    });

    botSocket.on('round over', (data) => {
        clearAllBotTimers();
        if (data && data.isFinalGameOver) {
            addTimer(() => {
                botSocket.emit('confirm result');
            }, randInt(500, 1000));
        }
    });

    // =========================================================
    // 3. 단어 폭탄 돌리기 (Bomb) 자동 플레이
    // =========================================================
    botSocket.on('bomb hearts updated', (data) => {
        if (data && data.hearts) state.bombHearts = data.hearts;
    });

    botSocket.on('bomb round started', (data) => {
        clearAllBotTimers();
        state.bombCategory = data.category || '';
        state.bombUsedWords = [];
        if (data.hearts) state.bombHearts = data.hearts;

        if (data.currentTurnId === botSocket.id) {
            // 서버의 추첨 연출 락(슈퍼 폭탄 인트로 2초 + rouletteDuration)이 풀린 직후부터 타이핑 시작
            const countdownDelay = (data.isSuperIntro ? 2000 : 0) + (data.rouletteDuration || 3600) + 150;
            addTimer(() => {
                scheduleBombTurnAction(roomId, true);
            }, countdownDelay);
        }
    });

    botSocket.on('bomb word accepted', (data) => {
        if (data && data.word && !state.bombUsedWords.includes(data.word)) {
            state.bombUsedWords.push(data.word);
        }
    });

    botSocket.on('bomb turn changed', (data) => {
        if (!data) return;
        if (data.nextTurnId === botSocket.id) {
            scheduleBombTurnAction(roomId, false);
        }
    });

    botSocket.on('bomb exploded', (data) => {
        clearAllBotTimers();
        if (data && data.isGameOver) {
            addTimer(() => {
                botSocket.emit('confirm result');
            }, randInt(500, 1000));
        }
    });

    function scheduleBombTurnAction(roomId, isFirstTurnOfRound) {
        const room = gameRooms[roomId];
        if (!room || !room.bombGame || room.status !== 'playing') return;

        const diff = activeRoomBots[roomId]?.difficulty || difficulty;
        const wordPool = room.bombGame.wordPool || [];
        const usedWords = room.bombGame.usedWords || [];
        const available = wordPool.filter(w => !usedWords.includes(w));
        if (available.length === 0) return;

        const answerWord = available[Math.floor(Math.random() * available.length)];

        // 일부러 오답을 먼저 쳐서 빨간 말풍선 흔들림을 보여줄 확률 (18%)
        const makeTypoFirst = Math.random() < 0.18;

        const thinkDelay = diff === 'hard'
            ? randInt(400, 850)
            : (diff === 'easy' ? randInt(1400, 2600) : randInt(700, 1450));
        const charDelay = diff === 'hard' ? randInt(90, 150) : randInt(140, 230);

        if (makeTypoFirst) {
            const wrongWord = usedWords.length > 0
                ? usedWords[Math.floor(Math.random() * usedWords.length)]
                : `${answerWord}ㅋ`;

            simulateWordTypingAndSubmit(wrongWord, thinkDelay, charDelay, () => {
                simulateWordTypingAndSubmit(answerWord, 750, charDelay);
            });
        } else {
            simulateWordTypingAndSubmit(answerWord, thinkDelay, charDelay);
        }
    }

    function simulateWordTypingAndSubmit(word, initialDelay, stepDelay, onAfterSubmit) {
        let idx = 0;
        addTimer(function typeNext() {
            const room = gameRooms[roomId];
            if (!room || !room.bombGame || room.bombGame.currentTurnId !== botSocket.id || room.status !== 'playing') {
                return;
            }
            idx++;
            const partial = word.slice(0, idx);
            botSocket.emit('bomb typing', partial);

            if (idx < word.length) {
                addTimer(typeNext, stepDelay);
            } else {
                addTimer(function trySubmit() {
                    const latestRoom = gameRooms[roomId];
                    if (!latestRoom || !latestRoom.bombGame || latestRoom.bombGame.currentTurnId !== botSocket.id || latestRoom.status !== 'playing') {
                        return;
                    }
                    // 서버 락(추첨 연출/패스 정지) 중이면 제출이 무시되므로 풀릴 때까지 재시도
                    const bg = latestRoom.bombGame;
                    if (bg.isCountingDown || Date.now() < (bg.passHoldUntil || 0)) {
                        addTimer(trySubmit, 120);
                        return;
                    }
                    botSocket.emit('submit bomb word', word);
                    if (typeof onAfterSubmit === 'function') {
                        onAfterSubmit();
                    }
                }, 180);
            }
        }, initialDelay);
    }

    state.destroy = () => {
        clearAllBotTimers();
        if (botSocket) {
            botSocket.removeAllListeners();
            botSocket.disconnect();
        }
    };

    return state;
}

function clearBotsInRoom(roomId) {
    const entry = activeRoomBots[roomId];
    if (!entry) return 0;
    const count = entry.bots.length;
    entry.bots.forEach(b => b.destroy());
    delete activeRoomBots[roomId];
    return count;
}

function getBotSocketIds(roomId) {
    const entry = activeRoomBots[roomId];
    if (!entry) return new Set();
    return new Set(entry.bots.map(b => b.socket.id).filter(Boolean));
}

function handleBotChatCommand(io, socket, gameRooms, rawText) {
    const roomId = socket.roomId;
    if (!roomId || !gameRooms[roomId]) return false;
    const room = gameRooms[roomId];

    const trimmed = String(rawText || '').trim();
    if (!trimmed.startsWith('/bot')) return false;

    if (socket.id !== room.hostId) {
        socket.emit('action failed', '방장만 /bot 테스트 명령어를 사용할 수 있습니다.');
        return true;
    }

    const parts = trimmed.split(/\s+/);
    const arg = (parts[1] || '3').toLowerCase();

    if (arg === 'clear' || arg === 'off' || arg === '0') {
        const removed = clearBotsInRoom(roomId);
        io.to(roomId).emit('system message', `[DEV] 테스트 봇 ${removed}명을 모두 퇴장시켰습니다.`);
        return true;
    }

    if (arg === 'hard' || arg === 'easy' || arg === 'normal') {
        if (!activeRoomBots[roomId]) {
            activeRoomBots[roomId] = { bots: [], difficulty: arg };
        } else {
            activeRoomBots[roomId].difficulty = arg;
        }
        io.to(roomId).emit('system message', `[DEV] 봇 난이도가 '${arg.toUpperCase()}'로 설정되었습니다.`);
        return true;
    }

    if (room.status !== 'WAITING') {
        socket.emit('action failed', '게임 시작 전(대기실)에만 봇을 추가할 수 있습니다.');
        return true;
    }

    const requestedCount = Math.max(1, Math.min(7, parseInt(arg, 10) || 3));
    const currentPlayerCount = Object.keys(room.players).length;
    const availableSlots = Math.max(0, 8 - currentPlayerCount);

    if (availableSlots <= 0) {
        socket.emit('action failed', '방 정원(8명)이 가득 차서 봇을 추가할 수 없습니다.');
        return true;
    }

    const spawnCount = Math.min(requestedCount, availableSlots);
    if (!activeRoomBots[roomId]) {
        activeRoomBots[roomId] = { bots: [], difficulty: 'normal' };
    }

    const startIdx = activeRoomBots[roomId].bots.length;
    for (let i = 0; i < spawnCount; i++) {
        const bot = createBotInstance(roomId, startIdx + i, gameRooms, activeRoomBots[roomId].difficulty);
        activeRoomBots[roomId].bots.push(bot);
    }

    io.to(roomId).emit('system message', `[DEV] 테스트 봇 ${spawnCount}명이 투입되었습니다. (해제: /bot clear, 난이도: /bot hard|normal|easy)`);
    return true;
}

module.exports = {
    handleBotChatCommand,
    clearBotsInRoom,
    getBotSocketIds
};

