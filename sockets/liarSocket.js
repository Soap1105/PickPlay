const fs = require('fs');
const path = require('path');

// 정적 카테고리/단어 DB를 메모리에 로드
let liarWordsData = [];
try {
    const dataPath = path.join(__dirname, '../data/liarWords.json');
    liarWordsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
} catch (error) {
    console.error("liarWords.json 로드 오류. 기본값 적용", error);
    liarWordsData = [{ category: '기본 과일', words: ['사과', '바나나'] }];
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

    // 카테고리 목록 클라이언트에 반환
    socket.on('request liar categories', () => {
        socket.emit('liar categories', liarWordsData.map(d => d.category));
    });

    // 최초 방 설정 (방장)
    socket.on('setup liar game', (data) => {
        const room = gameRooms[socket.roomId];
        if (!room || room.hostId !== socket.id) return;

        const players = Object.keys(room.players);
        if (players.length < 3) {
            socket.emit('system message', '라이어 게임은 최소 3명 이상이어야 시작할 수 있습니다!');
            return;
        }

        // 새로 게임을 엎친 것처럼 scores 초기화
        room.liarGameConfig = {
            winTarget: data.winTarget || 3,
            allowedCategories: data.categories || []
        };
        room.liarGame.scores = {};
        for (let pid in room.players) {
            room.liarGame.scores[pid] = 0;
        }

        io.to(socket.roomId).emit('update scores', room.liarGame.scores, room.liarGameConfig.winTarget);
        socket.emit('system message', `목표 승수가 ${data.winTarget}승으로 설정되었습니다.`);

        // 그리고 바로 최초 시작 처리
        startRound(socket.roomId);
    });

    // 다음 라운드 시작
    socket.on('next liar round', () => {
        const room = gameRooms[socket.roomId];
        if (!room || room.hostId !== socket.id) return;
        startRound(socket.roomId);
    });

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
        room.liarGame.votes = {};
        room.liarGame.submissions = {};

        // 방장이 선택한 카테고리 풀 필터링
        let pool = liarWordsData;
        if (room.liarGameConfig && room.liarGameConfig.allowedCategories && room.liarGameConfig.allowedCategories.length > 0) {
            const filteredPool = liarWordsData.filter(d => room.liarGameConfig.allowedCategories.includes(d.category));
            if (filteredPool.length > 0) pool = filteredPool;
        }

        // 카테고리 풀에서 랜덤으로 뽑고 그 안에서 단어를 무작위로 뽑음
        const pickedCategoryObj = pool[Math.floor(Math.random() * pool.length)];
        const pickedWord = pickedCategoryObj.words[Math.floor(Math.random() * pickedCategoryObj.words.length)];
        
        room.liarGame.category = pickedCategoryObj.category;
        room.liarGame.word = pickedWord;

        const liarIndex = Math.floor(Math.random() * players.length);
        room.liarGame.liarId = players[liarIndex];

        players.forEach(playerId => {
            const isLiar = (playerId === room.liarGame.liarId);
            io.to(playerId).emit('liar role assigned', {
                isLiar: isLiar,
                category: room.liarGame.category,
                word: isLiar ? '?' : room.liarGame.word
            });
        });

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

        // 첫 번째 턴 시작
        sendNextTurn(roomId);
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
        const label = String.fromCharCode(65 + currentIndex); // A, B, C...

        // 전체 유저에게 "익명 X가 설명 중입니다..." 알림
        io.to(roomId).emit('liar next turn', {
            label: label,
            isMyTurn: false
        });

        // 해당 인원에게만 "당신 본인의 차례"임을 알림
        io.to(currentPId).emit('liar next turn', {
            label: label,
            isMyTurn: true
        });

        // 턴별 타이머 (25초)
        startLiarTimer(roomId, `익명 ${label} 설명`, 25, () => {
            const currentRoom = gameRooms[roomId];
            if (!currentRoom || currentRoom.status !== 'submission') return;
            if (currentRoom.liarGame.turnOrder[currentRoom.liarGame.currentTurnIndex] !== currentPId) return;

            // 시간 초과 시 강제 제출 처리
            if (!currentRoom.liarGame.submissions[currentPId]) {
                currentRoom.liarGame.submissions[currentPId] = "시간 초과 (미입력)";
                io.to(roomId).emit('liar hint received', {
                    label: label,
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
        const label = String.fromCharCode(65 + currentIndex);

        // 설명 즉시 공개 (실시간 중계)
        io.to(socket.roomId).emit('liar hint received', {
            label: label,
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
        io.to(roomId).emit('system message', '모든 설명이 수집되었습니다! 이제 라이어를 투표해주세요. (제한시간: 45초)');

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

    // 라이어 지목(투표) - 이제 라벨(A, B, C...)을 받음
    socket.on('vote liar', (targetLabel) => {
        const room = gameRooms[socket.roomId];
        if (!room || room.status !== 'playing') return;

        // 라벨을 실제 플레이어 ID로 변환
        const labelIdx = (typeof targetLabel === 'string') ? targetLabel.toUpperCase().charCodeAt(0) - 65 : -1;
        const targetId = room.liarGame.anonymousMapping ? room.liarGame.anonymousMapping[labelIdx] : null;

        if (!targetId) return;

        // 본인 힌트 투표 방지
        if (targetId === socket.id) {
            socket.emit('system message', '자신의 힌트에는 투표할 수 없습니다!');
            return;
        }

        // 투표 기록
        room.liarGame.votes[socket.id] = targetId;
        const voterName = room.players[socket.id]?.name || '알수없음';

        io.to(socket.roomId).emit('system message', `[투표] ${voterName}님이 투표를 완료했습니다.`);
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

        const voteCounts = {};
        for (let v in room.liarGame.votes) {
            const t = room.liarGame.votes[v];
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
        if (isTie || maxTarget !== room.liarGame.liarId) {
            // 라이어 방어 성공 (동표이거나 엉뚱한 사람 지목됨)
            const targetName = isTie ? '동표' : room.players[maxTarget]?.name;
            const resultMsg = isTie ?
                `동표입니다! 라이어가 무사히 살아남았습니다.` :
                `의심받은 ${targetName}님은 선량한 시민이었습니다! 진짜 라이어는 ${room.players[room.liarGame.liarId]?.name}님입니다.`;

            // 라이어 1점 획득 (시민은 0점)
            room.liarGame.scores[room.liarGame.liarId] = (room.liarGame.scores[room.liarGame.liarId] || 0) + 1;

            handleRoundEnd(roomId, {
                message: resultMsg,
                liarName: room.players[room.liarGame.liarId]?.name,
                word: room.liarGame.word,
                citizensWon: false
            });

        } else {
            // 라이어 검거 성공 -> 최후 변론으로 이동
            room.status = 'final_guess';
            io.to(roomId).emit('system message', `🚨 투표 결과, ${room.players[room.liarGame.liarId]?.name}님이 라이어로 검거되었습니다! (제한시간: 30초)`);
            io.to(roomId).emit('final guess phase', { liarId: room.liarGame.liarId, liarName: room.players[room.liarGame.liarId]?.name });

            // 최후 변론 30초 타이머
            startLiarTimer(roomId, "최후 변론", 30, () => {
                const currentRoom = gameRooms[roomId];
                if (!currentRoom || currentRoom.status !== 'final_guess') return;

                io.to(roomId).emit('system message', `라이어(${currentRoom.players[currentRoom.liarGame.liarId]?.name})가 제한 시간 내에 정답을 제출하지 못했습니다!`);
                
                // 시간 초과 시 오답(시민 승리) 처리
                handleRoundEnd(roomId, {
                    message: `라이어가 시간 초과로 변론을 포기했습니다. 시민들이 승리했습니다!`,
                    liarName: currentRoom.players[currentRoom.liarGame.liarId]?.name,
                    word: currentRoom.liarGame.word,
                    citizensWon: true
                });
            });
        }
    }

    // 라이어 최후 변론 제출
    socket.on('submit final guess', (guessWord) => {
        const room = gameRooms[socket.roomId];
        if (!room || room.status !== 'final_guess') return;
        if (socket.id !== room.liarGame.liarId) return;

        clearLiarTimer(socket.roomId); // 정답 제출 완료 시 타이머 즉시 정지

        io.to(socket.roomId).emit('system message', `라이어(${room.players[socket.id]?.name})의 최후 정답: "${guessWord}"`);

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
            citizensWon: citizensWon
        });
    });

    // 점수 확인 및 라운드/게임 종료 처리 공통 함수
    function handleRoundEnd(roomId, resultData) {
        clearLiarTimer(roomId); // 만일을 위한 안전장치
        
        const room = gameRooms[roomId];
        const target = room.liarGameConfig.winTarget;

        // 점수 갱신 브로드캐스트
        io.to(roomId).emit('update scores', room.liarGame.scores, target);

        // 목표 점수 달성자 확인
        let winners = [];
        for (let pid in room.liarGame.scores) {
            if (room.liarGame.scores[pid] >= target) {
                winners.push(room.players[pid]?.name);
            }
        }

        if (winners.length > 0) {
            // 게임 최종 종료 (목표 점수 도달)
            resultData.isFinalGameOver = true;
            resultData.finalMessage = `🎉 목표 점수(${target}승) 달성! 🏆 최종 우승자: ${winners.join(', ')}`;
            room.status = 'WAITING'; // 게임 끝나서 다시 셋업 대기
        } else {
            // 다음 라운드 진행 가능
            resultData.isFinalGameOver = false;
            room.status = 'ROUND_OVER';
        }

        // 결과 통계에 익명 매핑 정보 추가 (정답 공개 시 사용)
        resultData.anonymousMapping = room.liarGame.anonymousMapping;
        resultData.playerNames = {};
        for(let pid in room.players) {
            resultData.playerNames[pid] = room.players[pid].name;
        }
        resultData.submissions = room.liarGame.submissions;

        // 결과 모달용 공통 스탯 형식 생성
        resultData.stats = Object.keys(room.players).map(pid => ({
            id: pid,
            name: room.players[pid].name,
            score: room.liarGame.scores[pid] || 0,
            isLiar: pid === room.liarGame.liarId
        })).sort((a, b) => b.score - a.score);

        io.to(roomId).emit('round over', resultData);
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
            liarId: null, category: null, word: null, votes: {}, submissions: {}
        };
        for (let pid in room.players) {
            room.liarGame.scores[pid] = 0;
        }

        io.to(socket.roomId).emit('game restarted');
        io.to(socket.roomId).emit('update scores', room.liarGame.scores, room.liarGameConfig?.winTarget || 3);
        io.to(socket.roomId).emit('system message', '방장이 게임을 완전히 초기화했습니다. 설정을 확인하고 다시 시작해주세요.');
    });
};
