// public/js/room.js

/* ── 로딩 오버레이 제어 ── */
const LOADING_MIN_MS = 1500; // 최소 노출 시간
const _loadingStart = Date.now();
let _loadingReady = false;
let _retryTimer = null;
let _stageTimer = null;

// 초기 진입 시 단계별 문구 표시
_stageTimer = setTimeout(() => {
    const statusEl = document.getElementById('loading-status');
    const overlay = document.getElementById('loading-overlay');
    if (statusEl && overlay && !overlay.classList.contains('hidden') && !_retryTimer) {
        statusEl.textContent = '게임 환경을 준비하는 중...';
    }
}, 700);

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;
    if (_stageTimer) clearTimeout(_stageTimer);
    const statusEl = document.getElementById('loading-status');
    if (statusEl && !_retryTimer) {
        statusEl.textContent = '입장 준비 완료!';
    }
    const elapsed = Date.now() - _loadingStart;
    const remaining = Math.max(0, LOADING_MIN_MS - elapsed);
    setTimeout(() => {
        overlay.classList.add('hidden');
    }, remaining);
}

function showLoading(status = '서버에 연결하는 중...', retryText = '') {
    const overlay = document.getElementById('loading-overlay');
    const statusEl = document.getElementById('loading-status');
    const retryEl = document.getElementById('loading-retry');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    if (statusEl) statusEl.textContent = status;
    if (retryEl) retryEl.textContent = retryText;
}

let _previewTimers = [];

function clearPreviewTimers() {
    _previewTimers.forEach(t => clearTimeout(t));
    _previewTimers = [];
}

function previewLoadingScreen() {
    const overlay = document.getElementById('loading-overlay');
    const statusEl = document.getElementById('loading-status');
    const retryEl = document.getElementById('loading-retry');
    if (!overlay) return;

    clearPreviewTimers();
    if (retryEl) retryEl.textContent = '';
    if (statusEl) statusEl.textContent = '서버에 연결하는 중...';
    overlay.classList.remove('hidden');

    _previewTimers.push(setTimeout(() => {
        if (statusEl && !overlay.classList.contains('hidden')) {
            statusEl.textContent = '게임 환경을 준비하는 중...';
        }
    }, 800));

    _previewTimers.push(setTimeout(() => {
        if (statusEl && !overlay.classList.contains('hidden')) {
            statusEl.textContent = '입장 준비 완료!';
        }
    }, 1800));

    _previewTimers.push(setTimeout(() => {
        overlay.classList.add('hidden');
        clearPreviewTimers();
    }, 2300));
}

// 오버레이 클릭 시 수동 닫기 (미리보기 등 언제든 즉시 닫기 가능)
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.addEventListener('click', () => {
            clearPreviewTimers();
            overlay.classList.add('hidden');
        });
    }
});

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
    showLoading('네트워크 재연결 시도 중...');
    startRetryCountdown(5);
});

// 소켓 재연결 시도
socket.on('reconnect_attempt', (attempt) => {
    showLoading('네트워크 재연결 시도 중...');
    startRetryCountdown(5);
});

