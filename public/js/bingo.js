// bingo.js
(function() {
// common.js에서 생성된 전역 변수(window.socket, window.myName, window.roomId)를 활용합니다.
const readyStatusDisplay = document.querySelector('#bingo-container .ready-status-display');
const setupArea = document.querySelector('#bingo-container .setup-area');
const waitingArea = document.querySelector('#bingo-container .waiting-area');

const turnTrack = document.createElement('div');
turnTrack.id = 'turn-track';
turnTrack.style.cssText = "display: flex; justify-content: center; gap: 10px; margin: 10px 0; font-size: 1rem; flex-wrap: wrap; font-weight: bold;";
document.querySelector('#bingo-container .player-ui').parentNode.insertBefore(turnTrack, document.querySelector('#bingo-container .player-ui'));

const playerUI = document.querySelector('#bingo-container .player-ui');
const inputControls = document.getElementById('input-controls');
const turnOrderSelect = document.getElementById('turn-order-select');
const startGameBtn = document.getElementById('start-bingo-btn');
const winLinesRadios = document.getElementsByName('win-lines');
const themeTitle = document.getElementById('theme-title');
const readyButton = document.getElementById('ready-button');
const turnDisplay = document.getElementById('turn-display');
const bigEventDisplay = document.getElementById('big-event-display');
const eventIcon = document.getElementById('event-icon');
const eventTitle = document.getElementById('event-title');
const eventMsg = document.getElementById('event-msg');
const bingoBoard = document.getElementById('bingo-board');
const calledNumbersDisplay = document.getElementById('called-numbers-display');
const bingoButton = document.getElementById('bingo-button');

const loadThemeBtn = document.getElementById('load-theme-btn');
const saveThemeBtn = document.getElementById('save-theme-btn');
const themeModal = document.getElementById('theme-modal');
const systemThemeList = document.getElementById('system-theme-list');
const myThemeList = document.getElementById('my-theme-list');
const closeModal = document.querySelector('.close-modal');
const autoFillBtn = document.getElementById('auto-fill-btn');

const themeTopicInput = document.getElementById('theme-topic-input');
const turnTimeLimitSelect = document.getElementById('turn-time-limit');
const hostManualStartBtn = document.getElementById('host-manual-start-btn');
const manualStartArea = document.getElementById('manual-start-area');

const turnTimerBar = document.getElementById('turn-timer-bar');
const turnTimerProgress = document.getElementById('turn-timer-progress');

const resultModal = document.getElementById('result-modal');
const resultWinner = document.getElementById('result-winner');
const resultStatsBody = document.getElementById('result-stats-body');

// 1. 효과음
const effectSound = new Audio('/call.mp3');
const eventSound = new Audio('/event.wav');

function playSound() {
    effectSound.currentTime = 0;
    effectSound.play().catch(() => { });
}

function playEvent() {
    eventSound.currentTime = 0;
    eventSound.play().catch(() => { });
}

// 4. 변수 초기화
let myBoard = [];
let calledNumbers = [];
let isMyTurn = false;
let amIHost = false;
let targetLines = 3;
let isGameStarted = false;
let isMyReady = false;
let currentProgressMap = {};
let currentTurnPlayerName = "";
let currentTurnId = "";
let myUsedEventCount = 0;
let currentUsers = [];
let turnTimerInterval = null;
let turnDuration = 0;
let turnStartTime = 0;

function getUserId() {
    let userId = localStorage.getItem('bingo_user_id');
    if (!userId) {
        userId = 'user-' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('bingo_user_id', userId);
    }
    return userId;
}
const myUserId = getUserId();

function getDuplicates(array) {
    const normalize = (str) => String(str).replace(/\s+/g, '').trim().toLowerCase();
    const seen = new Set();
    const duplicates = new Set();
    array.forEach(item => {
        const normalizedItem = normalize(item);
        if (seen.has(normalizedItem)) duplicates.add(item);
        seen.add(normalizedItem);
    });
    return [...duplicates];
}

function updateTurnTrack(users) {
    turnTrack.innerHTML = '';
    if (!isGameStarted) {
        turnTrack.style.display = 'none';
        return;
    }
    turnTrack.style.display = 'flex';

    users.forEach((user, index) => {
        const span = document.createElement('div');
        span.textContent = user.name;
        span.style.padding = "5px 10px";
        span.style.borderRadius = "15px";
        span.style.border = "2px solid #ccc";
        span.style.backgroundColor = "#fff";
        span.style.color = "#333";
        span.style.transition = "all 0.3s";

        if (user.id === currentTurnId) {
            span.style.borderColor = "#f1c40f";
            span.style.backgroundColor = "#fffcf0";
            span.style.transform = "scale(1.1)";
            span.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";
            span.style.zIndex = "10";
        } else {
            span.style.opacity = "0.6";
        }
        turnTrack.appendChild(span);

        if (index < users.length - 1) {
            const arrow = document.createElement('span');
            arrow.textContent = "→";
            arrow.style.margin = "0 5px";
            arrow.style.color = "#999";
            turnTrack.appendChild(arrow);
        }
    });
}

window.renderBingoUsers = function(users, hostStatus) {
    currentUsers = users;
    const userGrid = document.getElementById('user-grid');
    userGrid.innerHTML = '';
    updateTurnTrack(users);

    let bingoReadyCount = 0;

    users.forEach(user => {
        if (user.id === socket.id) {
            myUsedEventCount = user.usedEventCount || 0;
            updateBingoButton(checkBingoLines(myBoard, calledNumbers));
        }

        const card = document.createElement('div');
        card.className = 'user-card';
        if (user.ready) card.classList.add('is-ready');
        if (user.isSkipped) card.classList.add('is-skipped');
        card.id = `user-${user.id}`;
        if (user.id === socket.id) card.classList.add('is-me');

        const infoDiv = document.createElement('div');
        infoDiv.className = 'user-info';

        const avatarWrapper = document.createElement('div');
        avatarWrapper.className = 'avatar-wrapper';
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.textContent = user.avatar;
        avatarWrapper.appendChild(avatar);
        if (user.skipCount > 0) {
            const overlay = document.createElement('div');
            overlay.className = 'skip-overlay';
            overlay.textContent = '🚫';
            avatarWrapper.appendChild(overlay);
        }

        const nickname = document.createElement('div');
        nickname.className = 'nickname';
        if (user.isWaiting) {
            nickname.textContent = `⏳ ${user.name}`;
            nickname.style.color = "#7f8c8d";
        } else {
            nickname.textContent = user.name;
            nickname.style.color = "#333";
            if (user.ready) {
                nickname.innerHTML += ' <span style="color:#2ecc71">✔</span>';
                bingoReadyCount++;
            }
        }

        const statusRow = document.createElement('div');
        statusRow.className = 'status-row';

        if (isGameStarted && !user.isWaiting) {
            const dotsContainer = document.createElement('div');
            dotsContainer.className = 'bingo-progress';
            const lines = currentProgressMap[user.id] || 0;
            for (let i = 0; i < targetLines; i++) {
                const dot = document.createElement('div');
                dot.className = 'progress-dot';
                if (i < lines) dot.classList.add('filled');
                dotsContainer.appendChild(dot);
            }

            const divider = document.createElement('span');
            divider.className = 'status-divider';
            divider.textContent = '|';

            const eventContainer = document.createElement('div');
            eventContainer.className = 'event-progress';

            const used = user.usedEventCount || 0;
            const maxSlots = Math.max(0, targetLines - 1);
            const earned = Math.min(lines, maxSlots);
            const fillCount = Math.max(0, earned - used);

            for (let i = 0; i < maxSlots; i++) {
                const star = document.createElement('i');
                star.className = 'event-star';
                if (i < fillCount) {
                    star.className += ' fas fa-star filled';
                } else {
                    star.className += ' far fa-star';
                }
                eventContainer.appendChild(star);
            }

            statusRow.appendChild(dotsContainer);
            statusRow.appendChild(divider);
            statusRow.appendChild(eventContainer);
        }
        infoDiv.appendChild(nickname);
        infoDiv.appendChild(statusRow);

        if (amIHost && user.id !== socket.id && setupArea.style.display !== 'none') {
            const kickBtn = document.createElement('button');
            kickBtn.className = 'kick-btn';
            kickBtn.textContent = 'X';
            kickBtn.onclick = () => {
                if (confirm(`${user.name}님 강퇴?`)) socket.emit('kick user', user.id);
            };
            card.appendChild(kickBtn);
        }

        card.appendChild(avatarWrapper);
        card.appendChild(infoDiv);
        userGrid.appendChild(card);
    });
};

function updateReadyStatusVisibility() {
    // [Refinement] 로비, 설정(setupArea), 대기(waitingArea) 상태에서는 무조건 숨김
    // 오직 빙고판 입력 도중에만 표시되도록 함
    const isInInputMode = (inputControls && inputControls.style.display === 'block');
    
    if (window.gameType === 'lobby' || !isInInputMode) {
        readyStatusDisplay.style.display = 'none';
        readyStatusDisplay.classList.add('hidden-by-logic');
    } else {
        readyStatusDisplay.style.display = 'block';
        readyStatusDisplay.classList.remove('hidden-by-logic');
    }
}

function updateBingoButton(lines) {
    if (lines >= targetLines) {
        bingoButton.disabled = false;
        bingoButton.textContent = "🏆 승리 선언! 🏆";
        bingoButton.style.backgroundColor = "#ff0000";
        bingoButton.style.cursor = "pointer";
    } else if (lines >= 1) {
        const remaining = lines - myUsedEventCount;
        if (!isMyTurn) {
            bingoButton.disabled = true;
            bingoButton.textContent = "🚫 상대방 턴";
            bingoButton.style.backgroundColor = "#555";
            return;
        }
        if (remaining > 0) {
            bingoButton.disabled = false;
            bingoButton.textContent = `⚡ 이벤트 발동! (${remaining}회 남음)`;
            bingoButton.style.backgroundColor = "#2196F3";
            bingoButton.style.cursor = "pointer";
        } else {
            bingoButton.disabled = true;
            bingoButton.textContent = `빙고 ${lines}줄 (이벤트 소진)`;
            bingoButton.style.backgroundColor = "#ccc";
        }
    } else {
        bingoButton.disabled = true;
        bingoButton.textContent = lines >= 1 ? `빙고 ${lines}줄` : "진행 중...";
        bingoButton.style.backgroundColor = "#ccc";
    }
}

function getBingoLines(board, calledNums) {
    const normalize = (str) => String(str).replace(/\s+/g, '').trim().toLowerCase();
    const calledSet = new Set(calledNums.map(normalize));
    const winningIndices = new Set();
    let count = 0;
    const checkLine = (indices) => {
        if (indices.every(index => calledSet.has(normalize(board[index])))) {
            count++;
            indices.forEach(idx => winningIndices.add(idx));
        }
    };
    for (let i = 0; i < 5; i++) checkLine([i * 5, i * 5 + 1, i * 5 + 2, i * 5 + 3, i * 5 + 4]);
    for (let i = 0; i < 5; i++) checkLine([i, i + 5, i + 10, i + 15, i + 20]);
    checkLine([0, 6, 12, 18, 24]);
    checkLine([4, 8, 12, 16, 20]);
    return { count, winningIndices: Array.from(winningIndices) };
}

function checkBingoLines(board, calledNums) { return getBingoLines(board, calledNums).count; }

function updateBoardVisuals() {
    const normalize = (str) => String(str).replace(/\s+/g, '').trim().toLowerCase();
    const cells = document.querySelectorAll('.board-cell');
    cells.forEach(cell => {
        const word = cell.dataset.word;
        const isCalled = calledNumbers.some(num => normalize(num) === normalize(word));
        if (isCalled) cell.classList.add('checked');
        else cell.classList.remove('checked');
        cell.classList.remove('bingo-completed');
    });
    const { count, winningIndices } = getBingoLines(myBoard, calledNumbers);
    winningIndices.forEach(index => {
        if (cells[index]) cells[index].classList.add('bingo-completed');
    });
    updateBingoButton(count);
}

function renderBoard(boardData) {
    bingoBoard.innerHTML = '';
    myBoard = boardData;
    boardData.forEach((word, index) => {
        const cell = document.createElement('button');
        cell.classList.add('board-cell');
        if (word.length > 11) cell.classList.add('text-small');
        else if (word.length > 6) cell.classList.add('text-medium');
        cell.textContent = word;
        cell.dataset.word = word;
        cell.dataset.index = index;
        cell.addEventListener('click', () => {
            if (setupArea.style.display !== 'none' || waitingArea.style.display !== 'none') return;
            if (turnDisplay.style.display === 'none') return;
            if (!isMyTurn) {
                if (window.showToast) window.showToast("당신의 차례가 아닙니다!", "warning");
                else alert("당신의 차례가 아닙니다!");
                return;
            }
            if (calledNumbers.includes(word)) {
                if (window.showToast) window.showToast("이미 선택된 단어입니다.", "warning");
                else alert("이미 선택된 단어입니다.");
                return;
            }
            socket.emit('theme word selected', { roomId: window.roomId, word });
        });
        bingoBoard.appendChild(cell);
    });
}

function showBigEvent(icon, title, msg, type) {
    eventIcon.textContent = icon;
    eventTitle.textContent = title;
    eventMsg.textContent = msg;
    const overlay = bigEventDisplay;
    overlay.style.display = 'flex';
    const content = overlay.querySelector('.event-content');
    content.classList.remove('pop-in');
    void content.offsetWidth;
    content.classList.add('pop-in');
    if (type === 'bad' || type === 'bomb') content.style.borderColor = '#ff6b6b';
    else if (type === 'good' || type === 'bonus') content.style.borderColor = '#51cf66';
    else content.style.borderColor = 'white';
    setTimeout(() => { overlay.style.display = 'none'; }, 3000);
}

// 6. UI 이벤트 리스너

if (loadThemeBtn) loadThemeBtn.addEventListener('click', () => { themeModal.style.display = 'block'; loadThemes(); });
if (closeModal) closeModal.addEventListener('click', () => { themeModal.style.display = 'none'; });
if (autoFillBtn) {
    autoFillBtn.addEventListener('click', () => {
        const inputs = document.querySelectorAll('.board-input');
        inputs.forEach((input, index) => {
            if (!input.disabled) {
                input.value = `단어 ${index + 1}`;
            }
        });
    });
}

if (saveThemeBtn) saveThemeBtn.addEventListener('click', async () => {
    const inputs = document.querySelectorAll('.board-input');
    const words = [];
    let isAllFilled = true;
    inputs.forEach(input => {
        const val = input.value.trim() || input.placeholder;
        if (!val) isAllFilled = false;
        words.push(val);
    });
    if (!isAllFilled) {
        if (window.showToast) window.showToast("모든 칸을 채운 뒤 저장해주세요.", "warning");
        else alert("모든 칸을 채운 뒤 저장해주세요.");
        return;
    }
    const duplicates = getDuplicates(words);
    if (duplicates.length > 0) {
        const msg = `중복된 단어: ${duplicates.join(', ')}`;
        if (window.showToast) window.showToast(msg, "warning");
        else alert(msg);
        return;
    }
    const title = prompt("테마 제목 입력:");
    if (!title) return;
    try {
        const res = await fetch('/api/themes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, words, userId: myUserId })
        });
        if (res.ok) {
            if (window.showToast) window.showToast("저장되었습니다!", "success");
            else alert("저장되었습니다!");
        } else {
            if (window.showToast) window.showToast("저장 실패", "error");
            else alert("저장 실패");
        }
    } catch (e) {
        if (window.showToast) window.showToast("오류 발생", "error");
        else alert("오류 발생");
    }
});

readyButton.addEventListener('click', () => {
    if (isMyReady) {
        socket.emit('cancel ready');

        isMyReady = false;
        readyButton.textContent = "준비 완료";
        readyButton.style.backgroundColor = "#3498db";
        readyButton.disabled = false;

        document.querySelectorAll('.board-input').forEach(input => {
            input.disabled = false;
            input.style.backgroundColor = "#f9f9f9";
        });

        return;
    }

    const inputs = document.querySelectorAll('.board-input');
    const words = [];
    let isAllFilled = true;

    inputs.forEach(input => {
        const val = input.value.trim();
        if (!val) isAllFilled = false;
        words.push(val);
    });

    if (!isAllFilled) {
        if (window.showToast) window.showToast("모든 칸을 채워주세요.", "warning");
        else alert("모든 칸을 채워주세요.");
        return;
    }
    const duplicates = getDuplicates(words);
    if (duplicates.length > 0) {
        const msg = `중복된 단어: ${duplicates.join(', ')}`;
        if (window.showToast) window.showToast(msg, "warning");
        else alert(msg);
        return;
    }

    isMyReady = true;
    readyButton.textContent = "준비 해제";
    readyButton.style.backgroundColor = "#e74c3c";

    inputs.forEach(input => {
        input.disabled = true;
        input.style.backgroundColor = "#e0e0e0";
    });

    socket.emit('submit theme board', {
        roomId: window.roomId,
        board: words,
        name: window.myName
    });
});

async function loadThemes() {
    if (systemThemeList) systemThemeList.innerHTML = '<li>로딩 중...</li>';
    if (myThemeList) myThemeList.innerHTML = '<li>로딩 중...</li>';
    try {
        const res = await fetch(`/api/themes?userId=${myUserId}`);
        const themes = await res.json();
        if (systemThemeList) systemThemeList.innerHTML = '';
        if (myThemeList) myThemeList.innerHTML = '';
        themes.forEach(theme => {
            const li = document.createElement('li');
            const titleSpan = document.createElement('span');
            titleSpan.textContent = theme.title;
            titleSpan.style.flexGrow = "1";
            titleSpan.style.fontWeight = "bold";
            titleSpan.style.cursor = "pointer";
            titleSpan.onclick = () => { selectTheme(theme.id); };
            if (theme.creator === 'System') {
                li.appendChild(titleSpan);
                const tag = document.createElement('span');
                tag.textContent = "추천 ⭐";
                tag.style.fontSize = "0.8rem";
                tag.style.color = "#e67e22";
                li.appendChild(tag);
                if (systemThemeList) systemThemeList.appendChild(li);
            } else {
                const delBtn = document.createElement('button');
                delBtn.textContent = '삭제';
                delBtn.className = 'delete-theme-btn';
                delBtn.onclick = (e) => { e.stopPropagation(); deleteTheme(theme.id); };
                li.appendChild(titleSpan);
                li.appendChild(delBtn);
                if (myThemeList) myThemeList.appendChild(li);
            }
        });
        if (systemThemeList && systemThemeList.children.length === 0) systemThemeList.innerHTML = '<li style="color:#999">기본 테마 없음</li>';
        if (myThemeList && myThemeList.children.length === 0) myThemeList.innerHTML = '<li style="color:#999">저장된 테마 없음</li>';
    } catch (e) { console.error(e); }
}

async function deleteTheme(id) {
    if (!confirm("삭제하시겠습니까?")) return;
    try {
        const res = await fetch(`/api/themes/${id}?userId=${myUserId}`, { method: 'DELETE' });
        if (res.ok) {
            if (window.showToast) window.showToast("삭제되었습니다.", "success");
            else alert("삭제됨");
            loadThemes();
        } else {
            if (window.showToast) window.showToast("실패하였습니다.", "error");
            else alert("실패");
        }
    } catch (e) {
        if (window.showToast) window.showToast("오류가 발생했습니다.", "error");
        else alert("오류");
    }
}

async function selectTheme(id) {
    try {
        const res = await fetch(`/api/themes/${id}`);
        const data = await res.json();
        let words = data.words;
        if (typeof words === 'string') words = JSON.parse(words);
        if (confirm(`'${data.title}' 테마를 불러와서 채울까요?`)) {
            themeModal.style.display = 'none';
            words = words.sort(() => Math.random() - 0.5);
            const inputs = document.querySelectorAll('.board-input');
            inputs.forEach((input, index) => { if (words[index]) input.value = words[index]; });
            if (window.showToast) window.showToast("자동 입력 완료!", "success");
            else alert("자동 입력 완료!");
        }
    } catch (e) {
        if (window.showToast) window.showToast("불러오기 실패", "error");
        else alert("실패");
    }
}

startGameBtn.addEventListener('click', async () => {
    const playersCount = document.querySelectorAll('.user-card').length;
    if (playersCount < 2) {
        if (window.showToast) {
            window.showToast('빙고 게임은 최소 2명 이상이어야 시작할 수 있습니다!', 'error');
        } else {
            alert("🚫 최소 2명이 모여야 합니다.");
        }
        return;
    }
    if (!confirm("게임을 시작하시겠습니까?")) return;

    let selectedLines = 3;
    for (const radio of winLinesRadios) { if (radio.checked) selectedLines = parseInt(radio.value); }
    const selectedOrder = turnOrderSelect.value;
    const turnTime = parseInt(turnTimeLimitSelect.value);

    let topic = themeTopicInput.value.trim() || "자유 주제";
    let presetWords = [];

    // [AI 빙고 주제 구동부]
    if (topic !== "자유 주제") {
        const originalText = startGameBtn.textContent;
        startGameBtn.textContent = "AI가 단어를 고르는 중입니다...⏳";
        startGameBtn.disabled = true;

        // 진행률 UI 초기화 및 노출
        const progressContainer = document.getElementById('ai-progress-container');
        const progressBar = document.getElementById('ai-progress-bar');
        const progressStep = document.getElementById('ai-progress-step');
        const progressPercent = document.getElementById('ai-progress-percent');

        if (progressContainer) {
            progressContainer.style.display = 'block';
            progressBar.style.width = '0%';
            progressPercent.textContent = '0%';
            progressStep.innerHTML = '<i class="fas fa-robot" style="margin-right: 8px;"></i> AI 가동 중...';
        }

        try {
            const res = await fetch('/api/themes/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: topic, userId: myUserId, roomId: window.roomId })
            });
            const data = await res.json();
            
            if (res.ok && data.success) {
                presetWords = data.words;
                // 성공 시에도 잠시 대기 후 초기화 (UX)
                setTimeout(() => { if (progressContainer) progressContainer.style.display = 'none'; }, 1000);
            } else {
                const msg = "AI 생성 실패: " + (data.error || "알 수 없는 오류");
                if (window.showToast) window.showToast(msg, "error");
                else alert(msg);
                
                startGameBtn.textContent = originalText;
                startGameBtn.disabled = false;
                if (progressContainer) progressContainer.style.display = 'none';
                return; // 에러 시 진행 중단!
            }
        } catch (e) {
            if (window.showToast) window.showToast("서버 연결 오류가 발생했습니다.", "error");
            else alert("서버 연결 오류가 발생했습니다.");
            
            startGameBtn.textContent = originalText;
            startGameBtn.disabled = false;
            if (progressContainer) progressContainer.style.display = 'none';
            return;
        }
        startGameBtn.textContent = originalText;
        startGameBtn.disabled = false;
    }

    socket.emit('init theme mode', { 
        roomId: window.roomId, 
        topic, 
        winLines: selectedLines, 
        turnOrder: selectedOrder, 
        turnTimeLimit: turnTime,
        presetWords: presetWords
    });

    setupArea.style.display = 'none';
});

