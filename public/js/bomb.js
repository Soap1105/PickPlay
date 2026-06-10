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
    let selectedTargetId = null;
    let currentSubMode = 'random';
    let redThreshold = 3;
    let fastThreshold = 7;
    let lastBombSettings = { hearts: 3, subMode: 'random', showTimer: true, timerRange: 'medium', selectedCategories: [] };

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

        // [이슈 28 해결] 폭탄 돌리기 구식 대기 영역 강제 비활성화
        if (setupArea) setupArea.style.display = 'none';
        if (waitingArea) waitingArea.style.display = 'none';

        // 최신 대기방 화면으로 뒷배경 안전 복구
        if (window.gameType === 'bomb' && typeof showContainer === 'function') {
            showContainer('lobby-container');
            const stageSelection = document.getElementById('selection-stage');
            const stageWaiting = document.getElementById('waiting-stage');
            if (stageSelection) stageSelection.style.display = 'none';
            if (stageWaiting) stageWaiting.style.display = 'flex';
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

        updateBombLobbySettingsUI(lastBombSettings);
    };

    window.renderBombUsers = function (users) {
        const finalUsers = (users && users.length > 0) ? users : (window.roomPlayers || []);
        currentBombUsers = finalUsers;
        const arenaPlayers = document.getElementById('bomb-arena-players');
        if (!arenaPlayers) return;
        arenaPlayers.innerHTML = '';

        const radius = 180; // px
        const isGameActive = window.currentBombTurnId !== undefined && window.currentBombTurnId !== null;

        finalUsers.forEach((user, index) => {
            const pos = getCirclePosition(index, finalUsers.length, radius);
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

            // 전략 모드 지목 GUI 관련 클래스 추가
            if (isGameActive && currentSubMode === 'tactical' && isMyTurn && user.id !== socket.id && !isDead) {
                slot.classList.add('is-selectable');
                if (selectedTargetId === user.id) {
                    slot.classList.add('is-targeted');
                }
            }

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

            socket.emit('setup bomb game', {
                hearts: hHearts,
                subMode: hSubMode,
                timerRange: hTimerRange,
                showTimer: (hShowTimerStr === 'true'),
                selectedCategories: window.bombSelectedCategories || []
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
            let word = bombWordInput.value.trim();
            if (word) {
                if (currentSubMode === 'tactical' && selectedTargetId) {
                    const sortedIds = Object.keys(window.bombHearts || {}).sort();
                    const idx = sortedIds.indexOf(selectedTargetId);
                    if (idx !== -1) {
                        word = `${word} ${idx + 1}`;
                    }
                }
                socket.emit('submit bomb word', word);
                bombWordInput.value = '';
                bombWordInput.disabled = true; // [1-5 버그 해결] 즉시 비활성화하여 딜레이 동안의 추가 입력 방지
            }
        }
    });

    const arenaPlayers = document.getElementById('bomb-arena-players');
    if (arenaPlayers) {
        arenaPlayers.addEventListener('click', (e) => {
            if (!isMyTurn || currentSubMode !== 'tactical') return;

            const slot = e.target.closest('.arena-player-slot');
            if (!slot) return;

            const targetId = slot.dataset.playerId;
            if (targetId === socket.id) return; // 자신 지목 불가

            const heartCount = (window.bombHearts && window.bombHearts[targetId] !== undefined)
                ? window.bombHearts[targetId]
                : bombMaxHearts;
            if (heartCount <= 0) return; // 탈락자 지목 불가

            if (selectedTargetId === targetId) {
                selectedTargetId = null; // 지목 해제 (토글)
            } else {
                selectedTargetId = targetId;
            }

            if (window.renderBombUsers) window.renderBombUsers(window.roomPlayers);
        });
    }

    socket.on('bomb hearts updated', (data) => {
        const hearts = data.hearts;
        window.bombHearts = hearts;
        bombMaxHearts = data.maxHearts || 3;
        updateBombScoreboard(hearts);
        if (window.renderBombUsers) window.renderBombUsers(window.roomPlayers);
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
        
        // 내 턴이 돌아올 때마다 지목 타깃은 깨끗하게 무조건 초기화 (체크 해제 상태)
        if (isMyTurn) {
            selectedTargetId = null;
            if (bombCurrentTurn) {
                bombCurrentTurn.textContent = "당신의 차례입니다!";
                bombCurrentTurn.style.color = "#e74c3c";
            }
            if (bombInputArea) bombInputArea.style.display = 'block';
            if (bombWordInput) {
                bombWordInput.disabled = false; // [1-5 버그 해결] 자신의 차례일 때 활성화
                bombWordInput.value = ''; // 찌꺼기 문자 보장 제거
                bombWordInput.focus();
            }
        } else {
            selectedTargetId = null; // 내 차례가 아닐 때도 초기화
            if (bombCurrentTurn) {
                bombCurrentTurn.textContent = "다른 플레이어가 입력 중입니다...";
                bombCurrentTurn.style.color = "#999";
            }
            if (bombInputArea) bombInputArea.style.display = 'none';
            if (bombWordInput) {
                bombWordInput.disabled = true; // [1-5 버그 해결] 차례가 아닐 때는 항상 차단
                bombWordInput.value = ''; // 미완성 텍스트 파편 강제 삭제
            }
        }
    }

    socket.on('bomb round started', (data) => {
        if (typeof showContainer === 'function') showContainer('bomb-container');
        const setupArea = bombContainer.querySelector('.bomb-setup');
        const waitingArea = bombContainer.querySelector('.bomb-waiting');
        const playerUI = bombContainer.querySelector('.bomb-player-ui');

        if (setupArea) setupArea.style.display = 'none';
        if (waitingArea) waitingArea.style.display = 'none';
        if (playerUI) playerUI.style.display = 'block';

        // 사이드바 숨김
        const sidebar = document.getElementById('right-sidebar');
        if (sidebar) sidebar.classList.add('bomb-game-active');

        // 서브 모드 저장
        currentSubMode = data.subMode || 'random';

        // 폭탄 비주얼 가속 임계값 실시간 랜덤화 (뻔한 타이밍 타파)
        redThreshold = Math.floor(Math.random() * 4) + 2;   // 2 ~ 5초 사이 랜덤
        fastThreshold = Math.floor(Math.random() * 5) + 7;  // 7 ~ 11초 사이 랜덤

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
        if (window.renderBombUsers) window.renderBombUsers(window.roomPlayers);
    });

    socket.on('bomb timer tick', (data) => {
        if (bombTimerText) {
            bombTimerText.style.display = 'block';
            bombTimerText.textContent = `${data.timeLeft}초`;
            if (data.timeLeft <= redThreshold) {
                if (bombGraphic) bombGraphic.className = 'bomb-super-fast';
                bombTimerText.style.color = '#e74c3c';
                bombTimerText.style.transform = 'scale(1.3)';
            } else if (data.timeLeft <= fastThreshold) {
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
        if (window.renderBombUsers) window.renderBombUsers(window.roomPlayers);
    });

    socket.on('bomb invalid word', (msg) => {
        if (window.showToast) window.showToast(msg, 'error');
        // [5번 버그 수정] 틀린 단어 제출 시 인풋 재활성화 (턴이 안 넘어가므로 직접 복구)
        if (isMyTurn && bombWordInput) {
            bombWordInput.disabled = false;
            bombWordInput.value = '';
            bombWordInput.focus();
        }
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
                        socket.emit('confirm result');
                        window.initBombUI(localIsHost);
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

        // [이슈 28 해결] 구식 대기 영역 강제 비활성화
        if (setupArea) setupArea.style.display = 'none';
        if (waitingArea) waitingArea.style.display = 'none';

        // 게임이 진행 중이 아닐 때 글로벌 대기방으로 화면 전환
        const isGamePlaying = playerUI && playerUI.style.display === 'block';
        if (!isGamePlaying && window.gameType === 'bomb') {
            if (typeof showContainer === 'function') {
                showContainer('lobby-container');
                const stageSelection = document.getElementById('selection-stage');
                const stageWaiting = document.getElementById('waiting-stage');
                if (stageSelection) stageSelection.style.display = 'none';
                if (stageWaiting) stageWaiting.style.display = 'flex';
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

    function updateBombLobbySettingsUI(settings) {
        const previewEl = document.getElementById('bomb-lobby-settings-preview');
        const hostPreviewEl = document.getElementById('bomb-host-settings-preview');
        if (!settings) return;

        let modeText = "랜덤 모드";
        if (settings.subMode === 'tactical') modeText = "전략 모드";

        let timerText = "보통 (30~55초)";
        if (settings.timerRange === 'short') timerText = "짧게 (15~30초)";
        else if (settings.timerRange === 'long') timerText = "길게 (50~80초)";

        const showTimerText = settings.showTimer ? "ON" : "OFF";
        const categoriesText = settings.selectedCategories && settings.selectedCategories.length > 0 
            ? settings.selectedCategories.join(', ') 
            : "전체 랜덤";

        const html = `
            <div class="lobby-settings-title" style="justify-content: center; font-size: 0.95rem; margin-bottom: 14px; color: #fdcb6e; font-weight: 800; border-bottom: 1px solid rgba(253,203,110,0.15); padding-bottom: 6px;">게임 설정</div>
            <div class="lobby-settings-grid">
                <div class="lobby-settings-item">
                    <span class="lobby-settings-label">시작 목숨</span>
                    <span class="lobby-settings-val"><span style="background: rgba(230, 126, 34, 0.12); border: 1px solid rgba(230, 126, 34, 0.3); color: #fdcb6e; padding: 2px 8px; border-radius: 6px; font-size: 0.8rem;">${settings.hearts}개</span></span>
                </div>
                <div class="lobby-settings-item">
                    <span class="lobby-settings-label">게임 모드</span>
                    <span class="lobby-settings-val"><span style="background: rgba(230, 126, 34, 0.12); border: 1px solid rgba(230, 126, 34, 0.3); color: #fdcb6e; padding: 2px 8px; border-radius: 6px; font-size: 0.8rem;">${modeText}</span></span>
                </div>
                <div class="lobby-settings-item">
                    <span class="lobby-settings-label">폭탄 시간</span>
                    <span class="lobby-settings-val"><span style="background: rgba(230, 126, 34, 0.12); border: 1px solid rgba(230, 126, 34, 0.3); color: #fdcb6e; padding: 2px 8px; border-radius: 6px; font-size: 0.8rem;">${timerText}</span></span>
                </div>
                <div class="lobby-settings-item">
                    <span class="lobby-settings-label">타이머 표시</span>
                    <span class="lobby-settings-val"><span style="background: rgba(230, 126, 34, 0.12); border: 1px solid rgba(230, 126, 34, 0.3); color: #fdcb6e; padding: 2px 8px; border-radius: 6px; font-size: 0.8rem;">${showTimerText}</span></span>
                </div>
                <div class="lobby-settings-item" style="grid-column: span 2; text-align: center; margin-top: 4px;">
                    <span class="lobby-settings-label" style="margin-bottom: 4px;">선택 카테고리</span>
                    <span class="lobby-settings-val"><span style="background: rgba(230, 126, 34, 0.12); border: 1px solid rgba(230, 126, 34, 0.3); color: #fdcb6e; padding: 4px 12px; border-radius: 8px; font-size: 0.85rem; font-weight: bold; display: inline-block; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${categoriesText}">${categoriesText}</span></span>
                </div>
            </div>
        `;
        if (previewEl) {
            previewEl.innerHTML = html;
            previewEl.style.display = 'block';
        }
        if (hostPreviewEl) {
            hostPreviewEl.innerHTML = html;
            hostPreviewEl.style.display = 'block';
        }
    }

    socket.on('lobby settings updated', (data) => {
        if (data && data.bomb) {
            lastBombSettings = data.bomb;
            updateBombLobbySettingsUI(data.bomb);
        }
    });

})();
