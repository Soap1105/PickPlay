// public/js/room.js

/* ── 로딩 오버레이 제어 ── */
const LOADING_MIN_MS = 1500; // 최소 노출 시간
const _loadingStart = Date.now();
let _loadingReady = false;
let _retryTimer = null;

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;
    const elapsed = Date.now() - _loadingStart;
    const remaining = Math.max(0, LOADING_MIN_MS - elapsed);
    setTimeout(() => {
        overlay.classList.add('hidden');
    }, remaining);
}

function showLoading(status = '연결 중...', retryText = '') {
    const overlay = document.getElementById('loading-overlay');
    const statusEl = document.getElementById('loading-status');
    const retryEl = document.getElementById('loading-retry');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    if (statusEl) statusEl.textContent = status;
    if (retryEl) retryEl.textContent = retryText;
}

function startRetryCountdown(seconds) {
    if (_retryTimer) clearInterval(_retryTimer);
    let n = seconds;
    const retryEl = document.getElementById('loading-retry');
    const update = () => {
        if (retryEl) retryEl.textContent = `연결 실패 — ${n}초 후 재시도`;
        if (n <= 0) { clearInterval(_retryTimer); _retryTimer = null; }
        n--;
    };
    update();
    _retryTimer = setInterval(update, 1000);
}

// 소켓 연결 끊김
socket.on('disconnect', () => {
    showLoading('재연결 중...');
    startRetryCountdown(5);
});

// 소켓 재연결 시도
socket.on('reconnect_attempt', (attempt) => {
    showLoading('재연결 중...');
    startRetryCountdown(5);
});

// 소켓 재연결 성공 → role update 이벤트가 hiding 처리함

/* ── 다크/라이트 모드 토글 (기본: 라이트, dark-mode 클래스로 다크 전환) ── */
function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('pickplay-theme', isDark ? 'dark' : 'light');
    const icon = document.getElementById('theme-icon');
    if (icon) icon.textContent = isDark ? '☀️' : '🌙';
}

// 페이지 로드 시 저장된 테마 복원
(function applyStoredTheme() {
    const stored = localStorage.getItem('pickplay-theme');
    if (stored === 'dark') {
        document.body.classList.add('dark-mode');
        const icon = document.getElementById('theme-icon');
        if (icon) icon.textContent = '☀️';
    }
    // 저장값 없으면 라이트 기본값 유지 (아무것도 안 함)
})();

let isHost = false;

// UI Elements
const lobbyContainer = document.getElementById('lobby-container');
const bingoContainer = document.getElementById('bingo-container');
const liarContainer = document.getElementById('liar-container');
const myRoleDisplay = document.getElementById('my-role-display');
const userGrid = document.getElementById('user-grid');
const stylesheetLink = document.getElementById('game-stylesheet');

// Buttons
const gameSelectBtns = document.querySelectorAll('.game-select-btn');
const returnLobbyBtns = document.querySelectorAll('.return-lobby-btn');
const closeResultBtn = document.getElementById('close-result-btn');

function showContainer(containerId) {
    const lobbyDiv = document.getElementById('lobby-container');
    const bingoDiv = document.getElementById('bingo-container');
    const liarDiv = document.getElementById('liar-container');
    const bombDiv = document.getElementById('bomb-container');

    if (lobbyDiv) lobbyDiv.classList.add('hidden-container');
    if (bingoDiv) bingoDiv.classList.add('hidden-container');
    if (liarDiv) liarDiv.classList.add('hidden-container');
    if (bombDiv) bombDiv.classList.add('hidden-container');

    const activeContainer = document.getElementById(containerId);
    if (activeContainer) activeContainer.classList.remove('hidden-container');

    // 대기실과 인게임 사이드바 전환 분기
    if (containerId !== 'lobby-container') {
        document.body.classList.remove('in-lobby');
        const gameContainer = document.getElementById('game-container');
        if (gameContainer) gameContainer.classList.add('game-active');
    } else {
        document.body.classList.add('in-lobby');
        const gameContainer = document.getElementById('game-container');
        if (gameContainer) gameContainer.classList.remove('game-active');
    }
}