if (hostManualStartBtn) {
    hostManualStartBtn.addEventListener('click', () => {
        socket.emit('host manual start bingo');
    });
}

// 빙고 이벤트 리스너들
bingoButton.addEventListener('click', () => {
    const { count } = getBingoLines(myBoard, calledNumbers);
    bingoButton.disabled = true;
    if (count >= targetLines) {
        socket.emit('bingo declared', { name: window.myName });
    } else if (count >= 1) {
        if (!isMyTurn) {
            bingoButton.disabled = true;
            if (window.showToast) window.showToast("현재 내 턴이 아닙니다.", "warning");
            else alert("내 턴이 아님");
            return;
        }
        const remaining = count - myUsedEventCount;
        if (remaining <= 0) {
            bingoButton.disabled = false;
            if (window.showToast) window.showToast("이벤트를 사용할 기회가 없습니다!", "warning");
            else alert("이벤트를 사용할 기회가 없습니다!");
            return;
        }
        if (confirm(`이벤트를 발동하시겠습니까? (남은 기회: ${remaining}회)`)) {
            socket.emit('trigger event', { name: window.myName });
        } else {
            bingoButton.disabled = false;
        }
    }
});

// Event listeners for users removed here, handled by room.js calls
// socket.on('update user list', ...);

socket.on('bingo progress update', (progressMap) => {
    currentProgressMap = progressMap;
    if (window.gameType === 'bingo') {
        window.renderBingoUsers(currentUsers, amIHost);
    }
});

