const fs = require('fs');

// 1. bomb.js 롤백
let js = fs.readFileSync('public/js/bomb.js', 'utf8');

// runBombInitialRoulette 함수 삭제
js = js.replace(/    let rouletteTimer = null;[\s\S]*?executeStep\(\);\s*\}\r?\n/, '');

// bomb round started 내부 룰렛 호출을 깔끔한 즉시 시작으로 원복
const roundStartNew = `        const rouletteDuration = data.rouletteDuration || (data.roundCount === 1 ? 3500 : 2000);

        isCountingDownClient = true;
        updateTurnInternal(null); // 룰렛 중에는 입력 잠금

        function startRouletteSequence() {
            switchCoreMode('normal');
            runBombInitialRoulette(data.currentTurnId, rouletteDuration, () => {
                isCountingDownClient = false;
                updateTurnInternal(data.currentTurnId);
                updateCoreDisplay(null, data.currentTurnId);
                if (window.renderBombUsers) window.renderBombUsers(window.roomPlayers);
            });
        }

        if (data.isSuperIntro) {
            // 슈퍼 폭탄 인트로: 2초간 DANGER 브리핑 후 룰렛 시작
            switchCoreMode('super-intro');
            countdownLockTimer = setTimeout(() => {
                startRouletteSequence();
            }, 2000);
        } else {
            startRouletteSequence();
        }`;

const roundStartClean = `        if (data.isSuperIntro) {
            // 슈퍼 폭탄 진입 라운드: 2초간 DANGER 브리핑 후 시작
            switchCoreMode('super-intro');
            isCountingDownClient = true;
            if (window.renderBombUsers) window.renderBombUsers(window.roomPlayers);
            updateTurnInternal(data.currentTurnId);

            countdownLockTimer = setTimeout(() => {
                isCountingDownClient = false;
                switchCoreMode('normal');
                updateTurnInternal(window.currentBombTurnId);
            }, 2000);
        } else {
            isCountingDownClient = false;
            switchCoreMode('normal');
            positionBombAtPlayer(data.currentTurnId);
            if (window.renderBombUsers) window.renderBombUsers(window.roomPlayers);
            updateTurnInternal(data.currentTurnId);
        }`;

js = js.replace(roundStartNew.replace(/\r\n/g, '\n'), roundStartClean.replace(/\r\n/g, '\n'));
fs.writeFileSync('public/js/bomb.js', js.replace(/\n/g, '\r\n'), 'utf8');
console.log('Rolled back bomb.js');

// 2. bomb.css 롤백
let css = fs.readFileSync('public/css/bomb.css', 'utf8');
css = css.replace(/\/\* 룰렛 순환 시 아바타 포커스 하이라이트 \*\/[\s\S]*?\.arena-player-slot\.roulette-highlight[\s\S]*?\}\r?\n/, '');
fs.writeFileSync('public/css/bomb.css', css, 'utf8');
console.log('Rolled back bomb.css');

