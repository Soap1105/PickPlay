// public/js/bomb.js

(function () {
    // UI Elements
    const bombContainer = document.getElementById('bomb-container');
    const bombSetup = bombContainer.querySelector('.bomb-setup');
    const bombWaiting = bombContainer.querySelector('.bomb-waiting');
    const bombPlayerUI = bombContainer.querySelector('.bomb-player-ui');
    const bombScoresDisplay = document.getElementById('bomb-scores-display');
    const bombThemeDisplay = document.getElementById('bomb-theme-display');
    const bombCurrentTurn = document.getElementById('bomb-current-turn');
    const bombInputArea = document.getElementById('bomb-input-area');
    const bombWordInput = document.getElementById('bomb-word-input');
    const bombWordsList = document.getElementById('bomb-words-list');
    const bombGraphic = document.getElementById('bomb-graphic');
    const bombTimerText = document.getElementById('bomb-timer-text');
    const bombRoundResult = document.getElementById('bomb-round-result');
    const bombResultMsg = document.getElementById('bomb-result-msg');
    const bombCategoryList = document.getElementById('bomb-category-list');

    // Buttons
    const startBombBtn = document.getElementById('start-bomb-btn');
    const nextBombRoundBtn = document.getElementById('next-bomb-round-btn');
    const returnLobbyBtns = document.querySelectorAll('.return-lobby-btn');

    // Result Modal Elements
    const resultModal = document.getElementById('result-modal');
    const resultTitle = document.getElementById('result-title');
    const resultWinner = document.getElementById('result-winner');
    const resultStatsBody = document.getElementById('result-stats-body');
    const resultStatHeader1 = document.getElementById('result-stat-header-1');
    const resultStatHeader2 = document.getElementById('result-stat-header-2');
    const closeResultBtn = document.getElementById('close-result-btn');

    let isMyTurn = false;
    let localIsHost = false;
    window.bombWinTarget = 3; // 기본값
    window.bombScores = {};
    let currentBombUsers = []; // 현재 유저 목록 캐싱

    // 초기화 함수 (room.js에서 호출)
    window.initBombUI = function (isHost) {
        localIsHost = isHost;
        updateBombRoleUI(isHost);

        // 초기화
        bombPlayerUI.style.display = 'none';
        bombRoundResult.style.display = 'none';
        bombThemeDisplay.textContent = '주제: ';
        bombWordsList.innerHTML = '';
        bombGraphic.className = 'bomb-idle';
        bombGraphic.textContent = '💣';
    };

    // 역할별 UI 처리
    window.updateBombRoleUI = function (isHost) {
        localIsHost = isHost;
        if (window.gameType !== 'bomb') return;

        if (localIsHost) {
            bombSetup.style.display = 'block';
            bombWaiting.style.display = 'none';
            // 카테고리 목록 요청
            socket.emit('request bomb categories');
        } else {
            bombSetup.style.display = 'none';
            bombWaiting.style.display = 'block';
        }
    };

    // 참여자 목록 렌더링 (room.js에서 호출)
    window.renderBombUsers = function (users, isHost) {
        currentBombUsers = users; // 최신 유저 목록 저장

        // [디버깅] 렌더링 시점의 점수 데이터 확인
        console.log("렌더링 유저 목록 - 현재 점수판:", window.bombScores);

        const userGrid = document.getElementById('user-grid');
        userGrid.innerHTML = '';

        users.forEach(user => {
            const userDiv = document.createElement('div');
            userDiv.className = 'user-card player-card';

            // 현재 턴 강조
            if (window.currentBombTurnId === user.id) {
                userDiv.classList.add('is-turn');
            }

            const isMe = user.id === socket.id;
            if (isMe) userDiv.classList.add('is-me');

            const hostIcon = user.isHost ? '👑' : '';
            const statusIcon = isMe && isMyTurn ? '🔥' : '';

            // 점수 도트(Dots) 생성 로직
            const score = (window.bombScores && window.bombScores[user.id]) || 0;
            const target = window.bombWinTarget || 3;

            let dotsHTML = '<div class="bomb-progress">';
            for (let i = 0; i < target; i++) {
                dotsHTML += `<div class="progress-dot ${i < score ? 'filled' : ''}"></div>`;
            }
            dotsHTML += '</div>';

            userDiv.innerHTML = `
                <div class="avatar-wrapper">
                    <div class="avatar">${user.avatar}</div>
                </div>
                <div class="user-info">
                    <div class="nickname">${hostIcon} ${user.name} ${statusIcon}</div>
                    <div class="status-row">
                        ${dotsHTML}
                    </div>
                </div>
            `;
            userGrid.appendChild(userDiv);
        });
    };

    // 방장: 게임 시작 버튼
    if (startBombBtn) {
        startBombBtn.addEventListener('click', () => {
            const winTarget = document.getElementById('bomb-win-target').value;
            const showTimer = document.getElementById('bomb-show-timer').checked;
            const timeLimit = document.getElementById('bomb-timer-range').value;

            // 선택된 카테고리 수집
            const selectedCategories = [];
            const checkboxes = document.querySelectorAll('input[name="bomb-category"]:checked');
            checkboxes.forEach(cb => selectedCategories.push(cb.value));

            socket.emit('setup bomb game', {
                roomId: window.roomId,
                winTarget: parseInt(winTarget),
                timeLimit: timeLimit,
                showTimer: showTimer,
                selectedCategories: selectedCategories
            });
        });
    }

    // 다음 라운드 버튼
    if (nextBombRoundBtn) {
        nextBombRoundBtn.addEventListener('click', () => {
            socket.emit('next bomb round');
        });
    }

    // 대기실 복귀 버튼들
    returnLobbyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (localIsHost) {
                if (confirm('대기실로 돌아가 새로운 게임을 준비하시겠습니까?')) {
                    socket.emit('return to lobby from bomb');
                }
            } else {
                if (window.showToast) window.showToast('방장만 대기실로 복귀할 수 있습니다.', 'info');
                else alert('방장만 복귀 가능합니다.');
            }
        });
    });

    // 결과 모달 닫기 버튼
    if (closeResultBtn) {
        closeResultBtn.onclick = () => {
            resultModal.style.display = 'none';
            if (localIsHost) {
                socket.emit('return to lobby from bomb');
            }
        };
    }

    // 단어 입력 처리
    bombWordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && isMyTurn) {
            const word = bombWordInput.value.trim();
            if (word) {
                socket.emit('submit bomb word', word);
                bombWordInput.value = '';
            }
        }
    });

    // --- 소켓 이벤트 핸들링 ---

    socket.on('bomb categories', (categories) => {
        if (!bombCategoryList) return;
        bombCategoryList.innerHTML = '';

        if (categories.length === 0) {
            bombCategoryList.innerHTML = '<span style="color: #999; font-size: 0.9rem;">사용 가능한 주제가 없습니다.</span>';
            return;
        }

        categories.forEach(cat => {
            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.gap = '5px';
            label.style.background = 'white';
            label.style.padding = '5px 10px';
            label.style.borderRadius = '5px';
            label.style.border = '1px solid #ddd';
            label.style.cursor = 'pointer';
            label.style.fontSize = '0.9rem';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.name = 'bomb-category';
            checkbox.value = cat;
            checkbox.checked = true; // 기본적으로 전체 선택

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(cat));
            bombCategoryList.appendChild(label);
        });
    });

    socket.on('bomb win target updated', (target) => {
        window.bombWinTarget = target;
    });

    socket.on('bomb scores updated', (scores, target) => {
        console.log("점수 업데이트 수신:", scores, "목표:", target);
        window.bombScores = scores; // 전역 점수 저장
        if (target) window.bombWinTarget = target;

        const msg = "🏆 목표: " + window.bombWinTarget + "승";
        bombScoresDisplay.textContent = msg;

        // 중요: 점수가 바뀌었으므로 캐싱된 유저 목록을 사용해 즉시 다시 그리기
        if (currentBombUsers.length > 0) {
            window.renderBombUsers(currentBombUsers, localIsHost);
        }
    });

    socket.on('bomb round started', (data) => {
        bombSetup.style.display = 'none';
        bombWaiting.style.display = 'none';
        bombPlayerUI.style.display = 'block';
        bombRoundResult.style.display = 'none';

        bombThemeDisplay.textContent = '💡 주제: ' + data.category;
        window.currentBombTurnId = data.currentTurnId;

        bombWordsList.innerHTML = '';
        bombGraphic.className = 'bomb-ticking';
        bombGraphic.textContent = '💣';

        // 타이머 텍스트 설정 (먼저 보이고 안보이고 결정)
        bombTimerText.style.display = data.showTimer ? 'block' : 'none';
        if (data.showTimer) bombTimerText.textContent = "준비!";

        updateTurnInternal(data.currentTurnId);

        // 서버에 전체 유저 리스트 요청해서 갱신 (턴 강조를 위해)
        socket.emit('request update user list');
    });

    socket.on('game changed', (mode) => {
        if (mode === 'lobby') {
            console.log("[Bomb] Game changed to lobby. Clearing scores.");
            window.bombScores = {};
            // 유저 그리드에서 도트가 지워지도록 즉시 재렌더링
            if (currentBombUsers.length > 0) {
                window.renderBombUsers(currentBombUsers, localIsHost);
            }
        }
    });

    socket.on('bomb timer tick', (data) => {
        if (data.showTimer) {
            bombTimerText.style.display = 'block'; // 매 티킹마다 보장
            bombTimerText.textContent = data.timeLeft + "초";
        } else {
            bombTimerText.style.display = 'none';
        }

        // 시간이 얼마 안 남았을 때 (빨라지는 연출)
        if (data.timeLeft <= 10) {
            bombGraphic.className = 'bomb-fast-ticking';
        } else {
            bombGraphic.className = 'bomb-ticking';
        }
    });

    socket.on('bomb word accepted', (data) => {
        // 단어 리스트에 추가
        const wordSpan = document.createElement('span');
        wordSpan.textContent = data.word;
        bombWordsList.prepend(wordSpan);

        // 턴 넘기기
        window.currentBombTurnId = data.nextTurnId;
        updateTurnInternal(data.nextTurnId);

        // 참여자 목록 갱신
        socket.emit('request update user list');

        // 시스템 메시지처럼 살짝 표시 (채팅 등 활용 가능)
        console.log(`${data.senderName}: ${data.word} 통과!`);
    });

    socket.on('bomb invalid word', (msg) => {
        // 토스트 알림 (common.js에 있다고 가정)
        if (window.showToast) {
            window.showToast(msg, 'warning');
        } else {
            alert(msg);
        }
        bombWordInput.value = '';
    });

    socket.on('bomb exploded', (data) => {
        isMyTurn = false;
        bombInputArea.style.display = 'none';
        bombGraphic.textContent = data.isGameOver ? '🏆' : '💥';
        bombGraphic.className = 'bomb-idle';
        bombTimerText.style.display = 'none';

        bombResultMsg.textContent = data.message;
        bombRoundResult.style.display = 'block';

        if (data.isGameOver) {
            showBombResultModal(data.winner, data.stats);
        }

        if (localIsHost) {
            if (data.isGameOver) {
                // 게임 종료 시에는 대기실 버튼만 (또는 재시작 로직 추가 가능)
                nextBombRoundBtn.style.display = 'none';
            } else {
                nextBombRoundBtn.style.display = 'inline-block';
            }
        }

        // 패배자 전용 연출 (진동 등 가능)
        if (data.loserId === socket.id) {
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        }
    });

    function updateTurnInternal(turnId) {
        isMyTurn = (turnId === socket.id);

        if (isMyTurn) {
            bombCurrentTurn.textContent = "👉 당신의 차례입니다! 빨리 입력하세요!";
            bombCurrentTurn.style.color = "#e74c3c";
            bombInputArea.style.display = 'block';
            bombWordInput.focus();
        } else {
            bombCurrentTurn.textContent = "⏳ 다른 플레이어가 입력 중입니다...";
            bombCurrentTurn.style.color = "#333";
            bombInputArea.style.display = 'none';
        }
    }

    function showBombResultModal(winner, stats) {
        if (!resultModal) return;

        resultTitle.textContent = "💣 주제 폭탄돌리기 종료 💣";
        resultWinner.innerHTML = `🏆 최종 승자: <span style="font-size: 2rem;">${winner.name}</span> 🏆`;

        // 헤더 텍스트 변경
        if (resultStatHeader1) resultStatHeader1.textContent = "최종 승수";
        if (resultStatHeader2) resultStatHeader2.textContent = "-";

        resultStatsBody.innerHTML = '';
        if (stats) {
            stats.forEach(stat => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = "1px solid #eee";
                tr.innerHTML = `
                    <td style="padding:15px;">${stat.id === socket.id ? '<b>(나) </b>' : ''}${stat.name}</td>
                    <td style="padding:15px; font-weight:bold; color:#e67e22;">${stat.score}승</td>
                    <td style="padding:15px; color:#999;">-</td>
                `;
                if (stat.id === winner.id) tr.style.backgroundColor = '#fff9c4';
                resultStatsBody.appendChild(tr);
            });
        }

        resultModal.style.display = 'block';

        // 확인 버튼 처리: 호스트가 누르면 대기실로 복귀
        if (closeResultBtn) {
            closeResultBtn.onclick = () => {
                resultModal.style.display = 'none';
                if (localIsHost) {
                    socket.emit('return to lobby from bomb');
                }
            };
        }
    }

})();