// AI 생성 진행률 수신
socket.on('theme progress', (data) => {
    const progressContainer = document.getElementById('ai-progress-container');
    const progressBar = document.getElementById('ai-progress-bar');
    const progressStep = document.getElementById('ai-progress-step');
    const progressPercent = document.getElementById('ai-progress-percent');

    if (progressContainer && progressBar) {
        progressContainer.style.display = 'block';
        progressBar.style.width = `${data.percent}%`;
        if (progressPercent) progressPercent.textContent = `${data.percent}%`;
        if (progressStep) progressStep.innerHTML = `<i class="fas fa-microchip" style="margin-right: 8px;"></i> ${data.step}`;
    }
});

socket.on('update ready status', (data) => {
    readyStatusDisplay.innerHTML = `<span style="font-size:0.8rem; margin-right:5px;">📢</span>준비 인원: <span style="color:#f1c40f">${data.ready}</span> / ${data.total}`;
    updateReadyStatusVisibility();
});

socket.on('game status update', (data) => { isGameStarted = data.started; });

socket.on('turn update', (data) => {
    currentTurnId = data.currentTurnId;
    currentTurnPlayerName = data.currentTurnName;
    document.querySelectorAll('.user-card').forEach(c => c.classList.remove('current-turn'));
    const currentCard = document.getElementById(`user-${currentTurnId}`);
    if (currentCard) currentCard.classList.add('current-turn');
    updateTurnTrack(currentUsers);

    if (socket.id === currentTurnId) {
        isMyTurn = true;
        turnDisplay.textContent = "👉 당신의 차례입니다!";
        turnDisplay.style.backgroundColor = "#e3f2fd";
        bingoBoard.classList.remove('inactive-board');
        bingoBoard.classList.add('active-board');
    } else {
        isMyTurn = false;
        turnDisplay.textContent = `⏳ ${currentTurnPlayerName}님의 차례...`;
        turnDisplay.style.backgroundColor = "#f0f0f0";
        bingoBoard.classList.add('inactive-board');
        bingoBoard.classList.remove('active-board');
    }
    turnDisplay.style.display = 'block';

    // Timer logic
    if (data.turnTimeLimit > 0) {
        turnDuration = data.turnTimeLimit;
        turnStartTime = Date.now();
        turnTimerBar.style.display = 'block';
        updateTurnTimerUI();
        if (turnTimerInterval) clearInterval(turnTimerInterval);
        turnTimerInterval = setInterval(updateTurnTimerUI, 100);
    } else {
        turnTimerBar.style.display = 'none';
        if (turnTimerInterval) clearInterval(turnTimerInterval);
    }

    updateBoardVisuals();
});