socket.on('role update', (data) => {
    hideLoading(); // 방 진입 완료 → 로딩 숨김
    isHost = data.isHost;
    myRoleDisplay.textContent = isHost ? "👑 방장" : "👤 참가자";

    // 1단계 로비 카드들의 클릭/설명 처리
    const cards = document.querySelectorAll('.lobby-game-card');

    const startBtn = document.getElementById('integrated-start-btn');
    const settingsBtn = document.getElementById('integrated-settings-btn');
    const returnBtn = document.getElementById('integrated-return-btn');

    const selectorPanel = document.getElementById('lobby-game-selector-panel');
    const guestWaitingPanel = document.getElementById('lobby-guest-waiting-panel');

    if (isHost) {
        if (selectorPanel) selectorPanel.style.display = 'flex';
        if (guestWaitingPanel) guestWaitingPanel.style.display = 'none';

        cards.forEach(card => {
            card.style.pointerEvents = 'auto';
            card.style.opacity = '1';
            card.style.cursor = 'pointer';
        });


        // 방장 액션 노출
        if (startBtn) startBtn.style.display = 'flex';
        if (settingsBtn) settingsBtn.style.display = 'flex';
        if (returnBtn) returnBtn.innerHTML = `<i class="fas fa-arrow-left"></i> 대기실로`;
    } else {
        if (selectorPanel) selectorPanel.style.display = 'none';
        if (guestWaitingPanel) guestWaitingPanel.style.display = 'flex';

        cards.forEach(card => {
            card.style.pointerEvents = 'none';
            card.style.opacity = '0.85';
            card.style.cursor = 'default';
        });


        // 게스트 액션 노출 제한
        if (startBtn) startBtn.style.display = 'none';
        if (settingsBtn) settingsBtn.style.display = 'none';
        if (returnBtn) returnBtn.innerHTML = `<i class="fas fa-arrow-left"></i> 나가기`;
    }

    if (window.gameType === 'lobby') {
        const stageSelection = document.getElementById('selection-stage');
        const stageWaiting = document.getElementById('waiting-stage');
        if (stageSelection) stageSelection.style.display = 'flex';
        if (stageWaiting) stageWaiting.style.display = 'none';

        document.body.classList.add('in-lobby');
    }

    // Trigger role update in specific games if they are active
    if (window.gameType === 'bingo' && window.updateBingoRoleUI) {
        window.updateBingoRoleUI(isHost);
    }
    if (window.gameType === 'liar' && window.updateLiarRoleUI) {
        window.updateLiarRoleUI(isHost);
    }
    if (window.gameType === 'bomb' && window.updateBombRoleUI) {
        window.updateBombRoleUI(isHost);
    }
});

socket.on('update user list', (users) => {
    window.roomPlayers = users; // 전역 스토어 캐시 보존
    // 룸 ID 복사 텍스트 업데이트
    const roomIdEl = document.getElementById('lobby-room-id-display');
    if (roomIdEl && window.roomId) {
        roomIdEl.textContent = window.roomId;
    }

    const isGamePlaying = document.getElementById('game-container').classList.contains('game-active');

    if (isGamePlaying) {
        // 인게임 진행 중일 때는 원래 기존 참여자 목록/사이드바 렌더러 동작
        document.body.classList.remove('in-lobby');

        if (window.gameType === 'bingo' && window.renderBingoUsers) {
            window.renderBingoUsers(users, isHost);
            return;
        }
        if (window.gameType === 'liar' && window.renderLiarUsers) {
            window.renderLiarUsers(users, isHost);
            return;
        }
        if (window.gameType === 'bomb' && window.renderBombUsers) {
            window.renderBombUsers(users, isHost);
            return;
        }
    } else {
        // 대기실 상태일 때는 100% 채팅 모드로 클래스 추가 및 2x4 매트릭스 렌더링
        document.body.classList.add('in-lobby');
        renderPlayerMatrix(users);
    }
});