// 소켓 재연결 성공 → 타이머 정리 (hideLoading은 role update가 처리)
socket.on('connect', () => {
    if (_retryTimer) {
        clearInterval(_retryTimer);
        _retryTimer = null;
    }
});

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
        // 인게임 진입 시 lobby-theme 배경 클리어 (인게임 자체 스타일로 대체)
        document.body.classList.remove('lobby-theme-bingo', 'lobby-theme-liar', 'lobby-theme-bomb');
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
    const panelTitleText = document.getElementById('lobby-panel-title-text');

    if (selectorPanel) selectorPanel.style.display = 'flex';

    if (isHost) {
        if (panelTitleText) panelTitleText.innerHTML = `<i class="fas fa-list"></i> 게임 선택`;
        cards.forEach(card => {
            card.classList.remove('guest-mode');
            card.style.pointerEvents = 'auto';
            card.style.cursor = 'pointer';
        });

        // 방장 액션 노출
        if (startBtn) startBtn.style.display = 'flex';
        if (settingsBtn) settingsBtn.style.display = 'flex';
        if (returnBtn) returnBtn.innerHTML = `<i class="fas fa-arrow-left"></i> 대기실로`;
    } else {
        if (panelTitleText) panelTitleText.innerHTML = `<i class="fas fa-gamepad"></i> 플레이할 게임`;
        cards.forEach(card => {
            card.classList.add('guest-mode');
            card.style.pointerEvents = 'none';
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

    // 1단계 로비 카드/대기 상태 동기화
    const selectorPanel = document.getElementById('lobby-game-selector-panel');
    if (selectorPanel) selectorPanel.style.display = 'flex';

    // 결과 확인창 클리어
    gameContainer.classList.remove('game-active', 'game-active-bingo', 'game-active-liar', 'game-active-bomb');

    // 대기방 상태로 돌려놓기 (항상 lobby-container를 먼저 보여줌)
    showContainer('lobby-container');

    // 대기실 배경 무드 테마 전환
    document.body.classList.remove('lobby-theme-bingo', 'lobby-theme-liar', 'lobby-theme-bomb');
    if (newGameType === 'bingo') {
        document.body.classList.add('lobby-theme-bingo');
    } else if (newGameType === 'liar') {
        document.body.classList.add('lobby-theme-liar');
    } else if (newGameType === 'bomb') {
        document.body.classList.add('lobby-theme-bomb');
    }
    // newGameType === 'lobby' 일 때는 클래스 없음 → 기본 배경으로 복귀

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
    }
});

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
const MASCOT_COLOR_PRESETS = ['#FC944D','#55B4E0','#50C9A0','#A78BFA','#F472B6','#F87171','#FBBF24','#4ADE80'];

