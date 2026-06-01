// liar.js (Spatial Split-Screen Overhaul - Dual Mode waiting/playing)
(function () {
    // common.js에서 생성된 전역 변수(window.socket, window.myName, window.roomId)를 활용합니다.

    const setupArea = document.querySelector('#liar-container .setup-area');
    const waitingArea = document.querySelector('#liar-container .waiting-area');
    const playerUI = document.querySelector('#liar-container .player-ui');
    const openSettingsBtn = document.getElementById('open-settings-liar');
    const startGameBtn = document.getElementById('start-game-liar');

    let amIHost = false;
    let currentUsers = [];
    let liarGameStarted = false; // 실제 게임 진행 중인지 여부
    window.liarVotes = {};
    window.gameScores = {};
    window.winTarget = 3;

    // --- 동적 보드 및 특수 UI 요소 생성 및 바인딩 ---
    let gridBoard = document.getElementById('liar-grid-board');
    if (!gridBoard) {
        gridBoard = document.createElement('div');
        gridBoard.id = 'liar-grid-board';
        gridBoard.className = 'liar-grid-board';
        const liarContainer = document.getElementById('liar-container');
        if (liarContainer) {
            liarContainer.appendChild(gridBoard);
        }
    }

    let laserCanvas = document.getElementById('liar-laser-canvas');
    if (!laserCanvas) {
        laserCanvas = document.createElement('canvas');
        laserCanvas.id = 'liar-laser-canvas';
        const liarContainer = document.getElementById('liar-container');
        if (liarContainer) {
            liarContainer.appendChild(laserCanvas);
        }
    }

    let inputZone = document.getElementById('liar-input-zone');
    if (!inputZone) {
        inputZone = document.createElement('div');
        inputZone.id = 'liar-input-zone';
        const liarContainer = document.getElementById('liar-container');
        if (liarContainer) {
            liarContainer.appendChild(inputZone);
        }
    }

    inputZone.style.display = 'none';

    // --- 타이머 UI 설정 ---
    let liarTimerUI = document.getElementById('liar-timer-ui');
    if (!liarTimerUI) {
        liarTimerUI = document.createElement('div');
        liarTimerUI.id = 'liar-timer-ui';
        const liarContainer = document.getElementById('liar-container');
        if (liarContainer) {
            liarContainer.insertBefore(liarTimerUI, gridBoard);
        }
    }

    // --- 네온 지목 레이저 빔 애니메이션 그리기 함수 (비활성화) ---
    function drawAccusationLasers(votes) {
        return; // 화살표 레이저 빔 전면 제거
    }

    // --- 어몽어스 스타일 플레이어 슬롯 투표 칩 렌더링 함수 ---
    function renderVoteBadges(votes) {
        // 기존 렌더링된 배지 목록 청소
        document.querySelectorAll('.liar-slot-voters-list').forEach(el => el.remove());

        // targetId => [voterUser1, voterUser2, ...] 형태의 득표 현황 맵
        const voterGroups = {};

        // 모든 유저 슬롯 내부에 리스트 영역 배치
        currentUsers.forEach(user => {
            const slotContent = document.getElementById(`liar-slot-content-${user.id}`);
            if (slotContent) {
                const listDiv = document.createElement('div');
                listDiv.className = 'liar-slot-voters-list';
                listDiv.id = `liar-voters-list-${user.id}`;
                slotContent.appendChild(listDiv);
            }
            voterGroups[user.id] = [];
        });

        // votes 맵 순회하며 투표자 정보 할당
        if (votes) {
            for (let voterId in votes) {
                const targetId = votes[voterId];
                if (voterId === targetId) continue; // 자기 자신 투표 배제

                const voterUser = currentUsers.find(u => u.id === voterId);
                if (voterUser && voterGroups[targetId]) {
                    voterGroups[targetId].push(voterUser);
                }
            }
        }

        // 각 플레이어 카드 아래 리스트에 투표자 칩들 주입
        for (let targetId in voterGroups) {
            const voters = voterGroups[targetId];
            const listDiv = document.getElementById(`liar-voters-list-${targetId}`);
            if (listDiv && voters.length > 0) {
                voters.forEach(v => {
                    const chip = document.createElement('span');
                    chip.className = 'liar-voter-chip';
                    if (v.id === socket.id) {
                        chip.classList.add('is-me');
                    }
                    chip.innerHTML = `${v.avatar || '🐱'} ${v.name}`;
                    listDiv.appendChild(chip);
                });
            }
        }
    }

    window.renderLiarUsers = function (users, hostStatus) {
        currentUsers = users;
        amIHost = hostStatus;

        const mainWrapper = document.getElementById('main-wrapper');

        if (!liarGameStarted) {
            // [대기실 모드] 원래 플레이어 UI 사용 (오른쪽 사이드바의 user-grid 활성화)
            document.body.classList.remove('game-mode-liar');
            if (gridBoard) gridBoard.style.display = 'none';

            if (mainWrapper) {
                mainWrapper.className = mainWrapper.className.replace(/\bplayers-\d+\b/g, '').trim();
            }

            const userGrid = document.getElementById('user-grid');
            if (!userGrid) return;
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
                if (window.getUserBadgeHtml) {
                    nickname.innerHTML += window.getUserBadgeHtml(user);
                }

                infoDiv.appendChild(nickname);

                // 방장인 경우 상대방 강퇴 버튼
                const kickBtn = window.createKickButton(user, amIHost, socket.id, setupArea.style.display !== 'none');
                if (kickBtn) card.appendChild(kickBtn);

                card.appendChild(avatarWrapper);
                card.appendChild(infoDiv);

                userGrid.appendChild(card);
            });
        } else {
            // [게임방 모드] 신규 공간 분할 그리드 보드 렌더링 (사이드바 숨김)
            document.body.classList.add('game-mode-liar');
            if (gridBoard) {
                gridBoard.style.display = 'grid';
                gridBoard.innerHTML = '';
                gridBoard.className = `liar-grid-board players-${users.length}`;
            }

            if (mainWrapper) {
                mainWrapper.className = mainWrapper.className.replace(/\bplayers-\d+\b/g, '').trim();
                mainWrapper.classList.add(`players-${users.length}`);
            }

            users.forEach(user => {
                const card = document.createElement('div');
                card.className = 'liar-player-slot';
                if (user.id === socket.id) card.classList.add('is-me');
                card.id = `liar-slot-${user.id}`;

                // 1. 점수 승리 표시 도트 렌더링
                const myScore = window.gameScores ? (window.gameScores[user.id] || 0) : 0;
                const target = window.winTarget || 3;
                let dotsHtml = '<div class="liar-slot-score-dots">';
                for (let i = 0; i < target; i++) {
                    dotsHtml += `<div class="liar-slot-dot ${i < myScore ? 'filled' : ''}"></div>`;
                }
                dotsHtml += '</div>';

                // 2. 아바타 및 닉네임 정보 배지
                const hasVoted = window.liarVotes && window.liarVotes[user.id];
                const voteBadgeHtml = `<div class="liar-slot-vote-badge" id="liar-vote-check-${user.id}" style="display: ${hasVoted ? 'flex' : 'none'};"><i class="fas fa-check"></i></div>`;
                
                let badgeHtml = '';
                if (window.getUserBadgeHtml) {
                    badgeHtml = window.getUserBadgeHtml(user);
                }

                card.innerHTML = `
                    ${dotsHtml}
                    <div class="liar-slot-avatar-wrapper">
                        <div class="liar-slot-avatar">${user.avatar || '🐱'}</div>
                        ${voteBadgeHtml}
                    </div>
                    <div class="liar-slot-nickname">
                        ${user.name} ${badgeHtml}
                    </div>
                    <div class="liar-slot-content" id="liar-slot-content-${user.id}"></div>
                `;

                gridBoard.appendChild(card);
            });
        }
    };

    window.updateLiarRoleUI = function (isHostStatus) {
        amIHost = isHostStatus;

        // 대기실에서는 글로벌 꽉찬화면 클래스 및 그리드 보드, 특수 피처 은폐
        document.body.classList.remove('game-mode-liar');
        if (gridBoard) gridBoard.style.display = 'none';
        if (inputZone) inputZone.style.display = 'none';

        setupArea.style.display = 'none';
        waitingArea.style.display = 'none';

        if (amIHost) {
            setupArea.style.display = 'block';
        } else {
            waitingArea.style.display = 'block';
        }

        // 결과창 방장 지령 버튼 제어
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
                return;
            }
            const winTarget = parseInt(document.getElementById('win-target-select')?.value || '3');
            const categories = window.liarSelectedCategories; 
            
            socket.emit('setup liar game', {
                winTarget: winTarget,
                categories: categories || []
            });
        });
    }

    // 점수 동기화 수신
    socket.on('update scores', (scores, target) => {
        window.gameScores = scores;
        window.winTarget = target;
        if (window.gameType === 'liar') {
            window.renderLiarUsers(currentUsers, amIHost);
        }
    });

    // 게임 타입 변경 감지 (로비 이동 시 원복 처리)
    socket.on('game changed', (mode) => {
        if (mode !== 'liar') {
            document.body.classList.remove('game-mode-liar');
            if (gridBoard) gridBoard.style.display = 'none';
            inputZone.style.display = 'none';
        } else {
            // 대기방인 경우 원래 레이아웃 복구
            document.body.classList.remove('game-mode-liar');
            if (gridBoard) gridBoard.style.display = 'none';
        }

        const mainWrapper = document.getElementById('main-wrapper');
        if (mainWrapper) {
            mainWrapper.className = mainWrapper.className.replace(/\bplayers-\d+\b/g, '').trim();
        }

        if (mode === 'lobby') {
            liarGameStarted = false;
            window.gameScores = {};
            window.liarVotes = {};
            if (window.gameType === 'liar') {
                window.renderLiarUsers(currentUsers, amIHost);
            }
        }
    });

    // --- [피처 개편 1] 3D 카드 플립을 통한 정체 공개 ---
    socket.on('liar role assigned', (data) => {
        liarGameStarted = true;
        window.liarVotes = {}; // 투표 록온 초기화

        if (window.liarAutoNextInterval) {
            clearInterval(window.liarAutoNextInterval);
            window.liarAutoNextInterval = null;
        }

        setupArea.style.display = 'none';
        waitingArea.style.display = 'none';
        playerUI.innerHTML = ''; // 이전 결과 오버레이 청소

        // 게임 시작 시 비로소 글로벌 꽉찬 화면 클래스 및 보드 그리드 활성화
        document.body.classList.add('game-mode-liar');
        if (gridBoard) {
            gridBoard.style.display = 'grid';
            gridBoard.classList.remove('results-dimmed');
        }

        // 1. 보드 유저 슬롯들 먼저 갱신
        window.renderLiarUsers(currentUsers, amIHost);

        // 2. 각자 슬롯 내부에 카드 플립 설치
        currentUsers.forEach(user => {
            const slotContent = document.getElementById(`liar-slot-content-${user.id}`);
            if (!slotContent) return;

            if (user.id === socket.id) {
                // 내 카드: 클릭 시 앞면(역할 공개)으로 뒤집어지는 3D 인터랙션 탑재 (이모지 배제, 텍스트 미니멀)
                slotContent.innerHTML = `
                    <div class="liar-card-container" id="liar-my-card">
                        <div class="liar-card-inner">
                            <div class="liar-card-back">
                                <span class="liar-card-back-label" style="font-size:0.75rem; color:rgba(255,255,255,0.45);">클릭해서 역할 확인</span>
                            </div>
                            <div class="liar-card-front role-${data.isLiar ? 'liar' : 'role-citizen'} role-${data.isLiar ? 'liar' : 'citizen'}">
                                <span class="liar-card-role-title" style="color: ${data.isLiar ? '#f87171' : '#34d399'};">
                                    ${data.isLiar ? '라이어' : '시민'}
                                </span>
                                <span class="liar-card-role-desc" style="color:#e2e8f0;">
                                    ${data.isLiar ? `당신은 라이어입니다.<br>카테고리: <strong style="color:#fbbf24;">${data.category}</strong><br>눈치껏 설명하고 정답을 맞추세요.` : `카테고리: <strong>${data.category}</strong><br>제시어: <strong style="font-size:1.15rem; color:#38bdf8;">${data.word}</strong>`}
                                </span>
                            </div>
                        </div>
                    </div>
                `;

                // 카드 클릭 토글 바인딩
                setTimeout(() => {
                    const myCard = document.getElementById('liar-my-card');
                    if (myCard) {
                        myCard.onclick = () => {
                            myCard.classList.toggle('flipped');
                        };
                    }
                }, 100);
            } else {
                // 상대편 카드는 렌더링하지 않아 오클릭 및 불필요한 시각적 낭비 해소
                slotContent.innerHTML = '';
            }
        });

        // 3. 슬롯 하단 안내창 연출
        inputZone.style.display = 'block';
        inputZone.innerHTML = `
            <div class="liar-turn-panel" style="max-width: 500px; margin: 10px auto; text-align: center; border-color: rgba(129, 140, 248, 0.4); background: rgba(129, 140, 248, 0.05); padding: 16px;">
                <p style="color: #cbd5e1; font-weight: 800; margin: 0; animation: liarBlink 2s infinite;">중앙의 본인 카드를 클릭하여 역할을 뒤집어보세요.</p>
            </div>
        `;
    });

    // --- [피처 개편 2] 턴제 진행 시 분할 구역 광원 하이라이트 및 개별 말풍선 렌더링 ---
    socket.on('liar next turn', (data) => {
        // 모든 발언자 박스 광원 해제
        document.querySelectorAll('.liar-player-slot').forEach(el => el.classList.remove('active-turn'));

        // 해당 발언자 박스 보더 하이라이트 활성화
        const speakerSlot = document.getElementById(`liar-slot-${data.playerId}`);
        if (speakerSlot) {
            speakerSlot.classList.add('active-turn');
        }

        // 입력 폼 표시 제어 (중앙 하단 배치하여 스크롤 유발 억제)
        if (data.isMyTurn) {
            inputZone.style.display = 'block';
            inputZone.innerHTML = `
                <div class="liar-turn-panel" style="max-width: 500px; margin: 10px auto; animation: liarCharDrop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);">
                    <p class="liar-turn-message" style="margin-bottom: 8px; color: #38bdf8; font-weight:800; text-align:center;">⏳ 당신의 설명 차례입니다!</p>
                    <div class="liar-input-group" style="margin-top: 0; display: flex; gap: 10px;">
                        <input type="text" id="desc-input" class="liar-text-input" placeholder="제시어를 30자 이내로 설명하세요..." maxlength="30" style="margin-bottom:0; flex:1;" autocomplete="off">
                        <button id="submit-desc-btn" class="start-btn" style="width:auto; padding: 0 20px; font-size:0.9rem; background:#38bdf8;">제출</button>
                    </div>
                </div>
            `;
            setTimeout(() => {
                const inputField = document.getElementById('desc-input');
                const submitBtn = document.getElementById('submit-desc-btn');
                if (inputField) inputField.focus();

                const submitAction = () => {
                    const desc = inputField.value.trim();
                    if (!desc) {
                        if (window.showToast) window.showToast("설명을 입력해주세요!", "warning");
                        return;
                    }
                    socket.emit('submit description', desc);
                    inputZone.innerHTML = `
                        <div class="liar-turn-panel" style="max-width: 500px; margin: 10px auto; text-align: center;">
                            <p style="color: #94a3b8; margin: 0; font-weight:700;">✓ 설명 제출 완료! 다른 사람들의 발언을 기다립니다.</p>
                        </div>
                    `;
                };

                if (submitBtn) submitBtn.onclick = submitAction;
                if (inputField) {
                    inputField.addEventListener('keyup', (e) => {
                        if (e.key === 'Enter') submitAction();
                    });
                }
            }, 50);
        } else {
            inputZone.style.display = 'block';
            inputZone.innerHTML = `
                <div class="liar-turn-panel" style="max-width: 500px; margin: 10px auto; text-align: center;">
                    <p class="liar-turn-message" style="color: #94a3b8; font-weight:700;">🎤 <strong style="color:#fff;">${data.playerName}</strong>님이 단어를 설명 중입니다...</p>
                </div>
            `;
        }
    });

    // 설명 수신 시 해당 플레이어 분할 구역 위에 실시간 말풍선 주입
    socket.on('liar hint received', (data) => {
        const slotContent = document.getElementById(`liar-slot-content-${data.playerId}`);
        if (slotContent) {
            // 말풍선을 매끈한 애니메이션과 함께 주입
            slotContent.innerHTML = `
                <div class="liar-speech-bubble">
                    "${data.desc}"
                </div>
            `;
        }
    });

    // --- [피처 개편 3] 투표 돌입 시 분할 록온 클릭 타겟 지목 시스템 ---
    socket.on('liar voting phase start', () => {
        // 타이머 시작 시점 모든 슬롯의 턴 보더 하이라이트 소거
        document.querySelectorAll('.liar-player-slot').forEach(el => el.classList.remove('active-turn'));

        // 하단 안내창 제거
        inputZone.innerHTML = '';

        // 자신을 제외한 상대 플레이어 카드들을 모두 투표용 타겟으로 변경
        document.querySelectorAll('.liar-player-slot').forEach(slot => {
            const pid = slot.id.replace('liar-slot-', '');
            if (pid === socket.id) return; // 자신 제외

            slot.classList.add('voting-target');
            const nicknameEl = slot.querySelector('.liar-slot-nickname');
            const pName = nicknameEl ? nicknameEl.textContent.replace('👑', '').trim() : '상대';

            // 분할 구역 클릭 타겟 핸들러 바인딩
            slot.onclick = () => {
                inputZone.style.display = 'block';
                inputZone.innerHTML = `
                    <div class="liar-turn-panel" style="max-width: 500px; margin: 10px auto; text-align: center; border-color: rgba(239, 68, 68, 0.5); background: rgba(239, 68, 68, 0.06); animation: liarCharDrop 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);">
                        <p style="font-size: 1.15rem; color: #fff; margin-bottom: 12px; font-weight: 800;">정말 <span style="color: #f87171;">[${pName}]</span>님에게 투표하시겠습니까?</p>
                        <div style="display: flex; gap: 12px; justify-content: center;">
                            <button id="vote-confirm-yes" class="start-btn" style="background: #10b981; padding: 8px 24px; font-size: 0.9rem;">투표 완료</button>
                            <button id="vote-confirm-no" class="start-btn" style="background: rgba(255,255,255,0.15); padding: 8px 24px; font-size: 0.9rem;">취소</button>
                        </div>
                    </div>
                `;

                document.getElementById('vote-confirm-yes').onclick = () => {
                    socket.emit('vote liar', pid);
                    
                    // 투표 완료 후 타겟 클릭 비활성화 및 안내 처리
                    document.querySelectorAll('.liar-player-slot').forEach(el => {
                        el.classList.remove('voting-target');
                        el.onclick = null;
                    });
                    inputZone.innerHTML = `
                        <div class="liar-turn-panel" style="max-width: 500px; margin: 10px auto; text-align: center; border-color: rgba(245, 158, 11, 0.4); background: rgba(245, 158, 11, 0.05);">
                            <p style="color: #fbbf24; margin: 0; font-weight: 700; animation: liarBlink 2s infinite;">⏳ 투표 완료! 다른 플레이어들의 투표 결과를 기다리는 중...</p>
                        </div>
                    `;
                };

                document.getElementById('vote-confirm-no').onclick = () => {
                    inputZone.innerHTML = '';
                };
            };
        });
    });

    socket.on('game started', () => {
        window.isGamePlaying = false;
    });

    // 투표 아바타 체크 배지 실시간 동기화
    socket.on('vote updated', (votes) => {
        window.liarVotes = votes;
        for (let pid in votes) {
            const checkBadge = document.getElementById(`liar-vote-check-${pid}`);
            if (checkBadge) checkBadge.style.display = 'flex';
        }
    });

    socket.on('liar player voted', (playerId) => {
        if (!window.liarVotes) window.liarVotes = {};
        window.liarVotes[playerId] = true;
        const checkBadge = document.getElementById(`liar-vote-check-${playerId}`);
        if (checkBadge) checkBadge.style.display = 'flex';
    });

    // --- [피처 개편 4] 라이어 검거 성공 시 최후의 변론 실시간 타이핑 중계 ---
    socket.on('final guess phase', (data) => {
        window.isGamePlaying = false;

        // 지목 타겟 기능 전면 해제
        document.querySelectorAll('.liar-player-slot').forEach(el => {
            el.classList.remove('voting-target');
            el.onclick = null;
        });

        if (socket.id === data.liarId) {
            // 내가 걸린 라이어일 때
            inputZone.style.display = 'block';
            inputZone.innerHTML = `
                <div class="liar-turn-panel" style="max-width: 550px; margin: 10px auto; border-color: #ef4444; background: rgba(239, 68, 68, 0.06); text-align: center; animation: liarCharDrop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);">
                    <h2 style="color: #f87171; margin-top:0; margin-bottom: 6px; font-size: 1.45rem; font-weight:900;">🚨 당신은 라이어로 지목되었습니다!</h2>
                    <p style="color: #fbbf24; font-size: 1.1rem; font-weight: 800; margin-bottom: 8px;">제시어 카테고리: [${data.category}]</p>
                    <p style="color: #cbd5e1; font-size: 0.88rem; margin-bottom: 16px;">하지만 아직 기회가 있습니다. 진짜 제시어를 정확히 추리해 입력하면 대역전승을 거둡니다!</p>
                    <div class="liar-input-group" style="display: flex; gap: 10px; margin-top: 0; width: 100%; max-width: 500px; margin-left: auto; margin-right: auto;">
                        <input type="text" id="final-guess-input" class="liar-text-input" style="font-size: 1.1rem; border-color: #ef4444; margin-bottom:0; flex: 1; min-width: 280px; width: 100%;" placeholder="추리한 제시어 정답을 입력하세요..." autocomplete="off">
                        <button id="final-guess-btn" class="start-btn" style="background: #ef4444; padding: 0 24px; font-weight:800; width: auto; white-space: nowrap;">역전 제출</button>
                    </div>
                </div>
            `;

            setTimeout(() => {
                const guessInput = document.getElementById('final-guess-input');
                const finalBtn = document.getElementById('final-guess-btn');

                if (guessInput) {
                    guessInput.focus();
                    guessInput.addEventListener('input', () => {
                        socket.emit('final guess typing', guessInput.value);
                    });
                }

                const submitAction = () => {
                    const val = guessInput.value.trim();
                    if (!val) {
                        if (window.showToast) window.showToast("정답을 입력해 주세요!", "warning");
                        return;
                    }
                    socket.emit('submit final guess', val);
                    inputZone.innerHTML = `<div class="liar-turn-panel" style="max-width: 500px; margin: 10px auto; text-align: center;"><h2>판독 중...</h2></div>`;
                };

                if (finalBtn) finalBtn.onclick = submitAction;
                if (guessInput) {
                    guessInput.addEventListener('keyup', (e) => {
                        if (e.key === 'Enter') submitAction();
                    });
                }
            }, 50);
        } else {
            // 내가 시민일 때: 라이어 실시간 타이핑 훔쳐보기 오버레이
            inputZone.style.display = 'block';
            inputZone.innerHTML = `
                <div class="liar-turn-panel" style="max-width: 550px; margin: 10px auto; text-align: center; border-color: #10b981; background: rgba(16, 185, 129, 0.05); animation: liarCharDrop 0.25s;">
                    <h2 style="color: #10b981; margin-top:0; margin-bottom: 6px; font-size: 1.45rem; font-weight:900;">🎉 라이어 검거 완료!</h2>
                    <p style="color: #cbd5e1; font-size: 0.88rem; margin-bottom: 14px;">검거된 라이어(<strong style="color:#f87171;">${data.liarName}</strong>)가 최후의 역전 제시어를 추리하고 있습니다.</p>
                    
                    <div style="border: 2px dashed rgba(16, 185, 129, 0.35); padding: 10px 20px; border-radius: 14px; min-height: 52px; display: flex; justify-content: center; align-items: center; width: 100%; max-width: 480px; margin: 0 auto; background:rgba(0,0,0,0.2); box-sizing: border-box;">
                        <div id="live-typing-chars" style="font-size: 1.9rem; font-weight: 900; color: #f87171; letter-spacing: 5px; min-height: 32px; display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 4px; word-break: break-all; width: 100%; overflow: hidden;"></div>
                    </div>
                </div>
            `;
        }
    });

    // --- [피처 개편 5] 라운드 마감 시 지목 쇼다운 투표자 칩 렌더링 ---
    socket.on('liar showdown start', (data) => {
        if (data && data.votes) {
            renderVoteBadges(data.votes);
        }
    });

    socket.on('round over', (result) => {
        window.isGamePlaying = false;
        if (liarTimerUI) liarTimerUI.style.display = 'none';

        // 턴 제어창은 즉시 제거
        if (inputZone) inputZone.style.display = 'none';

        // 결과창 오픈할 때 보드판을 완전히 가리지 않고 은은한 딤드(Dimmed) 배경 효과 적용
        if (gridBoard) {
            gridBoard.style.display = 'grid';
            gridBoard.classList.add('results-dimmed');
        }

        if (result.isFinalGameOver) {
            // 게임 완전 종료: 스코어보드 렌더링
            const btnHtml = `
                <div style="margin-top: 32px; display: flex; flex-direction: column; align-items: center; gap: 14px;">
                    <div style="display: flex; gap: 14px; justify-content: center; width: 100%; max-width: 400px;">
                        <button id="liar-confirm-result-btn" class="start-btn" style="flex: 1; padding: 12px 24px; font-size: 0.95rem; background: linear-gradient(135deg, #34495e, #2c3e50); border: 1px solid rgba(255,255,255,0.15);">
                            확인 완료
                        </button>
                        ${amIHost ? `
                        <button id="restart-liar-btn" class="start-btn" style="flex: 1; padding: 12px 24px; font-size: 0.95rem; background: linear-gradient(135deg, #e74c3c, #c0392b);">
                            게임 초기화
                        </button>
                        ` : ''}
                    </div>
                    ${!amIHost ? `
                    <div style="color: #94a3b8; font-size: 0.85rem;">
                        ⏳ 방장이 게임을 초기화할 때까지 대기해주세요.
                    </div>
                    ` : ''}
                </div>
            `;

            playerUI.innerHTML = `
                <div class="liar-glass-panel liar-result-panel" style="border-top: 8px solid #fbbf24; max-width: 650px; margin: 0 auto;">
                    <div style="font-size: 3.5rem; text-align: center; margin-bottom: 6px;">🏆</div>
                    <div class="liar-result-title" style="color: #fbbf24; font-size: 2.2rem; text-shadow: 0 0 15px rgba(251, 191, 36, 0.4); margin-bottom: 8px;">
                        FINAL GAME OVER
                    </div>
                    <div style="margin: 15px 0 25px;">
                        <h2 style="color: #fff; font-size: 1.45rem; margin: 0; line-height: 1.4;">
                            ${result.finalMessage || '게임이 최종 종료되었습니다.'}
                        </h2>
                    </div>

                    <div class="liar-final-reveal" style="margin: 20px 0; gap: 15px;">
                        <div class="reveal-box" style="padding: 12px 24px; background: rgba(239, 68, 68, 0.08); border-color: rgba(239, 68, 68, 0.3);">
                            <div class="reveal-label">마지막 진짜 라이어</div>
                            <div class="reveal-value reveal-liar" style="font-size: 1.45rem;">${result.liarName}</div>
                        </div>
                        <div class="reveal-box" style="padding: 12px 24px; background: rgba(56, 189, 248, 0.08); border-color: rgba(56, 189, 248, 0.3);">
                            <div class="reveal-label">마지막 정답 단어</div>
                            <div class="reveal-value reveal-word" style="font-size: 1.45rem;">${result.word}</div>
                        </div>
                    </div>

                    <!-- 최종 스코어보드 -->
                    <div style="width: 100%; margin-top: 24px; background: rgba(0,0,0,0.25); border-radius: 14px; border: 1px solid rgba(255,255,255,0.08); overflow: hidden;">
                        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size:0.9rem;">
                            <thead>
                                <tr style="background: rgba(255,255,255,0.04); border-bottom: 2px solid rgba(255,255,255,0.08);">
                                    <th style="padding: 12px 16px; color: #94a3b8; font-weight: bold;">순위</th>
                                    <th style="padding: 12px 16px; color: #94a3b8; font-weight: bold;">플레이어</th>
                                    <th style="padding: 12px 16px; color: #94a3b8; font-weight: bold;">최종 승수</th>
                                    <th style="padding: 12px 16px; color: #94a3b8; font-weight: bold;">마지막 역할</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${result.stats ? result.stats.map((stat, idx) => {
                                    const isWinner = stat.score >= (window.winTarget || 3);
                                    const rowBg = isWinner ? 'background: rgba(251, 191, 36, 0.08); font-weight: bold;' : 'border-bottom: 1px solid rgba(255,255,255,0.04);';
                                    const nameColor = stat.id === socket.id ? 'color: #38bdf8;' : 'color: #f1f5f9;';
                                    const roleColor = stat.isLiar ? '<span style="color:#ef4444; font-weight:700;">라이어</span>' : '<span style="color:#cbd5e1;">시민</span>';
                                    return `
                                        <tr style="${rowBg}">
                                            <td style="padding: 12px 16px; color: ${isWinner ? '#fbbf24' : '#94a3b8'};">${idx + 1}위</td>
                                            <td style="padding: 12px 16px; ${nameColor}">${stat.id === socket.id ? '<b>(나) </b>' : ''}${stat.name}</td>
                                            <td style="padding: 12px 16px; color: #fbbf24; font-size: 1.0rem;">${stat.score}승</td>
                                            <td style="padding: 12px 16px;">${roleColor}</td>
                                        </tr>
                                    `;
                                }).join('') : ''}
                            </tbody>
                        </table>
                    </div>

                    ${btnHtml}
                </div>
            `;

            setTimeout(() => {
                const confirmBtn = document.getElementById('liar-confirm-result-btn');
                if (confirmBtn) {
                    confirmBtn.onclick = () => {
                        socket.emit('confirm result');
                        confirmBtn.disabled = true;
                        confirmBtn.textContent = "확인 완료 ✓";
                        confirmBtn.style.opacity = '0.6';
                        confirmBtn.style.background = '#475569';
                    };
                }

                const restartBtn = document.getElementById('restart-liar-btn');
                if (restartBtn) {
                    restartBtn.onclick = () => socket.emit('restart liar game');
                }
            }, 50);
            return;
        }

        // 라운드 종료 통계 렌더링
        const hostDisplay = amIHost ? 'block' : 'none';
        const guestDisplay = amIHost ? 'none' : 'block';

        const btnHtml = `
            <div id="host-buttons" style="display: ${hostDisplay};">
                <button id="next-round-btn" class="start-btn" style="background:#3498db; margin-top: 20px; width: auto; padding: 12px 36px; font-size:0.95rem;">다음 라운드 시작</button>
            </div>
            <div id="guest-text" style="display: ${guestDisplay};">
                <div style="color: #94a3b8; font-size: 0.9rem; margin-top: 20px;">
                    ⏳ 방장이 다음 라운드를 시작할 때까지 대기하고 있습니다.
                </div>
            </div>
        `;

        // 투표 지목 결과 그룹화 및 가독성 극대화
        const targetGroups = {};
        currentUsers.forEach(u => {
            targetGroups[u.id] = {
                name: u.name,
                voters: [],
                tally: 0
            };
        });

        if (result.votes) {
            for (let voterId in result.votes) {
                const targetId = result.votes[voterId];
                if (targetGroups[targetId]) {
                    const voterName = result.playerNames[voterId] || '알수없음';
                    targetGroups[targetId].voters.push(voterName);
                    targetGroups[targetId].tally++;
                }
            }
        }

        // 득표수가 높은 순서대로 정렬
        const sortedTargets = Object.keys(targetGroups).map(id => ({
            id,
            ...targetGroups[id]
        })).sort((a, b) => b.tally - a.tally);

        let votesHtml = `
            <div style="margin-top: 15px; text-align: left; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.06);">
                <h4 style="color: #94a3b8; margin: 0 0 8px 0; font-size: 0.9rem; font-weight: 700;"><i class="fas fa-vote-yea"></i> 투표 결과</h4>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 0.85rem; max-height: 120px; overflow-y: auto; padding-right: 6px;">
                    ${sortedTargets.map(target => {
                        const voterListText = target.voters.length > 0 ? target.voters.join(', ') : '없음';
                        const badgeColor = target.tally > 0 ? '#fbbf24' : '#94a3b8';
                        const nameColor = target.tally > 0 ? '#fffffe' : 'rgba(255,255,255,0.5)';
                        return `
                            <div style="padding: 6px 10px; background: rgba(255,255,255,0.02); border-radius: 6px; border: 1px solid rgba(255,255,255,0.03);">
                                <span style="color:${nameColor}; font-weight:800;">${target.name}</span>
                                <span style="color:${badgeColor}; font-weight:bold; margin-left: 4px;">(${target.tally}표)</span>
                                <div style="font-size:0.75rem; color:rgba(255,255,255,0.4); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="투표한 사람: ${voterListText}">
                                    투표: ${voterListText}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        // 모든 설명들을 2열 조화로운 콤팩트 카드형으로 대칭 렌더링하여 스크롤 억제
        playerUI.innerHTML = `
            <div class="liar-glass-panel liar-result-panel" style="border-top: 8px solid ${result.citizensWon ? '#10b981' : '#ef4444'}; max-width:650px;">
                <div class="liar-result-title" style="color: ${result.citizensWon ? '#10b981' : '#ef4444'}; font-size: 2.2rem;">
                    ROUND OVER
                </div>
                <div class="liar-result-msg" style="font-size:1.15rem; line-height:1.4;">${result.message}</div>
                
                <div class="liar-final-reveal" style="margin: 15px 0;">
                    <div class="reveal-box" style="padding:10px 20px; min-width:150px;">
                        <div class="reveal-label">진짜 라이어</div>
                        <div class="reveal-value reveal-liar" style="font-size:1.35rem;">${result.liarName}</div>
                    </div>
                    <div class="reveal-box" style="padding:10px 20px; min-width:150px;">
                        <div class="reveal-label">정답 단어</div>
                        <div class="reveal-value reveal-word" style="font-size:1.35rem;">${result.word}</div>
                    </div>
                </div>

                <div style="width: 100%; margin-top: 20px; text-align:left;">
                    <h4 style="color: #94a3b8; margin: 0 0 10px 0; font-size: 0.95rem;"><i class="fas fa-list-ul"></i> 플레이어들의 설명 요약</h4>
                    <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap: 10px; max-height: 180px; overflow-y: auto; padding-right: 6px;">
                        ${result.turnOrder ? result.turnOrder.map(pid => {
                            const name = result.playerNames[pid] || '알수없음';
                            const desc = result.submissions[pid] || '';
                            return `
                                <div style="padding: 10px; background: rgba(255,255,255,0.02); border-radius: 8px; border:1px solid rgba(255,255,255,0.04); font-size:0.88rem;">
                                    <strong style="color: #38bdf8;">${name}:</strong> 
                                    <span style="color: #e2e8f0;">"${desc}"</span>
                                </div>
                            `;
                        }).join('') : ''}
                    </div>
                </div>

                ${votesHtml}

                <div style="margin-top: 24px;">
                    ${btnHtml}
                </div>
            </div>
        `;

        setTimeout(() => {
            const nextBtn = document.getElementById('next-round-btn');
            if (nextBtn) nextBtn.onclick = () => socket.emit('next liar round');
        }, 50);
    });

    // 라이어 최후의 추리 실시간 단어 중계 처리
    socket.on('final guess typing update', (data) => {
        const charsDiv = document.getElementById('live-typing-chars');
        if (!charsDiv) return;

        const word = data.partialWord || '';
        const prevLen = charsDiv.querySelectorAll('span.liar-char').length;

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
                    transform: translateY(-8px);
                    animation: liarCharDrop 0.18s ease forwards;
                `;
                charsDiv.appendChild(span);
            }
        }
    });

    // --- 3D 카드 플립 정체공개 도입을 위해, 카운트다운 숫자를 생략하고 즉시 카드 배치로 우회 ---
    socket.on('liar game countdown start', (seconds) => {
        setupArea.style.display = 'none';
        waitingArea.style.display = 'none';
        
        // 카드 배치 활성화를 위해 렌더링 동기화
        liarGameStarted = true;
        window.renderLiarUsers(currentUsers, amIHost);
    });

    socket.on('liar game countdown tick', (seconds) => {
        // 3D 카드 플립 우회하므로 아무것도 하지 않음 (타이머 충돌 방지)
    });

    // 게임 완전히 재시작 시 록온 초기화 및 UI 전체 복원
    socket.on('game restarted', () => {
        window.liarVotes = {};
        window.gameScores = {};
        liarGameStarted = false;
        playerUI.innerHTML = '';

        document.body.classList.remove('game-mode-liar');
        if (gridBoard) {
            gridBoard.style.display = 'none';
            gridBoard.classList.remove('results-dimmed');
        }
        if (liarTimerUI) liarTimerUI.style.display = 'none';
        if (inputZone) inputZone.style.display = 'none';

        const mainWrapper = document.getElementById('main-wrapper');
        if (mainWrapper) {
            mainWrapper.className = mainWrapper.className.replace(/\bplayers-\d+\b/g, '').trim();
        }

        if (amIHost) {
            setupArea.style.display = 'block';
            waitingArea.style.display = 'none';
        } else {
            setupArea.style.display = 'none';
            waitingArea.style.display = 'block';
        }

        if (window.gameType === 'liar' && currentUsers.length > 0) {
            window.updateLiarRoleUI(amIHost);
            window.renderLiarUsers(currentUsers, amIHost);
        }
    });

    // 소켓 타이머 연동 처리
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

    // 실시간 인게임 잡담용 임시 말풍선 렌더링 함수
    function showLiarChatBubble(playerId, message) {
        const slot = document.getElementById(`liar-slot-${playerId}`);
        if (!slot) return;

        // 기존 임시 말풍선 소거
        const existing = slot.querySelector('.liar-chat-bubble');
        if (existing) existing.remove();

        const bubble = document.createElement('div');
        bubble.className = 'liar-chat-bubble';
        // 텍스트 최대 20자 제한 처리
        bubble.textContent = message.length > 20 ? message.slice(0, 20) + '…' : message;
        slot.appendChild(bubble);

        // 3초 후 페이드 아웃 소멸
        setTimeout(() => {
            bubble.style.transition = 'opacity 0.4s ease';
            bubble.style.opacity = '0';
            setTimeout(() => {
                if (bubble.parentNode) bubble.remove();
            }, 400);
        }, 3000);
    }

    socket.on('chat message', (data) => {
        if (liarGameStarted && data.socketId) {
            showLiarChatBubble(data.socketId, data.message);
        }
    });

})();
