// public/js/bomb.js
(function () {
    const bombContainer = document.getElementById('bomb-container');
    const bombInputArea = document.getElementById('bomb-input-area');
    const bombWordInput = document.getElementById('bomb-word-input');
    const bombCategory = document.getElementById('bomb-theme-display');
    const bombTimerText = document.getElementById('bomb-timer-text');
    const bombCurrentTurn = document.getElementById('bomb-current-turn');
    const bombUsedWordsList = document.getElementById('bomb-words-list');
    const bombResultMsg = document.getElementById('bomb-result-msg');
    const bombRoundResult = document.getElementById('bomb-round-result');
    const bombGraphic = document.getElementById('bomb-graphic');

    const startGameBombBtn = document.getElementById('start-game-bomb');
    const openSettingsBombBtn = document.getElementById('open-settings-bomb');
    const nextBombRoundBtn = document.getElementById('next-bomb-round-btn');
    const returnLobbyBtns = document.querySelectorAll('.return-lobby-btn');

    const resultModal = document.getElementById('result-modal');
    const resultTitle = document.getElementById('result-title');
    const resultWinner = document.getElementById('result-winner');
    const resultStatsBody = document.getElementById('result-stats-body');
    const resultStatHeader1 = document.getElementById('result-stat-header-1');
    const resultStatHeader2 = document.getElementById('result-stat-header-2');
    const closeResultBtn = document.getElementById('close-result-btn');

    let isMyTurn = false;
    let localIsHost = false;
    let currentBombUsers = [];
    let data_message_cache = "";
    let bombMaxHearts = 3; // 실제 설정값 추적

    function getCirclePosition(index, total, radiusPx) {
        const angle = (2 * Math.PI * index / total) - (Math.PI / 2); // 12시 방향 시작
        const x = Math.cos(angle) * radiusPx;
        const y = Math.sin(angle) * radiusPx;
        return { x, y };
    }

    window.initBombUI = function (isHost) {
        localIsHost = isHost;
        const setupArea = bombContainer.querySelector('.bomb-setup');
        const waitingArea = bombContainer.querySelector('.bomb-waiting');
        const playerUI = bombContainer.querySelector('.bomb-player-ui');

        window.currentBombTurnId = null; // 초기화

        if (isHost) {
            setupArea.style.display = 'block';
            if (waitingArea) waitingArea.style.display = 'none';
        } else {
            setupArea.style.display = 'none';
            if (waitingArea) waitingArea.style.display = 'block';
        }

        if (playerUI) playerUI.style.display = 'none';
        bombInputArea.style.display = 'none';
        bombRoundResult.style.display = 'none';

        // 사이드바 복구
        const sidebar = document.getElementById('right-sidebar');
        if (sidebar) sidebar.classList.remove('bomb-game-active');

        if (bombCategory) bombCategory.textContent = "방장이 게임을 시작하기를 기다리는 중...";
        if (bombTimerText) bombTimerText.style.display = 'none';
        if (bombCurrentTurn) bombCurrentTurn.textContent = "";
        if (bombUsedWordsList) bombUsedWordsList.innerHTML = '';
        if (bombGraphic) {
            bombGraphic.className = 'bomb-idle';
            bombGraphic.innerHTML = '💣';
        }

        const scoreDisplay = document.getElementById('bomb-scores-display');
        if (scoreDisplay) scoreDisplay.style.display = 'none';
    };

    window.renderBombUsers = function (users) {
        currentBombUsers = users;
        const arenaPlayers = document.getElementById('bomb-arena-players');
        if (!arenaPlayers) return;
        arenaPlayers.innerHTML = '';

        const radius = 180; // px
        const isGameActive = window.currentBombTurnId !== undefined && window.currentBombTurnId !== null;

        users.forEach((user, index) => {
            const pos = getCirclePosition(index, users.length, radius);
            const slot = document.createElement('div');
            slot.className = 'arena-player-slot';
            slot.dataset.playerId = user.id;

            if (user.id === socket.id) slot.classList.add('is-me');
            if (isGameActive && window.currentBombTurnId === user.id) slot.classList.add('is-turn');

            const heartCount = (window.bombHearts && window.bombHearts[user.id] !== undefined)
                ? window.bombHearts[user.id]
                : bombMaxHearts;
            const isDead = heartCount <= 0;
            if (isGameActive && isDead) slot.classList.add('is-dead');

            // 하트 HTML
            let heartsHtml = '';
            if (isGameActive) {
                for (let i = 0; i < bombMaxHearts; i++) {
                    heartsHtml += (i < heartCount) ? '❤️' : '🖤';
                }
            }

            slot.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
            slot.innerHTML = `
                <div class="arena-avatar-wrap">
                    <div class="arena-avatar">${user.avatar}</div>
                    <div class="arena-dead-overlay">💀</div>
                </div>
                <div class="arena-player-name">${user.isHost ? '👑' : ''}${user.name}</div>
                ${isGameActive ? `<div class="arena-hearts">${heartsHtml}</div>` : ''}
            `;
            arenaPlayers.appendChild(slot);
        });

        // 기존 사이드바용 렌더링 (호환성 유지용 - 필요시 주석 해제)
        // const userGrid = document.getElementById('user-grid');
        // if (userGrid) { ... }
    };

    if (openSettingsBombBtn) {
        openSettingsBombBtn.addEventListener('click', () => {
            window.openSettingsModal('bomb', (settings) => {
                window.bombSelectedCategories = settings.selectedCategories;
                if (window.showToast) window.showToast('설정이 저장되었습니다!', 'success');
            });
        });
    }

    if (startGameBombBtn) {
        startGameBombBtn.addEventListener('click', () => {
            const hHearts = parseInt(document.getElementById('bomb-hearts')?.value || '3');
            const hSubMode = document.getElementById('bomb-sub-mode')?.value || 'random';
            const hTimerRange = document.getElementById('bomb-timer-range')?.value || 'medium';
            const hShowTimerStr = document.getElementById('bomb-show-timer')?.value || 'true';

            if (!window.bombSelectedCategories || window.bombSelectedCategories.length === 0) {
                if (window.showToast) window.showToast('최소 한 개의 카테고리를 선택해야 합니다!', 'warning');
                return;
            }

            socket.emit('setup bomb game', {
                hearts: hHearts,
                subMode: hSubMode,
                timerRange: hTimerRange,
                showTimer: (hShowTimerStr === 'true'),
                selectedCategories: window.bombSelectedCategories
            });
        });
    }

    if (nextBombRoundBtn) {
        nextBombRoundBtn.addEventListener('click', () => {
            socket.emit('next bomb round');
        });
    }

    returnLobbyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (window.gameType !== 'bomb') return;
            if (!localIsHost) return;
            socket.emit('return to lobby from bomb');
        });
    });

    bombWordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && isMyTurn) {
            const word = bombWordInput.value.trim();
            if (word) {
                socket.emit('submit bomb word', word);
                bombWordInput.value = '';
            }
        }
    });

    socket.on('bomb hearts updated', (data) => {
        const hearts = data.hearts;
        window.bombHearts = hearts;
        bombMaxHearts = data.maxHearts || 3;
        updateBombScoreboard(hearts);
        if (window.renderBombUsers) window.renderBombUsers(currentBombUsers);
    });

    function updateBombScoreboard(hearts) {
        const scoreDisplay = document.getElementById('bomb-scores-display');
        if (!scoreDisplay) return;
        scoreDisplay.style.display = 'none';
        scoreDisplay.innerHTML = '';

        const sortedIds = Object.keys(hearts).sort();
        sortedIds.forEach((pid, index) => {
            const heartCount = hearts[pid];
            const pName = window.playerNames ? (window.playerNames[pid] || '...') : '...';
            const isMe = (pid === socket.id);
            const isDead = (heartCount <= 0);

            const card = document.createElement('div');
            card.className = `player-score-card ${isMe ? 'is-me' : ''} ${isDead ? 'is-dead' : ''}`;

            let heartHtml = '';
            for (let i = 0; i < bombMaxHearts; i++) {
                if (i < heartCount) heartHtml += '❤️';
                else heartHtml += '🖤';
            }

            card.innerHTML = `
                <div class="score-p-idx">${index + 1}</div>
                <div class="score-p-name">${pName}</div>
                <div class="score-p-hearts">${heartHtml}</div>
            `;
            scoreDisplay.appendChild(card);
        });
    }

    function updateTurnInternal(turnId) {
        isMyTurn = (turnId === socket.id);
        if (isMyTurn) {
            if (bombCurrentTurn) {
                bombCurrentTurn.textContent = "당신의 차례입니다!";
                bombCurrentTurn.style.color = "#e74c3c";
            }
            if (bombInputArea) bombInputArea.style.display = 'block';
            if (bombWordInput) bombWordInput.focus();
        } else {
            if (bombCurrentTurn) {
                bombCurrentTurn.textContent = "다른 플레이어가 입력 중입니다...";
                bombCurrentTurn.style.color = "#999";
            }
            if (bombInputArea) bombInputArea.style.display = 'none';
        }
    }

    socket.on('bomb round started', (data) => {
        const setupArea = bombContainer.querySelector('.bomb-setup');
        const waitingArea = bombContainer.querySelector('.bomb-waiting');
        const playerUI = bombContainer.querySelector('.bomb-player-ui');

        if (setupArea) setupArea.style.display = 'none';
        if (waitingArea) waitingArea.style.display = 'none';
        if (playerUI) playerUI.style.display = 'block';

        // 사이드바 숨김
        const sidebar = document.getElementById('right-sidebar');
        if (sidebar) sidebar.classList.add('bomb-game-active');

        bombRoundResult.style.display = 'none';
        if (bombUsedWordsList) bombUsedWordsList.innerHTML = '';
        if (bombCategory) bombCategory.textContent = `주제: ${data.category}`;

        if (bombGraphic) {
            bombGraphic.className = 'bomb-ticking';
            bombGraphic.innerHTML = `
                <div class="bomb-body-wrapper">
                    <div class="bomb-body"></div>
                    <div class="bomb-cap"></div>
                    <div class="bomb-fuse">
                        <div class="bomb-spark"></div>
                    </div>
                </div>
            `;
        }
        window.currentBombTurnId = data.currentTurnId;
        updateTurnInternal(data.currentTurnId);
        if (window.renderBombUsers) window.renderBombUsers(currentBombUsers);
    });

    socket.on('bomb timer tick', (data) => {
        if (bombTimerText) {
            bombTimerText.style.display = 'block';
            bombTimerText.textContent = `${data.timeLeft}초`;
            if (data.timeLeft <= 3) {
                if (bombGraphic) bombGraphic.className = 'bomb-super-fast';
                bombTimerText.style.color = '#e74c3c';
                bombTimerText.style.transform = 'scale(1.3)';
            } else if (data.timeLeft <= 7) {
                if (bombGraphic) bombGraphic.className = 'bomb-fast-ticking';
                bombTimerText.style.color = '#e67e22';
                bombTimerText.style.transform = 'scale(1.1)';
            } else {
                if (bombGraphic) bombGraphic.className = 'bomb-ticking';
                bombTimerText.style.color = '#fff';
                bombTimerText.style.transform = 'scale(1)';
            }
        }
    });

    socket.on('bomb word accepted', (data) => {
        const { word, senderName, reflect } = data;
        const wordSpan = document.createElement('span');
        wordSpan.textContent = word;
        if (bombUsedWordsList) {
            bombUsedWordsList.insertBefore(wordSpan, bombUsedWordsList.firstChild);
            bombUsedWordsList.insertBefore(document.createTextNode(' '), wordSpan.nextSibling);
        }

        if (reflect) {
            showCenterMessage(`🔄 ${senderName}님의 초고속 반사!`, '#3498db');
        }

        // 턴 전환은 'bomb turn changed' 이벤트를 기다림
    });

    socket.on('bomb turn changed', (data) => {
        const { nextTurnId } = data;
        window.currentBombTurnId = nextTurnId;
        updateTurnInternal(nextTurnId);
        if (window.renderBombUsers) window.renderBombUsers(currentBombUsers);
    });

    socket.on('bomb invalid word', (msg) => {
        if (window.showToast) window.showToast(msg, 'error');
    });

    socket.on('bomb all words used', (data) => {
        showCenterMessage(data.message, '#e74c3c');
    });

    socket.on('bomb exploded', (data) => {
        const { loserId, loserName, message, isGameOver, winner, stats, revealWord } = data;

        document.body.classList.add('bomb-screen-flash');
        setTimeout(() => document.body.classList.remove('bomb-screen-flash'), 500);

        if (bombGraphic) {
            bombGraphic.className = 'bomb-idle';
            bombGraphic.innerHTML = isGameOver ? '<span style="font-size: 5rem;">🏆</span>' : '<span style="font-size: 5rem;">💥</span>';
        }
        if (bombTimerText) bombTimerText.style.display = 'none';

        if (bombResultMsg) {
            bombResultMsg.textContent = message;
            // 남은 단어 힌트 표시
            if (revealWord) {
                const hintEl = document.createElement('div');
                hintEl.style.cssText = 'margin-top: 10px; font-size: 0.95rem; color: #f1c40f; opacity: 0.85;';
                hintEl.textContent = `💡 남은 단어: ${revealWord}`;
                bombResultMsg.appendChild(hintEl);
            }
        }
        data_message_cache = bombResultMsg ? bombResultMsg.innerHTML : message;
        if (bombRoundResult) bombRoundResult.style.display = 'block';

        if (isGameOver) {
            setTimeout(() => {
                if (!resultModal) return;
                resultTitle.textContent = "게임 종료";
                resultWinner.innerHTML = `승자: <span style="font-size: 2rem;">${winner.name}</span>`;
                if (resultStatHeader1) resultStatHeader1.textContent = "남은 하트";
                if (resultStatHeader2) resultStatHeader2.textContent = "상태";

                resultStatsBody.innerHTML = '';
                if (stats) {
                    stats.forEach(stat => {
                        const tr = document.createElement('tr');
                        const isWinner = winner && stat.id === winner.id;
                        tr.innerHTML = `
                            <td style="padding:15px;">${stat.id === socket.id ? '<b>(나) </b>' : ''}${stat.name}</td>
                            <td style="padding:15px; font-weight:bold; color:#e67e22;">${stat.hearts}개</td>
                            <td style="padding:15px; color:${stat.hearts > 0 ? '#2ecc71' : '#999'};">${stat.hearts > 0 ? '생존' : '탈락'}</td>
                        `;
                        if (isWinner) tr.style.backgroundColor = 'rgba(241, 196, 15, 0.1)';
                        resultStatsBody.appendChild(tr);
                    });
                }
                resultModal.style.display = 'block';
                if (closeResultBtn) {
                    closeResultBtn.onclick = () => {
                        resultModal.style.display = 'none';
                        if (localIsHost) socket.emit('return to lobby from bomb');
                    };
                }
            }, 1500);
        }
    });

    function showCenterMessage(text, color) {
        let msgEl = document.getElementById('bomb-center-message');
        if (!msgEl) {
            msgEl = document.createElement('div');
            msgEl.id = 'bomb-center-message';
            bombContainer.appendChild(msgEl);
        }
        // \n을 <br>로 변환하여 줄바꿈 지원
        msgEl.innerHTML = text.replace(/\n/g, '<br>');
        msgEl.style.color = color;
        msgEl.style.opacity = '1';
        msgEl.style.display = 'block';

        setTimeout(() => {
            msgEl.style.opacity = '0';
            setTimeout(() => { msgEl.style.display = 'none'; }, 500);
        }, 3000); // 3초 동안 표시
    }

    socket.on('bomb next round countdown', (countdown) => {
        if (bombResultMsg) {
            bombResultMsg.innerHTML = `${data_message_cache}<br><span style="color: #f1c40f; font-size: 0.9rem; margin-top: 10px; display: block;">⏳ ${countdown}초 후 자동으로 다음 라운드가 시작됩니다.</span>`;
        }
    });

    function showSpeechBubble(playerId, text) {
        // 게임이 활성 상태인지 확인
        const playerUI = bombContainer.querySelector('.bomb-player-ui');
        if (!playerUI || playerUI.style.display !== 'block') return;

        const slot = document.querySelector(`#bomb-arena-players .arena-player-slot[data-player-id="${playerId}"]`);
        if (!slot) return;

        // 기존 말풍선 제거
        const existing = slot.querySelector('.speech-bubble');
        if (existing) existing.remove();

        const bubble = document.createElement('div');
        bubble.className = 'speech-bubble';
        // 텍스트 최대 20자 제한
        bubble.textContent = text.length > 20 ? text.slice(0, 20) + '…' : text;
        slot.appendChild(bubble);

        // 3초 후 페이드아웃 제거
        setTimeout(() => {
            bubble.style.opacity = '0';
            setTimeout(() => { if (bubble.parentNode) bubble.remove(); }, 400);
        }, 3000);
    }

    socket.on('chat message', (data) => {
        if (data.socketId) {
            showSpeechBubble(data.socketId, data.message);
        }
    });

    window.updateBombRoleUI = function (isHost) {
        localIsHost = isHost;
        const setupArea = bombContainer.querySelector('.bomb-setup');
        const waitingArea = bombContainer.querySelector('.bomb-waiting');
        const playerUI = bombContainer.querySelector('.bomb-player-ui');

        // 게임이 진행 중인지 확인 (player-ui가 보이는지)
        const isGamePlaying = playerUI && playerUI.style.display === 'block';

        if (!isGamePlaying) {
            if (isHost) {
                if (setupArea) setupArea.style.display = 'block';
                if (waitingArea) waitingArea.style.display = 'none';
            } else {
                if (setupArea) setupArea.style.display = 'none';
                if (waitingArea) waitingArea.style.display = 'block';
            }
        }
    };

    socket.on('game changed', (game) => {
        if (game === 'lobby') {
            const scoreDisplay = document.getElementById('bomb-scores-display');
            if (scoreDisplay) scoreDisplay.style.display = 'none';
            window.bombHearts = null;
            window.currentBombTurnId = null; // 게임 상태 초기화
            window.initBombUI(localIsHost);
        }
    });

})();