// Host selects a game
gameSelectBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const selectedGame = btn.getAttribute('data-game');
        socket.emit('host select game', selectedGame);
    });
});

// Return to lobby
returnLobbyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        if (!isHost) return;
        // bomb.js에 자체 핸들러가 있으므로 중복 방지
        if (window.gameType === 'bomb') return;

        socket.emit('return to lobby');
    });
});

// =============================================
//  게스트 대기실 파티클 + 팁 로테이션
// =============================================
(function () {
    // --- 배경 파티클 생성 ---
    const particleContainer = document.getElementById('gw-particles');
    if (particleContainer) {
        const COLORS = ['#64c8ff', '#a29bfe', '#fd79a8', '#fdcb6e', '#55efc4'];
        for (let i = 0; i < 18; i++) {
            const p = document.createElement('div');
            p.className = 'gw-particle';
            const size = 8 + Math.random() * 24;
            p.style.cssText = [
                `width:${size}px`, `height:${size}px`,
                `left:${Math.random() * 100}%`,
                `bottom:${-size}px`,
                `background:${COLORS[Math.floor(Math.random() * COLORS.length)]}`,
                `animation-duration:${8 + Math.random() * 12}s`,
                `animation-delay:${Math.random() * 10}s`,
            ].join(';');
            particleContainer.appendChild(p);
        }
    }

    // --- 팁 로테이션 ---
    const TIPS = [
        '💡 <strong>팁:</strong> 채팅창에서 친구들과 대화하며 기다려 보세요!',
        '🎯 <strong>빙고:</strong> 단어 배치 전략이 승패를 가릅니다!',
        '🕵️ <strong>라이어:</strong> 너무 자세히 설명하면 오히려 의심받아요!',
        '💣 <strong>폭탄:</strong> 당황하지 말고 침착하게 단어를 떠올리세요!',
        '🎮 <strong>PickPlay:</strong> 이모지 폭죽으로 분위기를 올려보세요!',
        '👥 <strong>참가자:</strong> 우측 목록에서 함께하는 친구들을 확인하세요!',
    ];
    let tipIndex = 0;
    const tipEl = document.getElementById('guest-tip-text');
    if (!tipEl) return;

    function rotateTip() {
        tipIndex = (tipIndex + 1) % TIPS.length;
        tipEl.style.opacity = '0';
        setTimeout(() => {
            tipEl.innerHTML = TIPS[tipIndex];
            tipEl.style.opacity = '1';
        }, 400);
    }
    setInterval(rotateTip, 5000);
})();


if (closeResultBtn) {
    closeResultBtn.addEventListener('click', () => {
        document.getElementById('result-modal').style.display = 'none';
        // [버그 수정] 결과 확인 완료를 서버에 알림 → confirmedResult = true 처리
        // 이걸 emit해야 방장이 '아직 결과 확인 중인 플레이어가 있습니다' 에러 없이 새 게임 시작 가능
        socket.emit('confirm result');
    });
}