function updateTurnTimerUI() {
    const elapsed = (Date.now() - turnStartTime) / 1000;
    const remaining = Math.max(0, turnDuration - elapsed);
    const percentage = (remaining / turnDuration) * 100;
    turnTimerProgress.style.width = percentage + '%';
    
    // Color change when low time
    if (percentage < 30) turnTimerProgress.style.backgroundColor = '#e74c3c';
    else if (percentage < 60) turnTimerProgress.style.backgroundColor = '#f1c40f';
    else turnTimerProgress.style.backgroundColor = '#2ecc71';

    if (remaining <= 0) {
        if (turnTimerInterval) clearInterval(turnTimerInterval);
    }
}

window.updateBingoRoleUI = function(isHostStatus) {
    amIHost = isHostStatus;
    const myCard = document.getElementById(`user-${socket.id}`);
    if (myCard && amIHost) myCard.classList.add('is-host');

    setupArea.style.display = 'none';
    waitingArea.style.display = 'none';
    playerUI.style.display = 'none';
    readyStatusDisplay.style.display = 'none';

    if (isGameStarted) {
        if (isMyReady) {
            playerUI.style.display = 'block';
        }
    } else {
        if (amIHost) {
            setupArea.style.display = 'block';
            manualStartArea.style.display = 'block'; // 호스트에게는 미리 시작 영역 노출 (비활성 상태)
            hostManualStartBtn.disabled = true;
            hostManualStartBtn.style.opacity = '0.6';
        } else {
            waitingArea.style.display = 'block';
        }
    }
    updateReadyStatusVisibility();
};

