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

module.exports = (io, socket, gameRooms) => {
    
    // 타이머 헬퍼 함수
    function startBombTimer(roomId, durationSec) {
        const room = gameRooms[roomId];
        if (!room || !room.bombGame) return;

        clearBombTimer(roomId);

        room.bombGame.timeLeft = durationSec;
        
        io.to(roomId).emit('bomb timer tick', { 
            timeLeft: room.bombGame.timeLeft,
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

            room.bombGame.timeLeft--;
            
            if (room.bombGame.timeLeft > 0) {
                io.to(roomId).emit('bomb timer tick', { 
                    timeLeft: room.bombGame.timeLeft,
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
        
        // 하트 차감
        if (room.bombGame.hearts[loserId] > 0) {
            room.bombGame.hearts[loserId]--;
        }

        console.log(`[Bomb] Exploded! Loser: ${loserName}(${loserId}). Remaining Hearts: ${room.bombGame.hearts[loserId]}`);

        // 남은 단어 중 하나를 랜덤으로 공개
        const remainingWords = room.bombGame.wordPool.filter(w => !room.bombGame.usedWords.includes(w));
        const revealWord = remainingWords.length > 0
            ? remainingWords[Math.floor(Math.random() * remainingWords.length)]
            : null;

        // 생존자 체크
        const survivors = Object.keys(room.players).filter(pid => room.bombGame.hearts[pid] > 0);
        let finalWinner = null;
        let isGameOver = false;

        if (survivors.length === 1) {
            finalWinner = { id: survivors[0], name: room.players[survivors[0]].name };
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

        if (isGameOver) {
            room.status = 'WAITING';
            
            // 모든 참여자 확인 미완료 상태로 세팅 (결과 확인 중 배지 표시용)
            Object.values(room.players).forEach(p => {
                p.confirmedResult = false;
            });
            const { getSortedUserList } = require('./utils');
            io.to(roomId).emit('update user list', getSortedUserList(room));

            const stats = Object.keys(room.players).map(pid => ({
                id: pid,
                name: room.players[pid].name,
                hearts: room.bombGame.hearts[pid]
            })).sort((a, b) => b.hearts - a.hearts);

            io.to(roomId).emit('bomb exploded', {
                loserId: loserId,
                loserName: loserName,
                message: finalWinner 
                    ? `💥 퍼엉! ${loserName}님이 터졌습니다! 🏆 최종 우승: ${finalWinner.name}!` 
                    : `💥 퍼엉! ${loserName}님이 터졌습니다! 🛑 전원 탈락으로 무승부입니다.`,
                isGameOver: true,
                winner: finalWinner,
                stats: stats,
                revealWord: revealWord
            });
        } else {
            room.status = 'ROUND_OVER';
            if (room.bombGame.roundCount) {
                room.bombGame.roundCount++;
            } else {
                room.bombGame.roundCount = 2;
            }
            io.to(roomId).emit('bomb exploded', {
                loserId: loserId,
                loserName: loserName,
                message: `💥 퍼엉! ${loserName}님의 하트가 깎였습니다! (남은 하트: ${room.bombGame.hearts[loserId]}개)`,
                isGameOver: false,
                revealWord: revealWord
            });

            // 5초 후 자동 다음 라운드
            let countdown = 5;
            const countdownInterval = setInterval(() => {
                const currentRoom = gameRooms[roomId];
                if (!currentRoom || currentRoom.status !== 'ROUND_OVER') {
                    clearInterval(countdownInterval);
                    return;
                }
                countdown--;
                if (countdown > 0) {
                    io.to(roomId).emit('bomb next round countdown', countdown);
                } else {
                    clearInterval(countdownInterval);
                    startNewRound(roomId);
                }
            }, 1000);
            room.nextRoundTimeout = countdownInterval;
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
            subMode: data.subMode || 'random', // 'random', 'tactical'
            showTimer: data.showTimer !== undefined ? data.showTimer : true,
            timerRange: data.timerRange || 'medium',
            selectedCategories: data.selectedCategories || []
        };

        // 전체 점수 초기화
        room.bombGame = {
            hearts: {},
            usedWords: [],
            roundCount: 1
        };
        players.forEach(pid => {
            room.bombGame.hearts[pid] = room.bombGameConfig.maxHearts;
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
        room.bombGame.lastSuccessPId = null; 
        room.bombGame.lastSenderId = null; // 반사 기능을 위해 추가
        
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

        // 타이머 범위 설정 (short, medium, long)
        let min = 30, max = 55;
        const range = room.bombGameConfig.timerRange;
        if (range === 'short') { min = 15; max = 30; }
        else if (range === 'long') { min = 50; max = 80; }
        else { min = 30; max = 55; }
        
        // 라운드가 진행될수록 제한 시간이 줄어들도록 5초씩 패널티 적용 (최소 12초 보장)
        const round = room.bombGame.roundCount || 1;
        const penalty = (round - 1) * 5;
        const randomDuration = Math.max(12, Math.floor(Math.random() * (max - min + 1)) + min - penalty);
        
        console.log(`[Bomb] Round ${round} started. Timer range: ${min}~${max}s (penalty: -${penalty}s). Resulting duration: ${randomDuration}s.`);

        io.to(roomId).emit('bomb round started', {
            category: room.bombGame.category,
            currentTurnId: room.bombGame.currentTurnId,
            showTimer: room.bombGameConfig.showTimer,
            subMode: room.bombGameConfig.subMode,
            roundCount: round
        });

        startBombTimer(roomId, randomDuration);
        startTurnTimeout(roomId);
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

    // 단어 제출
    socket.on('submit bomb word', (input) => {
        const room = gameRooms[socket.roomId];
        if (!room || room.status !== 'playing') return;
        if (room.bombGame.currentTurnId !== socket.id) return;

        // 전략 모드 지목 체크 (예: "사과 3")
        let word = input.trim();
        let targetNum = null;
        
        if (room.bombGameConfig.subMode === 'tactical') {
            const parts = word.split(' ');
            if (parts.length > 1) {
                const lastPart = parts[parts.length - 1];
                if (!isNaN(lastPart)) {
                    targetNum = parseInt(lastPart);
                    word = parts.slice(0, -1).join(' ');
                }
            }
        }

        const normalizedInput = word.replace(/\s+/g, '').toLowerCase();
        
        // 정답 여부 확인 (DB의 단어들도 공백 제거 후 비교)
        const matchedWord = room.bombGame.wordPool.find(w => 
            w.replace(/\s+/g, '').toLowerCase() === normalizedInput
        );

        if (!matchedWord) {
            socket.emit('bomb invalid word', '해당 주제의 단어 리스트에 없습니다!');
            return;
        }

        // 중복 체크
        if (room.bombGame.usedWords.includes(matchedWord)) {
            socket.emit('bomb invalid word', '이미 사용된 단어입니다!');
            return;
        }

        // 성공!
        const cleanWord = matchedWord;
        room.bombGame.usedWords.push(cleanWord);
        const timeTaken = Date.now() - room.bombGame.turnStartTime;
        
        const survivors = Object.keys(room.players).filter(pid => room.bombGame.hearts[pid] > 0);
        let nextPId;
        let reflectTriggered = false;

        // 반사 체크 (전략 모드 & 2초 내 답변 & 나를 보낸 사람이 아직 생존 중일 때)
        if (room.bombGameConfig.subMode === 'tactical' && timeTaken < 2000 && room.bombGame.lastSenderId && room.bombGame.lastSenderId !== socket.id && survivors.includes(room.bombGame.lastSenderId)) {
            nextPId = room.bombGame.lastSenderId;
            reflectTriggered = true;
        } 
        // 지목 체크 (전략 모드)
        else if (room.bombGameConfig.subMode === 'tactical' && targetNum !== null) {
            const sortedPlayers = Object.keys(room.players).sort(); // 입장순
            const targetId = sortedPlayers[targetNum - 1];
            if (targetId && survivors.includes(targetId) && targetId !== socket.id) {
                nextPId = targetId;
            }
        }

        // 결정 안됐으면 랜덤 패스 (혹은 다음 사람)
        if (!nextPId) {
            const others = survivors.filter(id => id !== socket.id);
            nextPId = others[Math.floor(Math.random() * others.length)];
        }

        room.bombGame.lastSenderId = socket.id;

        // 단어 수락 - 메인 타이머 일시 정지 (턴 전환 딜레이 동안 시간이 흐르지 않도록)
        if (room.bombGame.timerInterval) {
            clearInterval(room.bombGame.timerInterval);
            room.bombGame.timerInterval = null;
        }
        if (room.bombGame.turnTimeout) {
            clearTimeout(room.bombGame.turnTimeout);
            room.bombGame.turnTimeout = null;
        }

        // 성공 이벤트 먼저 전송 (화면에 단어 표시)
        io.to(socket.roomId).emit('bomb word accepted', {
            word: cleanWord,
            senderName: room.players[socket.id].name,
            reflect: reflectTriggered
        });

        // 모든 단어 소진 체크
        if (room.bombGame.usedWords.length >= room.bombGame.wordPool.length) {
            clearBombTimer(socket.roomId);
            
            // 메시지를 즉시 전송하여 상황 인지
            io.to(socket.roomId).emit('bomb all words used', { 
                message: '⚠️ 모든 단어 소진! 더 이상 입력할 단어가 없습니다! ⚠️\n폭탄이 곧 폭발합니다!' 
            });

            // 2.5초 후 폭발 (상황 파악 및 마지막 단어 확인 시간)
            setTimeout(() => {
                const currentRoom = gameRooms[socket.roomId];
                if (currentRoom && currentRoom.status === 'playing') {
                    explodeBomb(socket.roomId);
                }
            }, 2500);
            return; 
        }

        // 끄투 스타일: 1초 대기 후 다음 사람에게 턴 전환
        setTimeout(() => {
            const currentRoom = gameRooms[socket.roomId];
            if (currentRoom && currentRoom.status === 'playing') {
                room.bombGame.currentTurnId = nextPId;
                io.to(socket.roomId).emit('bomb turn changed', {
                    nextTurnId: nextPId
                });
                startTurnTimeout(socket.roomId); // 다음 사람 턴 타이머 시작

                // 메인 타이머 재개 (남은 시간부터 이어서)
                room.bombGame.timerInterval = setInterval(() => {
                    const currentRoom = gameRooms[socket.roomId];
                    if (!currentRoom || !currentRoom.bombGame) {
                        clearInterval(room.bombGame.timerInterval);
                        room.bombGame.timerInterval = null;
                        return;
                    }

                    room.bombGame.timeLeft--;

                    if (room.bombGame.timeLeft > 0) {
                        io.to(socket.roomId).emit('bomb timer tick', { 
                            timeLeft: room.bombGame.timeLeft,
                            showTimer: room.bombGameConfig.showTimer
                        });
                    } else {
                        clearBombTimer(socket.roomId);
                        explodeBomb(socket.roomId);
                    }
                }, 1000);
            }
        }, 1000);
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

    socket.on('disconnect', () => {
        const roomId = socket.roomId;
        const room = gameRooms[roomId];
        if (!room || room.mode !== 'bomb' || room.status === 'WAITING') return;

        if (room.bombGame && room.bombGame.currentTurnId === socket.id) {
            // 현재 턴인 사람이 나간 경우 즉시 폭발 처리
            clearBombTimer(roomId);
            explodeBomb(roomId);
        }
    });

};