// Server notifies that the game mode has changed
// Server notifies that the game mode has changed
socket.on('game changed', (newGameType) => {
    window.gameType = newGameType;
    const gameContainer = document.getElementById('game-container');
    // [이슈 26] 대기방 복귀 시 결과 모달을 자동으로 닫지 않음 (사용자 클릭 시에만 닫힘)

    // 1단계 로비 카드/대기 상태 강제 동기화
    const selectorPanel = document.getElementById('lobby-game-selector-panel');
    const guestWaitingPanel = document.getElementById('lobby-guest-waiting-panel');
    if (isHost) {
        if (selectorPanel) selectorPanel.style.display = 'flex';
        if (guestWaitingPanel) guestWaitingPanel.style.display = 'none';
    } else {
        if (selectorPanel) selectorPanel.style.display = 'none';
        if (guestWaitingPanel) guestWaitingPanel.style.display = 'flex';
    }

    // 결과 확인창 클리어
    gameContainer.classList.remove('game-active', 'game-active-bingo', 'game-active-liar', 'game-active-bomb');

    // 대기방 상태로 돌려놓기 (항상 lobby-container를 먼저 보여줌)
    showContainer('lobby-container');

    const stageSelection = document.getElementById('selection-stage');
    const stageWaiting = document.getElementById('waiting-stage');

    // 카드 active 스타일 업데이트
    document.querySelectorAll('.lobby-game-card').forEach(card => {
        card.classList.remove('active');
        if (card.getAttribute('data-game') === newGameType) {
            card.classList.add('active');
        }
    });

    if (newGameType === 'lobby') {
        stylesheetLink.href = "";
        document.getElementById('game-title').textContent = "PickPlay 대기실";

        if (stageSelection) stageSelection.style.display = 'flex';
        if (stageWaiting) stageWaiting.style.display = 'none';

        // 대기실 진입 시 이모지 팔레트 표시
        emojiSetLobbyMode(true);
    } else {
        // 게임 대기방 단계
        if (stageSelection) stageSelection.style.display = 'none';
        if (stageWaiting) stageWaiting.style.display = 'flex';

        // 대기실 헤더 텍스트 변경
        const waitingTitleEl = document.getElementById('waiting-game-title');
        if (newGameType === 'bingo') {
            stylesheetLink.href = "/css/bingo.css";
            document.getElementById('game-title').textContent = "빙고 게임 대기방";
            if (waitingTitleEl) waitingTitleEl.innerHTML = `🎯 빙고 게임 대기방`;
            gameContainer.classList.add('game-active-bingo');
            if (window.initBingoUI) window.initBingoUI(isHost);
        } else if (newGameType === 'liar') {
            stylesheetLink.href = "/css/liar.css";
            document.getElementById('game-title').textContent = "라이어 게임 대기방";
            if (waitingTitleEl) waitingTitleEl.innerHTML = `🕵️ 라이어 게임 대기방`;
            gameContainer.classList.add('game-active-liar');
            if (window.initLiarUI) window.initLiarUI(isHost);
        } else if (newGameType === 'bomb') {
            stylesheetLink.href = "";
            document.getElementById('game-title').textContent = "폭탄 돌리기 게임 대기방";
            if (waitingTitleEl) waitingTitleEl.innerHTML = `💣 폭탄 돌리기 게임 대기방`;
            gameContainer.classList.add('game-active-bomb');
            if (window.initBombUI) window.initBombUI(isHost);
        }

        // 프리뷰 렌더링 호출
        updateIntegratedLobbySettingsPreview(newGameType);

        // 게임 대기실에서는 팔레트 표시 유지
        emojiSetLobbyMode(true);
    }
});

// =============================================
//  이모지 폭죽 시스템
// =============================================

const EMOJI_PALETTE_BAR = document.getElementById('emoji-palette-bar');
const EMOJI_TOGGLE_CHECKBOX = document.getElementById('emoji-toggle-checkbox');
const EMOJI_FIRE_BTNS = document.querySelectorAll('.emoji-fire-btn');

// localStorage에서 ON/OFF 상태 복원
let emojiEffectEnabled = localStorage.getItem('emojiEffectEnabled') !== 'false';
EMOJI_TOGGLE_CHECKBOX.checked = emojiEffectEnabled;

// 팔레트 바 표시/숨기기 (대기실 여부에 따라)
function emojiSetLobbyMode(isLobby) {
    if (isLobby) {
        EMOJI_PALETTE_BAR.classList.remove('emoji-hidden');
    } else {
        EMOJI_PALETTE_BAR.classList.add('emoji-hidden');
    }
}

// ON/OFF 토글
EMOJI_TOGGLE_CHECKBOX.addEventListener('change', () => {
    emojiEffectEnabled = EMOJI_TOGGLE_CHECKBOX.checked;
    localStorage.setItem('emojiEffectEnabled', emojiEffectEnabled);
});

// 이모지 버튼 클릭 → 쿨다운 처리 + 서버로 emit
let emojiLocalCooldown = false;

