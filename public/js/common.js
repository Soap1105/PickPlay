// public/js/common.js
const socket = window.io();
window.socket = socket;

const pathParts = window.location.pathname.split('/');
const roomId = pathParts[2];
window.gameType = 'lobby'; // 기본 상태는 로비
window.roomId = roomId;

// --- 닉네임 모달 창 띄우기 로직 ---
const nicknameModal = document.getElementById('nickname-modal');
const nicknameInput = document.getElementById('nickname-input-modal');
const joinGameBtn = document.getElementById('join-game-btn');

// localStorage에서 닉네임/색상 복원 (index.html에서 설정)
let myName = localStorage.getItem('pp_nickname') || '';
let myColor = localStorage.getItem('pp_color') || '#FC944D';

// 고유 클라이언트 ID 발급 (같은 기기/브라우저 식별용)
let myClientId = localStorage.getItem('pp_client_id');
if (!myClientId) {
    myClientId = 'c-' + Math.random().toString(36).substring(2, 11);
    localStorage.setItem('pp_client_id', myClientId);
}

let isInitialJoined = false;

function initConnection() {
    if (!myName) return;
    myName = localStorage.getItem('pp_nickname') || myName;
    myColor = localStorage.getItem('pp_color') || myColor;
    window.myName = myName;
    window.myColor = myColor;
    socket.emit('join room', { 
        roomId: roomId, 
        name: myName, 
        color: myColor, 
        clientId: myClientId, 
        gameType: window.gameType || 'lobby' 
    });
}

// 소켓 최초 연결 및 연결 끊김 후 재연결 시 자동으로 방 재입장 수행
socket.on('connect', () => {
    isInitialJoined = true;
    initConnection();
});

if (!myName) {
    // 닉네임 미설정 시 → index.html로 리다이렉트 (현재 경로를 redirect 파라미터로 전달)
    const redirect = encodeURIComponent(window.location.pathname);
    window.location.href = `/?redirect=${redirect}`;
} else {
    if (nicknameModal) nicknameModal.style.display = 'none';
    if (socket.connected && !isInitialJoined) {
        isInitialJoined = true;
        initConnection();
    }
}
// ---------------------------------

socket.on('room full', (msg) => { showToast(msg, 'error'); setTimeout(() => window.location.href = '/', 2000); });
socket.on('join failed', (msg) => { showToast(msg, 'error'); setTimeout(() => window.location.href = '/', 2000); });
socket.on('kicked', () => { showToast("강퇴되었습니다.", "warning"); setTimeout(() => window.location.href = '/', 2000); });

const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatHistory = document.getElementById('chat-history');
const inviteBtn = document.getElementById('invite-btn');

if (inviteBtn) {
    inviteBtn.addEventListener('click', () => {
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => showToast("링크가 복사되었습니다!", "success"));
    });
}

if (chatForm) {
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (chatInput.value.trim()) {
            socket.emit('chat message', { sender: myName, message: chatInput.value });
            chatInput.value = '';
        }
    });

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); // 기본 줄바꿈 방지
            chatForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }
    });
}

function addChatMessage(sender, message) {
    if (!chatHistory) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-msg';
    const now = new Date();
    const timeStr = `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}]`;
    msgDiv.innerHTML = `<span class="chat-time">${timeStr}</span><span class="chat-name">${sender}</span><span class="chat-text">${message}</span>`;
    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function addSystemMessage(message) {
    if (!chatHistory) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = 'system-msg';
    msgDiv.textContent = message;
    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

// --- 토스트 알림 기능 ---
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    } else {
        container.innerHTML = ''; // 기존 토스트 즉시 제거 (최대 1개 제한)
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // 타입별 아이콘 설정 (FontAwesome 활용)
    let iconClass = 'fa-info-circle';
    if (type === 'warning') iconClass = 'fa-exclamation-triangle';
    if (type === 'error') iconClass = 'fa-times-circle';
    if (type === 'success') iconClass = 'fa-check-circle';

    const showIcon = type !== 'none';
    toast.innerHTML = `
        <i class="fas ${iconClass} toast-icon ${showIcon ? '' : 'hidden'}"></i>
        <span style="flex:1; text-align: ${showIcon ? 'left' : 'center'}">${message}</span>
        <div class="toast-progress"></div>
    `;

    container.appendChild(toast);

    // 상호작용성: 클릭 시 바로 제거
    toast.onclick = () => { toast.remove(); };

    // 4초 후 자동 제거 (애니메이션 시간 포함)
    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, 4500);
}