function buildMascotSvg(color) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1254 1254" style="width:100%;height:100%;">
        <g>
            <path fill="${color}" style="stroke:#4A1715;stroke-width:12;stroke-linejoin:round;stroke-linecap:round;"
                  d="M 949,257 937,249 916,240 902,239 897,241 892,251 893,276 887,295 869,313 857,320 842,325 833,323 817,312 781,294 739,280 692,271 634,268 573,274 533,283 502,293 453,315 401,348 386,346 370,339 353,323 348,312 348,284 344,273 332,272 326,274 302,289 281,310 269,328 255,358 247,389 246,421 249,441 262,472 273,486 273,491 254,526 243,553 231,593 224,632 222,670 226,698 231,713 247,738 247,742 240,747 214,748 192,754 174,764 158,779 147,799 142,823 147,848 158,867 168,878 187,892 220,907 261,915 310,915 314,919 310,952 310,978 314,999 323,1021 329,1030 349,1047 363,1054 383,1060 407,1064 440,1065 480,1059 516,1044 547,1022 604,1024 724,1019 754,1042 778,1054 822,1063 852,1063 877,1059 895,1053 920,1038 939,1017 953,986 959,955 960,900 969,894 992,891 1034,878 1062,865 1081,853 1097,840 1112,822 1121,804 1125,787 1124,769 1119,753 1107,734 1098,726 1081,716 1067,712 1042,710 1016,714 1009,709 1009,704 1021,689 1030,672 1037,649 1040,621 1038,589 1031,557 1020,524 1002,486 981,454 981,450 999,420 1005,399 1006,363 1002,343 993,316 983,296 970,277 Z"/>
            <g fill="#000000" fill-opacity="0.14">
                <path d="M 152,837 162,860 183,881 214,897 262,908 313,906 334,860 340,848 287,874 244,879 192,868 Z"/>
                <path d="M 1115,798 1083,829 1041,846 985,851 946,837 947,861 959,888 1009,879 1060,858 1100,826 Z"/>
                <path d="M 980,308 967,364 956,378 947,376 933,398 924,396 976,441 991,413 997,386 994,345 Z"/>
                <path d="M 269,344 256,386 255,420 263,453 277,476 321,432 303,426 282,403 270,371 Z"/>
                <path d="M 767,1041 727,998 712,990 638,1003 556,998 521,1032 541,1015 698,1016 729,1010 Z"/>
            </g>
            <g fill="#3A1412">
                <path d="M 774,512 763,517 754,531 748,558 749,585 753,602 762,621 771,630 787,634 797,630 804,623 809,613 813,593 812,567 807,546 797,526 786,515 Z"/>
                <path d="M 463,540 456,543 444,559 438,579 436,603 439,627 447,647 458,659 472,662 482,658 489,651 494,641 498,624 499,603 494,573 486,554 474,542 Z"/>
            </g>
            <path d="M 634,639 599,647 583,656 566,673 577,707 592,731 615,750 639,755 661,746 677,728 690,698 695,661 672,646 Z"
                  fill="#F7B4C1" style="stroke:#4A1715;stroke-width:12;stroke-linejoin:round;"/>
        </g>
    </svg>`;
}
window.buildMascotSvg = buildMascotSvg;

function renderPlayerMatrix(users) {
    const lobbyMatrix = document.getElementById('lobby-player-matrix');
    const waitingMatrix = document.getElementById('waiting-player-matrix');
    const lobbyCount = document.getElementById('lobby-user-count');
    const waitingCount = document.getElementById('waiting-user-count');

    const totalSlots = 8;
    // 현재 사용 중인 색 목록
    const usedColors = new Set(users.map(u => u.color).filter(Boolean));
    let html = '';

    for (let i = 0; i < totalSlots; i++) {
        if (i < users.length) {
            const user = users[i];
            const isMe = user.id === socket.id;
            const isUserHost = users[0] && users[0].id === user.id;
            const isReady = user.isReady || isUserHost;
            const userColor = user.color || '#FC944D';

            let crownHtml = isUserHost ? `<i class="fas fa-crown host-crown"></i>` : '';
            let borderStyle = `border-color: ${userColor}; box-shadow: 0 0 0 2px ${userColor}40;`;

            let badgeClass = '';
            let badgeText = '';
            if (user.confirmedResult === false) {
                badgeClass = 'badge-unconfirmed';
                badgeText = '결과 확인 중';
            } else {
                badgeClass = isReady ? 'badge-ready' : 'badge-waiting';
                badgeText = isUserHost ? '방장' : (isReady ? '준비 완료' : '대기 중...');
            }

            let kickHtml = (isHost && !isMe) ? `<div class="slot-kick-btn" onclick="window.confirmKick('${user.id}', '${user.name.replace(/'/g, "\\'")}')">✕</div>` : '';

            // 본인 카드에만 색 변경 팔레트 표시
            let paletteHtml = '';
            if (isMe) {
                const swatches = MASCOT_COLOR_PRESETS.map(c => {
                    const isTakenByOther = usedColors.has(c) && c !== userColor;
                    const isSelected = c === userColor;
                    const takenClass = isTakenByOther ? 'swatch-taken' : '';
                    const selectedClass = isSelected ? 'swatch-selected' : '';
                    const onclick = isTakenByOther ? '' : `window.changeMyColor('${c}')`;
                    return `<button class="matrix-swatch ${takenClass} ${selectedClass}" style="background:${c}" title="${c}" ${isTakenByOther ? 'disabled' : `onclick="${onclick}"`}></button>`;
                }).join('');
                paletteHtml = `<div class="matrix-palette">${swatches}</div>`;
            }

            html += `
                <div class="player-slot ${isMe ? 'is-me' : ''}" style="--slot-color: ${userColor};">
                    ${crownHtml}
                    <div class="avatar-wrap" style="${borderStyle}">${buildMascotSvg(userColor)}</div>
                    <div class="player-name">${user.name}${isMe ? ' (나)' : ''}</div>
                    <span class="player-badge ${badgeClass}">${badgeText}</span>
                    ${paletteHtml}
                    ${kickHtml}
                </div>
            `;
        } else {
            html += `<div class="player-slot empty"></div>`;
        }
    }

    if (lobbyMatrix) lobbyMatrix.innerHTML = html;
    if (waitingMatrix) waitingMatrix.innerHTML = html;

    const countText = `참가: ${users.length} / 8`;
    if (lobbyCount) lobbyCount.textContent = countText;
    if (waitingCount) waitingCount.textContent = countText;

    // 커스텀 쇼룸이 열려 있다면 팔레트 상태 동기화
    if (window.isLobbyCustomMode) {
        renderCustomShowroom();
    }
}

// =============================================
//  로비 마스코트 커스텀 쇼룸 엔진
// =============================================
window.isLobbyCustomMode = false;