EMOJI_FIRE_BTNS.forEach(btn => {
    btn.addEventListener('click', () => {
        if (emojiLocalCooldown) return;
        if (window.gameType !== 'lobby') return;

        const emoji = btn.getAttribute('data-emoji');
        socket.emit('emoji reaction', emoji);

        // 클라이언트 쿨다운 UI (2.5초)
        emojiLocalCooldown = true;
        EMOJI_FIRE_BTNS.forEach(b => b.classList.add('on-cooldown'));
        setTimeout(() => {
            emojiLocalCooldown = false;
            EMOJI_FIRE_BTNS.forEach(b => b.classList.remove('on-cooldown'));
        }, 2500);
    });
});

// 서버로부터 이모지 수신 → 파티클 발사
socket.on('emoji reaction', ({ emoji, sender }) => {
    if (!emojiEffectEnabled) return;
    launchEmojiFireworks(emoji, sender);
});

/**
 * 이모지 파티클을 화면 하단에서 여러 개 분산 발사
 */
function launchEmojiFireworks(emoji, sender) {
    const COUNT = 7; // 한 번에 발사할 파티클 수
    const windowW = window.innerWidth;
    const windowH = window.innerHeight;

    for (let i = 0; i < COUNT; i++) {
        // 화면 하단 40% 구간에서 랜덤 x 위치
        const startX = windowW * (0.1 + Math.random() * 0.8);
        const startY = windowH * (0.75 + Math.random() * 0.2);

        const duration = 2.2 + Math.random() * 1.2; // 2.2~3.4s
        const flyHeight = -(55 + Math.random() * 35); // -55vh ~ -90vh
        const rotate = (Math.random() > 0.5 ? 1 : -1) * (180 + Math.random() * 360);
        const delay = i * 80; // 80ms 간격으로 순차 발사

        setTimeout(() => {
            const el = document.createElement('div');
            el.className = 'emoji-particle';
            el.textContent = emoji;
            el.style.setProperty('--duration', `${duration}s`);
            el.style.setProperty('--fly-height', `${flyHeight}vh`);
            el.style.setProperty('--rotate', `${rotate}deg`);
            el.style.left = `${startX}px`;
            el.style.top = `${startY}px`;
            document.body.appendChild(el);

            // 첫 번째 파티클에만 이름 라벨 붙이기
            if (i === 0 && sender) {
                const label = document.createElement('div');
                label.className = 'emoji-sender-label';
                label.textContent = sender;
                label.style.left = `${startX + 30}px`;
                label.style.top = `${startY - 18}px`;
                document.body.appendChild(label);
                setTimeout(() => label.remove(), 2300);
            }

            setTimeout(() => el.remove(), duration * 1000 + 100);
        }, delay);
    }
}

// =======================================================
//  [로비 오버홀] 2x4 매트릭스 그리드 빌더 & 동적 프리뷰 연동
// =======================================================

// 최신 룸 세팅 캐시
let latestSettings = {
    bingo: { winLines: 3, turnOrder: 'host_first', turnTimeLimit: 15, useEvents: true },
    liar: { winTarget: 3, selectedCategories: [] },
    bomb: { hearts: 3, subMode: 'random', timerRange: 'medium', showTimer: true }
};