socket.on('chat message', (data) => addChatMessage(data.sender, data.message));
socket.on('system message', (msg) => {
    addSystemMessage(msg);
    // 중요한 시스템 메시지는 토스트로도 띄움
    if (msg.includes('!') || msg.includes('최소') || msg.includes('종료') || msg.includes('승리')) {
        let type = 'info';
        if (msg.includes('!')) type = 'warning';
        if (msg.includes('최소')) type = 'error';
        if (msg.includes('승리')) type = 'success';
        
        showToast(msg, type);
    }
});

window.showConfirm = function(message, callback) {
    const modal = document.getElementById('confirm-modal');
    const msgEl = document.getElementById('confirm-message');
    const okBtn = document.getElementById('confirm-ok-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');
    
    if(!modal || !msgEl || !okBtn || !cancelBtn) {
        if(confirm(message)) callback();
        return;
    }
    
    msgEl.innerText = message;
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    
    const cleanup = () => {
        modal.style.display = 'none';
        okBtn.onclick = null;
        cancelBtn.onclick = null;
    };
    
    okBtn.onclick = () => {
        cleanup();
        callback();
    };
    
    cancelBtn.onclick = () => {
        cleanup();
    };
};

window.addChatMessage = addChatMessage;
window.addSystemMessage = addSystemMessage;
window.showToast = showToast;

/**
 * 공통 강퇴 버튼 생성 함수
 * @param {Object} user - 강퇴 대상 유저 객체 {id, name, ...}
 * @param {boolean} amIHost - 현재 사용자가 방장인지 여부
 * @param {string} mySocketId - 현재 사용자의 소켓 ID
 * @param {boolean} condition - 버튼을 표시할 추가 조건
 * @returns {HTMLElement|null} 생성된 버튼 엘리먼트 또는 null
 */
window.createKickButton = function(user, amIHost, mySocketId, condition) {
    if (amIHost && user.id !== mySocketId && condition) {
        const kickBtn = document.createElement('button');
        kickBtn.className = 'kick-btn';
        kickBtn.textContent = '강퇴';
        kickBtn.onclick = () => {
            window.showConfirm(`${user.name}님을 강퇴하시겠습니까?`, () => {
                socket.emit('kick user', user.id);
            });
        };
        return kickBtn;
    }
    return null;
};

/**
 * 결과 확인 중 배지 생성 함수
 * @param {Object} user - 유저 객체
 * @returns {string} 배지 HTML 스트링 또는 빈 값
 */
window.getUserBadgeHtml = function (user) {
    if (user.confirmedResult === false) {
        return ` <span style="font-size: 0.72rem; color: #f1c40f; background: rgba(241, 196, 15, 0.12); border: 1px solid rgba(241, 196, 15, 0.25); padding: 2px 6px; border-radius: 4px; margin-left: 6px; font-weight: normal; white-space: nowrap;">⏳ 결과 확인 중</span>`;
    }
    return '';
};

// 공통 액션 실패 처리 (토스트 경고창 노출)
socket.on('action failed', (msg) => {
    if (window.gameType !== 'bingo') {
        if (window.showToast) window.showToast(msg, 'warning');
    }
});

/**
 * 공통 게임 결과 모달 (#result-modal) 렌더러 함수
 */
