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

let myName = sessionStorage.getItem('myNickname');

function initConnection() {
    window.myName = myName;
    socket.emit('join room', { roomId: roomId, name: myName, gameType: gameType });
}

if (!myName && nicknameModal) {
    // 닉네임이 없으면 모달을 띄운다 (기본 prompt 제거)
    nicknameModal.style.display = 'flex';

    // 모달 안에서 입장 버튼 누름
    joinGameBtn.addEventListener('click', () => {
        const val = nicknameInput.value.trim();
        if (!val) {
            alert('닉네임은 필수입니다!');
            return;
        }
        if (val.length > 6) {
            alert('닉네임은 6글자 이내여야 합니다!');
            return;
        }
        myName = val;
        sessionStorage.setItem('myNickname', myName);
        nicknameModal.style.display = 'none';
        initConnection(); // 연결 시작
    });

    nicknameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinGameBtn.click();
    });
} else {
    // 이미 세션에 닉네임이 있으면 즉시 연결 시작
    if (nicknameModal) nicknameModal.style.display = 'none';
    initConnection();
}
// ---------------------------------

socket.on('room full', (msg) => { alert(msg); window.location.href = '/'; });
socket.on('join failed', (msg) => { alert(msg); window.location.href = '/'; });
socket.on('kicked', () => { alert("강퇴되었습니다."); window.location.href = '/'; });

const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatHistory = document.getElementById('chat-history');
const inviteBtn = document.getElementById('invite-btn');

if (inviteBtn) {
    inviteBtn.addEventListener('click', () => {
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => alert("링크가 복사되었습니다!"));
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

socket.on('chat message', (data) => addChatMessage(data.sender, data.message));
socket.on('system message', (msg) => addSystemMessage(msg));

window.addChatMessage = addChatMessage;
window.addSystemMessage = addSystemMessage;
