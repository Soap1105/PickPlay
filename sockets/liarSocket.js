// 임시 하드코딩된 단어 풀 (이후 AI로 대체)
const tempWords = [
    { category: '과일', word: '바나나' },
    { category: '동물', word: '사자' },
    { category: '직업', word: '경찰관' },
    { category: '영화', word: '해리포터' },
    { category: '국가', word: '대한민국' }
];

module.exports = (io, socket, gameRooms) => {

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
            winTarget: data.winTarget || 3
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

        room.status = 'submission';
        room.liarGame.liarId = null;
        room.liarGame.category = null;
        room.liarGame.word = null;
        room.liarGame.votes = {};
        room.liarGame.submissions = {};

        const picked = tempWords[Math.floor(Math.random() * tempWords.length)];
        room.liarGame.category = picked.category;
        room.liarGame.word = picked.word;

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

        io.to(roomId).emit('system message', `[새 라운드] 제시어를 확인하고 그럴듯한 설명을 한 줄 적어 제출해주세요!`);
        io.to(roomId).emit('game started');
    }



    // 설명 제출
    socket.on('submit description', (desc) => {
        const room = gameRooms[socket.roomId];
        if (!room || room.status !== 'submission') return;

        room.liarGame.submissions[socket.id] = desc;
        const submitterName = room.players[socket.id]?.name || '알수없음';
        io.to(socket.roomId).emit('system message', `${submitterName}님이 설명을 제출했습니다.`);

        // 전원 제출 완료 시
        if (Object.keys(room.liarGame.submissions).length === Object.keys(room.players).length) {
            room.status = 'playing'; // 투표 페이즈 진행

            // 제출 내역 정리 (누가 무엇을 썼는지)
            const submissionList = [];
            for (let id in room.liarGame.submissions) {
                submissionList.push({
                    id: id,
                    name: room.players[id]?.name,
                    desc: room.liarGame.submissions[id]
                });
            }

            io.to(socket.roomId).emit('all submissions received', submissionList);
            io.to(socket.roomId).emit('system message', '모든 설명이 공개되었습니다! 채팅으로 토론한 뒤 라이어를 투표해주세요.');
        }
    });

    // 라이어 지목(투표)
    socket.on('vote liar', (targetId) => {
        const room = gameRooms[socket.roomId];
        if (!room || room.status !== 'playing') return;

        // 투표 기록
        room.liarGame.votes[socket.id] = targetId;
        const voterName = room.players[socket.id]?.name || '알수없음';

        io.to(socket.roomId).emit('system message', `[투표] ${voterName}님이 투표를 완료했습니다.`);
        io.to(socket.roomId).emit('vote updated', room.liarGame.votes); // 중간 결과 UI 업데이트용

        // 전원 투표 완료 시 결과 집계
        if (Object.keys(room.liarGame.votes).length === Object.keys(room.players).length) {
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

                handleRoundEnd(socket.roomId, {
                    message: resultMsg,
                    liarName: room.players[room.liarGame.liarId]?.name,
                    word: room.liarGame.word,
                    citizensWon: false
                });

            } else {
                // 라이어 검거 성공 -> 최후 변론으로 이동
                room.status = 'final_guess';
                io.to(socket.roomId).emit('system message', `🚨 투표 결과, ${room.players[room.liarGame.liarId]?.name}님이 라이어로 검거되었습니다!`);
                io.to(socket.roomId).emit('final guess phase', { liarId: room.liarGame.liarId, liarName: room.players[room.liarGame.liarId]?.name });
            }
        }
    });

    // 라이어 최후 변론 제출
    socket.on('submit final guess', (guessWord) => {
        const room = gameRooms[socket.roomId];
        if (!room || room.status !== 'final_guess') return;
        if (socket.id !== room.liarGame.liarId) return;

        io.to(socket.roomId).emit('system message', `라이어(${room.players[socket.id]?.name})의 최후 정답: "${guessWord}"`);

        let citizensWon = false;
        let resultMsg = "";

        // 정답 판정 (공백 제거 후 일치 비교)
        const isCorrect = (guessWord.trim().toLowerCase() === room.liarGame.word.trim().toLowerCase());

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

        io.to(roomId).emit('round over', resultData);
    }

    socket.on('restart liar game', () => {
        const room = gameRooms[socket.roomId];
        if (!room) return;
        if (room.hostId !== socket.id) return;

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
