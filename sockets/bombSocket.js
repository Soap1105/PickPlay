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
        
        // 타이머 시작 알림 (showTimer 옵션에 따라 다르게 처리할지는 클라이언트에서 결정할 수도 있음)
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
            console.log(`[Bomb] Cleaning up timer for room: ${roomId}`);
            clearInterval(room.bombGame.timerInterval);
            room.bombGame.timerInterval = null;
        }
    }

    // 폭탄 폭발 처리
    function explodeBomb(roomId) {
        const room = gameRooms[roomId];
        if (!room || !room.bombGame) return;

        const loserId = room.bombGame.currentTurnId;
        const loserName = room.players[loserId]?.name || "알 수 없음";
        
        // [서버 로그] 폭탄 폭발 및 점수 처리 시작
        const killerId = room.bombGame.lastSuccessPId;
        let killerName = "";

        console.log(`[Bomb] Exploded! Loser: ${loserName}(${loserId}), Killer: ${killerId}`);

        if (killerId && killerId !== loserId && room.players[killerId]) {
            room.bombGame.scores[killerId] = (room.bombGame.scores[killerId] || 0) + 1;
            killerName = room.players[killerId].name;
            console.log(`[Bomb] Score Granted to ${killerName}. New Score: ${room.bombGame.scores[killerId]}`);
        } else {
            console.log(`[Bomb] No Killer found or killer was the loser or left the room.`);
        }

        const winTarget = room.bombGameConfig.winTarget;
        let finalWinner = null;
        
        // 승리자 체크
        for (let pid in room.bombGame.scores) {
            if (room.bombGame.scores[pid] >= winTarget) {
                finalWinner = { id: pid, name: room.players[pid]?.name };
                break;
            }
        }

        io.to(roomId).emit('bomb scores updated', room.bombGame.scores, winTarget);

        if (finalWinner) {
            room.status = 'WAITING';
            
            // 모든 플레이어의 성적 데이터 생성
            const stats = Object.keys(room.players).map(pid => ({
                id: pid,
                name: room.players[pid].name,
                score: room.bombGame.scores[pid] || 0
            })).sort((a, b) => b.score - a.score);

            io.to(roomId).emit('bomb exploded', {
                loserId: loserId,
                loserName: loserName,
                message: `💥 퍼엉! ${loserName}님이 터졌습니다! 🏆 최종 우승: ${finalWinner.name}!`,
                isGameOver: true,
                winner: finalWinner,
                stats: stats // 결과 모달용 통계 데이터
            });
        } else {
            room.status = 'ROUND_OVER';
            io.to(roomId).emit('bomb exploded', {
                loserId: loserId,
                loserName: loserName,
                message: killerName ? `💥 퍼엉! ${loserName}님이 터졌습니다! (${killerName}님 1점 획득!)` : `💥 퍼엉! ${loserName}님이 터졌습니다!`,
                isGameOver: false
            });
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

        const players = Object.keys(room.players);
        if (players.length < 2) {
            socket.emit('system message', '폭탄 돌리기는 최소 2명 이상이어야 시작할 수 있습니다!');
            return;
        }

        // 설정 저장
        room.bombGameConfig = {
            winTarget: data.winTarget || 3,
            showTimer: data.showTimer !== undefined ? data.showTimer : true,
            timerRange: data.timeLimit || 'medium', // 'short', 'medium', 'long'
            selectedCategories: data.selectedCategories || []
        };

        // 전체 점수 초기화
        room.bombGame = {
            scores: {}
        };
        players.forEach(pid => {
            room.bombGame.scores[pid] = 0;
        });

        // 클라이언트에 초기 승리 조건 및 점수 전송
        io.to(socket.roomId).emit('bomb win target updated', room.bombGameConfig.winTarget);
        io.to(socket.roomId).emit('bomb scores updated', room.bombGame.scores, room.bombGameConfig.winTarget);
        
        startNewRound(socket.roomId);
    });

    // 라운드 시작
    function startNewRound(roomId) {
        const room = gameRooms[roomId];
        if (!room) return;

        const players = Object.keys(room.players);
        if (players.length < 2) return;

        clearBombTimer(roomId);

        // 라운드 데이터 초기화
        room.status = 'playing';
        room.bombGame.usedWords = [];
        room.bombGame.lastSuccessPId = null; // 이번 라운드 마지막 성공자 초기화
        
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
        room.bombGame.wordPool = pickedObj.words;

        // 첫 턴 무작위 선택
        const firstPlayer = players[Math.floor(Math.random() * players.length)];
        room.bombGame.currentTurnId = firstPlayer;

        // 타이머 범위 설정 (short, medium, long)
        let min = 30, max = 55;
        const range = room.bombGameConfig.timerRange;
        if (range === 'short') { min = 15; max = 30; }
        else if (range === 'long') { min = 50; max = 80; }
        else { min = 30; max = 55; }
        const randomDuration = Math.floor(Math.random() * (max - min + 1)) + min;
        
        console.log(`[Bomb] Round started with duration: ${randomDuration}s (Range type: ${range})`);

        io.to(roomId).emit('bomb round started', {
            category: room.bombGame.category,
            currentTurnId: room.bombGame.currentTurnId,
            showTimer: room.bombGameConfig.showTimer
        });

        startBombTimer(roomId, randomDuration);
    }

    // 단어 제출
    socket.on('submit bomb word', (word) => {
        const room = gameRooms[socket.roomId];
        if (!room || room.status !== 'playing') return;
        if (room.bombGame.currentTurnId !== socket.id) return;

        const normalizedInput = word.trim().replace(/\s+/g, '').toLowerCase();
        
        // 정답 여부 확인 (DB의 단어들도 공백 제거 후 비교)
        const matchedWord = room.bombGame.wordPool.find(w => 
            w.trim().replace(/\s+/g, '').toLowerCase() === normalizedInput
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

        const cleanWord = matchedWord; // DB에 있는 표준 명칭 사용

        // 성공!
        room.bombGame.usedWords.push(cleanWord);
        room.bombGame.lastSuccessPId = socket.id; // 현재 성공자를 '마지막 성공자'로 기록
        
        // 다음 사람 결정 (사용자 요구사항 반영: 3인 이상 랜덤)
        const players = Object.keys(room.players);
        let nextPId;
        if (players.length === 2) {
            nextPId = players.find(id => id !== socket.id);
        } else {
            const others = players.filter(id => id !== socket.id);
            nextPId = others[Math.floor(Math.random() * others.length)];
        }

        room.bombGame.currentTurnId = nextPId;

        io.to(socket.roomId).emit('bomb word accepted', {
            word: cleanWord,
            nextTurnId: nextPId,
            senderName: room.players[socket.id].name
        });
    });

    // 라운드 재시작 또는 다음 라운드
    socket.on('next bomb round', () => {
        const room = gameRooms[socket.roomId];
        if (!room || room.hostId !== socket.id) return;
        startNewRound(socket.roomId);
    });

    socket.on('return to lobby from bomb', () => {
        const room = gameRooms[socket.roomId];
        if (!room || room.hostId !== socket.id) return;
        
        console.log(`[Bomb] Room ${socket.roomId} returning to lobby.`);
        clearBombTimer(socket.roomId);
        
        // 게임 데이터 완전 삭제
        delete room.bombGame;
        room.status = 'WAITING';
        
        // 모든 클러이언트의 UI를 로비(테마 선택)로 강제 전환
        io.to(socket.roomId).emit('game changed', 'lobby');
    });

};
