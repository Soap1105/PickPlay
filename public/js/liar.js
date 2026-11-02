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
    let lastRoleData = null; // F5 새로고침 및 보드 재렌더링 시 내 3D 카드 영구 보존용
    window.liarVotes = {};
    window.gameScores = {};
    window.winTarget = 3;
    let lastLiarSettings = { winTarget: 3, selectedCategories: [] };
    let mySubmittedDesc = '';

    // --- 내 3D 역할 카드 일원화 렌더러 (증발 방지) ---
    function renderMyRoleCard(data, autoFlipped = false) {
        if (!data) return;
        const mySlotId = (window.socket && window.socket.id) ? window.socket.id : null;
        if (!mySlotId) return;

        const slotContent = document.getElementById(`liar-slot-content-${mySlotId}`);
        if (!slotContent) return;

        const existingCard = document.getElementById('liar-my-card');
        const wasFlipped = existingCard ? existingCard.classList.contains('flipped') : false;

        const isWordMode = (data.subMode === 'word');
        let cardFrontHtml = '';

        if (isWordMode) {
            cardFrontHtml = `
                <div class="liar-card-front role-word">
                    <span class="liar-card-badge">워드 모드</span>
                    <span class="liar-card-cat-label">카테고리: <strong>${data.category || ''}</strong></span>
                    <span class="liar-card-main-word">${data.word || '비공개'}</span>
                </div>
            `;
        } else {
            const roleTitle = data.isLiar ? '라이어' : '시민';
            const roleClass = data.isLiar ? 'role-liar' : 'role-citizen';
            const mainWordHtml = data.isLiar 
                ? '<span class="liar-card-main-word liar-secret">?</span>'
                : `<span class="liar-card-main-word">${data.word || '비공개'}</span>`;

            cardFrontHtml = `
                <div class="liar-card-front ${roleClass}">
                    <span class="liar-card-badge">${roleTitle}</span>
                    <span class="liar-card-cat-label">카테고리: <strong>${data.category || ''}</strong></span>
                    ${mainWordHtml}
                </div>
            `;
        }

        const flippedClass = (autoFlipped || wasFlipped) ? 'flipped' : '';
        const myDescChipHtml = mySubmittedDesc
            ? `<div class="liar-my-speech-chip" id="liar-my-speech-chip">"${mySubmittedDesc}"</div>`
            : '';

        slotContent.innerHTML = `
            <div class="liar-card-container ${flippedClass}" id="liar-my-card">
                <div class="liar-card-inner">
                    <div class="liar-card-back">
                        <span class="liar-card-back-label">클릭해서 역할 확인</span>
                    </div>
                    ${cardFrontHtml}
                </div>
            </div>
            ${myDescChipHtml}
        `;

        setTimeout(() => {
            const myCard = document.getElementById('liar-my-card');
            if (myCard) {
                myCard.onclick = (e) => {
                    e.stopPropagation();
                    myCard.classList.toggle('flipped');
                };
            }
        }, 50);
    }

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

    // --- 마스코트 퀵 감정표현 이모지(4종) 팔레트 생성 ---
    let reactionPalette = document.getElementById('liar-reaction-palette');
    if (!reactionPalette) {
        reactionPalette = document.createElement('div');
        reactionPalette.id = 'liar-reaction-palette';
        const emojis = ['❓', '👀', '💦', '👍'];
        emojis.forEach(emoji => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'liar-reaction-btn';
            btn.textContent = emoji;
            btn.onclick = () => {
                if (btn.classList.contains('cooldown')) return;

                // 도배 방지 쿨다운 (0.7초)
                btn.classList.add('cooldown');
                setTimeout(() => btn.classList.remove('cooldown'), 700);

                if (window.socket) {
                    window.socket.emit('liar reaction', { emoji: emoji });
                }
            };
            reactionPalette.appendChild(btn);
        });

        const liarContainer = document.getElementById('liar-container');
        if (liarContainer) {
            liarContainer.appendChild(reactionPalette);
        }
    }

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
                    const vColor = v.color || '#FC944D';
                    const vMascot = window.buildMascotSvg ? `<span style="display:inline-block;width:16px;height:16px;vertical-align:middle;margin-right:4px;">${window.buildMascotSvg(vColor, v.costume || [])}</span>` : '';
                    chip.innerHTML = `${vMascot}${v.name}`;
                    listDiv.appendChild(chip);
                });
            }
        }
    }

    window.renderLiarUsers = function (users, hostStatus) {
        const finalUsers = (users && users.length > 0) ? users : (window.roomPlayers || []);
        currentUsers = finalUsers;
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

            finalUsers.forEach(user => {
                const card = document.createElement('div');
                card.className = 'user-card';
                if (user.id === socket.id) card.classList.add('is-me');

                const infoDiv = document.createElement('div');
                infoDiv.className = 'user-info';

                const avatarWrapper = document.createElement('div');
                avatarWrapper.className = 'avatar-wrapper';
                const avatar = document.createElement('div');
                avatar.className = 'avatar';
                const userColor = user.color || '#FC944D';
                if (window.buildMascotSvg) {
                    avatar.innerHTML = window.buildMascotSvg(userColor, user.costume || []);
                } else {
                    avatar.textContent = user.avatar || '😀';
                }
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
                gridBoard.className = `liar-grid-board players-${finalUsers.length}`;
            }

            if (mainWrapper) {
                mainWrapper.className = mainWrapper.className.replace(/\bplayers-\d+\b/g, '').trim();
                mainWrapper.classList.add(`players-${finalUsers.length}`);
            }

            finalUsers.forEach(user => {
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

                const userColor = user.color || '#FC944D';
                const mascotHtml = window.buildMascotSvg ? window.buildMascotSvg(userColor, user.costume || []) : (user.avatar || '😀');

                card.innerHTML = `
                    ${dotsHtml}
                    <div class="liar-slot-avatar-wrapper">
                        <div class="liar-slot-avatar">${mascotHtml}</div>
                        ${voteBadgeHtml}
                    </div>
                    <div class="liar-slot-nickname">
                        ${user.name} ${badgeHtml}
                    </div>
                    <div class="liar-slot-content" id="liar-slot-content-${user.id}"></div>
                `;

                gridBoard.appendChild(card);
            });

            // 보드 렌더링 후 내 역할 카드가 이미 발급되어 있다면 즉시 복원 (새로고침 및 유저 목록 갱신 시 카드 증발 방지)
            if (liarGameStarted && lastRoleData) {
                renderMyRoleCard(lastRoleData, false);
            }
        }
    };

    window.updateLiarRoleUI = function (isHostStatus) {
        amIHost = isHostStatus;

        // 대기실에서는 글로벌 꽉찬화면 클래스 및 그리드 보드, 특수 피처 은폐
        document.body.classList.remove('game-mode-liar');
        if (gridBoard) gridBoard.style.display = 'none';
        if (inputZone) inputZone.style.display = 'none';
        if (reactionPalette) reactionPalette.style.display = 'none';

        // [이슈 28 해결] 라이어 구식 대기 영역 강제 비활성화
        setupArea.style.display = 'none';
        waitingArea.style.display = 'none';

        // 단판 라운드가 아닌 전체 대기 상태일 때는 최신 대기방으로 복귀
        if (!window.isGamePlaying && window.gameType === 'liar') {
            if (typeof showContainer === 'function') {
                showContainer('lobby-container');
                const stageSelection = document.getElementById('selection-stage');
                const stageWaiting = document.getElementById('waiting-stage');
                if (stageSelection) stageSelection.style.display = 'none';
                if (stageWaiting) stageWaiting.style.display = 'flex';
            }
        }

        // 결과창 방장 지령 버튼 제어
        const hostBtns = document.getElementById('host-buttons');
        const guestTxt = document.getElementById('guest-text');
        if (hostBtns && guestTxt) {
            hostBtns.style.display = amIHost ? 'block' : 'none';
            guestTxt.style.display = amIHost ? 'none' : 'block';
        }

        updateLiarLobbySettingsUI(lastLiarSettings);
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
                window.liarSubMode = settings.subMode;
                if (window.showToast) window.showToast('설정이 저장되었습니다!', 'success');
            });
        });
    }

    if (startGameBtn) {
        startGameBtn.addEventListener('click', () => {
            const players = window.roomPlayers || currentUsers || [];
            if (players.length < 3) {
                if (window.showToast) window.showToast('라이어 게임은 최소 3명 이상이어야 시작할 수 있습니다!', 'error');
                return;
            }
            const winTarget = parseInt(document.getElementById('win-target-select')?.value || '3');
            const subMode = window.liarSubMode || document.getElementById('liar-sub-mode')?.value || 'classic';
            const categories = window.liarSelectedCategories;

            socket.emit('setup liar game', {
                winTarget: winTarget,
                subMode: subMode,
                categories: categories || []
            });
        });
    }

    // 점수 동기화 수신
    socket.on('update scores', (scores, target) => {
        window.gameScores = scores;
        window.winTarget = target;
        if (window.gameType === 'liar') {
            window.renderLiarUsers(window.roomPlayers, amIHost);
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
                window.renderLiarUsers(window.roomPlayers, amIHost);
            }
        }
    });

    // --- [피처 개편 1] 3D 카드 플립을 통한 정체 공개 ---
    socket.on('liar role assigned', (data) => {
        if (typeof showContainer === 'function') showContainer('liar-container');
        liarGameStarted = true;
        window.liarVotes = {}; // 투표 록온 초기화
        mySubmittedDesc = ''; // 새 라운드 시작 시 내 발언 초기화

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
        if (reactionPalette) reactionPalette.style.display = 'flex';

        // 1. 보드 유저 슬롯들 먼저 갱신
        window.renderLiarUsers(window.roomPlayers, amIHost);

        // 2. 각자 슬롯 내부에 카드 플립 설치
        lastRoleData = data;

        // 2. 내 3D 카드 렌더링 (일원화 헬퍼 호출)
        renderMyRoleCard(data, false);

        // 3. 슬롯 하단 안내창 연출
        const isWordMode = (data.subMode === 'word');
        const guideMsg = isWordMode
            ? '중앙의 본인 카드를 클릭하여 제시어를 확인하세요. 대화를 통해 서로 다른 단어를 찾아내세요.'
            : '중앙의 본인 카드를 클릭하여 역할을 뒤집어보세요.';

        inputZone.style.display = 'block';
        inputZone.innerHTML = `
            <div class="liar-turn-panel" style="max-width: 550px; margin: 10px auto; text-align: center; border-color: rgba(129, 140, 248, 0.4); background: rgba(129, 140, 248, 0.05); padding: 16px;">
                <p style="color: #cbd5e1; font-weight: 800; margin: 0; animation: liarBlink 2s infinite;">${guideMsg}</p>
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
                    <p class="liar-turn-message" style="margin-bottom: 8px; color: #38bdf8; font-weight:800; text-align:center;">제시어를 설명해주세요</p>
                    <div class="liar-input-group" style="margin-top: 0; display: flex; gap: 10px;">
                        <input type="text" id="desc-input" class="liar-text-input" placeholder="제시어를 설명하세요 (30자 이내)" maxlength="30" style="margin-bottom:0; flex:1;" autocomplete="off">
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
                            <p style="margin: 0; font-weight:700;">설명 제출 완료. 다음 발언을 기다립니다.</p>
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
                    <p class="liar-turn-message" style="margin: 0; font-weight:700;"><strong>${data.playerName}</strong>님이 단어를 설명하고 있습니다.</p>
                </div>
            `;
        }
    });

    // 설명 수신 시 해당 플레이어 분할 구역 위에 실시간 말풍선 주입 (내 슬롯은 3D 카드 보존)
    socket.on('liar hint received', (data) => {
        const slotContent = document.getElementById(`liar-slot-content-${data.playerId}`);
        if (!slotContent) return;

        if (data.playerId === socket.id) {
            mySubmittedDesc = data.desc;
            const existingCard = document.getElementById('liar-my-card');
            if (existingCard) {
                let chipEl = document.getElementById('liar-my-speech-chip');
                if (!chipEl) {
                    chipEl = document.createElement('div');
                    chipEl.id = 'liar-my-speech-chip';
                    chipEl.className = 'liar-my-speech-chip';
                    slotContent.appendChild(chipEl);
                }
                chipEl.textContent = `"${data.desc}"`;
            } else if (lastRoleData) {
                renderMyRoleCard(lastRoleData, true);
            }
        } else {
            // 상대방 슬롯에는 말풍선 주입
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

        // 투표 단계 중에도 내 카드는 언제든 앞뒤로 뒤집어볼 수 있도록 보장
        const myCard = document.getElementById('liar-my-card');
        if (myCard) {
            myCard.onclick = () => myCard.classList.toggle('flipped');
        }

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
                        <p class="liar-vote-prompt" style="font-size: 1.15rem; margin-bottom: 12px; font-weight: 800;">정말 <span style="color: #ef4444;">[${pName}]</span>님에게 투표하시겠습니까?</p>
                        <div style="display: flex; gap: 12px; justify-content: center;">
                            <button id="vote-confirm-yes" class="start-btn liar-vote-confirm-btn" style="background: #10b981; padding: 8px 24px; font-size: 0.9rem;">투표 완료</button>
                            <button id="vote-confirm-no" class="start-btn liar-vote-cancel-btn" style="padding: 8px 24px; font-size: 0.9rem;">취소</button>
                        </div>
                    </div>
                `;

                document.getElementById('vote-confirm-yes').onclick = () => {
                    socket.emit('vote liar', pid);

                    // 투표 완료 후 상대방 타겟 클릭 비활성화 및 안내 처리
                    document.querySelectorAll('.liar-player-slot').forEach(el => {
                        el.classList.remove('voting-target');
                        if (el.id !== `liar-slot-${socket.id}`) {
                            el.onclick = null;
                        }
                    });

                    // 내 카드 뒤집기는 투표 완료 후에도 계속 유효
                    const cardEl = document.getElementById('liar-my-card');
                    if (cardEl) {
                        cardEl.onclick = () => cardEl.classList.toggle('flipped');
                    }

                    inputZone.innerHTML = `
                        <div class="liar-turn-panel" style="max-width: 500px; margin: 10px auto; text-align: center; border-color: rgba(245, 158, 11, 0.4); background: rgba(245, 158, 11, 0.05);">
                            <p style="color: #fbbf24; margin: 0; font-weight: 700; animation: liarBlink 2s infinite;">투표 완료. 다른 플레이어들의 투표 결과를 기다리는 중...</p>
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

    // 라이어 게임 마스코트 감정표현 핑 실시간 애니메이션 수신
    socket.on('liar reaction broadcast', (data) => {
        if (!data || !data.emoji) return;
        const targetId = data.targetId || data.senderId;
        const slot = document.getElementById(`liar-slot-${targetId}`);
        if (!slot) return;

        const avatarWrapper = slot.querySelector('.liar-slot-avatar-wrapper') || slot;

        // 이전 동일 핑 잔여물 정리
        const oldPing = avatarWrapper.querySelector('.liar-slot-emoji-ping');
        if (oldPing) oldPing.remove();

        const pingEl = document.createElement('div');
        pingEl.className = 'liar-slot-emoji-ping';
        pingEl.textContent = data.emoji;
        avatarWrapper.appendChild(pingEl);

        setTimeout(() => {
            if (pingEl.parentNode) pingEl.remove();
        }, 1500);
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
            // 내가 걸린 라이어일 때 (간결한 3초 컷 UI)
            inputZone.style.display = 'block';
            inputZone.innerHTML = `
                <div class="liar-turn-panel" style="max-width: 500px; margin: 10px auto; border-color: #ef4444; text-align: center; animation: liarCharDrop 0.22s ease;">
                    <h3 style="color: #ef4444; margin-top: 0; margin-bottom: 6px; font-size: 1.15rem; font-weight: 900;">라이어로 지목되었습니다</h3>
                    <div style="display: inline-block; background: rgba(245, 158, 11, 0.12); color: #d97706; border: 1px solid rgba(245, 158, 11, 0.3); padding: 3px 12px; border-radius: 12px; font-size: 0.82rem; font-weight: 800; margin-bottom: 12px;">카테고리: ${data.category}</div>
                    <div class="liar-input-group" style="display: flex; gap: 8px; margin-top: 0; width: 100%; max-width: 460px; margin-left: auto; margin-right: auto;">
                        <input type="text" id="final-guess-input" class="liar-text-input" style="font-size: 0.95rem; border-color: #ef4444; margin-bottom:0; flex: 1;" placeholder="진짜 제시어를 입력하세요" autocomplete="off">
                        <button id="final-guess-btn" class="start-btn" style="background: #ef4444; padding: 0 20px; font-weight:800; width: auto; font-size: 0.9rem;">정답 제출</button>
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
                    inputZone.innerHTML = `<div class="liar-turn-panel" style="max-width: 500px; margin: 10px auto; text-align: center;"><h3>판독 중...</h3></div>`;
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
                <div class="liar-turn-panel" style="max-width: 500px; margin: 10px auto; text-align: center; border-color: #10b981; animation: liarCharDrop 0.22s ease;">
                    <p style="color: #10b981; font-weight: 800; margin-bottom: 8px; font-size: 0.95rem;">라이어(<strong style="color: #ef4444;">${data.liarName}</strong>)가 제시어를 추리하고 있습니다</p>
                    <div style="border: 1px dashed rgba(16, 185, 129, 0.4); padding: 8px 16px; border-radius: 12px; min-height: 44px; display: flex; justify-content: center; align-items: center; width: 100%; max-width: 440px; margin: 0 auto; box-sizing: border-box;">
                        <div id="live-typing-chars" style="font-size: 1.5rem; font-weight: 900; color: #ef4444; letter-spacing: 4px; min-height: 28px; display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 4px; word-break: break-all; width: 100%; overflow: hidden;"></div>
                    </div>
                </div>
            `;
        }
    });

    // --- [피처 개편 5] 라운드 마감 시 지목 쇼다운 투표자 칩 렌더링 ---
    socket.on('liar showdown start', (data) => {
        // 투표 타겟 클릭 즉시 전면 해제 (중복 투표 원천 차단)
        document.querySelectorAll('.liar-player-slot').forEach(el => {
            el.classList.remove('voting-target');
            el.onclick = null;
        });
        if (inputZone) inputZone.innerHTML = '';

        if (data && data.votes) {
            renderVoteBadges(data.votes);
        }
    });

    function bindResultChatEvents() {
        const inputEl = document.getElementById('liar-result-chat-input');
        const sendBtn = document.getElementById('liar-result-chat-send');
        if (!inputEl || !sendBtn) return;

        const sendMsg = () => {
            const val = inputEl.value.trim();
            if (!val) return;
            socket.emit('chat message', {
                message: val,
                sender: window.myName
            });
            inputEl.value = '';
            inputEl.focus();
        };

        sendBtn.onclick = sendMsg;
        inputEl.onkeypress = (e) => {
            if (e.key === 'Enter') sendMsg();
        };
    }

    socket.on('round over', (result) => {
        window.isGamePlaying = false;
        if (liarTimerUI) liarTimerUI.style.display = 'none';

        // 투표 타겟 클릭 즉시 전면 해제 (중복 투표 원천 차단)
        document.querySelectorAll('.liar-player-slot').forEach(el => {
            el.classList.remove('voting-target');
            el.onclick = null;
        });

        // 서버 최신 통계에서 점수 동기화 및 도트 갱신
        if (result && result.stats && Array.isArray(result.stats)) {
            if (!window.gameScores) window.gameScores = {};
            result.stats.forEach(s => {
                window.gameScores[s.id] = s.score;
            });
            // 백그라운드 슬롯 도트 즉시 최신화
            if (window.roomPlayers && window.renderLiarUsers) {
                window.renderLiarUsers(window.roomPlayers, amIHost);
            }
        }

        // 턴 제어창 및 하단 이모지 팔레트는 즉시 제거
        if (inputZone) inputZone.style.display = 'none';
        if (reactionPalette) reactionPalette.style.display = 'none';

        // 결과창 오픈할 때 보드판을 완전히 가리지 않고 은은한 딤드(Dimmed) 배경 효과 적용
        if (gridBoard) {
            gridBoard.style.display = 'grid';
            gridBoard.classList.add('results-dimmed');
        }

        // 결과 공개 박스 템플릿 생성기 (일반 모드 vs 라이어 워드 모드 분기)
        const isWordMode = (result.subMode === 'word');
        const getRevealBoxesHtml = (isFinal = false) => {
            if (isWordMode) {
                return `
                    <div class="reveal-box reveal-box-liar" style="padding: 10px 14px; min-width: 100px; flex: 1;">
                        <div class="reveal-label">라이어</div>
                        <div class="reveal-value reveal-liar" style="font-size: ${isFinal ? '1.35rem' : '1.25rem'};">${result.liarName}</div>
                    </div>
                    <div class="reveal-box reveal-box-word" style="padding: 10px 14px; min-width: 100px; flex: 1;">
                        <div class="reveal-label">시민 단어</div>
                        <div class="reveal-value reveal-word" style="font-size: ${isFinal ? '1.35rem' : '1.25rem'};">${result.word}</div>
                    </div>
                    <div class="reveal-box reveal-box-subword" style="padding: 10px 14px; min-width: 100px; flex: 1;">
                        <div class="reveal-label">라이어 단어</div>
                        <div class="reveal-value reveal-subword" style="font-size: ${isFinal ? '1.35rem' : '1.25rem'}; font-weight: 800;">${result.liarWord || '알 수 없음'}</div>
                    </div>
                `;
            } else {
                return `
                    <div class="reveal-box reveal-box-liar" style="padding: ${isFinal ? '12px 24px' : '10px 20px'}; min-width: 140px;">
                        <div class="reveal-label">라이어</div>
                        <div class="reveal-value reveal-liar" style="font-size: ${isFinal ? '1.45rem' : '1.35rem'};">${result.liarName}</div>
                    </div>
                    <div class="reveal-box reveal-box-word" style="padding: ${isFinal ? '12px 24px' : '10px 20px'}; min-width: 140px;">
                        <div class="reveal-label">제시어</div>
                        <div class="reveal-value reveal-word" style="font-size: ${isFinal ? '1.45rem' : '1.35rem'};">${result.word}</div>
                    </div>
                `;
            }
        };

        const resultChatHtml = `
            <!-- 결과창 내장 채팅 섹션 -->
            <div class="liar-result-chat">
                <div class="liar-result-chat-header">채팅</div>
                <div id="liar-result-chat-history">
                    <!-- 채팅 내역 -->
                </div>
                <div style="display: flex; gap: 8px;">
                    <input type="text" id="liar-result-chat-input" placeholder="이번 판 후기를 나눠보세요..." autocomplete="off">
                    <button id="liar-result-chat-send">전송</button>
                </div>
            </div>
        `;

        if (result.isFinalGameOver) {
            // 게임 완전 종료: 배경 패널 렌더링 + 공통 결과창 모달 팝업
            playerUI.innerHTML = `
                <div class="liar-glass-panel liar-result-panel" style="border-top: 8px solid #fbbf24; max-width: 650px; margin: 0 auto;">
                    <div class="liar-result-title" style="color: #fbbf24; font-size: 2rem; font-weight: 900; margin-bottom: 8px;">
                        최종 결과
                    </div>
                    <div style="margin: 12px 0 20px;">
                        <h2 class="liar-result-final-msg" style="font-size: 1.35rem; margin: 0; line-height: 1.4;">
                            ${result.finalMessage || '게임이 최종 종료되었습니다.'}
                        </h2>
                    </div>

                    <div class="liar-final-reveal" style="margin: 20px 0; gap: 12px; display: flex; justify-content: center; flex-wrap: wrap;">
                        ${getRevealBoxesHtml(true)}
                    </div>

                    ${resultChatHtml}
                </div>
            `;

            bindResultChatEvents();

            const onConfirmResult = () => {
                socket.emit('confirm result');

                // [이슈 23] 방장은 확인 즉시 게임 초기화도 처리
                if (amIHost) {
                    socket.emit('restart liar game');
                } else {
                    // [이슈 30 해결] 게스트는 방장이 게임 초기화하기 전에 스스로 대기방 UI로 복구 처리하여 갇힘 방지
                    setTimeout(() => {
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

                        setupArea.style.display = 'none';
                        waitingArea.style.display = 'none';

                        if (typeof showContainer === 'function') {
                            showContainer('lobby-container');
                        }

                        const players = window.roomPlayers || currentUsers || [];
                        if (window.gameType === 'liar' && players.length > 0) {
                            window.updateLiarRoleUI(amIHost);
                            window.renderLiarUsers(window.roomPlayers, amIHost);
                        }
                    }, 500);
                }
            };

            setTimeout(() => {
                const formattedStats = (result.stats || []).map(s => ({
                    id: s.id,
                    name: s.name,
                    color: s.color || '#FC944D',
                    stat1: `${s.score}승`,
                    stat2: s.stat2Text || '-',
                    isWinner: result.winner && s.id === result.winner.id
                }));

                const winnerObj = result.winner ? {
                    id: result.winner.id,
                    name: result.winner.name,
                    color: result.winner.color || '#fbbf24',
                    scoreText: `${result.winner.name} 우승!`
                } : null;

                window.showGameResultModal({
                    mode: 'liar',
                    modeName: '라이어 게임',
                    winner: winnerObj,
                    stat1Header: '최종 승수',
                    stat2Header: '검거 성공률',
                    rules: [
                        '1위: 목표 승수 선착순 달성 (우승)',
                        '2위 이하: 누적 승수가 높은 순서',
                        '승수 동점 시: 라이어 검거(지목) 성공률이 높은 순'
                    ],
                    stats: formattedStats,
                    history: result.history || [],
                    onConfirm: onConfirmResult
                });
            }, 800);
            return;
        }

        // 라운드 종료 통계 렌더링
        const hostDisplay = amIHost ? 'block' : 'none';
        const guestDisplay = amIHost ? 'none' : 'block';

        const btnHtml = `
            <div id="host-buttons" style="display: ${hostDisplay};">
                <button id="next-round-btn" class="start-btn" style="background:#3498db; margin-top: 16px; width: auto; padding: 10px 32px; font-size:0.92rem;">다음 라운드 시작</button>
            </div>
            <div id="guest-text" style="display: ${guestDisplay};">
                <div style="color: #94a3b8; font-size: 0.9rem; font-weight: 600; margin-top: 16px;">
                    다음 라운드 대기 중...
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
            <div class="liar-result-section">
                <h4 class="liar-result-sec-title">투표 결과</h4>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 0.85rem; max-height: 120px; overflow-y: auto; padding-right: 6px;">
                    ${sortedTargets.map(target => {
            const voterListText = target.voters.length > 0 ? target.voters.join(', ') : '없음';
            const voteStateClass = target.tally > 0 ? 'has-votes' : 'no-votes';
            return `
                            <div class="liar-result-vote-item ${voteStateClass}">
                                <span class="liar-result-vote-name">${target.name}</span>
                                <span class="liar-result-vote-count">(${target.tally}표)</span>
                                <div class="liar-result-voters" title="투표한 사람: ${voterListText}">
                                    지목: ${voterListText}
                                </div>
                            </div>
                        `;
        }).join('')}
                </div>
            </div>
        `;

        // 라운드 종료 스코어보드 (빙고 스타일 골드 도트 원으로 승수 시각화)
        const targetWins = window.winTarget || 3;
        const scoresBoardHtml = `
            <div class="liar-result-section">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                    <h4 class="liar-result-sec-title" style="margin: 0;">
                        스코어 <span class="liar-result-sec-sub">(목표 ${targetWins}승)</span>
                    </h4>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px;">
                    ${(result.stats || []).map(s => {
                        const mascotSvg = window.buildMascotSvg ? window.buildMascotSvg(s.color || '#FC944D', s.costume || []) : '';
                        
                        // 빙고 스타일 골드 도트 원 생성
                        let dotsHtml = '';
                        for (let i = 0; i < targetWins; i++) {
                            const isFilled = i < s.score;
                            dotsHtml += `<span class="liar-result-dot ${isFilled ? 'filled' : ''}"></span>`;
                        }

                        return `
                            <div class="liar-result-score-card">
                                <div style="width:28px; height:28px; flex-shrink:0;">${mascotSvg}</div>
                                <div style="flex:1; min-width:0;">
                                    <div class="liar-result-player-name">${s.name}</div>
                                    <div style="display:flex; align-items:center; gap:5px;">${dotsHtml}</div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        // 모든 설명들을 2열 조화로운 콤팩트 카드형으로 대칭 렌더링하여 스크롤 억제
        const roundTitle = result.citizensWon ? '시민 승리' : '라이어 승리';
        const roundTitleColor = result.citizensWon ? '#10b981' : '#ef4444';

        playerUI.innerHTML = `
            <div class="liar-glass-panel liar-result-panel" style="border-top: 8px solid ${roundTitleColor}; max-width:650px;">
                <div class="liar-result-title" style="color: ${roundTitleColor}; font-size: 2rem; font-weight: 900; letter-spacing: -0.5px; margin-bottom: 4px;">
                    ${roundTitle}
                </div>
                <div class="liar-result-msg" style="font-size:1.05rem; line-height:1.4; margin-bottom: 8px;">${result.message}</div>
                
                <div class="liar-final-reveal" style="margin: 12px 0; gap: 10px; display: flex; justify-content: center; flex-wrap: wrap;">
                    ${getRevealBoxesHtml(false)}
                </div>

                ${scoresBoardHtml}

                <div class="liar-result-section">
                    <h4 class="liar-result-sec-title">플레이어 발언</h4>
                    <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap: 8px; max-height: 180px; overflow-y: auto; padding-right: 6px;">
                        ${result.turnOrder ? result.turnOrder.map(pid => {
            const name = result.playerNames[pid] || '알수없음';
            const desc = result.submissions[pid] || '';
            return `
                                <div class="liar-result-speech-item">
                                    <strong class="liar-result-speaker">${name}:</strong> 
                                    <span class="liar-result-speech-text">"${desc}"</span>
                                </div>
                            `;
        }).join('') : ''}
                    </div>
                </div>

                ${votesHtml}

                ${resultChatHtml}

                <div style="margin-top: 24px;">
                    ${btnHtml}
                </div>
            </div>
        `;

        bindResultChatEvents();

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

    // --- 1라운드 및 다음 라운드 시작 시 3초 카운트다운 연출 및 보드 동기화 ---
    socket.on('liar game countdown start', (seconds) => {
        if (typeof showContainer === 'function') showContainer('liar-container');
        setupArea.style.display = 'none';
        waitingArea.style.display = 'none';
        playerUI.innerHTML = '';
        lastRoleData = null;
        mySubmittedDesc = '';

        document.body.classList.add('game-mode-liar');
        if (gridBoard) {
            gridBoard.style.display = 'grid';
            gridBoard.classList.remove('results-dimmed');
        }

        // 3초 카운트다운 연출 실행
        if (window.playStartCountdown) {
            window.playStartCountdown();
        }

        // 카드 배치 활성화를 위해 렌더링 동기화
        liarGameStarted = true;
        window.renderLiarUsers(window.roomPlayers, amIHost);
    });

    socket.on('liar game countdown tick', (seconds) => {
        // 3D 카드 플립 우회하므로 아무것도 하지 않음 (타이머 충돌 방지)
    });

    function updateLiarLobbySettingsUI(settings) {
        const previewEl = document.getElementById('liar-lobby-settings-preview');
        const hostPreviewEl = document.getElementById('liar-host-settings-preview');
        if (!settings) return;

        const categoriesText = settings.selectedCategories && settings.selectedCategories.length > 0
            ? settings.selectedCategories.join(', ')
            : "전체 랜덤";

        const html = `
            <div class="lobby-settings-title" style="justify-content: center; font-size: 0.95rem; margin-bottom: 14px; color: #ff7675; font-weight: 800; border-bottom: 1px solid rgba(255,118,117,0.15); padding-bottom: 6px;">게임 설정</div>
            <div class="lobby-settings-grid">
                <div class="lobby-settings-item">
                    <span class="lobby-settings-label">목표 승수</span>
                    <span class="lobby-settings-val"><span style="background: rgba(231, 76, 60, 0.12); border: 1px solid rgba(231, 76, 60, 0.3); color: #ff7675; padding: 2px 8px; border-radius: 6px; font-size: 0.8rem;">${settings.winTarget}승</span></span>
                </div>
                <div class="lobby-settings-item">
                    <span class="lobby-settings-label">선택 카테고리</span>
                    <span class="lobby-settings-val"><span style="background: rgba(231, 76, 60, 0.12); border: 1px solid rgba(231, 76, 60, 0.3); color: #ff7675; padding: 2px 8px; border-radius: 6px; font-size: 0.8rem; display: inline-block; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${categoriesText}">${categoriesText}</span></span>
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
        if (data && data.liar) {
            lastLiarSettings = data.liar;
            updateLiarLobbySettingsUI(data.liar);
        }
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

        // [이슈 28 해결] 구식 대기방 노출 차단
        setupArea.style.display = 'none';
        waitingArea.style.display = 'none';

        const players = window.roomPlayers || currentUsers || [];
        if (window.gameType === 'liar' && players.length > 0) {
            window.updateLiarRoleUI(amIHost);
            window.renderLiarUsers(window.roomPlayers, amIHost);
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

        liarTimerUI.innerHTML = `
            <div class="liar-timer-badge">
                <span class="timer-phase-tag">${data.phase}</span>
                <span style="opacity:0.3;">|</span>
                <span>남은 시간 <strong class="timer-countdown">${data.timeLeft}</strong>초</span>
            </div>
        `;
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

        // 결과창 내장 채팅(대안 A) 연동
        const historyEl = document.getElementById('liar-result-chat-history');
        if (historyEl) {
            const msgEl = document.createElement('div');
            msgEl.className = 'chat-msg';
            msgEl.style.cssText = 'animation: msgFadeIn 0.25s forwards; font-size: 0.85rem; line-height: 1.4;';

            const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const isSystem = (data.socketId === undefined || data.socketId === null || data.system);

            if (isSystem) {
                msgEl.innerHTML = `<span class="system-msg" style="display:block; margin: 2px 0; font-size: 0.8rem; color: #a29bfe; font-style: italic; text-align: center; background: rgba(162, 155, 254, 0.05); padding: 4px; border-radius: 6px; border: 1px dashed rgba(162, 155, 254, 0.15);">${data.message}</span>`;
            } else {
                const nameColor = data.socketId === socket.id ? '#38bdf8' : '#fbbf24';
                msgEl.innerHTML = `
                    <span class="chat-time" style="color:rgba(255,255,255,0.3); font-size:0.72rem; margin-right:4px;">[${time.split(' ')[1] || time}]</span>
                    <span class="chat-name" style="font-weight:bold; color:${nameColor}; margin-right:4px;">${data.sender}:</span>
                    <span class="chat-text" style="color:#e2e8f0; word-break:break-all;">${data.message}</span>
                `;
            }
            historyEl.appendChild(msgEl);
            historyEl.scrollTop = historyEl.scrollHeight; // 자동 스크롤
        }
    });

    // --- [피처 개편 5] 새로고침(F5) 세션 복구 핸들러 ---
    socket.on('restore liar state', (data) => {
        if (!data) return;

        if (typeof showContainer === 'function') showContainer('liar-container');
        const gameTitleEl = document.getElementById('game-title');
        if (gameTitleEl) gameTitleEl.textContent = '라이어 게임';

        liarGameStarted = true;
        window.gameScores = data.scores || {};
        window.winTarget = data.winTarget || 3;
        window.liarVotes = data.votes || {};

        setupArea.style.display = 'none';
        waitingArea.style.display = 'none';
        playerUI.innerHTML = '';

        document.body.classList.add('game-mode-liar');
        if (gridBoard) {
            gridBoard.style.display = 'grid';
            gridBoard.classList.remove('results-dimmed');
        }

        // 1. 유저 슬롯들 보드에 즉각 렌더링
        window.renderLiarUsers(window.roomPlayers, amIHost);

        lastRoleData = data;
        mySubmittedDesc = (data.submissions && data.submissions[socket.id]) ? data.submissions[socket.id] : '';

        // 2. 내 역할 카드 복원 (일원화 헬퍼 호출)
        renderMyRoleCard(data, true);

        // 다른 사람들의 기존 발언 말풍선 복구
        currentUsers.forEach(user => {
            if (user.id !== socket.id) {
                const slotContent = document.getElementById(`liar-slot-content-${user.id}`);
                if (slotContent) {
                    if (data.submissions && data.submissions[user.id]) {
                        slotContent.innerHTML = `
                            <div class="liar-speech-bubble">
                                "${data.submissions[user.id]}"
                            </div>
                        `;
                    } else {
                        slotContent.innerHTML = '';
                    }
                }
            }
        });

        // 3. 타이머 바 복구
        if (data.timeLeft > 0 && data.timerPhase && liarTimerUI) {
            liarTimerUI.style.display = 'block';
            liarTimerUI.innerHTML = `
                <div class="liar-timer-badge">
                    <span class="timer-phase-tag">${data.timerPhase}</span>
                    <span style="opacity:0.3;">|</span>
                    <span>남은 시간 <strong class="timer-countdown">${data.timeLeft}</strong>초</span>
                </div>
            `;
        }

        // 4. 페이즈별 UI 상태 즉시 복원
        if (data.status === 'submission') {
            // 발언 페이즈
            document.querySelectorAll('.liar-player-slot').forEach(el => el.classList.remove('active-turn'));
            if (data.currentTurnId) {
                const activeSlot = document.getElementById(`liar-slot-${data.currentTurnId}`);
                if (activeSlot) activeSlot.classList.add('active-turn');
            }

            inputZone.style.display = 'block';
            if (data.isMyTurn) {
                inputZone.innerHTML = `
                    <div class="liar-turn-panel" style="max-width: 500px; margin: 10px auto;">
                        <p style="color: #38bdf8; margin-bottom: 8px; font-weight: 700;">제시어를 설명해주세요</p>
                        <div style="display: flex; gap: 8px;">
                            <input type="text" id="liar-desc-input" maxlength="30" placeholder="제시어를 설명하세요 (30자 이내)" style="flex: 1; padding: 10px 14px; border-radius: 10px; border: 1px solid #475569; background: #1e293b; color: white; outline: none;">
                            <button id="liar-desc-submit" class="start-btn" style="padding: 10px 20px; font-size: 0.95rem;">제출</button>
                        </div>
                    </div>
                `;
                const descInput = document.getElementById('liar-desc-input');
                const submitBtn = document.getElementById('liar-desc-submit');
                if (descInput && submitBtn) {
                    descInput.focus();
                    const doSubmit = () => {
                        const text = descInput.value.trim();
                        if (!text) return;
                        socket.emit('submit description', text);
                        inputZone.innerHTML = '';
                    };
                    submitBtn.onclick = doSubmit;
                    descInput.onkeydown = (e) => { if (e.key === 'Enter') doSubmit(); };
                }
            } else {
                inputZone.innerHTML = `
                    <div class="liar-turn-panel" style="max-width: 500px; margin: 10px auto; text-align: center; border-color: rgba(56, 189, 248, 0.2); background: rgba(56, 189, 248, 0.03);">
                        <p style="margin: 0; font-size: 0.9rem;">
                            <strong>${data.currentTurnName || '상대방'}</strong>님이 단어를 설명하고 있습니다.
                        </p>
                    </div>
                `;
            }
        } else if (data.status === 'playing') {
            // 투표 페이즈
            document.querySelectorAll('.liar-player-slot').forEach(el => el.classList.remove('active-turn'));

            // 이미 투표한 사람들의 체크 배지 동기화
            if (data.votes) {
                for (let pid in data.votes) {
                    const checkBadge = document.getElementById(`liar-vote-check-${pid}`);
                    if (checkBadge) checkBadge.style.display = 'flex';
                }
            }

            if (data.hasVoted) {
                inputZone.style.display = 'block';
                inputZone.innerHTML = `
                    <div class="liar-turn-panel" style="max-width: 500px; margin: 10px auto; text-align: center; border-color: rgba(245, 158, 11, 0.4); background: rgba(245, 158, 11, 0.05);">
                        <p style="color: #fbbf24; margin: 0; font-weight: 700; animation: liarBlink 2s infinite;">⏳ 투표 완료! 다른 플레이어들의 투표 결과를 기다리는 중...</p>
                    </div>
                `;
            } else {
                // 아직 미투표 상태인 경우 타겟 클릭 활성화
                inputZone.innerHTML = '';
                document.querySelectorAll('.liar-player-slot').forEach(slot => {
                    const pid = slot.id.replace('liar-slot-', '');
                    if (pid === socket.id) return;

                    slot.classList.add('voting-target');
                    const nicknameEl = slot.querySelector('.liar-slot-nickname');
                    const pName = nicknameEl ? nicknameEl.textContent.replace('👑', '').trim() : '상대';

                    slot.onclick = () => {
                        inputZone.style.display = 'block';
                        inputZone.innerHTML = `
                            <div class="liar-turn-panel" style="max-width: 500px; margin: 10px auto; text-align: center; border-color: rgba(239, 68, 68, 0.5); background: rgba(239, 68, 68, 0.06); animation: liarCharDrop 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);">
                                <p class="liar-vote-prompt" style="font-size: 1.15rem; margin-bottom: 12px; font-weight: 800;">정말 <span style="color: #ef4444;">[${pName}]</span>님에게 투표하시겠습니까?</p>
                                <div style="display: flex; gap: 12px; justify-content: center;">
                                    <button id="vote-confirm-yes" class="start-btn liar-vote-confirm-btn" style="background: #10b981; padding: 8px 24px; font-size: 0.9rem;">투표 완료</button>
                                    <button id="vote-confirm-no" class="start-btn liar-vote-cancel-btn" style="padding: 8px 24px; font-size: 0.9rem;">취소</button>
                                </div>
                            </div>
                        `;

                        document.getElementById('vote-confirm-yes').onclick = () => {
                            socket.emit('vote liar', pid);
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
            }
        } else if (data.status === 'final_guess') {
            // 최후 변론 페이즈
            document.querySelectorAll('.liar-player-slot').forEach(el => {
                el.classList.remove('voting-target');
                el.onclick = null;
            });

            inputZone.style.display = 'block';
            if (socket.id === data.liarId) {
                // 본인이 라이어
                inputZone.innerHTML = `
                    <div class="liar-turn-panel" style="max-width: 550px; margin: 10px auto; border-color: rgba(239, 68, 68, 0.5); background: rgba(239, 68, 68, 0.06); padding: 16px;">
                        <p style="color: #ef4444; margin-bottom: 6px; font-weight: 800; font-size: 1.05rem;">검거되었습니다! 최후의 정답을 맞추면 역전 승리합니다.</p>
                        <p style="color: #94a3b8; margin-bottom: 12px; font-size: 0.85rem;">카테고리: <strong style="color: #fbbf24;">${data.category || ''}</strong></p>
                        <div style="display: flex; gap: 8px;">
                            <input type="text" id="liar-final-input" maxlength="20" placeholder="제시어를 입력하세요" autocomplete="off" style="flex: 1; padding: 10px 14px; border-radius: 10px; border: 1px solid #475569; background: #1e293b; color: white; outline: none;">
                            <button id="liar-final-submit" class="start-btn" style="background: #ef4444; padding: 10px 20px; font-size: 0.95rem;">최종 제출</button>
                        </div>
                    </div>
                `;
                const finalInput = document.getElementById('liar-final-input');
                const finalSubmit = document.getElementById('liar-final-submit');
                if (finalInput && finalSubmit) {
                    finalInput.focus();
                    finalInput.oninput = (e) => {
                        socket.emit('final guess typing', e.target.value);
                    };
                    const doSubmitFinal = () => {
                        const val = finalInput.value.trim();
                        if (!val) return;
                        socket.emit('submit final guess', val);
                        inputZone.innerHTML = '';
                    };
                    finalSubmit.onclick = doSubmitFinal;
                    finalInput.onkeydown = (e) => { if (e.key === 'Enter') doSubmitFinal(); };
                }
            } else {
                // 시민들 훔쳐보기 패널
                inputZone.innerHTML = `
                    <div class="liar-turn-panel" style="max-width: 550px; margin: 10px auto; border-color: rgba(56, 189, 248, 0.3); background: rgba(15, 23, 42, 0.8); padding: 16px; text-align: center;">
                        <p style="color: #38bdf8; margin-bottom: 8px; font-weight: 800;">라이어(${data.liarName})가 최후의 정답을 추리하고 있습니다...</p>
                        <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.4); padding: 8px 18px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                            <span style="font-size: 0.85rem; color: #94a3b8;">실시간 입력:</span>
                            <span id="final-guess-peek-text" style="font-size: 1.1rem; font-weight: bold; color: #facc15; min-width: 60px; text-align: left;">(입력 대기 중...)</span>
                        </div>
                    </div>
                `;
            }
        }

        if (window.showToast) {
            window.showToast('라이어 게임 세션이 원래대로 복구되었습니다.', 'info');
        }
    });

})();