window.initBingoUI = function(isHostStatus) {
    window.updateBingoRoleUI(isHostStatus);
};

socket.on('setup theme input', (data) => {
    targetLines = data.winLines;
    calledNumbers = [];
    setupArea.style.display = 'none';
    waitingArea.style.display = 'none';
    readyStatusDisplay.style.display = 'block';
    playerUI.style.display = 'block';
    themeTitle.style.display = 'block';
    themeTitle.textContent = `주제: ${data.topic} (목표: ${targetLines}줄)`;
    bingoBoard.innerHTML = '';
    bingoBoard.classList.remove('inactive-board');
    bingoBoard.classList.remove('active-board');

    bingoButton.style.display = 'none';
    isMyReady = false;
    readyButton.disabled = false;
    readyButton.textContent = "준비 완료";
    readyButton.style.backgroundColor = "#3498db";
    readyButton.style.display = 'inline-block';
    readyButton.style.position = 'relative';
    readyButton.style.zIndex = '9999';

    if (saveThemeBtn) saveThemeBtn.style.display = 'inline-block';
    if (loadThemeBtn) loadThemeBtn.style.display = 'block';

    inputControls.style.display = 'block';
    inputControls.style.position = 'relative';
    inputControls.style.zIndex = '9999';

    // [AI 단어 자동 채우기 및 랜덤 셔플 적용 (40단어 이상 지원)]
    let preset = data.presetWords || [];
    if (preset.length >= 25) {
        preset = preset.sort(() => Math.random() - 0.5); // 40~50개를 섞은 뒤 앞의 25개만 사용됨
    }

    for (let i = 0; i < 25; i++) {
        const inputCell = document.createElement('input');
        inputCell.classList.add('board-input');
        inputCell.placeholder = `${i + 1}`;
        inputCell.maxLength = 15;
        inputCell.addEventListener('input', function () {
            if (this.value.length > 15) {
                alert("15글자까지만 입력 가능합니다.");
                this.value = this.value.slice(0, 15);
            }
        });
        if (preset[i]) inputCell.value = preset[i];
        bingoBoard.appendChild(inputCell);
    }
    alert(`주제: '${data.topic}'\n25칸을 채워주세요. (목표: ${targetLines}줄)`);
});

