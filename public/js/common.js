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

// localStorage에서 닉네임/이모지 복원 (index.html에서 설정)
let myName = localStorage.getItem('pp_nickname') || '';
let myAvatar = localStorage.getItem('pp_emoji') || '🐱';

// 고유 클라이언트 ID 발급 (같은 기기/브라우저 식별용)
let myClientId = localStorage.getItem('pp_client_id');
if (!myClientId) {
    myClientId = 'c-' + Math.random().toString(36).substring(2, 11);
    localStorage.setItem('pp_client_id', myClientId);
}

function initConnection() {
    window.myName = myName;
    window.myAvatar = myAvatar;
    socket.emit('join room', { roomId: roomId, name: myName, avatar: myAvatar, clientId: myClientId, gameType: gameType });
}

if (!myName) {
    // 닉네임 미설정 시 → index.html로 리다이렉트 (현재 경로를 redirect 파라미터로 전달)
    const redirect = encodeURIComponent(window.location.pathname);
    window.location.href = `/?redirect=${redirect}`;
} else {
    if (nicknameModal) nicknameModal.style.display = 'none';
    initConnection();
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
