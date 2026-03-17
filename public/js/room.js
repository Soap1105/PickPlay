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
const voteBtns = document.querySelectorAll('.vote-btn');
const startVoteBtn = document.getElementById('start-vote-btn');
const closeResultBtn = document.getElementById('close-result-btn');

function showContainer(containerId) {
    lobbyContainer.classList.add('hidden-container');
    bingoContainer.classList.add('hidden-container');
    liarContainer.classList.add('hidden-container');

    document.getElementById(containerId).classList.remove('hidden-container');
}

socket.on('role update', (data) => {
    isHost = data.isHost;
    myRoleDisplay.textContent = isHost ? "👑 방장" : "👤 참가자";

    if (window.gameType === 'lobby') {
        if (isHost) {
            hostGameSelection.style.display = 'block';
            document.getElementById('host-vote-controls').style.display = 'block';
            guestWaitingMsg.style.display = 'none';
        } else {
            hostGameSelection.style.display = 'none';
            document.getElementById('host-vote-controls').style.display = 'none';
            guestWaitingMsg.style.display = 'block';
        }
    }
    
    // Trigger role update in specific games if they are active
    if (window.gameType === 'bingo' && window.updateBingoRoleUI) {
        window.updateBingoRoleUI(isHost);
    }
    if (window.gameType === 'liar' && window.updateLiarRoleUI) {
        window.updateLiarRoleUI(isHost);
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

    // Default Lobby Rendering
    userGrid.innerHTML = '';
    
    users.forEach(user => {
        const userDiv = document.createElement('div');
        userDiv.className = 'user-card';
        
        let hostCrown = user.id === socket.id && isHost ? '👑 ' : '';
        if (users[0] && users[0].id === user.id) hostCrown = '👑 '; // First user is host in sorted list

        let kickBtnHTML = '';
        if (isHost && user.id !== socket.id && window.gameType === 'lobby') {
            kickBtnHTML = `<button class="kick-btn" onclick="kickUser('${user.id}')">강퇴</button>`;
        }

        userDiv.innerHTML = `
            <div class="user-avatar">${user.avatar}</div>
            <div class="user-name">${hostCrown}${user.name}</div>
            ${kickBtnHTML}
        `;
        userGrid.appendChild(userDiv);
    });
});

function kickUser(userId) {
    if (confirm("이 플레이어를 강퇴하시겠습니까?")) {
        socket.emit('kick user', userId);
    }
}

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
        if (confirm("게임을 종료하고 대기실로 돌아가시겠습니까?")) {
            socket.emit('return to lobby');
        }
    });
});

// Voting logic
if (startVoteBtn) {
    startVoteBtn.addEventListener('click', () => {
        const time = document.getElementById('vote-time-select').value;
        socket.emit('host start vote', { duration: parseInt(time) });
    });
}

voteBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.classList.contains('voted')) return;
        const game = btn.getAttribute('data-vote');
        socket.emit('vote game', game);
    });
});

socket.on('vote update', (votes) => {
    document.getElementById('vote-count-bingo').textContent = votes.bingo || 0;
    document.getElementById('vote-count-liar').textContent = votes.liar || 0;
});

socket.on('vote timer', (data) => {
    const timerDisplay = document.getElementById('vote-timer-display');
    const timerText = document.getElementById('vote-time-left');
    const optionsContainer = document.getElementById('vote-options-container');
    const resultDisplay = document.getElementById('vote-result-display');
    const resultMsg = document.getElementById('vote-result-msg');

    if (data.status === 'started') {
        timerDisplay.style.display = 'block';
        resultDisplay.style.display = 'none';
        optionsContainer.style.opacity = '1';
        optionsContainer.style.pointerEvents = 'auto';
        if (startVoteBtn) startVoteBtn.disabled = true;
    } else if (data.status === 'ended') {
        timerDisplay.style.display = 'none';
        resultDisplay.style.display = 'block';
        optionsContainer.style.opacity = '0.5';
        optionsContainer.style.pointerEvents = 'none';
        if (startVoteBtn) startVoteBtn.disabled = false;
        
        const winnerText = data.winner === 'tie' ? '무승부입니다!' : (data.winner === 'bingo' ? '빙고' : '라이어') + ' 게임이 선택되었습니다!';
        resultMsg.textContent = `📢 투표 결과: ${winnerText}`;
    }
    
    if (data.timeLeft !== undefined) {
        timerText.textContent = data.timeLeft < 10 ? '0' + data.timeLeft : data.timeLeft;
    }
});

socket.on('voted', (game) => {
    voteBtns.forEach(btn => {
        if (btn.getAttribute('data-vote') === game) {
            btn.classList.add('voted');
            btn.textContent = '완료';
        } else {
            btn.disabled = true;
            btn.style.opacity = '0.5';
        }
    });
});

function resetVotesUI() {
    voteBtns.forEach(btn => {
        btn.classList.remove('voted');
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.textContent = '투표';
    });
    document.getElementById('vote-count-bingo').textContent = '0';
    document.getElementById('vote-count-liar').textContent = '0';
    document.getElementById('vote-timer-display').style.display = 'none';
    document.getElementById('vote-result-display').style.display = 'none';
    document.getElementById('vote-options-container').style.opacity = '0.5';
    document.getElementById('vote-options-container').style.pointerEvents = 'none';
}

if (closeResultBtn) {
    closeResultBtn.addEventListener('click', () => {
        document.getElementById('result-modal').style.display = 'none';
    });
}

// Server notifies that the game mode has changed
socket.on('game changed', (newGameType) => {
    window.gameType = newGameType;

    if (newGameType === 'lobby') {
        stylesheetLink.href = ""; 
        document.getElementById('game-title').textContent = "PickPlay 대기실";
        showContainer('lobby-container');
        resetVotesUI(); // Reset votes UI when back to lobby
        
        if (isHost) {
            hostGameSelection.style.display = 'block';
            document.getElementById('host-vote-controls').style.display = 'block';
            guestWaitingMsg.style.display = 'none';
        } else {
            hostGameSelection.style.display = 'none';
            document.getElementById('host-vote-controls').style.display = 'none';
            guestWaitingMsg.style.display = 'block';
        }
    } else if (newGameType === 'bingo') {
        stylesheetLink.href = "/css/bingo.css";
        document.getElementById('game-title').textContent = "테마 빙고";
        showContainer('bingo-container');
        if (window.initBingoUI) window.initBingoUI(isHost);
    } else if (newGameType === 'liar') {
        stylesheetLink.href = "/css/liar.css";
        document.getElementById('game-title').textContent = "라이어 게임";
        showContainer('liar-container');
        if (window.initLiarUI) window.initLiarUI(isHost);
    }
});