socket.on('start theme game', (data) => {
    readyButton.style.display = 'none';
    if (saveThemeBtn) saveThemeBtn.style.display = 'none';
    if (loadThemeBtn) loadThemeBtn.style.display = 'none';
    inputControls.style.display = 'none';
    readyStatusDisplay.style.display = 'none';
    manualStartArea.style.display = 'none'; // [Bug 5-2 FIX] 게임 시작 시 시작 버튼 영역 제거
    targetLines = data.winLines;
    calledNumbers = [];
    myUsedEventCount = 0;
    isGameStarted = true;
    renderBoard(data.board);
    bingoButton.style.display = 'block';
    bingoButton.style.position = 'relative';
    bingoButton.style.zIndex = '9999';

    updateBoardVisuals();
    showBigEvent('🚀', '게임 시작!', `목표: ${targetLines}줄 빙고!`, 'good');
});

socket.on('number called', (number) => {
    playSound();
    calledNumbers.push(number);
    updateBoardVisuals();
    let msgText = `🔔 ${currentTurnPlayerName || '누군가'} 님이 단어 [ ${number} ] (을)를 선택! 🔔`;
    calledNumbersDisplay.innerHTML = msgText;
});

socket.on('server called numbers', (newCalledList) => {
    calledNumbers = newCalledList;
    updateBoardVisuals();
});