function renderCustomShowroom() {
    const avatarStage = document.getElementById('lobby-custom-avatar-stage');
    const paletteRow = document.getElementById('lobby-custom-palette-row');
    if (!avatarStage || !paletteRow) return;

    // 현재 본인 색상 탐색
    const users = window.roomPlayers || [];
    const me = users.find(u => u.id === socket.id);
    const myColor = (me && me.color) ? me.color : (localStorage.getItem('pp_color') || '#FC944D');

    // 마스코트 아바타 갱신
    avatarStage.innerHTML = buildMascotSvg(myColor);

    // 사용 중인 색상 집합
    const usedColors = new Set(users.map(u => u.color).filter(Boolean));

    // 팔레트 버튼 생성
    paletteRow.innerHTML = MASCOT_COLOR_PRESETS.map(c => {
        const isTakenByOther = usedColors.has(c) && c !== myColor;
        const isSelected = c === myColor;
        const takenClass = isTakenByOther ? 'swatch-taken' : '';
        const selectedClass = isSelected ? 'swatch-selected' : '';
        const onclick = isTakenByOther ? '' : `window.changeMyColor('${c}')`;
        return `<button class="showroom-swatch ${takenClass} ${selectedClass}" style="background:${c}" title="${c}" ${isTakenByOther ? 'disabled' : `onclick="${onclick}"`}></button>`;
    }).join('');
}
window.renderCustomShowroom = renderCustomShowroom;

// 색상 변경 함수 (본인 카드 팔레트 및 쇼룸에서 호출)
window.changeMyColor = function(newColor) {
    localStorage.setItem('pp_color', newColor);
    socket.emit('change color', newColor);
    if (window.isLobbyCustomMode) {
        renderCustomShowroom();
    }
};

// 쇼룸 토글 버튼 바인딩
(function initLobbyCustomToggle() {
    const toggleBtn = document.getElementById('lobby-custom-toggle-btn');
    const toggleText = document.getElementById('lobby-custom-toggle-text');
    const cardsCol = document.getElementById('lobby-banner-cards-column');
    const showroom = document.getElementById('lobby-custom-showroom');

    if (!toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
        window.isLobbyCustomMode = !window.isLobbyCustomMode;

        if (window.isLobbyCustomMode) {
            if (cardsCol) cardsCol.style.display = 'none';
            if (showroom) showroom.style.display = 'flex';
            if (toggleText) toggleText.textContent = '게임 목록 보기';
            renderCustomShowroom();
        } else {
            if (cardsCol) cardsCol.style.display = 'flex';
            if (showroom) showroom.style.display = 'none';
            if (toggleText) toggleText.textContent = '내 캐릭터 꾸미기';
        }
    });
})();

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

// =======================================================
// [Task 3] 게임 시작 3초 카운트다운 모듈
// =======================================================

// 1. 게임 시작 3초 카운트다운 (3 ➡️ 2 ➡️ 1 ➡️ START!)
(function initStartCountdownModule() {
    let isCountdownRunning = false;

    window.playStartCountdown = function (onComplete) {
        if (isCountdownRunning) {
            if (typeof onComplete === 'function') onComplete();
            return;
        }

        const overlay = document.getElementById('game-countdown-overlay');
        const textEl = document.getElementById('game-countdown-text');
        if (!overlay || !textEl) {
            if (typeof onComplete === 'function') onComplete();
            return;
        }

        isCountdownRunning = true;
        overlay.classList.add('active');

        const sequence = ['3', '2', '1', 'START!'];
        let step = 0;

        function playStep() {
            if (step >= sequence.length) {
                overlay.classList.remove('active');
                textEl.className = 'game-countdown-number';
                isCountdownRunning = false;
                if (typeof onComplete === 'function') {
                    onComplete();
                }
                return;
            }

            const val = sequence[step];
            textEl.textContent = val;
            textEl.className = 'game-countdown-number';

            if (val === 'START!') {
                textEl.classList.add('start-text');
                if (typeof onComplete === 'function') {
                    onComplete();
                    onComplete = null;
                }
            }

            // 애니메이션 리플로우 강제
            void textEl.offsetWidth;
            textEl.classList.add('animate');

            step++;
            setTimeout(playStep, 850);
        }

        playStep();
    };
})();

