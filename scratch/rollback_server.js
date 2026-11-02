const fs = require('fs');
let c = fs.readFileSync('sockets/bombSocket.js', 'utf8');

const target = `        // 생존자 수에 따른 룰렛 지속 시간 계산 (1R 및 6인 이상: 3.5초 / 4~5인: 2.6초 / 2~3인 서든데스: 2.0초)
        let rouletteDuration = 3500;
        if (round !== 1) {
            if (players.length < 4) {
                rouletteDuration = 2000;
            } else if (players.length < 6) {
                rouletteDuration = 2600;
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
        }, totalDelay);`;

const repl = `        io.to(roomId).emit('bomb round started', {
            category: room.bombGame.category,
            currentTurnId: room.bombGame.currentTurnId,
            showTimer: room.bombGameConfig.showTimer,
            roundCount: round,
            isSuperBomb: superInfo.isSuper,
            isSuperIntro: superInfo.isIntro,
            maxTime: randomDuration,
            timeLeft: randomDuration,
            hearts: room.bombGame.hearts,
            maxHearts: room.bombGameConfig.maxHearts
        });

        if (superInfo.isIntro) {
            // 슈퍼 폭탄 등장 라운드 (3, 6, 9, 12, 13R): 2초 동안 타임스톱 락 후 시작
            room.bombGame.isCountingDown = true;
            room.bombGame.startDelayTimeout = setTimeout(() => {
                const currentRoom = gameRooms[roomId];
                if (!currentRoom || currentRoom.status !== 'playing' || !currentRoom.bombGame) return;
                currentRoom.bombGame.startDelayTimeout = null;
                currentRoom.bombGame.isCountingDown = false;
                currentRoom.bombGame.turnStartTime = Date.now();
                startBombTimer(roomId, randomDuration);
                startTurnTimeout(roomId);
            }, 2000);
        } else {
            // 일반 라운드는 즉시 가동
            room.bombGame.isCountingDown = false;
            startBombTimer(roomId, randomDuration);
            startTurnTimeout(roomId);
        }`;

c = c.replace(target.replace(/\r\n/g, '\n'), repl.replace(/\r\n/g, '\n'));
fs.writeFileSync('sockets/bombSocket.js', c.replace(/\n/g, '\r\n'), 'utf8');
console.log('Rolled back bombSocket.js');

