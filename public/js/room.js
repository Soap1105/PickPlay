// public/js/room.js

let isHost = false;

// UI Elements
const lobbyContainer = document.getElementById('lobby-container');
const bingoContainer = document.getElementById('bingo-container');
const liarContainer = document.getElementById('liar-container');
const myRoleDisplay = document.getElementById('my-role-display');
const userGrid = document.getElementById('user-grid');
const stylesheetLink = document.getElementById('game-stylesheet');

const hostGameSelection = document.getElementById('host-game-selection');
const guestWaitingMsg = document.getElementById('guest-waiting-msg');

// Buttons
const gameSelectBtns = document.querySelectorAll('.game-select-btn');
const returnLobbyBtns = document.querySelectorAll('.return-lobby-btn');
const closeResultBtn = document.getElementById('close-result-btn');

function showContainer(containerId) {
    lobbyContainer.classList.add('hidden-container');
    bingoContainer.classList.add('hidden-container');
    liarContainer.classList.add('hidden-container');
    document.getElementById('bomb-container').classList.add('hidden-container');

    document.getElementById(containerId).classList.remove('hidden-container');
}

socket.on('role update', (data) => {
    isHost = data.isHost;
    myRoleDisplay.textContent = isHost ? "👑 방장" : "👤 참가자";

    if (window.gameType === 'lobby') {
        const lobbyContainer = document.getElementById('lobby-container');
        const lobbyWelcome = document.querySelector('.lobby-welcome');
        if (isHost) {
            lobbyContainer.classList.add('host-view');
            lobbyContainer.classList.remove('guest-view');
            if (lobbyWelcome) lobbyWelcome.style.display = 'block';
            hostGameSelection.style.display = 'block';
            document.getElementById('host-vote-controls')?.style.setProperty('display', 'block');
            guestWaitingMsg.style.display = 'none';
        } else {
            lobbyContainer.classList.remove('host-view');
            lobbyContainer.classList.add('guest-view');
            if (lobbyWelcome) lobbyWelcome.style.display = 'none';
            hostGameSelection.style.display = 'none';
            document.getElementById('host-vote-controls')?.style.setProperty('display', 'none');
            guestWaitingMsg.style.display = 'flex';
        }
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

    // Default Lobby Rendering
    userGrid.innerHTML = '';
    
    users.forEach(user => {
        const userDiv = document.createElement('div');
        userDiv.className = 'user-card';
        
        let hostCrown = user.id === socket.id && isHost ? '👑 ' : '';
        if (users[0] && users[0].id === user.id) hostCrown = '👑 '; // First user is host in sorted list

        let badgeHtml = window.getUserBadgeHtml(user);

        userDiv.innerHTML = `
            <div class="avatar-wrapper">
                <div class="avatar">${user.avatar}</div>
            </div>
            <div class="user-info">
                <div class="nickname" style="display: flex; align-items: center;">${hostCrown}${user.name}${badgeHtml}</div>
            </div>
        `;

        const kickBtn = window.createKickButton(user, isHost, socket.id, window.gameType === 'lobby');
        if (kickBtn) userDiv.appendChild(kickBtn);

        userGrid.appendChild(userDiv);
    });
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
(function() {
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
socket.on('game changed', (newGameType) => {
    window.gameType = newGameType;
    const gameContainer = document.getElementById('game-container');

    if (newGameType === 'lobby') {
        stylesheetLink.href = ""; 
        document.getElementById('game-title').textContent = "PickPlay 대기실";
        showContainer('lobby-container');
        
        // 결과 모달창 강제 숨김
        const resModal = document.getElementById('result-modal');
        if (resModal) resModal.style.display = 'none';
        
        // 게임 컨테이너 다크 배경 제거
        gameContainer.classList.remove('game-active', 'game-active-bingo', 'game-active-liar', 'game-active-bomb');
        
        const lobbyContainer = document.getElementById('lobby-container');
        const lobbyWelcome = document.querySelector('.lobby-welcome');
        if (isHost) {
            lobbyContainer.classList.add('host-view');
            lobbyContainer.classList.remove('guest-view');
            if (lobbyWelcome) lobbyWelcome.style.display = 'block';
            hostGameSelection.style.display = 'block';
            document.getElementById('host-vote-controls')?.style.setProperty('display', 'block');
            guestWaitingMsg.style.display = 'none';
        } else {
            lobbyContainer.classList.remove('host-view');
            lobbyContainer.classList.add('guest-view');
            if (lobbyWelcome) lobbyWelcome.style.display = 'none';
            hostGameSelection.style.display = 'none';
            document.getElementById('host-vote-controls')?.style.setProperty('display', 'none');
            guestWaitingMsg.style.display = 'flex';
        }


        // 대기실 진입 시 이모지 팔레트 표시
        emojiSetLobbyMode(true);
    } else if (newGameType === 'bingo') {
        stylesheetLink.href = "/css/bingo.css";
        document.getElementById('game-title').textContent = "테마 빙고";
        showContainer('bingo-container');
        gameContainer.classList.add('game-active', 'game-active-bingo');
        gameContainer.classList.remove('game-active-liar', 'game-active-bomb');
        if (window.initBingoUI) window.initBingoUI(isHost);
        // 게임 시작 시 팔레트 숨김
        emojiSetLobbyMode(false);
    } else if (newGameType === 'liar') {
        stylesheetLink.href = "/css/liar.css";
        document.getElementById('game-title').textContent = "라이어 게임";
        showContainer('liar-container');
        gameContainer.classList.add('game-active', 'game-active-liar');
        gameContainer.classList.remove('game-active-bingo', 'game-active-bomb');
        if (window.initLiarUI) window.initLiarUI(isHost);
        // 게임 시작 시 팔레트 숨김
        emojiSetLobbyMode(false);
    } else if (newGameType === 'bomb') {
        stylesheetLink.href = ""; // bomb uses static bomb.css (or we can move it here)
        document.getElementById('game-title').textContent = "주제 폭탄돌리기";
        showContainer('bomb-container');
        gameContainer.classList.add('game-active', 'game-active-bomb');
        gameContainer.classList.remove('game-active-bingo', 'game-active-liar');
        if (window.initBombUI) window.initBombUI(isHost);
        // 게임 시작 시 팔레트 숨김
        emojiSetLobbyMode(false);
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