socket.on('action failed', (msg) => {
    alert(msg);
    if (isMyTurn) bingoButton.disabled = false;
    updateBingoButton(checkBingoLines(myBoard, calledNumbers));
});

socket.on('event happened', (data) => {
    playEvent();
    showBigEvent(data.icon, data.title, data.msg, data.type);
    if (data.type === 'shuffle') {
        bingoBoard.classList.add('shake-effect');
        setTimeout(() => bingoBoard.classList.remove('shake-effect'), 1000);
    }
});

socket.on('update board', (newBoard) => {
    renderBoard(newBoard);
    updateBoardVisuals();
    if (turnTimerInterval) clearInterval(turnTimerInterval);
    manualStartArea.style.display = 'none';
    showBigEvent('🚀', '게임 시작!', `목표: ${targetLines}줄 빙고!`, 'good');
});

socket.on('all players ready', () => {
    if (amIHost) {
        manualStartArea.style.display = 'block';
        hostManualStartBtn.disabled = false;
        hostManualStartBtn.style.opacity = '1';
        hostManualStartBtn.style.cursor = 'pointer';
    }
});

socket.on('not all players ready', () => {
    if (amIHost) {
        // [Refinement] 버튼만 비활성화
        hostManualStartBtn.disabled = true;
        hostManualStartBtn.style.opacity = '0.6';
        hostManualStartBtn.style.cursor = 'not-allowed';
    }
});