// 8칸 플레이어 매트릭스 동적 렌더링 함수
function renderPlayerMatrix(users) {
    const lobbyMatrix = document.getElementById('lobby-player-matrix');
    const waitingMatrix = document.getElementById('waiting-player-matrix');
    const lobbyCount = document.getElementById('lobby-user-count');
    const waitingCount = document.getElementById('waiting-user-count');

    const totalSlots = 8;
    let html = '';

    for (let i = 0; i < totalSlots; i++) {
        if (i < users.length) {
            const user = users[i];
            const isMe = user.id === socket.id;
            const isUserHost = users[0] && users[0].id === user.id;
            const isReady = user.isReady || isUserHost; // 방장은 기본 ready로 간주

            let crownHtml = isUserHost ? `<i class="fas fa-crown host-crown" style="color: #f1c40f;"></i>` : '';
            let borderStyle = isUserHost ? `border-color: #f1c40f;` : '';

            let badgeClass = '';
            let badgeText = '';

            // [이슈 26] 아직 결과를 확인하지 않은 경우 대기방 배지에 표시
            if (user.confirmedResult === false) {
                badgeClass = 'badge-unconfirmed';
                badgeText = '결과 확인 중';
            } else {
                badgeClass = isReady ? 'badge-ready' : 'badge-waiting';
                badgeText = isUserHost ? '방장' : (isReady ? '준비 완료' : '대기 중...');
            }

            // 강퇴 버튼 (방장이고 내가 아닌 다른 타인 카드일 때) + 강퇴 전 경고창 confirm 추가
            let kickHtml = (isHost && !isMe) ? `<div class="slot-kick-btn" onclick="window.confirmKick('${user.id}', '${user.name.replace(/'/g, "\\'")}')">✕</div>` : '';

            html += `
                <div class="player-slot ${isMe ? 'is-me' : ''}">
                    ${crownHtml}
                    <div class="avatar-wrap" style="${borderStyle}">${user.avatar}</div>
                    <div class="player-name">${user.name}${isMe ? ' (나)' : ''}</div>
                    <span class="player-badge ${badgeClass}">${badgeText}</span>
                    ${kickHtml}
                </div>
            `;
        } else {
            // 빈 슬롯
            html += `<div class="player-slot empty"></div>`;
        }
    }

    if (lobbyMatrix) lobbyMatrix.innerHTML = html;
    if (waitingMatrix) waitingMatrix.innerHTML = html;

    const countText = `참가: ${users.length} / 8`;
    if (lobbyCount) lobbyCount.textContent = countText;
    if (waitingCount) waitingCount.textContent = countText;
}

// 설정 실시간 수신 핸들러 등록
socket.on('lobby settings updated', (data) => {
    if (data) {
        if (data.bingo) latestSettings.bingo = data.bingo;
        if (data.liar) latestSettings.liar = data.liar;
        if (data.bomb) latestSettings.bomb = data.bomb;

        // 현재 특정 대기방 상태라면 통합 프리뷰 리렌더링
        if (window.gameType && window.gameType !== 'lobby') {
            updateIntegratedLobbySettingsPreview(window.gameType);
        }
    }
});

// 통합 프리뷰 드로잉 엔진
function updateIntegratedLobbySettingsPreview(gameType) {
    const previewContainer = document.getElementById('integrated-preview-container');
    if (!previewContainer) return;

    let html = '';

    if (gameType === 'bingo') {
        const settings = latestSettings.bingo;
        const turnOrderText = settings.turnOrder === 'random' ? '랜덤' : (settings.turnOrder === 'join_asc' ? '입장 순서' : '방장 우선');
        const limitVal = settings.turnTimeLimit !== undefined ? settings.turnTimeLimit : (settings.turnTime !== undefined ? settings.turnTime : 15);
        const timeLimitText = limitVal === 0 ? '무제한' : `${limitVal}초`;
        html = `
            <span class="preview-badge" id="preview-badge-lines"><i class="fas fa-bullseye"></i> 목표: <strong>${settings.winLines}줄</strong></span>
            <span class="preview-badge" id="preview-badge-order"><i class="fas fa-sort-amount-down"></i> 순서: <strong>${turnOrderText}</strong></span>
            <span class="preview-badge" id="preview-badge-time"><i class="fas fa-stopwatch"></i> 시간: <strong>${timeLimitText}</strong></span>
            <span class="preview-badge" id="preview-badge-events"><i class="fas fa-bolt"></i> 이벤트: <strong>${settings.useEvents ? 'ON' : 'OFF'}</strong></span>
        `;
    } else if (gameType === 'liar') {
        const settings = latestSettings.liar;
        const categories = (settings.selectedCategories && settings.selectedCategories.length > 0)
            ? settings.selectedCategories.join(', ')
            : '전체 랜덤';
        html = `
            <span class="preview-badge"><i class="fas fa-trophy"></i> 목표 승수: <strong>${settings.winTarget}승</strong></span>
            <span class="preview-badge" title="${categories}"><i class="fas fa-tags"></i> 카테고리: <strong style="max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${categories}</strong></span>
        `;
    } else if (gameType === 'bomb') {
        const settings = latestSettings.bomb;
        const timerText = settings.timerRange === 'short' ? '짧게' : (settings.timerRange === 'long' ? '길게' : '보통');
        const modeText = settings.subMode === 'tactical' ? '전략 모드' : '랜덤 모드';
        html = `
            <span class="preview-badge"><i class="fas fa-heart"></i> 시작 목숨: <strong>${settings.hearts}개</strong></span>
            <span class="preview-badge"><i class="fas fa-gamepad"></i> 모드: <strong>${modeText}</strong></span>
            <span class="preview-badge"><i class="fas fa-stopwatch"></i> 시간: <strong>${timerText}</strong></span>
            <span class="preview-badge"><i class="fas fa-eye"></i> 타이머 표시: <strong>${settings.showTimer ? 'ON' : 'OFF'}</strong></span>
        `;
    }

    previewContainer.innerHTML = html;
}

