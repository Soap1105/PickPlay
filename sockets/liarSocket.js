const fs = require('fs');
const path = require('path');
const { getSortedUserList } = require('./utils');

// 정적 카테고리/단어 DB를 메모리에 로드
let liarWordsData = [];
let liarWordPairsData = [];
try {
    const dataPath = path.join(__dirname, '../data/liarWords.json');
    liarWordsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
} catch (error) {
    console.error("liarWords.json 로드 오류. 기본값 적용", error);
    liarWordsData = [{ category: '기본 과일', words: ['사과', '바나나'] }];
}

try {
    const pairsPath = path.join(__dirname, '../data/liarWordPairs.json');
    liarWordPairsData = JSON.parse(fs.readFileSync(pairsPath, 'utf8'));
} catch (error) {
    console.error("liarWordPairs.json 로드 오류. 기본값 적용", error);
    liarWordPairsData = [{ category: '음식', pairs: [['사과', '배']] }];
}

module.exports = (io, socket, gameRooms) => {

    // 타이머 헬퍼 함수
    function startLiarTimer(roomId, phaseName, durationSec, onTimeout) {
        const room = gameRooms[roomId];
        if (!room) return;

        clearLiarTimer(roomId);

        room.liarGame.timeLeft = durationSec;
        room.liarGame.timerPhase = phaseName;

        io.to(roomId).emit('liar timer tick', { phase: phaseName, timeLeft: room.liarGame.timeLeft });

        room.liarGame.timerInterval = setInterval(() => {
            room.liarGame.timeLeft--;
            if (room.liarGame.timeLeft > 0) {
                io.to(roomId).emit('liar timer tick', { phase: phaseName, timeLeft: room.liarGame.timeLeft });
            } else {
                clearLiarTimer(roomId);
                onTimeout();
            }
        }, 1000);
    }

    function clearLiarTimer(roomId) {
        const room = gameRooms[roomId];
        if (!room || !room.liarGame) return;

        if (room.liarGame.timerInterval) {
            clearInterval(room.liarGame.timerInterval);
            room.liarGame.timerInterval = null;
        }
        io.to(roomId).emit('liar timer clear');
    }

    // 카테고리 목록 클라이언트에 반환 (일반 모드 + 라이어 워드 모드 통합)
    socket.on('request liar categories', () => {
        const allCategories = Array.from(new Set([
            ...liarWordsData.map(d => d.category),
            ...liarWordPairsData.map(d => d.category)
        ]));
        socket.emit('liar categories', allCategories);
    });

    // 최초 방 설정 (방장)
    socket.on('setup liar game', (data) => {
        const room = gameRooms[socket.roomId];
        if (!room || room.hostId !== socket.id) return;

        // 결과 확인 중인 플레이어가 있는 경우 시작 차단
        const unconfirmed = Object.values(room.players).filter(p => p.confirmedResult === false);
        if (unconfirmed.length > 0) {
            const names = unconfirmed.map(p => p.name).join(', ');
            socket.emit('action failed', `아직 결과 확인 중인 플레이어가 있습니다: ${names}`);
            return;
        }

        const players = Object.keys(room.players);
        if (players.length < 3) {
            socket.emit('system message', '라이어 게임은 최소 3명 이상이어야 시작할 수 있습니다!');
            return;
        }

        const subMode = data.subMode === 'word' ? 'word' : 'classic';

        // 새로 게임을 엎친 것처럼 scores 초기화
        room.liarGameConfig = {
            winTarget: data.winTarget || 3,
            subMode: subMode,
            allowedCategories: data.categories || []
        };
        if (!room.liarGame) {
            room.liarGame = { scores: {}, votes: {}, submissions: {}, liarHistory: [] };
        }
        room.liarGame.scores = {};
        room.liarGame.liarHistory = []; // 셋업 시 최근 라이어 이력 초기화
        for (let pid in room.players) {
            room.liarGame.scores[pid] = 0;
            room.players[pid].confirmedResult = true;
        }

        io.to(socket.roomId).emit('update scores', room.liarGame.scores, room.liarGameConfig.winTarget);
        const modeLabel = subMode === 'word' ? '라이어 워드' : '클래식';
        socket.emit('system message', `게임 모드: ${modeLabel}, 목표 승수: ${data.winTarget}승으로 설정되었습니다.`);
        
        // 라운드 시작
        startRound(socket.roomId);
    });

    // 다음 라운드 시작
    socket.on('next liar round', () => {
        const room = gameRooms[socket.roomId];
        if (!room || room.hostId !== socket.id) return;
        startRound(socket.roomId); // Task 4-12: 카운트다운 생략
    });

    function startLiarCountdown(roomId) {
        const room = gameRooms[roomId];
        if (!room) return;

        io.to(roomId).emit('liar game countdown start', 3);
        
        let count = 3;
        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                io.to(roomId).emit('liar game countdown tick', count);
            } else {
                clearInterval(interval);
                startRound(roomId);
            }
        }, 1000);
    }

    function startRound(roomId) {
        const room = gameRooms[roomId];
        if (!room) return;

        const players = Object.keys(room.players);
        if (players.length < 3) {
            io.to(room.hostId).emit('system message', '라이어 게임은 최소 3명 이상이어야 시작할 수 있습니다!');
            return;
        }

        clearLiarTimer(roomId);

        room.status = 'submission';
        room.liarGame.liarId = null;
        room.liarGame.category = null;
        room.liarGame.word = null;
        room.liarGame.liarWord = null;
        room.liarGame.subMode = room.liarGameConfig?.subMode || 'classic';
        room.liarGame.votes = {};
        room.liarGame.submissions = {};
        if (!room.liarGame.liarHistory) {
            room.liarGame.liarHistory = [];
        }

        if (room.liarGame.subMode === 'word') {
            // [라이어 워드 모드] 유사 단어 쌍(Pair) 추첨
            let pool = liarWordPairsData;
            if (room.liarGameConfig && room.liarGameConfig.allowedCategories && room.liarGameConfig.allowedCategories.length > 0) {
                const filteredPool = liarWordPairsData.filter(d => room.liarGameConfig.allowedCategories.includes(d.category));
                if (filteredPool.length > 0) pool = filteredPool;
            }

            const pickedCategoryObj = pool[Math.floor(Math.random() * pool.length)];
            const pickedPair = pickedCategoryObj.pairs[Math.floor(Math.random() * pickedCategoryObj.pairs.length)];
            
            // 50% 확률로 시민 단어와 라이어 단어 셔플
            const isPairReversed = Math.random() < 0.5;
            const citizenWord = isPairReversed ? pickedPair[1] : pickedPair[0];
            const liarWord = isPairReversed ? pickedPair[0] : pickedPair[1];

            room.liarGame.category = pickedCategoryObj.category;
            room.liarGame.word = citizenWord;
            room.liarGame.liarWord = liarWord;
        } else {
            // [일반 라이어 모드] 단일 단어 추첨
            let pool = liarWordsData;
            if (room.liarGameConfig && room.liarGameConfig.allowedCategories && room.liarGameConfig.allowedCategories.length > 0) {
                const filteredPool = liarWordsData.filter(d => room.liarGameConfig.allowedCategories.includes(d.category));
                if (filteredPool.length > 0) pool = filteredPool;
            }

            const pickedCategoryObj = pool[Math.floor(Math.random() * pool.length)];
            const pickedWord = pickedCategoryObj.words[Math.floor(Math.random() * pickedCategoryObj.words.length)];
            
            room.liarGame.category = pickedCategoryObj.category;
            room.liarGame.word = pickedWord;
            room.liarGame.liarWord = null;
        }

        // 1판 기억식 가중치 기반 라이어 선정 시스템
        const immediatePastLiar = room.liarGame.liarHistory[room.liarGame.liarHistory.length - 1] || null;
        
        const weights = players.map(pid => {
            if (pid === immediatePastLiar) {
                return 0.25; // 직전 판 라이어는 가중치 0.25로 감소
            }
            return 1.00; // 걸린 적 없거나 한 판 쉰 유저는 가중치 1.00 유지
        });
        
        const totalWeight = weights.reduce((sum, w) => sum + w, 0);
        let randomVal = Math.random() * totalWeight;
        let selectedLiarId = players[players.length - 1]; // fallback
        
        for (let i = 0; i < players.length; i++) {
            randomVal -= weights[i];
            if (randomVal <= 0) {
                selectedLiarId = players[i];
                break;
            }
        }
        
        room.liarGame.liarId = selectedLiarId;
        room.liarGame.liarHistory.push(selectedLiarId);
        
        // 최근 이력은 5개까지만 안전하게 유지 (메모리 제어)
        if (room.liarGame.liarHistory.length > 5) {
            room.liarGame.liarHistory.shift();
        }

        players.forEach(playerId => {
            const isLiar = (playerId === room.liarGame.liarId);
            const userWord = isLiar 
                ? (room.liarGame.subMode === 'word' ? room.liarGame.liarWord : '?') 
                : room.liarGame.word;

            io.to(playerId).emit('liar role assigned', {
                isLiar: isLiar,
                category: room.liarGame.category,
                word: userWord,
                subMode: room.liarGame.subMode
            });
        });

        io.to(roomId).emit('update scores', room.liarGame.scores, room.liarGameConfig?.winTarget || 3);
        io.to(roomId).emit('game started');

        // [순차 턴제] 순서 섞기 및 익명 매팅 초기화
        const turnOrder = [...players];
        for (let i = turnOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [turnOrder[i], turnOrder[j]] = [turnOrder[j], turnOrder[i]];
        }
        room.liarGame.turnOrder = turnOrder;
        room.liarGame.currentTurnIndex = 0;
        room.liarGame.anonymousMapping = turnOrder; // 0번 인덱스 -> 'A', ...

        // 첫 턴 시작 전에 7초 동안 각자 역할을 확인할 시간을 줌
        startLiarTimer(roomId, "역할 확인", 7, () => {
            sendNextTurn(roomId);
        });
    }

    // 다음 플레이어에게 입력 권한을 넘기는 함수
    function sendNextTurn(roomId) {
        const room = gameRooms[roomId];
        if (!room || room.status !== 'submission') return;

        const currentIndex = room.liarGame.currentTurnIndex;
        const turnOrder = room.liarGame.turnOrder;

        if (currentIndex >= turnOrder.length) {
            // 모든 플레이어가 입력을 마침 -> 투표 단계로
            proceedToVotingPhase(roomId);
            return;
        }

        const currentPId = turnOrder[currentIndex];
        const playerName = room.players[currentPId]?.name || '알수없음';

        // 전체 유저에게 "OOO가 설명 중입니다..." 알림
        io.to(roomId).emit('liar next turn', {
            playerName: playerName,
            playerId: currentPId,
            isMyTurn: false
        });

        // 해당 인원에게만 "당신 본인의 차례"임을 알림
        io.to(currentPId).emit('liar next turn', {
            playerName: playerName,
            playerId: currentPId,
            isMyTurn: true
        });

        // 턴별 타이머 (25초)
        startLiarTimer(roomId, `${playerName} 설명`, 25, () => {
            const currentRoom = gameRooms[roomId];
            if (!currentRoom || currentRoom.status !== 'submission') return;
            if (currentRoom.liarGame.turnOrder[currentRoom.liarGame.currentTurnIndex] !== currentPId) return;

            // 시간 초과 시 강제 제출 처리
            if (!currentRoom.liarGame.submissions[currentPId]) {
                currentRoom.liarGame.submissions[currentPId] = "시간 초과 (미입력)";
                io.to(roomId).emit('liar hint received', {
                    playerName: playerName,
                    playerId: currentPId,
                    desc: "시간 초과 (미입력)"
                });
            }

            currentRoom.liarGame.currentTurnIndex++;
            sendNextTurn(roomId);
        });
    }

    // 설명 제출 (순차 턴제)
    socket.on('submit description', (desc) => {
        const room = gameRooms[socket.roomId];
        if (!room || room.status !== 'submission') return;

        const turnOrder = room.liarGame.turnOrder;
        const currentIndex = room.liarGame.currentTurnIndex;

        // 본인 차례인지 확인
        if (turnOrder[currentIndex] !== socket.id) return;

        room.liarGame.submissions[socket.id] = desc;
        const playerName = room.players[socket.id]?.name || '알수없음';

        // 설명 즉시 공개 (실시간 중계)
        io.to(socket.roomId).emit('liar hint received', {
            playerName: playerName,
            playerId: socket.id,
            desc: desc
        });

        clearLiarTimer(socket.roomId);
        room.liarGame.currentTurnIndex++;
        sendNextTurn(socket.roomId);
    });

    function proceedToVotingPhase(roomId) {
        const room = gameRooms[roomId];
        if (!room) return;

        room.status = 'playing'; // 투표 페이즈 진행
        
        // 투표 단계 전환 알림
        io.to(roomId).emit('liar voting phase start');
        // io.to(roomId).emit('system message', '모든 설명이 수집되었습니다! 이제 라이어를 투표해주세요. (제한시간: 45초)');

        // 투표 시간 45초 제어
        startLiarTimer(roomId, "라이어 투표", 45, () => {
            const currentRoom = gameRooms[roomId];
            if (!currentRoom || currentRoom.status !== 'playing') return;

            // 현재 라운드 참여자(turnOrder) 중 아직 방에 남아있는 사람만 추출
            const activeVoters = currentRoom.liarGame.turnOrder.filter(pid => currentRoom.players[pid]);
            let hasForcedVote = false;
            
            for (let pid of activeVoters) {
                if (!currentRoom.liarGame.votes[pid]) {
                    // 본인을 제외한 무작위 대상 선택
                    const otherPlayers = activeVoters.filter(p => p !== pid);
                    const randomTarget = otherPlayers[Math.floor(Math.random() * otherPlayers.length)] || pid;
                    currentRoom.liarGame.votes[pid] = randomTarget;
                    hasForcedVote = true;
                    io.to(roomId).emit('system message', `${currentRoom.players[pid]?.name || '알수없음'}님이 시간 초과로 강제 기권(무작위 지목) 처리되었습니다.`);
                }
            }
            
            if (hasForcedVote) {
                io.to(roomId).emit('vote updated', currentRoom.liarGame.votes);
            }
            tallyVotesAndProceed(roomId);
        });
    }

    // 라이어 지목(투표)
    socket.on('vote liar', (targetId) => {
        const room = gameRooms[socket.roomId];
        if (!room || room.status !== 'playing') return;

        if (!targetId) return;

        // 본인 투표 방지
        if (targetId === socket.id) {
            socket.emit('system message', '본인에게는 투표할 수 없습니다!');
            return;
        }

        // 투표 기록
        room.liarGame.votes[socket.id] = targetId;
        const voterName = room.players[socket.id]?.name || '알수없음';

        // io.to(socket.roomId).emit('system message', `[투표] ${voterName}님이 투표를 완료했습니다.`);
        io.to(socket.roomId).emit('liar player voted', socket.id);
        io.to(socket.roomId).emit('vote updated', room.liarGame.votes); // 중간 결과 UI 업데이트용

        // 전원 투표 완료 시 결과 집계
        // 참여자 중 현재 방에 남아있는 인원수와 투표수 비교
        const activeVoterCount = room.liarGame.turnOrder.filter(pid => room.players[pid]).length;
        if (Object.keys(room.liarGame.votes).length >= activeVoterCount) {
            clearLiarTimer(socket.roomId);
            tallyVotesAndProceed(socket.roomId);
        }
    });

    function tallyVotesAndProceed(roomId) {
        const room = gameRooms[roomId];
        if (!room) return;

        // 1. 모든 유저에게 투표 결과 화살표 레이저를 그리라고 신호 전송 (스포일러 방지 쇼다운 페이즈)
        io.to(roomId).emit('liar showdown start', { votes: room.liarGame.votes });
        // io.to(roomId).emit('system message', '🗳️ 투표 완료! 쇼다운 결과를 분석하는 중입니다...');

        // 2. 3.5초 지연 시간(레이저 드로잉 감상 및 긴장감 유도)을 가진 후 본 결과 판정 진행
        setTimeout(() => {
            const currentRoom = gameRooms[roomId];
            if (!currentRoom || !currentRoom.liarGame) return;

            const voteCounts = {};
            for (let v in currentRoom.liarGame.votes) {
                const t = currentRoom.liarGame.votes[v];
                voteCounts[t] = (voteCounts[t] || 0) + 1;
            }

            // 최다 득표자 찾기
            let maxVotes = 0;
            let maxTarget = null;
            let isTie = false;

            for (let t in voteCounts) {
                if (voteCounts[t] > maxVotes) {
                    maxVotes = voteCounts[t];
                    maxTarget = t;
                    isTie = false;
                } else if (voteCounts[t] === maxVotes) {
                    isTie = true;
                }
            }

            // 결과 판정 (투표 종료)
            if (isTie || maxTarget !== currentRoom.liarGame.liarId) {
                // 라이어 방어 성공 (동표이거나 엉뚱한 사람 지목됨)
                const targetName = isTie ? '동표' : currentRoom.players[maxTarget]?.name;
                const resultMsg = isTie ?
                    `동표입니다! 라이어가 무사히 살아남았습니다.` :
                    `의심받은 ${targetName}님은 선량한 시민이었습니다! 진짜 라이어는 ${currentRoom.players[currentRoom.liarGame.liarId]?.name}님입니다.`;

                // 라이어 1점 획득 (시민은 0점)
                currentRoom.liarGame.scores[currentRoom.liarGame.liarId] = (currentRoom.liarGame.scores[currentRoom.liarGame.liarId] || 0) + 1;

                handleRoundEnd(roomId, {
                    message: resultMsg,
                    liarName: currentRoom.players[currentRoom.liarGame.liarId]?.name,
                    word: currentRoom.liarGame.word,
                    citizensWon: false,
                    votes: currentRoom.liarGame.votes
                });

            } else {
                // 라이어 검거 성공 -> 최후 변론으로 이동
                currentRoom.status = 'final_guess';
                io.to(roomId).emit('final guess phase', { 
                    liarId: currentRoom.liarGame.liarId, 
                    liarName: currentRoom.players[currentRoom.liarGame.liarId]?.name,
                    category: currentRoom.liarGame.category,
                    subMode: currentRoom.liarGame.subMode
                });

                // 최후 변론 30초 타이머
                startLiarTimer(roomId, "최후 변론", 30, () => {
                    const latestRoom = gameRooms[roomId];
                    if (!latestRoom || latestRoom.status !== 'final_guess') return;

                    // 시간 초과 시 오답(시민 승리) 처리 및 지목한 시민 점수 지급
                    for (let voter in latestRoom.liarGame.votes) {
                        if (latestRoom.liarGame.votes[voter] === latestRoom.liarGame.liarId && voter !== latestRoom.liarGame.liarId) {
                            latestRoom.liarGame.scores[voter] = (latestRoom.liarGame.scores[voter] || 0) + 1;
                        }
                    }

                    handleRoundEnd(roomId, {
                        message: `라이어가 시간 초과로 변론을 포기했습니다. 시민들이 승리했습니다!`,
                        liarName: latestRoom.players[latestRoom.liarGame.liarId]?.name,
                        word: latestRoom.liarGame.word,
                        citizensWon: true,
                        votes: latestRoom.liarGame.votes
                    });
                });
            }
        }, 3500);
    }

    // 라이어 최후 변론 실시간 타이핑 중계
    socket.on('final guess typing', (partialWord) => {
        const room = gameRooms[socket.roomId];
        if (!room || room.status !== 'final_guess') return;
        if (socket.id !== room.liarGame.liarId) return;

        // 라이어를 제외한 나머지 사람들에게 브로드캐스트
        socket.to(socket.roomId).emit('final guess typing update', { partialWord });
    });

    // 라이어 최후 변론 제출
    socket.on('submit final guess', (guessWord) => {
        const room = gameRooms[socket.roomId];
        if (!room || room.status !== 'final_guess') return;
        if (socket.id !== room.liarGame.liarId) return;

        clearLiarTimer(socket.roomId); // 정답 제출 완료 시 타이머 즉시 정지

        // io.to(socket.roomId).emit('system message', `라이어(${room.players[socket.id]?.name})의 최후 정답: "${guessWord}"`);

        let citizensWon = false;
        let resultMsg = "";

        // 정답 판정: 유의어/오타 방지를 위해 모든 띄어쓰기(\s)를 지우고 소문자로 변환 후 비교
        const normalizeStr = (str) => typeof str === 'string' ? str.replace(/\s+/g, '').toLowerCase() : "";
        const isCorrect = (normalizeStr(guessWord) === normalizeStr(room.liarGame.word));

        if (isCorrect) {
            resultMsg = `라이어가 정답을 맞췄습니다! 라이어의 승리입니다.`;
            // 정답을 맞춘 라이어 1점 획득
            room.liarGame.scores[socket.id] = (room.liarGame.scores[socket.id] || 0) + 1;
        } else {
            resultMsg = `라이어가 오답을 제출했습니다. (정답: ${room.liarGame.word}) 시민들이 승리했습니다!`;
            citizensWon = true;

            // 옵션1 룰: "라이어를 정확히 지목한 유저만 1점 부여"
            for (let voter in room.liarGame.votes) {
                if (room.liarGame.votes[voter] === room.liarGame.liarId && voter !== room.liarGame.liarId) {
                    room.liarGame.scores[voter] = (room.liarGame.scores[voter] || 0) + 1;
                }
            }
        }

        handleRoundEnd(socket.roomId, {
            message: resultMsg,
            liarName: room.players[room.liarGame.liarId]?.name,
            word: room.liarGame.word,
            citizensWon: citizensWon,
            votes: room.liarGame.votes
        });
    });

    // 점수 확인 및 라운드/게임 종료 처리 공통 함수
    function handleRoundEnd(roomId, resultData) {
        clearLiarTimer(roomId); // 만일을 위한 안전장치
        
        const room = gameRooms[roomId];
        const target = room.liarGameConfig.winTarget;

        // 최신 점수 실시간 브로드캐스트 동기화
        io.to(roomId).emit('update scores', room.liarGame.scores, target);

        // 검거율 및 히스토리 저장을 위한 방 객체 프로퍼티 보장
        if (!room.liarGame.correctVoteCounts) room.liarGame.correctVoteCounts = {};
        if (!room.liarGame.citizenRoundCounts) room.liarGame.citizenRoundCounts = {};
        if (!room.liarGame.roundHistory) room.liarGame.roundHistory = [];

        // 이번 라운드 시민들의 라이어 투표 성공 여부 집계
        const liarId = room.liarGame.liarId;
        if (room.liarGame.votes) {
            for (let voter in room.liarGame.votes) {
                if (voter !== liarId) {
                    room.liarGame.citizenRoundCounts[voter] = (room.liarGame.citizenRoundCounts[voter] || 0) + 1;
                    if (room.liarGame.votes[voter] === liarId) {
                        room.liarGame.correctVoteCounts[voter] = (room.liarGame.correctVoteCounts[voter] || 0) + 1;
                    }
                }
            }
        }

        // 라운드 복기 히스토리 누적
        const roundNum = room.liarGame.roundHistory.length + 1;
        const liarPlayerName = room.players[liarId]?.name || '알 수 없음';
        room.liarGame.roundHistory.push({
            round: `${roundNum}R`,
            tag: resultData.citizensWon ? '시민 승리' : '라이어 승리',
            tagClass: resultData.citizensWon ? 'tag-win' : 'tag-danger',
            topic: `제시어: ${room.liarGame.word || '비공개'} / 라이어: ${liarPlayerName}`,
            desc: resultData.message || (resultData.citizensWon ? '시민들이 라이어를 검거하여 승리했습니다.' : '라이어가 승리했습니다.')
        });

        // 목표 점수 달성자 확인
        let winners = [];
        let finalWinner = null;
        for (let pid in room.liarGame.scores) {
            if (room.liarGame.scores[pid] >= target) {
                winners.push(room.players[pid]?.name);
                if (!finalWinner) {
                    finalWinner = {
                        id: pid,
                        name: room.players[pid]?.name,
                        color: room.players[pid]?.color || '#FC944D'
                    };
                }
            }
        }

        if (winners.length > 0) {
            // 게임 최종 종료 (목표 점수 도달)
            resultData.isFinalGameOver = true;
            resultData.finalMessage = `🎉 목표 점수(${target}승) 달성! 🏆 최종 우승자: ${winners.join(', ')}`;
            resultData.winner = finalWinner;
            room.status = 'WAITING'; // 게임 끝나서 다시 셋업 대기

            // 모든 참여자 확인 미완료 상태로 세팅 (결과 확인 중 배지 표시용)
            Object.values(room.players).forEach(p => {
                p.confirmedResult = false;
            });
            io.to(roomId).emit('update user list', getSortedUserList(room));
        } else {
            // 다음 라운드 진행 가능
            resultData.isFinalGameOver = false;
            room.status = 'ROUND_OVER';
        }

        // 결과 통계에 제출 순서 정보 추가 (정답 공개 시 사용)
        resultData.turnOrder = room.liarGame.turnOrder;
        resultData.playerNames = {};
        for(let pid in room.players) {
            resultData.playerNames[pid] = room.players[pid].name;
        }
        resultData.submissions = room.liarGame.submissions;
        resultData.subMode = room.liarGame.subMode;
        resultData.liarWord = room.liarGame.liarWord;

        // 결과 모달용 다중 기준 정렬: 1위 우승자 고정 -> 누적 승수 내림차순 -> 검거율 내림차순 -> 검거 성공 횟수 내림차순
        resultData.stats = Object.keys(room.players).map(pid => {
            const p = room.players[pid];
            const score = room.liarGame.scores[pid] || 0;
            const correctCount = room.liarGame.correctVoteCounts[pid] || 0;
            const citizenRounds = room.liarGame.citizenRoundCounts[pid] || 0;
            const rate = citizenRounds > 0 ? Math.round((correctCount / citizenRounds) * 100) : 0;
            return {
                id: pid,
                name: p.name,
                color: p.color || '#FC944D',
                score: score,
                correctCount: correctCount,
                citizenRounds: citizenRounds,
                voteCorrectRate: rate,
                stat2Text: citizenRounds > 0 ? `${rate}% (${correctCount}/${citizenRounds})` : '-',
                isLiar: pid === room.liarGame.liarId
            };
        }).sort((a, b) => {
            if (finalWinner && a.id === finalWinner.id) return -1;
            if (finalWinner && b.id === finalWinner.id) return 1;
            if (b.score !== a.score) return b.score - a.score;
            if (b.voteCorrectRate !== a.voteCorrectRate) return b.voteCorrectRate - a.voteCorrectRate;
            return b.correctCount - a.correctCount;
        });

        resultData.history = room.liarGame.roundHistory;

        io.to(roomId).emit('round over', resultData);

        // 방장의 수동 "다음 라운드 시작" 버튼 클릭에 의한 진행으로 변경 (자동 다음 라운드 예약 타이머 삭제)
    }

    socket.on('restart liar game', () => {
        const room = gameRooms[socket.roomId];
        if (!room) return;
        if (room.hostId !== socket.id) return;

        clearLiarTimer(socket.roomId); // 재시작 시 기존 타이머 지우기

        // 상태 초기화
        room.status = 'WAITING';
        room.liarGame = {
            scores: {},
            liarId: null, category: null, word: null, votes: {}, submissions: {},
            liarHistory: [] // 최근 라이어 이력 완벽 소거
        };
        for (let pid in room.players) {
            room.liarGame.scores[pid] = 0;
            room.players[pid].confirmedResult = true; // [이슈 23] 결과 확인 중 배지 초기화
        }

        io.to(socket.roomId).emit('game restarted');
        io.to(socket.roomId).emit('lobby settings updated', {
            bingo: room.bingoSettings || { winLines: 3, turnOrder: 'host_first', turnTimeLimit: 15, topic: '', useEvents: true },
            liar: room.liarSettings || { winTarget: 3, selectedCategories: [] },
            bomb: room.bombSettings || { hearts: 3, subMode: 'random', showTimer: true, timerRange: 'medium', selectedCategories: [] }
        });
        io.to(socket.roomId).emit('update scores', room.liarGame.scores, room.liarGameConfig?.winTarget || 3);
        io.to(socket.roomId).emit('system message', '방장이 게임을 완전히 초기화했습니다. 설정을 확인하고 다시 시작해주세요.');
    });
};