window.showGameResultModal = function(options) {
    const modal = document.getElementById('result-modal');
    if (!modal) return;

    const winnerNameEl = document.getElementById('winner-name');
    const winnerAvatarBox = document.getElementById('winner-avatar-box');
    const ruleTitle = document.getElementById('rule-title');
    const ruleList = document.getElementById('rule-list');
    const thStat1 = document.getElementById('th-stat-1');
    const thStat2 = document.getElementById('th-stat-2');
    const statsBody = document.getElementById('result-stats-body');
    const tabBar = document.getElementById('result-tab-bar');
    const panelHistory = document.getElementById('panel-history');
    const closeBtn = document.getElementById('close-result-btn');

    // 1. 우승자 쇼케이스
    const winner = options.winner || { name: '알 수 없음', color: '#FC944D' };
    if (winnerNameEl) winnerNameEl.textContent = winner.name || '-';
    if (winnerAvatarBox && window.buildMascotSvg) {
        winnerAvatarBox.innerHTML = window.buildMascotSvg(winner.color || '#FC944D');
        winnerAvatarBox.style.borderColor = winner.color || '#f59e0b';
        winnerAvatarBox.style.boxShadow = `0 0 28px ${winner.color || '#f59e0b'}60`;
    }

    // 2. 우측 상단 순위 산정 조건 팝오버
    if (ruleTitle) ruleTitle.textContent = `${options.modeName || '게임'} 순위 산정 기준`;
    if (ruleList && options.rules) {
        ruleList.innerHTML = options.rules.map((rule, idx) => `
            <li><span class="step-num">${idx + 1}</span><span>${rule}</span></li>
        `).join('');
    }

    // 3. 헤더 명칭 세팅
    if (thStat1) thStat1.textContent = options.stat1Header || "기록 1";
    if (thStat2) thStat2.textContent = options.stat2Header || "기록 2";

    // 4. 탭 바 및 라운드 히스토리 세팅
    const hasHistory = Array.isArray(options.history) && options.history.length > 0;
    if (tabBar) tabBar.style.display = hasHistory ? 'inline-flex' : 'none';

    if (panelHistory && hasHistory) {
        panelHistory.innerHTML = options.history.map(h => `
            <div class="history-card">
                <div class="history-card-header">
                    <span class="history-round-badge">${h.round}</span>
                    <span class="history-result-tag ${h.tagClass || ''}">${h.tag}</span>
                </div>
                <div class="history-card-body">
                    <span class="history-topic-pill">${h.topic}</span>
                </div>
                <div class="history-desc">${h.desc}</div>
            </div>
        `).join('');
    }

    // 기본 탭은 항상 '최종 순위'로 초기화
    window.switchResultTab('rank');

    // 5. 스코어보드 렌더링
    if (statsBody && options.stats) {
        statsBody.innerHTML = options.stats.map((p, index) => {
            const rank = index + 1;
            const rankClass = rank === 1 ? 'rank-gold' : rank === 2 ? 'rank-silver' : rank === 3 ? 'rank-bronze' : 'rank-default';
            const isWinner = p.isWinner || (winner && p.name === winner.name);
            const isMe = p.id === (window.socket && window.socket.id) || p.name === window.myName;
            const pColor = p.color || '#FC944D';
            const miniSvg = window.buildMascotSvg ? window.buildMascotSvg(pColor) : '';

            return `
                <tr class="${isWinner ? 'row-winner' : ''}">
                    <td class="rank-cell"><span class="rank-badge ${rankClass}">${rank}</span></td>
                    <td>
                        <div class="player-cell">
                            <div class="avatar-mini" style="--player-color: ${pColor}; border-color: ${pColor};">
                                ${miniSvg}
                            </div>
                            <div class="player-info-text">
                                <span class="player-name-text" title="${p.name}">${p.name}</span>
                                ${isMe ? '<span class="badge-me">(나)</span>' : ''}
                            </div>
                        </div>
                    </td>
                    <td class="stat-value" style="text-align: center;">${p.stat1 !== undefined ? p.stat1 : '-'}</td>
                    <td style="text-align: right; font-weight: 600;">${p.stat2 !== undefined ? p.stat2 : '-'}</td>
                </tr>
            `;
        }).join('');
    }

    // 6. 확인 버튼 클릭 핸들러
    if (closeBtn) {
        closeBtn.onclick = () => {
            modal.style.display = 'none';
            if (options.onConfirm) options.onConfirm();
        };
    }

    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
};

// 탭 전환 헬퍼
window.switchResultTab = function(tab) {
    const panelRank = document.getElementById('panel-rank');
    const panelHistory = document.getElementById('panel-history');
    const btnRank = document.getElementById('tab-btn-rank');
    const btnHistory = document.getElementById('tab-btn-history');

    if (!panelRank || !panelHistory) return;

    if (tab === 'rank') {
        panelRank.style.display = 'block';
        panelHistory.style.display = 'none';
        if (btnRank) btnRank.classList.add('active');
        if (btnHistory) btnHistory.classList.remove('active');
    } else {
        panelRank.style.display = 'none';
        panelHistory.style.display = 'flex';
        if (btnHistory) btnHistory.classList.add('active');
        if (btnRank) btnRank.classList.remove('active');
    }
};

// 순위 조건 팝오버 토글 헬퍼
window.toggleRulePopover = function(e) {
    if (e) e.stopPropagation();
    const popover = document.getElementById('rule-popover');
    const btn = document.getElementById('btn-rule-info');
    if (popover && btn) {
        popover.classList.toggle('show');
        btn.classList.toggle('active');
    }
};

// 팝오버 외부 클릭 닫기 이벤트 리스너
document.addEventListener('click', (e) => {
    const popover = document.getElementById('rule-popover');
    const btn = document.getElementById('btn-rule-info');
    if (popover && popover.classList.contains('show')) {
        popover.classList.remove('show');
        if (btn) btn.classList.remove('active');
    }
});
