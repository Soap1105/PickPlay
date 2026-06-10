// bingo.js
(function () {
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
    const openSettingsBtn = document.getElementById('open-settings-bingo');
    const startGameBtn = document.getElementById('start-game-bingo');
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
    const bingoActionArea = document.getElementById('bingo-action-area');
    const eventTriggerBtn = document.getElementById('event-trigger-btn');
    const victoryBingoBtn = document.getElementById('victory-bingo-btn');

    const loadThemeBtn = document.getElementById('load-theme-btn');
    const saveThemeBtn = document.getElementById('save-theme-btn');
    const themeModal = document.getElementById('theme-modal');
    const systemThemeList = document.getElementById('system-theme-list');
    const myThemeList = document.getElementById('my-theme-list');
    const closeModal = document.querySelector('.close-modal');
    const autoFillBtn = document.getElementById('auto-fill-btn');
    const shuffleBtn = document.getElementById('bingo-shuffle-btn');
    const rerollBtn = document.getElementById('bingo-reroll-btn');
    const rerollCountDisplay = document.getElementById('reroll-count-display');

    const themeTopicInput = document.getElementById('theme-topic-input');
    const turnTimeLimitSelect = document.getElementById('turn-time-limit');
    const hostManualStartBtn = document.getElementById('host-manual-start-btn');
    const manualStartArea = document.getElementById('manual-start-area');

    const turnTimerBar = document.getElementById('turn-timer-bar');
    const turnTimerProgress = document.getElementById('turn-timer-progress');

    const resultModal = document.getElementById('result-modal');
    const resultWinner = document.getElementById('result-winner');
    const resultStatsBody = document.getElementById('result-stats-body');
    const closeResultBtn = document.getElementById('close-result-btn');

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
    let currentThemeWords = [];
    let rerollCount = 0;
    let maxRerollLimit = 0;
    let isRerollMode = false;
    let currentTurnPlayerName = "";
    let currentTurnId = "";
    let myUsedEventCount = 0;
    let currentUsers = [];
    let turnTimerInterval = null;
    let turnDuration = 0;
    let turnStartTime = 0;
    window.useEventsGlobal = true; // [전역화] 렌더링 함수들이 어디서든 참조 가능하게 변경
    let pendingTurnUpdate = null;
    let popupActive = false;
    let lockedWords = {}; // [유령의 장난] 잠긴 단어 관리
    let lastBingoSettings = { winLines: 3, turnOrder: 'host_first', turnTimeLimit: 15, topic: '', useEvents: true };

    let myIgnoredNumbers = [];
    function getActiveCalledNumbers() {
        const normalize = (str) => String(str).replace(/\s+/g, '').trim().toLowerCase();
        const ignoreSet = new Set(myIgnoredNumbers.map(normalize));
        return calledNumbers.filter(num => !ignoreSet.has(normalize(num)));
    }

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
            span.style.border = "1px solid rgba(255,255,255,0.1)";
            span.style.backgroundColor = "rgba(0,0,0,0.3)";
            span.style.color = "#fffffe";
            span.style.transition = "all 0.3s";

            if (user.id === currentTurnId) {
                span.style.borderColor = "#f1c40f";
                span.style.backgroundColor = "rgba(241, 196, 15, 0.15)";
                span.style.transform = "scale(1.1)";
                span.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";
                span.style.zIndex = "10";
                if (user.id === socket.id) {
                    span.classList.add('turn-track-mine');
                }
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

    window.renderBingoUsers = function (users, hostStatus) {
        currentUsers = users;
        const userGrid = document.getElementById('user-grid');
        userGrid.innerHTML = '';
        updateTurnTrack(users);

        let bingoReadyCount = 0;

        users.forEach(user => {
            if (user.id === socket.id) {
                myUsedEventCount = user.usedEventCount || 0;
                myIgnoredNumbers = user.ignoredNumbers || [];
                updateBingoActionButtons(checkBingoLines(myBoard, getActiveCalledNumbers()));
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
            nickname.style.color = "#fffffe";
            nickname.style.textShadow = "0 2px 4px rgba(0,0,0,0.3)";
            if (user.isWaiting) {
                nickname.textContent = `⏳ ${user.name}`;
            } else {
                nickname.textContent = user.name;
                if (user.ready) {
                    nickname.innerHTML += ' <span style="color:#2ecc71">✔</span>';
                    bingoReadyCount++;
                }
            }
            if (window.getUserBadgeHtml) {
                nickname.innerHTML += window.getUserBadgeHtml(user);
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

                if (useEventsGlobal) {
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
                } else {
                    statusRow.appendChild(dotsContainer);
                }
            }
            infoDiv.appendChild(nickname);
            infoDiv.appendChild(statusRow);

            const kickBtn = window.createKickButton(user, amIHost, socket.id, !isGameStarted);
            if (kickBtn) card.appendChild(kickBtn);

            card.appendChild(avatarWrapper);
            card.appendChild(infoDiv);
            userGrid.appendChild(card);
        });
    };

    function updateReadyStatusVisibility() {
        const isInInputMode = (inputControls && inputControls.style.display === 'block');

        if (window.gameType === 'lobby' || !isInInputMode) {
            readyStatusDisplay.style.display = 'none';
            readyStatusDisplay.classList.add('hidden-by-logic');
        } else {
            readyStatusDisplay.style.display = 'block';
            readyStatusDisplay.classList.remove('hidden-by-logic');
        }
    }

    function updateBingoActionButtons(lines) {
        if (!isGameStarted) return;

        bingoActionArea.style.display = 'flex';

        // 1. 이벤트 버튼 제어
        if (window.useEventsGlobal) {
            eventTriggerBtn.style.display = 'flex';
            const maxEvents = Math.max(0, targetLines - 1);
            const remaining = Math.min(lines, maxEvents) - myUsedEventCount;

            if (isMyTurn && remaining > 0) {
                eventTriggerBtn.disabled = false;
                eventTriggerBtn.classList.add('active');
                eventTriggerBtn.querySelector('.btn-text').textContent = `이벤트 사용 (${remaining})`;
            } else {
                eventTriggerBtn.disabled = true;
                eventTriggerBtn.classList.remove('active');
                if (remaining <= 0) eventTriggerBtn.querySelector('.btn-text').textContent = `이벤트 사용!`;
                else eventTriggerBtn.querySelector('.btn-text').textContent = `상대 턴 대기`;
            }
        } else {
            eventTriggerBtn.style.display = 'none'; // 이벤트 모드 OFF면 버튼 숨김
        }

        // 2. 승리 버튼 제어
        if (lines >= targetLines) {
            victoryBingoBtn.disabled = false;
            victoryBingoBtn.classList.add('active');
            victoryBingoBtn.querySelector('.btn-text').textContent = `빙고!`;
        } else {
            victoryBingoBtn.disabled = true;
            victoryBingoBtn.classList.remove('active');
            victoryBingoBtn.querySelector('.btn-text').textContent = `빙고!`;
        }
    }

    function getBingoLines(board, calledNums) {
        const normalize = (str) => String(str).replace(/\s+/g, '').trim().toLowerCase();
        const calledSet = new Set(calledNums.map(normalize));
        const winningIndices = new Set();
        const lines = [];
        let count = 0;
        const checkLine = (indices) => {
            if (indices.every(index => calledSet.has(normalize(board[index])))) {
                count++;
                indices.forEach(idx => winningIndices.add(idx));
                lines.push(indices);
            }
        };
        for (let i = 0; i < 5; i++) checkLine([i * 5, i * 5 + 1, i * 5 + 2, i * 5 + 3, i * 5 + 4]);
        for (let i = 0; i < 5; i++) checkLine([i, i + 5, i + 10, i + 15, i + 20]);
        checkLine([0, 6, 12, 18, 24]);
        checkLine([4, 8, 12, 16, 20]);
        return { count, winningIndices: Array.from(winningIndices), lines };
    }

    function checkBingoLines(board, calledNums) { return getBingoLines(board, calledNums).count; }

    function updateBoardVisuals() {
        const normalize = (str) => String(str).replace(/\s+/g, '').trim().toLowerCase();
        const cells = document.querySelectorAll('.board-cell');

        // 이미 완성됐거나 애니메이션 진행 중인 칸 인덱스를 모두 기억
        const prevCompleted = new Set();
        cells.forEach(cell => {
            if (cell.classList.contains('bingo-completed') || cell.classList.contains('bingo-completing')) {
                prevCompleted.add(parseInt(cell.dataset.index));
            }
        });

        const activeNums = getActiveCalledNumbers();
        cells.forEach(cell => {
            const word = cell.dataset.word;
            const isCalled = activeNums.some(num => normalize(num) === normalize(word));
            if (isCalled) cell.classList.add('checked');
            else cell.classList.remove('checked');
            cell.classList.remove('bingo-completed');
            // 애니메이션 진행 중인 칸은 건드리지 않음 (연속 호출로 인한 중단 방지)
            if (!cell.classList.contains('bingo-completing')) {
                cell.classList.remove('bingo-completing');
            }
            // [유령의 장난] 잠긴 단어 표시
            if (word && lockedWords[word] !== undefined) {
                cell.classList.add('locked');
            } else {
                cell.classList.remove('locked');
            }
        });

        const { count, lines } = getBingoLines(myBoard, activeNums);
        const stampedIndices = new Set();

        lines.forEach(lineIndices => {
            // 해당 줄에 이전에 완성되지 않은 칸이 하나라도 있으면 새 줄 = 순차 애니메이션 실행
            const isNewLine = lineIndices.some(idx => !prevCompleted.has(idx));
            lineIndices.forEach((index, orderInLine) => {
                if (!cells[index]) return;
                cells[index].classList.add('bingo-completed');
                if (isNewLine && !stampedIndices.has(index)) {
                    stampedIndices.add(index);
                    const delay = orderInLine * 90;
                    cells[index].style.setProperty('--stamp-delay', `${delay}ms`);
                    cells[index].classList.add('bingo-completing');
                    // 애니메이션 종료 후 클래스 제거 (flashLine이 이어서 동작)
                    setTimeout(() => cells[index].classList.remove('bingo-completing'), 500 + delay);
                }
            });
        });

        updateBingoActionButtons(count);
    }

    function getCellFontSize(word) {
        const len = String(word).length;
        if (len <= 4) return '4.2cqw';
        if (len <= 6) return '3.6cqw';
        if (len <= 9) return '3.1cqw';
        return '2.6cqw';
    }

    function renderBoard(boardData) {
        bingoBoard.innerHTML = '';
        myBoard = boardData;
        boardData.forEach((word, index) => {
            const cell = document.createElement('button');
            cell.classList.add('board-cell');

            cell.textContent = word;
            cell.dataset.word = word;
            cell.dataset.index = index;
            cell.style.fontSize = getCellFontSize(word);
            cell.addEventListener('click', () => {
                if (setupArea.style.display !== 'none' || waitingArea.style.display !== 'none') return;
                if (turnDisplay.style.display === 'none') return;
                if (!isMyTurn) {
                    if (window.showToast) window.showToast("당신의 차례가 아닙니다!", "warning");
                    else alert("당신의 차례가 아닙니다!");
                    return;
                }
                if (calledNumbers.includes(word)) {
                    // [블랙홀 격리 복구] 격리 기간 동안 무시되었던 단어인 경우 마킹 복원 허용
                    if (myIgnoredNumbers.includes(word)) {
                        socket.emit('theme word selected', { roomId: window.roomId, word });
                        return;
                    }
                    if (window.showToast) window.showToast("이미 선택된 단어입니다.", "warning");
                    else alert("이미 선택된 단어입니다.");
                    return;
                }
                if (lockedWords[word] !== undefined) {
                    if (window.showToast) window.showToast(`🔒 '${word}'은(는) 유령에게 잠겨있습니다! (${lockedWords[word]}턴 후 해제)`, "warning");
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
            const val = (input.value || '').trim() || (input.placeholder || '').trim();
            if (!val || val.startsWith('단어 ')) isAllFilled = false;
            words.push(val);
        });
        if (!isAllFilled) {
            if (window.showToast) window.showToast("모든 칸을 진짜 단어로 채운 뒤 저장해주세요.", "warning");
            else alert("모든 칸을 진짜 단어로 채운 뒤 저장해주세요.");
            return;
        }
        
        // 단어 유효성 검사 (특수문자만 있거나 공백 단어 방지)
        const invalidWord = words.find(w => !w.trim() || /^[!@#$%^&*(),.?":{}|<>+=\-_'~` ]+$/.test(w));
        if (invalidWord) {
            if (window.showToast) window.showToast(`유효하지 않은 단어가 있습니다: '${invalidWord}'`, "warning");
            else alert(`유효하지 않은 단어가 있습니다: '${invalidWord}'`);
            return;
        }

        const duplicates = getDuplicates(words);
        if (duplicates.length > 0) {
            const msg = `중복된 단어: ${duplicates.join(', ')}`;
            if (window.showToast) window.showToast(msg, "warning");
            else alert(msg);
            return;
        }
        
        let title = prompt("테마 제목 입력 (최대 20자):");
        if (!title) return;
        title = title.trim();
        if (title.length > 20) {
            if (window.showToast) window.showToast("테마 제목은 최대 20자까지 가능합니다.", "warning");
            else alert("테마 제목은 최대 20자까지 가능합니다.");
            return;
        }
        if (/^[!@#$%^&*(),.?":{}|<>+=\-_'~` ]+$/.test(title)) {
            if (window.showToast) window.showToast("유효한 제목을 입력해 주세요.", "warning");
            return;
        }

        // 로컬 스토리지 저장 헬퍼
        const saveLocal = () => {
            let localThemes = [];
            try {
                localThemes = JSON.parse(localStorage.getItem('my_local_themes')) || [];
            } catch (e) {
                localThemes = [];
            }
            localThemes.push({
                id: 'local_' + Date.now(),
                title: title,
                words: words,
                creator: 'Local',
                created_at: new Date().toISOString()
            });
            localStorage.setItem('my_local_themes', JSON.stringify(localThemes));
        };

        try {
            const res = await fetch('/api/themes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, words, userId: myUserId })
            });
            if (res.ok) {
                if (window.showToast) window.showToast("서버 DB에 저장되었습니다!", "success");
                else alert("저장되었습니다!");
            } else {
                // DB 저장 실패 시 로컬 스토리지 Fallback 저장
                saveLocal();
                if (window.showToast) window.showToast("서버 저장 실패: 로컬 브라우저에 저장 완료!", "success");
                else alert("로컬에 저장 완료!");
            }
        } catch (e) {
            // DB 연결 불가능 시 로컬 스토리지 Fallback 저장
            saveLocal();
            if (window.showToast) window.showToast("네트워크 연결 실패: 로컬 브라우저에 저장 완료!", "success");
            else alert("로컬에 저장 완료!");
        }
    });

    // AI 생성 로딩 모달 취소 버튼 이벤트 바인딩
    const loadingCancelBtn = document.getElementById('ai-loading-cancel-btn');
    if (loadingCancelBtn) {
        loadingCancelBtn.addEventListener('click', () => {
            if (!amIHost) return; // 방장만 취소 가능

            if (confirm("주제 단어 생성을 취소하시겠습니까?")) {
                window.isFetchingTheme = false;

                // 서버에 취소 소켓 전송
                socket.emit('cancel theme generation');

                // 호스트 UI 컨트롤 복구
                const themeInput = document.getElementById('theme-topic-input');
                const startGameBtn = document.getElementById('start-game-bingo');

                if (window.aiCooldownInterval) {
                    clearInterval(window.aiCooldownInterval);
                    window.aiCooldownInterval = null;
                }
                window.aiCooldownEndTime = null;

                if (startGameBtn) {
                    startGameBtn.textContent = "게임 시작";
                    startGameBtn.disabled = false;
                }
                if (themeInput) themeInput.disabled = false;

                resetAILoader();
                if (window.showToast) window.showToast("단어 생성이 취소되었습니다.", "info");
            }
        });
    }

    readyButton.addEventListener('click', () => {
        if (isMyReady) {
            socket.emit('cancel ready');

            isMyReady = false;
            readyButton.textContent = "준비 완료";
            readyButton.style.background = "linear-gradient(135deg, #6366f1, #a855f7)";
            readyButton.style.boxShadow = "0 4px 15px rgba(99, 102, 241, 0.3)";
            readyButton.disabled = false;

            document.querySelectorAll('.board-input').forEach(input => {
                input.disabled = false;
            });

            // [리롤 & 셔플 연동] 준비 해제 시 버튼 복원
            updateRerollUI();

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

        // [리롤 & 셔플 연동] 준비 완료 시 리롤 모드 해제 및 버튼 비활성화
        isRerollMode = false;
        if (rerollBtn) {
            rerollBtn.classList.remove('reroll-active');
            rerollBtn.disabled = true;
        }
        if (shuffleBtn) {
            shuffleBtn.disabled = true;
        }
        inputs.forEach(input => input.classList.remove('rerollable'));

        isMyReady = true;
        readyButton.textContent = "준비 해제";
        readyButton.style.background = "linear-gradient(135deg, #ff7675, #ee5253)";
        readyButton.style.boxShadow = "0 4px 15px rgba(238, 82, 83, 0.3)";

        inputs.forEach(input => {
            input.disabled = true;
        });

        socket.emit('submit theme board', {
            roomId: window.roomId,
            board: words,
            name: window.myName,
            useEvents: useEventsGlobal
        });
    });

    if (shuffleBtn) {
        shuffleBtn.addEventListener('click', () => {
            if (isMyReady) return;
            
            const inputs = document.querySelectorAll('.board-input');
            const words = [];
            inputs.forEach(input => words.push(input.value.trim()));
            
            const shuffled = [...words].sort(() => Math.random() - 0.5);
            inputs.forEach((input, index) => {
                input.value = shuffled[index] || '';
            });
            
            if (window.showToast) window.showToast("빙고판 배치가 섞였습니다!", "info");
        });
    }

    if (rerollBtn) {
        rerollBtn.addEventListener('click', () => {
            if (isMyReady) return;
            if (maxRerollLimit <= 0 || rerollCount >= maxRerollLimit) {
                if (window.showToast) window.showToast("리롤을 더 이상 사용할 수 없습니다.", "warning");
                return;
            }
            
            isRerollMode = !isRerollMode;
            const inputs = document.querySelectorAll('.board-input');
            
            if (isRerollMode) {
                rerollBtn.classList.add('reroll-active');
                inputs.forEach(input => input.classList.add('rerollable'));
                if (window.showToast) window.showToast("교체할 빙고 칸을 선택하세요!", "info");
            } else {
                rerollBtn.classList.remove('reroll-active');
                inputs.forEach(input => input.classList.remove('rerollable'));
            }
        });
    }

    async function loadThemes() {
        if (systemThemeList) systemThemeList.innerHTML = '<li>로딩 중...</li>';
        if (myThemeList) myThemeList.innerHTML = '<li>로딩 중...</li>';

        let localThemes = [];
        try {
            localThemes = JSON.parse(localStorage.getItem('my_local_themes')) || [];
        } catch (e) {
            localThemes = [];
        }

        const renderThemesList = (themes) => {
            if (systemThemeList) systemThemeList.innerHTML = '';
            if (myThemeList) myThemeList.innerHTML = '';

            // DB 테마 목록에 로컬 스토리지 테마를 중복 없이 병합
            const allThemes = [...themes];
            localThemes.forEach(lt => {
                if (!allThemes.some(t => t.id === lt.id)) {
                    allThemes.push(lt);
                }
            });

            allThemes.forEach(theme => {
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
        };

        try {
            const res = await fetch(`/api/themes?userId=${myUserId}`);
            if (res.ok) {
                const themes = await res.json();
                renderThemesList(themes);
            } else {
                // 서버 오류 시 로컬 스토리지의 테마 목록으로 채우기
                renderThemesList([]);
                if (window.showToast) window.showToast("서버 목록 로드 실패: 로컬 테마만 표시합니다.", "warning");
            }
        } catch (e) {
            // 네트워크 끊겼을 때 로컬 테마만 출력
            renderThemesList([]);
            if (window.showToast) window.showToast("네트워크 장애: 로컬 테마만 표시합니다.", "warning");
        }
    }

    async function deleteTheme(id) {
        if (!confirm("삭제하시겠습니까?")) return;

        // 로컬 테마인 경우
        if (typeof id === 'string' && id.startsWith('local_')) {
            try {
                let localThemes = JSON.parse(localStorage.getItem('my_local_themes')) || [];
                localThemes = localThemes.filter(t => t.id !== id);
                localStorage.setItem('my_local_themes', JSON.stringify(localThemes));
                if (window.showToast) window.showToast("로컬 테마가 삭제되었습니다.", "success");
                loadThemes();
            } catch (e) {
                if (window.showToast) window.showToast("로컬 삭제 실패", "error");
            }
            return;
        }

        // DB 테마인 경우
        try {
            const res = await fetch(`/api/themes/${id}?userId=${myUserId}`, { method: 'DELETE' });
            if (res.ok) {
                if (window.showToast) window.showToast("삭제되었습니다.", "success");
                loadThemes();
            } else {
                if (window.showToast) window.showToast("서버 삭제 실패", "error");
            }
        } catch (e) {
            if (window.showToast) window.showToast("네트워크 오류로 삭제 불가", "error");
        }
    }

    function updateRerollUI() {
        if (!rerollBtn || !rerollCountDisplay) return;
        
        if (maxRerollLimit > 0 && rerollCount < maxRerollLimit) {
            rerollBtn.disabled = false;
            rerollCountDisplay.textContent = `${rerollCount}/${maxRerollLimit}`;
            if (shuffleBtn) shuffleBtn.disabled = false;
        } else {
            rerollBtn.disabled = true;
            rerollBtn.classList.remove('reroll-active');
            isRerollMode = false;
            document.querySelectorAll('.board-input').forEach(input => input.classList.remove('rerollable'));
            
            if (maxRerollLimit === 0) {
                rerollCountDisplay.textContent = `불가`;
            } else {
                rerollCountDisplay.textContent = `완료`;
            }
        }
    }

    async function selectTheme(id) {
        const applyTheme = (title, words) => {
            if (confirm(`'${title}' 테마를 불러와서 채울까요?`)) {
                themeModal.style.display = 'none';
                
                // [리롤 & 셔플 연동] 전체 단어 목록 저장 및 횟수 리셋
                currentThemeWords = [...words];
                rerollCount = 0;
                maxRerollLimit = Math.max(0, currentThemeWords.length - 25);
                isRerollMode = false;
                if (rerollBtn) {
                    rerollBtn.classList.remove('reroll-active');
                }
                updateRerollUI();

                const shuffled = [...words].sort(() => Math.random() - 0.5);
                const inputs = document.querySelectorAll('.board-input');
                inputs.forEach((input, index) => { 
                    if (shuffled[index]) input.value = shuffled[index]; 
                    else input.value = '';
                    input.classList.remove('rerollable');
                });
                if (window.showToast) window.showToast("자동 입력 완료!", "success");
            }
        };

        // 로컬 테마인 경우
        if (typeof id === 'string' && id.startsWith('local_')) {
            try {
                const localThemes = JSON.parse(localStorage.getItem('my_local_themes')) || [];
                const found = localThemes.find(t => t.id === id);
                if (found) {
                    let words = found.words;
                    if (typeof words === 'string') words = JSON.parse(words);
                    applyTheme(found.title, words);
                } else {
                    if (window.showToast) window.showToast("해당 로컬 테마를 찾을 수 없습니다.", "error");
                }
            } catch (e) {
                if (window.showToast) window.showToast("로컬 로드 오류", "error");
            }
            return;
        }

        // DB 테마인 경우
        try {
            const res = await fetch(`/api/themes/${id}`);
            if (res.ok) {
                const data = await res.json();
                let words = data.words;
                if (typeof words === 'string') words = JSON.parse(words);
                applyTheme(data.title, words);
            } else {
                if (window.showToast) window.showToast("서버에서 테마를 조회하지 못했습니다.", "error");
            }
        } catch (e) {
            if (window.showToast) window.showToast("불러오기 실패: 네트워크 연결 오류", "error");
        }
    }

    if (openSettingsBtn) {
        openSettingsBtn.addEventListener('click', () => {
            window.openSettingsModal('bingo', (settings) => {
                if (window.showToast) window.showToast('설정이 저장되었습니다!', 'success');
            });
        });
    }

    if (startGameBtn) {
        startGameBtn.addEventListener('click', async () => {
            // [버그 방지] 결과창이 열려 있는 동안에는 AI 주제 생성 및 게임 시작 완전 차단
            if (resultModal && resultModal.style.display === 'block') {
                if (window.showToast) window.showToast('아직 결과를 확인 중인 플레이어가 있습니다.', 'warning');
                return;
            }

            const slotsCount = document.querySelectorAll('#waiting-player-matrix .player-slot:not(.empty)').length;
            const playersCount = slotsCount > 0 ? slotsCount : document.querySelectorAll('.user-card').length;
            if (playersCount < 2) {
                if (window.showToast) {
                    window.showToast('빙고 게임은 최소 2명 이상이어야 시작할 수 있습니다!', 'error');
                } else {
                    alert("🚫 최소 2명이 모여야 합니다.");
                }
                return;
            }

            const selectedLines = parseInt(document.getElementById('win-lines-select')?.value || '3');
            const selectedOrder = document.getElementById('turn-order-select')?.value || 'host_first';
            const turnTime = parseInt(document.getElementById('turn-time-limit')?.value || '15');
            let topic = document.getElementById('theme-topic-input')?.value || '';
            const themeInput = document.getElementById('theme-topic-input');
            let presetWords = [];

            // 쿨타임 정의 및 연동 함수
            function startLocalCooldown(seconds) {
                if (window.aiCooldownInterval) clearInterval(window.aiCooldownInterval);

                startGameBtn.disabled = true;
                if (themeInput) themeInput.disabled = true;

                let remaining = seconds;
                startGameBtn.textContent = `생성 쿨타임 대기 (${remaining}초)...⏳`;

                window.aiCooldownInterval = setInterval(() => {
                    remaining--;
                    if (remaining <= 0) {
                        clearInterval(window.aiCooldownInterval);
                        window.aiCooldownInterval = null;
                        window.aiCooldownEndTime = null;

                        startGameBtn.textContent = "게임 시작";
                        startGameBtn.disabled = false;
                        if (themeInput) themeInput.disabled = false;
                    } else {
                        startGameBtn.textContent = `생성 쿨타임 대기 (${remaining}초)...⏳`;
                    }
                }, 1000);
            }
            window.startBingoAICooldown = startLocalCooldown;

            // 로컬 쿨다운 검사
            const localNow = Date.now();
            if (window.aiCooldownEndTime && localNow < window.aiCooldownEndTime) {
                const remaining = Math.ceil((window.aiCooldownEndTime - localNow) / 1000);
                if (window.showToast) window.showToast(`단어 생성 쿨타임 대기 중입니다. (${remaining}초 남음)`, 'warning');
                return;
            }

            // [AI 빙고 주제 구동부]
            if (topic && topic !== '자유 주제') {
                // [입력값 검증] 한글 자음만으로 구성된 무의미한 입력 차단 (예: ㅋ, ㄷㄱ 등)
                if (/^[ㄱ-ㅎ]+$/.test(topic.trim())) {
                    if (window.showToast) window.showToast('자음만으로는 주제를 생성할 수 없어요. 단어나 카테고리를 입력해주세요! (예: K-POP, 한국 음식)', 'warning');
                    return;
                }
                const originalText = startGameBtn.textContent;
                startGameBtn.textContent = "단어를 구성하는 중입니다...⏳";
                startGameBtn.disabled = true;
                if (themeInput) themeInput.disabled = true;

                const progressContainer = document.getElementById('ai-loading-modal');
                const progressBar = document.getElementById('ai-progress-bar');
                const progressStep = document.getElementById('ai-progress-step');
                const cancelBtn = document.getElementById('ai-loading-cancel-btn');

                if (progressContainer) {
                    progressContainer.style.display = 'flex';
                    if (progressBar) progressBar.style.width = '0%';
                    if (progressStep) progressStep.innerHTML = '<i class="fas fa-cog fa-spin" style="margin-right: 6px;"></i> 단어 생성 준비 중...';
                    if (cancelBtn) cancelBtn.style.display = 'block'; // 방장은 항상 취소 노출
                }

                window.isFetchingTheme = true;

                try {
                    const res = await fetch('/api/themes/generate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title: topic, userId: myUserId, roomId: window.roomId })
                    });
                    
                    if (!window.isFetchingTheme) {
                        return; // 중간에 취소된 경우 중단
                    }

                    const data = await res.json();

                    if (!window.isFetchingTheme) {
                        return; // 중간에 취소된 경우 중단
                    }

                    window.isFetchingTheme = false;

                    if (res.ok && data.success) {
                        presetWords = data.words;

                        // 캐시 미스(실제 AI가 생성한 경우)에만 30초 로컬 쿨다운 적용
                        if (data.source === 'ai') {
                            window.aiCooldownEndTime = Date.now() + 30000;
                            startLocalCooldown(30);
                        } else {
                            // 캐시 히트 시에는 즉시 입력창 및 버튼 원복
                            startGameBtn.textContent = originalText;
                            startGameBtn.disabled = false;
                            if (themeInput) themeInput.disabled = false;
                        }

                        setTimeout(() => { if (progressContainer) progressContainer.style.display = 'none'; }, 1000);
                    } else {
                        // 서버 측에서 쿨다운 에러(429)를 반환했을 때 대응
                        if (res.status === 429 && data.error === 'cooldown') {
                            const remaining = data.remainingTime || 30;
                            window.aiCooldownEndTime = Date.now() + (remaining * 1000);
                            startLocalCooldown(remaining);
                        } else {
                            // 일반 실패 시 즉시 입력 및 버튼 복구
                            const msg = "단어 생성 실패: " + (data.message || data.error || "알 수 없는 오류");
                            if (window.showToast) window.showToast(msg, "error");
                            else alert(msg);
                            startGameBtn.textContent = originalText;
                            startGameBtn.disabled = false;
                            if (themeInput) themeInput.disabled = false;
                        }
                        if (progressContainer) progressContainer.style.display = 'none';
                        return;
                    }
                } catch (e) {
                    window.isFetchingTheme = false;
                    if (window.showToast) window.showToast("서버 연결 오류가 발생했습니다.", "error");
                    else alert("서버 연결 오류가 발생했습니다.");
                    startGameBtn.textContent = originalText;
                    startGameBtn.disabled = false;
                    if (themeInput) themeInput.disabled = false;
                    if (progressContainer) progressContainer.style.display = 'none';
                    return;
                }
            }

            socket.emit('init theme mode', {
                roomId: window.roomId,
                topic,
                winLines: selectedLines,
                turnOrder: selectedOrder,
                turnTimeLimit: turnTime,
                useEvents: document.getElementById('bingo-use-events')?.value === 'true',
                presetWords: presetWords
            });
            // setupArea는 서버가 'setup theme input'을 보낼 때 숨김 처리됨
            // 여기서 미리 숨기면 서버가 action failed를 보낼 때 빈 화면이 되는 버그 발생
        });
    }

    if (hostManualStartBtn) {
        hostManualStartBtn.addEventListener('click', () => {
            socket.emit('host manual start bingo');
        });
    }

    // 빙고 이벤트 리스너들
    eventTriggerBtn.addEventListener('click', () => {
        if (!isMyTurn || !window.useEventsGlobal) return;
        const { count } = getBingoLines(myBoard, getActiveCalledNumbers());
        const remaining = count - myUsedEventCount;
        if (remaining > 0) {
            socket.emit('trigger event', { name: window.myName });
        }
    });

    victoryBingoBtn.addEventListener('click', () => {
        const { count } = getBingoLines(myBoard, getActiveCalledNumbers());
        if (count >= targetLines) {
            socket.emit('bingo declared', { name: window.myName });
        }
    });

    socket.on('bingo progress update', (progressMap) => {
        currentProgressMap = progressMap;
        if (window.gameType === 'bingo') {
            window.renderBingoUsers(currentUsers, amIHost);
        }
    });

    function updateBingoLobbySettingsUI(settings) {
        const previewEl = document.getElementById('bingo-lobby-settings-preview');
        const hostPreviewEl = document.getElementById('bingo-host-settings-preview');
        if (!settings) return;

        let turnOrderText = "방장 우선";
        if (settings.turnOrder === 'random') turnOrderText = "랜덤 순서";
        else if (settings.turnOrder === 'join_asc') turnOrderText = "입장 순서";

        const limitVal = settings.turnTimeLimit !== undefined ? settings.turnTimeLimit : (settings.turnTime !== undefined ? settings.turnTime : 15);
        const timeLimitText = limitVal > 0 ? `${limitVal}초` : "무제한";
        const topicText = settings.topic ? `<span style="color:#2ecc71; font-weight:700;">${settings.topic}</span>` : "자유 주제";
        const eventsText = settings.useEvents ? "ON" : "OFF";

        const html = `
            <div class="lobby-settings-title" style="justify-content: center; font-size: 0.95rem; margin-bottom: 14px; color: #64b5f6; font-weight: 800; border-bottom: 1px solid rgba(100,181,246,0.15); padding-bottom: 6px;">게임 설정</div>
            <div class="lobby-settings-grid">
                <div class="lobby-settings-item">
                    <span class="lobby-settings-label">목표 줄 수</span>
                    <span class="lobby-settings-val"><span style="background: rgba(52, 152, 219, 0.12); border: 1px solid rgba(52, 152, 219, 0.3); color: #64b5f6; padding: 2px 8px; border-radius: 6px; font-size: 0.8rem;">${settings.winLines}줄</span></span>
                </div>
                <div class="lobby-settings-item">
                    <span class="lobby-settings-label">시작 순서</span>
                    <span class="lobby-settings-val"><span style="background: rgba(52, 152, 219, 0.12); border: 1px solid rgba(52, 152, 219, 0.3); color: #64b5f6; padding: 2px 8px; border-radius: 6px; font-size: 0.8rem;">${turnOrderText}</span></span>
                </div>
                <div class="lobby-settings-item">
                    <span class="lobby-settings-label">턴 제한시간</span>
                    <span class="lobby-settings-val"><span style="background: rgba(52, 152, 219, 0.12); border: 1px solid rgba(52, 152, 219, 0.3); color: #64b5f6; padding: 2px 8px; border-radius: 6px; font-size: 0.8rem;">${timeLimitText}</span></span>
                </div>
                <div class="lobby-settings-item">
                    <span class="lobby-settings-label">이벤트 모드</span>
                    <span class="lobby-settings-val"><span style="background: rgba(52, 152, 219, 0.12); border: 1px solid rgba(52, 152, 219, 0.3); color: #64b5f6; padding: 2px 8px; border-radius: 6px; font-size: 0.8rem;">${eventsText}</span></span>
                </div>
                <div class="lobby-settings-item" style="grid-column: span 2; text-align: center; margin-top: 4px;">
                    <span class="lobby-settings-label" style="margin-bottom: 4px;">AI 생성 주제</span>
                    <span class="lobby-settings-val"><span style="background: rgba(46, 204, 113, 0.12); border: 1px solid rgba(46, 204, 113, 0.3); color: #2ecc71; padding: 4px 12px; border-radius: 8px; font-size: 0.85rem; font-weight: bold; display: inline-block;">${settings.topic ? settings.topic : '자유 주제'}</span></span>
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
        if (data && data.bingo) {
            lastBingoSettings = data.bingo;
            updateBingoLobbySettingsUI(data.bingo);

            // [Bug Fix] 수신한 빙고 설정을 hidden input 필드에도 확실히 동기화
            const settings = data.bingo;
            const hiddenTurnOrder = document.getElementById('turn-order-select');
            const hiddenTurnTime = document.getElementById('turn-time-limit');
            const hiddenTopic = document.getElementById('theme-topic-input');
            const hiddenWinLines = document.getElementById('win-lines-select');
            const hiddenEvents = document.getElementById('bingo-use-events');

            if (hiddenTurnOrder && settings.turnOrder !== undefined) hiddenTurnOrder.value = settings.turnOrder;
            if (hiddenTurnTime && settings.turnTimeLimit !== undefined) {
                // turnTimeLimit이 수신되지 않거나 turnTime으로 올 경우 대비
                const limitVal = settings.turnTimeLimit !== undefined ? settings.turnTimeLimit : (settings.turnTime !== undefined ? settings.turnTime : 15);
                hiddenTurnTime.value = limitVal;
            }
            if (hiddenTopic && settings.topic !== undefined) hiddenTopic.value = settings.topic;
            if (hiddenWinLines && settings.winLines !== undefined) hiddenWinLines.value = settings.winLines;
            if (hiddenEvents && settings.useEvents !== undefined) hiddenEvents.value = settings.useEvents;
        }
    });

    // AI 생성 진행률 수신
    socket.on('theme progress', (data) => {
        const progressContainer = document.getElementById('ai-loading-modal');
        const progressBar = document.getElementById('ai-progress-bar');
        const progressStep = document.getElementById('ai-progress-step');
        const cancelBtn = document.getElementById('ai-loading-cancel-btn');

        if (progressContainer && progressBar) {
            progressContainer.style.display = 'flex';
            if (cancelBtn) {
                cancelBtn.style.display = amIHost ? 'block' : 'none'; // 방장만 취소 노출
            }

            // 실시간 작업 현황 문구 출력 (방장/게스트 문구 완벽 통일)
            if (progressStep) {
                const stepMsg = data.step || "단어 생성 중...";
                const percentSuffix = data.percent !== undefined ? ` (${data.percent}%)` : "";
                progressStep.innerHTML = `<i class="fas fa-cog fa-spin" style="margin-right: 6px;"></i> ${stepMsg}${percentSuffix}`;
            }

            // 가상 스무스 로더 타이머 기동 (미세하게 매초마다 차오르게 함)
            if (!aiFakeProgressInterval) {
                aiFakePercent = data.percent;
                progressBar.style.width = `${aiFakePercent}%`;

                aiFakeProgressInterval = setInterval(() => {
                    if (aiFakePercent < 95) {
                        aiFakePercent += 0.4; // 100ms 당 0.4%씩 부드럽게 증가시킴
                        progressBar.style.width = `${aiFakePercent}%`;
                    }
                }, 100);
            }

            // 실제 서버 진행도 수신 시 강제 연동 보정
            if (data.percent > aiFakePercent) {
                aiFakePercent = data.percent;
                progressBar.style.width = `${aiFakePercent}%`;
            }

            // 실패 또는 취소 문구 핸들링
            if (data.percent === 0 && (data.step.includes('실패') || data.step === '취소됨')) {
                if (progressStep) {
                    if (data.step === '취소됨') {
                        progressStep.innerHTML = `<i class="fas fa-ban" style="margin-right: 8px; color: #ff7675;"></i> 단어 생성 요청이 취소되었습니다.`;
                    } else {
                        progressStep.innerHTML = `<i class="fas fa-exclamation-triangle" style="margin-right: 8px; color: #ef4444;"></i> ${data.step}`;
                    }
                }
                
                // 모든 참여자(호스트/게스트)에게 토스트 팝업으로 명확하게 실패 원인 안내
                if (window.showToast) {
                    const toastMsg = data.step === '취소됨' 
                        ? "단어 생성 요청이 취소되었습니다." 
                        : `${data.step}`;
                    const toastType = (data.step === '취소됨' || data.step.includes('쿨타임')) ? "warning" : "error";
                    window.showToast(toastMsg, toastType);
                }
                
                if (amIHost) {
                    // 방장 UI 복원
                    const themeInput = document.getElementById('theme-topic-input');
                    const startGameBtn = document.getElementById('start-game-bingo');
                    if (window.aiCooldownInterval) {
                        clearInterval(window.aiCooldownInterval);
                        window.aiCooldownInterval = null;
                    }
                    window.aiCooldownEndTime = null;
                    if (startGameBtn) {
                        startGameBtn.textContent = "게임 시작";
                        startGameBtn.disabled = false;
                    }
                    if (themeInput) themeInput.disabled = false;
                }
                
                setTimeout(resetAILoader, 1500);
            }

            // 완료
            if (data.percent === 100) {
                if (aiFakeProgressInterval) {
                    clearInterval(aiFakeProgressInterval);
                    aiFakeProgressInterval = null;
                }
                aiFakePercent = 100;
                progressBar.style.width = '100%';
            }
        }

        // [Bug Fix #7] 방장이 AI 생성 도중 새로고침하여 들어와서 대기 중일 때 자동 게임 시작 처리
        if (data.percent === 100 && amIHost && !window.isFetchingTheme && data.words) {
            const selectedLines = parseInt(document.getElementById('win-lines-select')?.value || '3');
            const selectedOrder = document.getElementById('turn-order-select')?.value || 'host_first';
            const turnTime = parseInt(document.getElementById('turn-time-limit')?.value || '15');
            let topic = document.getElementById('theme-topic-input')?.value || '';

            socket.emit('init theme mode', {
                roomId: window.roomId,
                topic,
                winLines: selectedLines,
                turnOrder: selectedOrder,
                turnTimeLimit: turnTime,
                useEvents: document.getElementById('bingo-use-events')?.value === 'true',
                presetWords: data.words
            });

            setTimeout(resetAILoader, 1000);
        }
    });

    socket.on('update ready status', (data) => {
        readyStatusDisplay.innerHTML = `준비 인원: <span style="color:#f1c40f">${data.ready}</span> / ${data.total}`;
        updateReadyStatusVisibility();
    });

    socket.on('game status update', (data) => { isGameStarted = data.started; });

    function processTurnUpdate(data) {
        currentTurnId = data.currentTurnId;
        currentTurnPlayerName = data.currentTurnName;
        document.querySelectorAll('.user-card').forEach(c => c.classList.remove('current-turn'));
        const currentCard = document.getElementById(`user-${currentTurnId}`);
        if (currentCard) currentCard.classList.add('current-turn');
        updateTurnTrack(currentUsers);

        if (socket.id === currentTurnId) {
            isMyTurn = true;
            turnDisplay.classList.add('my-turn-glow');
            turnDisplay.textContent = "👉 당신의 차례입니다!";
            turnDisplay.style.backgroundColor = "rgba(46, 204, 113, 0.15)";
            bingoBoard.classList.remove('inactive-board');
            bingoBoard.classList.add('active-board');
        } else {
            isMyTurn = false;
            turnDisplay.classList.remove('my-turn-glow');
            turnDisplay.textContent = `⏳ ${currentTurnPlayerName}님의 차례...`;
            turnDisplay.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
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
    }

    socket.on('turn update', (data) => {
        if (popupActive) {
            pendingTurnUpdate = data;
            return;
        }
        processTurnUpdate(data);
    });

    // RGB 선형 보간 헬퍼: c1, c2 = [r, g, b], t = 0~1
    function lerpColor(c1, c2, t) {
        return [
            Math.round(c1[0] + (c2[0] - c1[0]) * t),
            Math.round(c1[1] + (c2[1] - c1[1]) * t),
            Math.round(c1[2] + (c2[2] - c1[2]) * t)
        ];
    }

    // percentage(0~100)에 따라 황금색/주황색 -> 적색 그라디언트 반환
    function getTimerGradient(percentage) {
        const orange = [230, 126, 34];
        const yellow = [241, 196, 15];
        const red = [231, 76, 60];

        let base;
        if (percentage >= 30) {
            // 100% ~ 30% : 주황색 -> 노란색 (주황빛에서 노란빛 유지)
            const t = (percentage - 30) / 70;
            base = lerpColor(orange, yellow, t);
        } else {
            // 30% ~ 0% : 주황색 -> 빨간색 (30% 이하부터 빨갛게 타오름)
            const t = 1 - (percentage / 30);
            base = lerpColor(orange, red, t);
        }

        // 그라디언트용: 같은 색의 72% 밝기 버전을 왼쪽에
        const dark = base.map(v => Math.round(v * 0.72));
        return `linear-gradient(90deg, rgb(${dark.join(',')}), rgb(${base.join(',')}))`;
    }

    // AI 생성용 부드러운 가상 로더 변수 및 함수
    let aiFakeProgressInterval = null;
    let aiFakePercent = 0;

    function resetAILoader() {
        if (aiFakeProgressInterval) {
            clearInterval(aiFakeProgressInterval);
            aiFakeProgressInterval = null;
        }
        aiFakePercent = 0;
        const progressContainer = document.getElementById('ai-loading-modal');
        const progressBar = document.getElementById('ai-progress-bar');
        if (progressContainer) progressContainer.style.display = 'none';
        if (progressBar) progressBar.style.width = '0%';
    }

    function updateTurnTimerUI() {
        const elapsed = (Date.now() - turnStartTime) / 1000;
        const remaining = Math.max(0, turnDuration - elapsed);
        const percentage = (remaining / turnDuration) * 100;
        turnTimerProgress.style.width = percentage + '%';

        // RGB 실시간 보간으로 색상 부드럽게 전환
        turnTimerProgress.style.background = getTimerGradient(percentage);

        // 소수점 1자리 실시간 표시
        const secondsSpan = document.getElementById('turn-timer-seconds');
        if (secondsSpan) {
            secondsSpan.textContent = remaining.toFixed(1) + '초';
        }

        if (remaining <= 0) {
            if (secondsSpan) secondsSpan.textContent = '0.0초';
            if (turnTimerInterval) clearInterval(turnTimerInterval);
        }
    }

    window.updateBingoRoleUI = function (isHostStatus) {
        amIHost = isHostStatus;
        resetAILoader(); // 대기방 복원/이탈 시 로더 완전 정리

        // 게스트 나가기 버튼 숨김 처리
        const returnBtn = document.getElementById('integrated-return-btn');
        if (returnBtn) {
            returnBtn.style.display = amIHost ? 'inline-block' : 'none';
        }

        const myCard = document.getElementById(`user-${socket.id}`);
        if (myCard && amIHost) myCard.classList.add('is-host');

        // [이슈 28 해결] 구식 대기방 영역은 언제나 완전 은폐 처리합니다.
        setupArea.style.display = 'none';
        waitingArea.style.display = 'none';
        playerUI.style.display = 'none';
        readyStatusDisplay.style.display = 'none';

        if (isGameStarted) {
            if (isMyReady) {
                playerUI.style.display = 'block';
            }
        } else {
            const isInInputMode = (inputControls && inputControls.style.display === 'block');
            // 단어 입력 단계가 아닐 때만 글로벌 대기방으로 뒷배경을 안전하게 전환합니다.
            if (!isInInputMode && window.gameType === 'bingo') {
                if (typeof showContainer === 'function') {
                    showContainer('lobby-container');
                    const stageSelection = document.getElementById('selection-stage');
                    const stageWaiting = document.getElementById('waiting-stage');
                    if (stageSelection) stageSelection.style.display = 'none';
                    if (stageWaiting) stageWaiting.style.display = 'flex';
                }
            }

            // [1-8] 대기실 진입 시 AI 쿨타임이 남아있다면 로컬 카운트다운 타이머 연동 구동
            if (amIHost) {
                const now = Date.now();
                if (window.aiCooldownEndTime && now < window.aiCooldownEndTime) {
                    const remaining = Math.ceil((window.aiCooldownEndTime - now) / 1000);
                    if (typeof window.startBingoAICooldown === 'function') {
                        window.startBingoAICooldown(remaining);
                    }
                }
            }
        }
        updateReadyStatusVisibility();
        updateBingoLobbySettingsUI(lastBingoSettings);
    };

    window.initBingoUI = function (isHostStatus) {
        window.updateBingoRoleUI(isHostStatus);
    };

    socket.on('setup theme input', (data) => {
        if (typeof showContainer === 'function') showContainer('bingo-container');
        // [작업 2] 이전 게임 잔류 변수 및 데이터 완벽 초기화
        currentTurnId = "";
        currentTurnPlayerName = "";
        pendingTurnUpdate = null;
        popupActive = false;
        calledNumbers = [];
        currentProgressMap = {};
        myUsedEventCount = 0;
        isMyTurn = false;

        // [리롤 & 셔플 연동] 전체 단어 목록 저장 및 횟수 리셋
        currentThemeWords = data.presetWords || [];
        rerollCount = 0;
        maxRerollLimit = Math.max(0, currentThemeWords.length - 25);
        isRerollMode = false;
        if (rerollBtn) {
            rerollBtn.classList.remove('reroll-active');
        }
        updateRerollUI();

        // AI 로더 강제 정리 및 초기화
        resetAILoader();

        // 타이머 인터벌 해제
        if (turnTimerInterval) {
            clearInterval(turnTimerInterval);
            turnTimerInterval = null;
        }

        // UI 컴포넌트 강제 리셋 및 숨김 처리
        if (turnDisplay) {
            turnDisplay.style.display = 'none';
            turnDisplay.textContent = '';
        }
        if (victoryBingoBtn) {
            victoryBingoBtn.style.display = ''; // 버튼 숨김 해제
            victoryBingoBtn.disabled = true;
            victoryBingoBtn.classList.remove('active');
        }
        if (turnTimerBar) {
            turnTimerBar.style.display = 'none';
            const secondsSpan = document.getElementById('turn-timer-seconds');
            if (secondsSpan) secondsSpan.textContent = '';
        }
        if (calledNumbersDisplay) {
            calledNumbersDisplay.textContent = '';
        }
        updateTurnTrack([]);

        // 결과 모달 닫기
        const resultModal = document.getElementById('result-modal');
        if (resultModal) {
            resultModal.style.display = 'none';
        }

        targetLines = data.winLines || 3;
        useEventsGlobal = data.useEvents !== undefined ? data.useEvents : true;

        setupArea.style.display = 'none';
        waitingArea.style.display = 'none';
        readyStatusDisplay.style.display = 'block';
        playerUI.style.display = 'block';
        themeTitle.style.display = 'block';
        themeTitle.textContent = `주제: ${data.topic} (목표: ${targetLines}줄)`;
        bingoBoard.innerHTML = '';
        bingoBoard.classList.remove('inactive-board');
        bingoBoard.classList.remove('active-board');

        bingoActionArea.style.display = 'none';
        isMyReady = false;
        readyButton.disabled = false;
        readyButton.textContent = "준비 완료";
        readyButton.style.display = 'inline-block';
        readyButton.style.position = 'relative';
        readyButton.style.zIndex = '9999';
        readyButton.style.background = 'linear-gradient(135deg, #6366f1, #a855f7)';
        readyButton.style.color = '#fff';
        readyButton.style.border = 'none';
        readyButton.style.boxShadow = '0 0 15px rgba(99, 102, 241, 0.4)';

        if (saveThemeBtn) {
            saveThemeBtn.style.display = 'inline-block';
            saveThemeBtn.style.background = 'rgba(255, 255, 255, 0.1)';
            saveThemeBtn.style.backdropFilter = 'blur(10px)';
            saveThemeBtn.style.border = '1px solid rgba(255, 255, 255, 0.2)';
            saveThemeBtn.style.color = '#fff';
        }
        if (loadThemeBtn) {
            loadThemeBtn.style.display = 'inline-block';
            loadThemeBtn.style.background = 'rgba(255, 255, 255, 0.1)';
            loadThemeBtn.style.backdropFilter = 'blur(10px)';
            loadThemeBtn.style.border = '1px solid rgba(255, 255, 255, 0.2)';
            loadThemeBtn.style.color = '#fff';
        }

        inputControls.style.display = 'block';
        inputControls.style.position = 'relative';
        inputControls.style.zIndex = '9999';

        let preset = data.presetWords || [];
        if (preset.length >= 25) {
            preset = preset.sort(() => Math.random() - 0.5);
        }

        for (let i = 0; i < 25; i++) {
            const inputCell = document.createElement('input');
            inputCell.classList.add('board-input');
            inputCell.placeholder = `${i + 1}`;
            inputCell.maxLength = 15;
            inputCell.addEventListener('input', function () {
                if (this.value.length > 15) {
                    if (window.showToast) window.showToast("15글자까지만 입력 가능합니다.", "warning");
                    this.value = this.value.slice(0, 15);
                }
            });
            inputCell.addEventListener('click', function () {
                if (!isRerollMode) return;
                
                const currentInputs = document.querySelectorAll('.board-input');
                const usedWords = [];
                currentInputs.forEach(inp => {
                    const val = inp.value.trim();
                    if (val) usedWords.push(val);
                });
                
                const unusedWords = currentThemeWords.filter(w => !usedWords.includes(w));
                if (unusedWords.length > 0 && rerollCount < maxRerollLimit) {
                    const randomWord = unusedWords[Math.floor(Math.random() * unusedWords.length)];
                    const oldWord = this.value;
                    this.value = randomWord;
                    rerollCount++;
                    
                    if (window.showToast) {
                        window.showToast(`단어 '${oldWord || "빈칸"}'(이)가 '${randomWord}'(으)로 교체되었습니다!`, "success");
                    }
                    
                    const nextUnused = currentThemeWords.filter(w => !usedWords.includes(w) && w !== randomWord);
                    if (rerollCount >= maxRerollLimit || nextUnused.length === 0) {
                        isRerollMode = false;
                        if (rerollBtn) rerollBtn.classList.remove('reroll-active');
                        currentInputs.forEach(inp => inp.classList.remove('rerollable'));
                        if (window.showToast) window.showToast("리롤 한도를 모두 소모했습니다.", "info");
                    }
                    
                    updateRerollUI();
                } else {
                    if (window.showToast) window.showToast("교체 가능한 단어가 더 이상 없거나 한도를 초과했습니다.", "warning");
                }
            });
            if (preset[i]) inputCell.value = preset[i];
            bingoBoard.appendChild(inputCell);
        }
        showBigEvent('📋', '빙고판 채우기', `주제: ${data.topic || '자유 주제'}\n25칸을 채워주세요! (목표: ${targetLines}줄)`, 'info');
    });

    socket.on('start theme game', (data) => {
        resetAILoader(); // 인게임 진입 시 AI 로더 잔상 및 타이머 클리어
        readyButton.style.display = 'none';
        if (saveThemeBtn) saveThemeBtn.style.display = 'none';
        if (loadThemeBtn) loadThemeBtn.style.display = 'none';
        inputControls.style.display = 'none';
        readyStatusDisplay.style.display = 'none';
        manualStartArea.style.display = 'none';
        targetLines = data.winLines;
        calledNumbers = [];
        myIgnoredNumbers = [];
        myUsedEventCount = 0;
        isGameStarted = true;
        renderBoard(data.board);
        bingoActionArea.style.display = 'flex';
        bingoActionArea.style.position = 'relative';
        bingoActionArea.style.zIndex = '9999';

        updateBoardVisuals();
        showBigEvent('🚀', '게임 시작!', `목표: ${targetLines}줄 빙고!`, 'good');

        popupActive = true;
        setTimeout(() => {
            popupActive = false;
            // 팝업 종료 후 0.5초 뒤에 타이머 및 턴 표시 시작
            setTimeout(() => {
                if (pendingTurnUpdate) {
                    processTurnUpdate(pendingTurnUpdate);
                    pendingTurnUpdate = null;
                }
            }, 500);
        }, 3000);
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

    socket.on('locked words updated', (newLockedWords) => {
        lockedWords = newLockedWords || {};
        updateBoardVisuals();
    });

    socket.on('time warp next', () => {
        if (window.showToast) window.showToast('⏳ 시간 왜곡! 단어를 하나 더 선택하세요.', 'success');
    });

    socket.on('action failed', (msg) => {
        if (window.showToast) window.showToast(msg, "error");
        updateBingoActionButtons(checkBingoLines(myBoard, getActiveCalledNumbers()));
    });

    socket.on('event happened', (data) => {
        playEvent();
        showBigEvent(data.icon, data.title, data.msg, data.type);

        // [1번 버그 수정] 이벤트 팝업 동안 타이머 정지 + turn update 큐잉
        if (turnTimerInterval) clearInterval(turnTimerInterval);
        turnTimerBar.style.display = 'none';
        popupActive = true;
        setTimeout(() => {
            popupActive = false;
            if (pendingTurnUpdate) {
                processTurnUpdate(pendingTurnUpdate);
                pendingTurnUpdate = null;
            }
        }, 3000);

        if (data.type === 'shuffle') {
            bingoBoard.classList.add('shake-effect');
            setTimeout(() => bingoBoard.classList.remove('shake-effect'), 1000);
        }
    });

    // [블랙홀] 타깃 선택 팝업
    let blackholeCountdownInterval = null;

    socket.on('select skip target', (data) => {
        // 기존 팝업이 있으면 제거
        const existing = document.getElementById('blackhole-modal');
        if (existing) existing.remove();
        if (blackholeCountdownInterval) clearInterval(blackholeCountdownInterval);

        const modal = document.createElement('div');
        modal.id = 'blackhole-modal';
        modal.innerHTML = `
            <div class="blackhole-overlay">
                <div class="blackhole-box">
                    <div class="blackhole-icon">🕳️</div>
                    <div class="blackhole-title">블랙홀 발동!</div>
                    <div class="blackhole-subtitle">빨아들일 플레이어를 선택하세요</div>
                    <div class="blackhole-timer-wrap">
                        <div class="blackhole-timer-bar">
                            <div class="blackhole-timer-progress" id="bh-timer-progress"></div>
                        </div>
                        <span class="blackhole-timer-text" id="bh-timer-text">15초</span>
                    </div>
                    <div class="blackhole-candidates" id="bh-candidates"></div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const candidateContainer = document.getElementById('bh-candidates');
        data.candidates.forEach(candidate => {
            const btn = document.createElement('button');
            btn.className = 'bh-candidate-btn';
            btn.textContent = candidate.name;
            btn.dataset.id = candidate.id;
            btn.addEventListener('click', () => {
                if (blackholeCountdownInterval) clearInterval(blackholeCountdownInterval);
                socket.emit('skip target selected', { targetId: candidate.id });
                modal.remove();
            });
            candidateContainer.appendChild(btn);
        });

        // 15초 카운트다운
        let timeLeft = 15;
        const progressEl = document.getElementById('bh-timer-progress');
        const textEl = document.getElementById('bh-timer-text');
        blackholeCountdownInterval = setInterval(() => {
            timeLeft--;
            if (progressEl) progressEl.style.width = `${(timeLeft / 15) * 100}%`;
            if (textEl) textEl.textContent = `${timeLeft}초`;
            if (timeLeft <= 0) {
                clearInterval(blackholeCountdownInterval);
                modal.remove();
            }
        }, 1000);
    });

    socket.on('blackhole target confirmed', () => {
        // 팝업이 남아있으면 닫기 (타임아웃 or 타인의 선택 확정 시)
        const modal = document.getElementById('blackhole-modal');
        if (modal) modal.remove();
        if (blackholeCountdownInterval) clearInterval(blackholeCountdownInterval);
    });

    socket.on('update board', (newBoard) => {
        renderBoard(newBoard);
        updateBoardVisuals();
        if (turnTimerInterval) clearInterval(turnTimerInterval);
        manualStartArea.style.display = 'none';
        if (!isGameStarted) {
            showBigEvent('🚀', '게임 시작!', `목표: ${targetLines}줄 빙고!`, 'good');
        }
    });

    socket.on('all players ready', () => {
        if (window.showToast) window.showToast('모든 플레이어가 준비됐습니다! 🎉', 'success');
        if (amIHost) {
            manualStartArea.style.display = 'block';
            hostManualStartBtn.disabled = false;
            hostManualStartBtn.style.opacity = '1';
            hostManualStartBtn.style.cursor = 'pointer';
        }
    });

    socket.on('not all players ready', () => {
        if (amIHost) {
            hostManualStartBtn.disabled = true;
            hostManualStartBtn.style.opacity = '0.6';
            hostManualStartBtn.style.cursor = 'not-allowed';
        }
    });

    socket.on('game over', (data) => {
        playEvent();
        if (turnTimerInterval) clearInterval(turnTimerInterval);
        turnTimerBar.style.display = 'none';
        myIgnoredNumbers = [];

        const resultTitle = document.getElementById('result-title');
        const resultStatHeader1 = document.getElementById('result-stat-header-1');
        const resultStatHeader2 = document.getElementById('result-stat-header-2');
        if (resultTitle) resultTitle.textContent = '게임 종료';
        if (resultStatHeader1) resultStatHeader1.textContent = "빙고 수";
        if (resultStatHeader2) resultStatHeader2.textContent = "이벤트 사용";

        resultWinner.textContent = `승자: ${data.winner}`;
        resultStatsBody.innerHTML = '';

        if (closeResultBtn) {
            closeResultBtn.onclick = () => {
                resultModal.style.display = 'none';
                socket.emit('confirm result');
            };
        }

        if (data.stats) {
            data.stats.forEach(stat => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                <td style="padding:10px;">${stat.name}</td>
                <td style="padding:10px; font-weight:bold;">${stat.bingoCount}줄</td>
                <td style="padding:10px;">${stat.eventUsed}회</td>
            `;
                if (stat.name === data.winner) {
                    tr.style.backgroundColor = 'rgba(241, 196, 15, 0.2)';
                    tr.style.color = '#fffffe';
                    tr.style.fontWeight = 'bold';
                }
                resultStatsBody.appendChild(tr);
            });
        }

        resultModal.style.display = 'block';

        calledNumbersDisplay.textContent = '';
        bingoBoard.innerHTML = '';
        if (victoryBingoBtn) victoryBingoBtn.style.display = 'none';
        themeTitle.style.display = 'none';
        readyButton.style.display = 'none';
        if (saveThemeBtn) saveThemeBtn.style.display = 'none';
        turnDisplay.style.display = 'none';
        inputControls.style.display = 'none';
        isGameStarted = false;
        playerUI.style.display = 'none';

        readyStatusDisplay.style.display = 'none';
        bingoBoard.classList.remove('inactive-board');
        bingoBoard.classList.remove('active-board');
        currentProgressMap = {};
        if (document.getElementById('turn-track')) document.getElementById('turn-track').style.display = 'none';

        // [이슈 28 해결] 게임 종료 후 최신 대기실 화면으로 안전하게 복원
        isGameStarted = false;
        window.updateBingoRoleUI(amIHost);
    });

    socket.on('false bingo', (msg) => {
        if (window.showToast) window.showToast(`🚨 ${msg}`, "error");
        if (isMyTurn) {
            if (victoryBingoBtn) victoryBingoBtn.disabled = false;
            updateBingoActionButtons(checkBingoLines(myBoard, getActiveCalledNumbers()));
        }
    });
})();