// 대리 이벤트 맵핑 (통합 버튼 클릭 -> 원래 버튼 클릭 트리거)
function bindIntegratedEvents() {
    // 통합 시작 버튼
    const integratedStartBtn = document.getElementById('integrated-start-btn');
    if (integratedStartBtn) {
        integratedStartBtn.addEventListener('click', () => {
            if (window.gameType === 'bingo') {
                const btn = document.getElementById('start-game-bingo');
                if (btn) btn.click();
            } else if (window.gameType === 'liar') {
                const btn = document.getElementById('start-game-liar');
                if (btn) btn.click();
            } else if (window.gameType === 'bomb') {
                const btn = document.getElementById('start-game-bomb');
                if (btn) btn.click();
            }
        });
    }

    // 통합 설정 버튼
    const integratedSettingsBtn = document.getElementById('integrated-settings-btn');
    if (integratedSettingsBtn) {
        integratedSettingsBtn.addEventListener('click', () => {
            if (window.gameType === 'bingo') {
                const btn = document.getElementById('open-settings-bingo');
                if (btn) btn.click();
            } else if (window.gameType === 'liar') {
                const btn = document.getElementById('open-settings-liar');
                if (btn) btn.click();
            } else if (window.gameType === 'bomb') {
                const btn = document.getElementById('open-settings-bomb');
                if (btn) btn.click();
            }
        });
    }

    // 통합 대기실로 복귀 버튼
    const integratedReturnBtn = document.getElementById('integrated-return-btn');
    if (integratedReturnBtn) {
        integratedReturnBtn.addEventListener('click', () => {
            if (!isHost) {
                // 게스트는 나가기 기능
                window.location.href = '/';
                return;
            }
            // [버그 수정] 구형 UI 버튼의 가상 클릭을 유도하지 않고 직접 다이렉트 소켓을 전송하여 예외 락 방지
            if (window.gameType === 'bomb') {
                socket.emit('return to lobby from bomb');
            } else {
                socket.emit('return to lobby');
            }
        });
    }

    // 로비 초대 링크 복사 버튼 연동
    const lobbyInviteBtn = document.getElementById('lobby-invite-btn');
    if (lobbyInviteBtn) {
        lobbyInviteBtn.addEventListener('click', () => {
            const orgBtn = document.getElementById('invite-btn');
            if (orgBtn) orgBtn.click();
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindIntegratedEvents);
} else {
    bindIntegratedEvents();
}

// 방장 대기방 유저 강퇴 확인창 헬퍼 함수
window.confirmKick = function (targetId, targetName) {
    if (window.showConfirm) {
        window.showConfirm(`${targetName}님을 강퇴하시겠습니까?`, () => {
            socket.emit('kick user', targetId);
        });
    } else {
        if (confirm(`${targetName}님을 강퇴하시겠습니까?`)) {
            socket.emit('kick user', targetId);
        }
    }
};

