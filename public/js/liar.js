// liar.js
(function () {
    // common.js에서 생성된 전역 변수(window.socket, window.myName, window.roomId)를 활용합니다.

    const setupArea = document.querySelector('#liar-container .setup-area');
    const waitingArea = document.querySelector('#liar-container .waiting-area');
    const playerUI = document.querySelector('#liar-container .player-ui');
    const openSettingsBtn = document.getElementById('open-settings-liar');
    const startGameBtn = document.getElementById('start-game-liar');

    // --- 타이머 UI 생성 ---
    let liarTimerUI = document.getElementById('liar-timer-ui');
    if (!liarTimerUI) {
        liarTimerUI = document.createElement('div');
        liarTimerUI.id = 'liar-timer-ui';
        liarTimerUI.style.cssText = '';
        const liarContainer = document.getElementById('liar-container');
        if (liarContainer) {
            liarContainer.insertBefore(liarTimerUI, playerUI);
        }
    }
    // -----------------------

    let amIHost = false;
    let currentUsers = [];
    let liarGameStarted = false; // 실제 게임 진행 중인지 여부

    // Result Modal Elements
    const resultModal = document.getElementById('result-modal');
    const resultTitle = document.getElementById('result-title');
    const resultWinner = document.getElementById('result-winner');
    const resultStatsBody = document.getElementById('result-stats-body');
    const resultStatHeader1 = document.getElementById('result-stat-header-1');
    const resultStatHeader2 = document.getElementById('result-stat-header-2');
    const closeResultBtn = document.getElementById('close-result-btn');



    window.renderLiarUsers = function (users, hostStatus) {
        currentUsers = users;
        amIHost = hostStatus;
        const userGrid = document.getElementById('user-grid');
        userGrid.innerHTML = '';
        users.forEach(user => {
            const card = document.createElement('div');
            card.className = 'user-card';
            if (user.id === socket.id) card.classList.add('is-me');

            const infoDiv = document.createElement('div');
            infoDiv.className = 'user-info';

            const avatarWrapper = document.createElement('div');
            avatarWrapper.className = 'avatar-wrapper';
            const avatar = document.createElement('div');
            avatar.className = 'avatar';
            avatar.textContent = user.avatar || '😀';
            avatarWrapper.appendChild(avatar);

            const nickname = document.createElement('div');
            nickname.className = 'nickname';
            nickname.textContent = user.name;

            infoDiv.appendChild(nickname);

            // 방장인 경우 상대방 강퇴 버튼
            const kickBtn = window.createKickButton(user, amIHost, socket.id, setupArea.style.display !== 'none');
            if (kickBtn) card.appendChild(kickBtn);

            card.appendChild(avatarWrapper);
            card.appendChild(infoDiv);

            // 승리 도트: 빙고 게임과 동일하게 우측 끝에 가로로 배치 (Task 4-8)
            if (liarGameStarted) {
                const scoreWrapper = document.createElement('div');
                scoreWrapper.className = 'liar-score-dots';
                // order: 99와 margin-left: auto로 확실하게 우측 끝 배치
                scoreWrapper.style.cssText = 'display: flex; gap: 6px; margin-left: auto; padding-left: 15px; align-items: center; order: 99;';

                const myScore = window.gameScores ? (window.gameScores[user.id] || 0) : 0;
                const target = window.winTarget || 3;

                for (let i = 0; i < target; i++) {
                    const dot = document.createElement('div');
                    dot.style.cssText = `
                        width: 10px; 
                        height: 10px; 
                        border-radius: 50%; 
                        border: 1px solid rgba(255,255,255,0.3);
                        box-shadow: ${i < myScore ? '0 0 8px #f1c40f' : 'none'};
                        background: ${i < myScore ? '#f1c40f' : 'rgba(255,255,255,0.1)'};
                    `;
                    scoreWrapper.appendChild(dot);
                }
                card.appendChild(scoreWrapper);
            }

            // 투표 완료 표시 (아바타 배지 방식 - Task 4-6 UX 개선)
            if (window.liarVotes && window.liarVotes[user.id]) {
                const checkMark = document.createElement('div');
                checkMark.className = 'vote-check';
                checkMark.innerHTML = '<i class="fas fa-check"></i>';
                checkMark.style.cssText = `
                    position: absolute;
                    bottom: -2px;
                    right: -2px;
                    background: #10b981;
                    color: white;
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 10px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                    border: 2px solid #232339;
                    z-index: 10;
                    animation: fadeInScale 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                `;
                avatarWrapper.appendChild(checkMark);
            }

            userGrid.appendChild(card);
        });
    }

    window.updateLiarRoleUI = function (isHostStatus) {
        amIHost = isHostStatus;

        setupArea.style.display = 'none';
        waitingArea.style.display = 'none';

        if (amIHost) {
            setupArea.style.display = 'block';
        } else {
            waitingArea.style.display = 'block';
        }

        // 결과창 방장 위임 반응형 로직
        const hostBtns = document.getElementById('host-buttons');
        const guestTxt = document.getElementById('guest-text');
        if (hostBtns && guestTxt) {
            hostBtns.style.display = amIHost ? 'block' : 'none';
            guestTxt.style.display = amIHost ? 'none' : 'block';
        }
    };

    window.initLiarUI = function (isHostStatus) {
        window.updateLiarRoleUI(isHostStatus);
    };

    // 라이어 게임 전역 상태
    window.isGamePlaying = false;

    if (openSettingsBtn) {
        openSettingsBtn.addEventListener('click', () => {
            window.openSettingsModal('liar', (settings) => {
                window.liarSelectedCategories = settings.selectedCategories;
                if (window.showToast) window.showToast('설정이 저장되었습니다!', 'success');
            });
        });
    }

    if (startGameBtn) {
        startGameBtn.addEventListener('click', () => {
            if (currentUsers.length < 3) {
                if (window.showToast) window.showToast('라이어 게임은 최소 3명 이상이어야 시작할 수 있습니다!', 'error');
                else alert('라이어 게임은 최소 3명 이상이어야 시작할 수 있습니다!');
                return;
            }
            const winTarget = parseInt(document.getElementById('win-target-select')?.value || '3');
            const categories = window.liarSelectedCategories; 
            
            if (!categories || categories.length === 0) {
                if (window.showToast) window.showToast('최소 한 개의 카테고리를 선택해야 합니다!', 'warning');
                return;
            }
            
            socket.emit('setup liar game', {
                winTarget: winTarget,
                categories: categories
            });
        });
    }

    // 점수 업데이트
    socket.on('update scores', (scores, target) => {
        window.gameScores = scores;
        window.winTarget = target;
        if (window.gameType === 'liar') {
            window.renderLiarUsers(currentUsers, amIHost); // 점수 반영해서 다시 그리기
        }
    });

    // 게임 타입 변경 감지 (로비 이동 시 초기화)
    socket.on('game changed', (mode) => {
        if (mode === 'lobby') {
            liarGameStarted = false;
            window.gameScores = {};
            if (window.gameType === 'liar') {
                window.renderLiarUsers(currentUsers, amIHost);
            }
        }
    });

    socket.on('liar role assigned', (data) => {
        liarGameStarted = true;
        window.liarVotes = {}; // 라운드 시작 시 투표 초기화
        window.renderLiarUsers(currentUsers, amIHost); // 투표 상태 반영
        const roleClass = data.isLiar ? 'role-liar' : 'role-citizen';
        const wordClass = data.isLiar ? 'word-liar' : 'word-citizen';
        const roleText = data.isLiar ? '라이어' : '시민';

        playerUI.innerHTML = `
            <div class="liar-glass-panel liar-role-card">
                <div class="liar-role-header">당신의 역할</div>
                <div class="liar-role-badge ${roleClass}">${roleText}</div>
                
                <div class="liar-category-label">카테고리</div>
                <div class="liar-category-value">${data.category}</div>
                
                <div class="liar-word-label">제시어</div>
                <div class="liar-word-value ${wordClass}">${data.word}</div>

                <!-- 실시간 힌트 리스트 영역 -->
                <div id="live-hint-container" style="display: none; margin-top: 40px; text-align: left;">
                    <h3 style="color: #cbd5e1; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 12px;"><i class="fas fa-comment-dots"></i> 플레이어들의 설명</h3>
                    <div id="live-hint-list" class="liar-hint-list"></div>
                </div>

                <div id="turn-display-area" class="liar-turn-panel">
                    <p id="turn-message" class="liar-turn-message">순번을 정하는 중입니다...</p>
                    <div id="turn-input-area" class="liar-input-group" style="display: none;">
                        <input type="text" id="desc-input" class="liar-text-input" placeholder="단어 설명하기..." maxlength="30">
                        <br>
                        <button id="submit-desc-btn" class="start-btn">설명 제출하기</button>
                    </div>
                </div>
            </div>
        `;
        setupArea.style.display = 'none';
        waitingArea.style.display = 'none';

        const inputArea = document.getElementById('turn-input-area');
        const submitBtn = document.getElementById('submit-desc-btn');
        const inputField = document.getElementById('desc-input');

        if (submitBtn) {
            submitBtn.onclick = () => {
                const desc = inputField.value.trim();
                if (!desc) {
                    if (window.showToast) window.showToast("설명을 입력해주세요!", "warning");
                    return;
                }
                socket.emit('submit description', desc);
                inputArea.style.display = 'none';
                document.getElementById('turn-message').textContent = "제출 완료! 다음 순서를 기다립니다.";
            };
        }
    });

    // 순차 턴 알림 수신
    socket.on('liar next turn', (data) => {
        const turnMsg = document.getElementById('turn-message');
        const inputArea = document.getElementById('turn-input-area');
        const liveHintContainer = document.getElementById('live-hint-container');

        if (liveHintContainer) liveHintContainer.style.display = 'block';

        if (data.isMyTurn) {
            turnMsg.innerHTML = `<span style="color: #38bdf8; font-size: 1.4rem;">당신의 차례입니다.</span>`; // Task 4-9
            if (inputArea) {
                inputArea.style.display = 'block';
                const inputField = document.getElementById('desc-input');
                if (inputField) inputField.focus();
            }
        } else {
            turnMsg.innerHTML = `<span style="color: #94a3b8;">${data.playerName}</span>님이 설명 중입니다...`;
            if (inputArea) inputArea.style.display = 'none';
        }
    });

    // 실시간 힌트 수신
    socket.on('liar hint received', (data) => {
        const hintList = document.getElementById('live-hint-list');
        const liveHintContainer = document.getElementById('live-hint-container');

        if (liveHintContainer) liveHintContainer.style.display = 'block';

        if (hintList) {
            const div = document.createElement('div');
            div.className = 'liar-hint-item';
            div.dataset.playerId = data.playerId;
            div.dataset.playerName = data.playerName;
            div.innerHTML = `<strong>[${data.playerName}]</strong> <span>"${data.desc}"</span>`;
            hintList.appendChild(div);
            hintList.scrollTop = hintList.scrollHeight;
        }
    });

    // 투표 단계 진입 (턴제 종료 시)
    socket.on('liar voting phase start', () => {
        const hintList = document.getElementById('live-hint-list');
        const turnDisplay = document.getElementById('turn-display-area');

        if (turnDisplay) turnDisplay.style.display = 'none';

        // 투표 버튼 생성
        const hints = Array.from(hintList.querySelectorAll('.liar-hint-item'));
        let voteButtonsHTML = '<div class="liar-vote-grid">';

        hints.forEach((hint) => {
            const pid = hint.dataset.playerId;
            const pName = hint.dataset.playerName;
            if (pid === socket.id) return;
            voteButtonsHTML += `
                <button class="liar-vote-btn" data-target-id="${pid}" data-target-name="${pName}">
                    <i class="fas fa-user-secret"></i>
                    <span>${pName} 지목</span>
                </button>`;
        });
        voteButtonsHTML += '</div>';

        const votingHtml = `
        <div id="voting-section" class="liar-voting-panel">
            <h2 style="margin-bottom: 10px; font-size: 1.8rem;">🕵️‍♂️ 라이어 지목하기</h2>
            <p style="color: #94a3b8; margin-bottom: 24px;">설명을 듣고 라이어로 의심되는 사람을 선택하세요.</p>
            ${voteButtonsHTML}
            <div id="vote-confirm-panel" class="liar-turn-panel" style="display: none; background: rgba(56, 189, 248, 0.1); border-color: rgba(56, 189, 248, 0.3); text-align: center;">
                <p id="vote-confirm-msg" style="margin-bottom: 15px; font-size: 1.1rem; color: #fff;"></p>
                <div style="display: flex; gap: 10px; justify-content: center;">
                    <button id="vote-yes-btn" class="start-btn" style="background: #10b981; padding: 10px 25px; font-size: 0.9rem;">확인</button>
                    <button id="vote-no-btn" class="start-btn" style="background: rgba(255,255,255,0.1); padding: 10px 25px; font-size: 0.9rem;">취소</button>
                </div>
            </div>
            <div id="waiting-vote-area" class="liar-turn-panel" style="display: none; background: rgba(245, 158, 11, 0.1); border-color: rgba(245, 158, 11, 0.3); color: #fbbf24; text-align: center;">
                ⏳ 다른 플레이어들을 기다리는 중...
            </div>
        </div>
    `;

        // 롤 가이드 아래에 투표창 붙이기
        const card = playerUI.querySelector('.liar-glass-panel');
        if (card) {
            const existingVoting = document.getElementById('voting-section');
            if (existingVoting) existingVoting.remove();
            card.insertAdjacentHTML('beforeend', votingHtml);
        }

        // 버튼 이벤트 연결
        document.querySelectorAll('.liar-vote-btn').forEach(btn => {
            btn.onclick = () => {
                const targetId = btn.getAttribute('data-target-id');
                const targetName = btn.getAttribute('data-target-name');
                
                const voteGrid = document.querySelector('.liar-vote-grid');
                const confirmPanel = document.getElementById('vote-confirm-panel');
                const confirmMsg = document.getElementById('vote-confirm-msg');
                const yesBtn = document.getElementById('vote-yes-btn');
                const noBtn = document.getElementById('vote-no-btn');

                if (voteGrid && confirmPanel) {
                    voteGrid.style.display = 'none';
                    confirmPanel.style.display = 'block';
                    confirmMsg.innerHTML = `정말 <strong>${targetName}</strong>님을<br>라이어로 지목하시겠습니까?`;

                    yesBtn.onclick = () => {
                        socket.emit('vote liar', targetId);
                        confirmPanel.style.display = 'none';
                        const waitingArea = document.getElementById('waiting-vote-area');
                        if (waitingArea) waitingArea.style.display = 'block';
                    };

                    noBtn.onclick = () => {
                        confirmPanel.style.display = 'none';
                        voteGrid.style.display = 'grid';
                    };
                }
            };
        });
    });

    socket.on('game started', () => {
        window.isGamePlaying = false;
    });

    // 투표 진행 현황 표시
    socket.on('vote updated', (votes) => {
        window.liarVotes = votes;
        if (window.gameType === 'liar') {
            window.renderLiarUsers(currentUsers, amIHost);
        }
    });

    socket.on('liar player voted', (playerId) => {
        if (!window.liarVotes) window.liarVotes = {};
        window.liarVotes[playerId] = true;
        if (window.gameType === 'liar') {
            window.renderLiarUsers(currentUsers, amIHost);
        }
    });

    socket.on('final guess phase', (data) => {
        window.isGamePlaying = false;

        if (socket.id === data.liarId) {
            playerUI.innerHTML = `
            <div class="liar-glass-panel" style="border-color: rgba(239, 68, 68, 0.4);">
                <h1 style="color: #f87171; margin-bottom: 12px; font-size: 2.5rem;">🚨 정체가 발각되었습니다!</h1>
                <h3 style="color: #cbd5e1; margin-bottom: 24px;">하지만 아직 기회가 있습니다. 제시어 정답을 맞추면 <span style="color:#f87171; font-weight: 800;">역전승</span>입니다!</h3>
                <div class="liar-input-group">
                    <input type="text" id="final-guess-input" class="liar-text-input" style="font-size: 1.8rem; border-color: #ef4444;" placeholder="정답 단어 입력..." autocomplete="off">
                    <br>
                    <button id="final-guess-btn" class="start-btn" style="background: #ef4444; width: auto; padding: 16px 48px;">최후의 역전 제출</button>
                </div>
            </div>
        `;

            document.getElementById('final-guess-btn').onclick = () => {
                const val = document.getElementById('final-guess-input').value.trim();
                if (!val) {
                    if (window.showToast) window.showToast("정답을 입력해야 합니다!", "warning");
                    return;
                }
                socket.emit('submit final guess', val);
                playerUI.innerHTML = `<div class="liar-glass-panel"><h2>결과 판정 중...</h2></div>`;
            };

            const guessInput = document.getElementById('final-guess-input');
            if (guessInput) {
                guessInput.focus();
                guessInput.addEventListener('input', () => {
                    socket.emit('final guess typing', guessInput.value);
                });
            }
        } else {
            playerUI.innerHTML = `
            <div class="liar-glass-panel" style="border-color: rgba(16, 185, 129, 0.4);">
                <h1 style="color: #10b981; margin-bottom: 12px; font-size: 2.5rem;">🎉 라이어 검거 성공!</h1>
                <h3 style="color: #cbd5e1;">현재 라이어(<span style="color:#f87171; font-weight: 800;">${data.liarName}</span>)가 정답을 추리하고 있습니다.</h3>
                <p style="color: #94a3b8; font-weight: 600; margin-top: 20px;">라이어가 정답을 틀려야 완벽한 승리가 됩니다!</p>
                
                <div id="live-typing-box" class="liar-turn-panel" style="border: 2px dashed rgba(16, 185, 129, 0.4); min-width: 300px; margin-top: 32px;">
                    <div id="live-typing-chars" style="font-size: 3rem; font-weight: 900; color: #f87171; letter-spacing: 12px; min-height: 60px;"></div>
                </div>
            </div>
        `;
        }
    });

    socket.on('round over', (result) => {
        window.isGamePlaying = false;
        if (liarTimerUI) liarTimerUI.style.display = 'none';

        if (result.isFinalGameOver) {
            showLiarResultModal(result);
        }

        const hostBtnId = result.isFinalGameOver ? 'restart-liar-btn' : 'next-round-btn';
        const hostBtnText = result.isFinalGameOver ? '게임 초기화' : '다음 라운드 시작';
        const hostBtnColor = result.isFinalGameOver ? '' : 'background:#3498db;';

        const hostBtnHtml = `<button id="${hostBtnId}" class="start-btn" style="${hostBtnColor} margin-top: 30px; width: auto; padding: 15px 40px;">${hostBtnText}</button>`;
        const guestText = result.isFinalGameOver ? '방장이 게임을 초기화할 때까지 대기해주세요.' : ''; // Task 4-13

        const hostDisplay = amIHost ? 'block' : 'none';
        const guestDisplay = amIHost ? 'none' : 'block';

        let autoNextMsg = '';
        if (!result.isFinalGameOver) {
            autoNextMsg = `<div id="auto-next-timer" style="margin-top: 15px; color: #94a3b8; font-size: 0.9rem;">
                <span id="auto-next-seconds">8</span>초 후 다음 라운드가 자동으로 시작됩니다...
            </div>`;
        }

        const btnHtml = `
            <div id="host-buttons" style="display: ${hostDisplay};">
                ${hostBtnHtml}
            </div>
            <div id="guest-text" style="display: ${guestDisplay};">
                <p style="margin-top:20px; color:#94a3b8;">${guestText}</p>
            </div>
            ${autoNextMsg}
        `;

        playerUI.innerHTML = `
        <div class="liar-glass-panel liar-result-panel" style="border-top: 8px solid ${result.citizensWon ? '#10b981' : '#ef4444'};">
            <div class="liar-result-title" style="color: ${result.citizensWon ? '#10b981' : '#ef4444'};">
                ${result.isFinalGameOver ? 'FINAL GAME OVER' : 'ROUND OVER'}
            </div>
            <div class="liar-result-msg">${result.message}</div>
            
            ${result.isFinalGameOver ? `<h1 style="font-size: 3rem; color: #fbbf24; margin-bottom: 32px; text-shadow: 0 0 20px rgba(251, 191, 36, 0.4);">${result.finalMessage}</h1>` : ''}
            
            <div class="liar-final-reveal">
                <div class="reveal-box">
                    <div class="reveal-label">진짜 라이어</div>
                    <div class="reveal-value reveal-liar">${result.liarName}</div>
                </div>
                <div class="reveal-box">
                    <div class="reveal-label">정답 단어</div>
                    <div class="reveal-value reveal-word">${result.word}</div>
                </div>
            </div>

            <div class="liar-submissions-box" style="width: 100%; max-width: 600px; margin-top: 32px;">
                <h4 style="color: #94a3b8; margin-bottom: 16px;"><i class="fas fa-list-ul"></i> 제출된 모든 설명</h4>
                <div style="text-align: left; max-height: 200px; overflow-y: auto; padding-right: 10px;">
                    ${result.turnOrder ? result.turnOrder.map(pid => {
            const name = result.playerNames[pid] || '알수없음';
            const desc = result.submissions[pid] || '';
            return `<div style="margin-bottom: 12px; padding: 12px; background: rgba(255,255,255,0.03); border-radius: 8px;">
                        <strong style="color: #38bdf8;">${name}:</strong> 
                        <span style="color: #e2e8f0;">"${desc}"</span>
                    </div>`;
        }).join('') : ''}
                </div>
            </div>

            <div style="margin-top: 40px;">
                ${btnHtml}
            </div>
        </div>
    `;

        setTimeout(() => {
            const restartBtn = document.getElementById('restart-liar-btn');
            if (restartBtn) restartBtn.onclick = () => socket.emit('restart liar game');

            const nextBtn = document.getElementById('next-round-btn');
            if (nextBtn) nextBtn.onclick = () => socket.emit('next liar round');

            // 자동 시작 카운트다운 타이머 (UI 표시용)
            if (!result.isFinalGameOver) {
                let seconds = 8;
                const timerSpan = document.getElementById('auto-next-seconds');
                const interval = setInterval(() => {
                    seconds--;
                    if (timerSpan) timerSpan.textContent = seconds;
                    if (seconds <= 0) clearInterval(interval);
                }, 1000);
            }
        }, 100);
    });


    socket.on('final guess typing update', (data) => {
        const charsDiv = document.getElementById('live-typing-chars');
        if (!charsDiv) return;

        const word = data.partialWord || '';
        const prevLen = charsDiv.querySelectorAll('span.liar-char').length;

        // 글자 수가 줄었으면 (백스페이스) 전체 재렌더
        if (word.length < prevLen) {
            charsDiv.innerHTML = '';
            for (let i = 0; i < word.length; i++) {
                const span = document.createElement('span');
                span.className = 'liar-char';
                span.textContent = word[i] === ' ' ? '\u00A0' : word[i];
                span.style.cssText = 'display: inline-block; opacity: 1;';
                charsDiv.appendChild(span);
            }
        } else {
            const spans = charsDiv.querySelectorAll('span.liar-char');
            for (let i = 0; i < prevLen; i++) {
                spans[i].textContent = word[i] === ' ' ? '\u00A0' : word[i];
            }

            for (let i = prevLen; i < word.length; i++) {
                const span = document.createElement('span');
                span.className = 'liar-char';
                span.textContent = word[i] === ' ' ? '\u00A0' : word[i];
                span.style.cssText = `
                    display: inline-block;
                    opacity: 0;
                    transform: translateY(-10px);
                    animation: liarCharDrop 0.18s ease forwards;
                `;
                charsDiv.appendChild(span);
            }
        }
    });

    // --- Task 4-2: 시작 카운트다운 ---
    socket.on('liar game countdown start', (seconds) => {
        setupArea.style.display = 'none';
        waitingArea.style.display = 'none';
        
        playerUI.innerHTML = `
            <div class="liar-glass-panel" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 300px;">
                <h2 style="color: #cbd5e1; margin-bottom: 20px;">게임을 시작합니다!</h2>
                <div id="liar-countdown-number" style="font-size: 8rem; font-weight: 900; color: #38bdf8; text-shadow: 0 0 30px rgba(56, 189, 248, 0.5); animation: emojiPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);">${seconds}</div>
            </div>
        `;
    });

    socket.on('liar game countdown tick', (seconds) => {
        const numEl = document.getElementById('liar-countdown-number');
        if (numEl) {
            numEl.textContent = seconds;
            // 애니메이션 재트리거
            numEl.style.animation = 'none';
            numEl.offsetHeight; // trigger reflow
            numEl.style.animation = 'emojiPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
        }
    });

    socket.on('game restarted', () => {
        liarGameStarted = false;
        playerUI.innerHTML = '';
        if (amIHost) {
            setupArea.style.display = 'block';
            waitingArea.style.display = 'none';
        } else {
            setupArea.style.display = 'none';
            waitingArea.style.display = 'block';
        }
        if (window.gameType === 'liar' && currentUsers.length > 0) {
            window.updateLiarRoleUI(amIHost);
        }
    });

    // 타이머 이벤트 리스너 추가
    socket.on('liar timer tick', (data) => {
        if (!liarTimerUI) return;
        liarTimerUI.style.display = 'block';

        liarTimerUI.classList.remove('timer-green', 'timer-yellow', 'timer-red');

        if (data.timeLeft <= 10) {
            liarTimerUI.classList.add('timer-red');
        } else if (data.timeLeft <= 20) {
            liarTimerUI.classList.add('timer-yellow');
        } else {
            liarTimerUI.classList.add('timer-green');
        }

        liarTimerUI.innerHTML = `⏳ [${data.phase}] 진행 중... 남은 시간: <span>${data.timeLeft}</span>초`;
    });

    socket.on('liar timer clear', () => {
        if (liarTimerUI) liarTimerUI.style.display = 'none';
    });

    function showLiarResultModal(result) {
        if (!resultModal) return;

        resultTitle.textContent = "🕵️‍♂️ 라이어 게임 종료 🕵️‍♂️";
        
        // Task 4-7: 우승자 정보 추출
        const target = window.winTarget || 3;
        const winnerStats = result.stats.filter(s => s.score >= target);
        const winnerNames = winnerStats.map(s => s.name);
        
        let winnerHtml = '';
        if (winnerNames.length > 1) {
            winnerHtml = `
                <div style="color: #fbbf24; font-size: 2rem; font-weight: 900; margin-bottom: 8px;">🎊 공동 우승! 🎊</div>
                <div style="color: #fff; font-size: 2.5rem; font-weight: 900; margin-bottom: 16px; text-shadow: 0 0 20px rgba(251, 191, 36, 0.5);">${winnerNames.join(', ')}</div>
            `;
        } else if (winnerNames.length === 1) {
            winnerHtml = `
                <div style="color: #fbbf24; font-size: 1.8rem; font-weight: 800; margin-bottom: 4px;">🏆 최종 우승자 🏆</div>
                <div style="color: #fff; font-size: 3.5rem; font-weight: 900; margin-bottom: 16px; text-shadow: 0 0 30px rgba(251, 191, 36, 0.6);">${winnerNames[0]}</div>
            `;
        } else {
            // 예외 상황 (점수 미달 시)
            const winTeam = result.citizensWon ? "시민 승리" : "라이어 승리";
            const winColor = result.citizensWon ? "#10b981" : "#ef4444";
            winnerHtml = `<div style="color: ${winColor}; font-size: 2.5rem; font-weight: 900; margin-bottom: 12px;">${winTeam}!</div>`;
        }

        resultWinner.innerHTML = `
            ${winnerHtml}
            <div style="display: flex; gap: 20px; justify-content: center; margin-top: 20px; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 12px;">
                <div>
                    <div style="font-size: 0.85rem; color: #94a3b8;">진짜 라이어</div>
                    <div style="font-size: 1.2rem; color: #ef4444; font-weight: bold;">${result.liarName}</div>
                </div>
                <div style="width: 1px; background: rgba(255,255,255,0.1);"></div>
                <div>
                    <div style="font-size: 0.85rem; color: #94a3b8;">정답 단어</div>
                    <div style="font-size: 1.2rem; color: #38bdf8; font-weight: bold;">${result.word}</div>
                </div>
            </div>
        `;

        if (resultStatHeader1) resultStatHeader1.textContent = "최종 승수";
        if (resultStatHeader2) resultStatHeader2.textContent = "역할";

        resultStatsBody.innerHTML = '';
        if (result.stats) {
            result.stats.forEach(stat => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
                const roleText = stat.isLiar ? '<span style="color:#ef4444; font-weight: 700;">라이어</span>' : '시민';
                tr.innerHTML = `
                <td style="padding:16px; color: #f1f5f9;">${stat.id === socket.id ? '<b style="color: #38bdf8;">(나) </b>' : ''}${stat.name}</td>
                <td style="padding:16px; font-weight:bold; color:#fbbf24; font-size: 1.1rem;">${stat.score}승</td>
                <td style="padding:16px; color: #94a3b8;">${roleText}</td>
            `;
                if (stat.score >= window.winTarget) tr.style.backgroundColor = 'rgba(251, 191, 36, 0.1)';
                resultStatsBody.appendChild(tr);
            });
        }

        resultModal.style.display = 'block';

        closeResultBtn.onclick = () => {
            resultModal.style.display = 'none';
            if (amIHost) {
                socket.emit('return to lobby');
            }
        };
    }

})();