socket.on('game over', (data) => {
    playEvent();
    if (turnTimerInterval) clearInterval(turnTimerInterval);
    turnTimerBar.style.display = 'none';

    // Render stats modal
    const resultStatHeader1 = document.getElementById('result-stat-header-1');
    const resultStatHeader2 = document.getElementById('result-stat-header-2');
    if (resultStatHeader1) resultStatHeader1.textContent = "빙고 수";
    if (resultStatHeader2) resultStatHeader2.textContent = "이벤트 사용";

    resultWinner.textContent = `👑 승자: ${data.winner}`;
    resultStatsBody.innerHTML = '';
    
    // Data should include stats for all players
    if (data.stats) {
        data.stats.forEach(stat => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding:10px;">${stat.name}</td>
                <td style="padding:10px; font-weight:bold;">${stat.bingoCount}줄</td>
                <td style="padding:10px;">${stat.eventUsed}회</td>
            `;
            if (stat.name === data.winner) tr.style.backgroundColor = '#fff9c4';
            resultStatsBody.appendChild(tr);
        });
    }
    
    resultModal.style.display = 'block';

    calledNumbersDisplay.textContent = '';
    bingoBoard.innerHTML = '';
    bingoButton.style.display = 'none';
    themeTitle.style.display = 'none';
    readyButton.style.display = 'none';
    if (saveThemeBtn) saveThemeBtn.style.display = 'none';
    turnDisplay.style.display = 'none';
    inputControls.style.display = 'none';
    isGameStarted = false;
    playerUI.style.display = 'none';

    if (amIHost) setupArea.style.display = 'block';
    else {
        waitingArea.style.display = 'block';
        waitingArea.innerHTML = `<h3>⏳ 대기 중...</h3><p>방장이 게임을 설정하고 있습니다.</p>`;
    }

    readyStatusDisplay.style.display = 'none';
    bingoBoard.classList.remove('inactive-board');
    bingoBoard.classList.remove('active-board');
    currentProgressMap = {};
    if (document.getElementById('turn-track')) document.getElementById('turn-track').style.display = 'none';
});

socket.on('false bingo', (msg) => {
    alert(`🚨 ${msg}`);
    if (isMyTurn) {
        bingoButton.disabled = false;
        updateBingoButton(checkBingoLines(myBoard, calledNumbers));
    }
});
})();
