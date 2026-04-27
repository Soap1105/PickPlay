// liar.js
(function () {
    // common.js에서 생성된 전역 변수(window.socket, window.myName, window.roomId)를 활용합니다.

    const setupArea = document.querySelector('#liar-container .setup-area');
    const waitingArea = document.querySelector('#liar-container .waiting-area');
    const playerUI = document.querySelector('#liar-container .player-ui');
    const openSettingsBtn = document.getElementById('open-settings-liar');
    const startGameBtn = document.getElementById('start-game-liar');

    // --- 타이머 UI 생성 ---
    let liarTimerUI = document.getElementById('liar-timer-ui');
    if (!liarTimerUI) {
        liarTimerUI = document.createElement('div');
        liarTimerUI.id = 'liar-timer-ui';
        liarTimerUI.style.cssText = 'background: #fff3cd; color: #856404; padding: 15px; border-radius: 10px; font-size: 1.5rem; font-weight: bold; text-align: center; margin-bottom: 20px; display: none; border: 2px solid #ffeeba; box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: color 0.3s, border-color 0.3s;';
        const liarContainer = document.getElementById('liar-container');
        if (liarContainer) {
            liarContainer.insertBefore(liarTimerUI, playerUI);
        }
    }
    // -----------------------

    let amIHost = false;
    let currentUsers = [];
    let liarGameStarted = false; // 실제 게임 진행 중인지 여부

    // Result Modal Elements
    const resultModal = document.getElementById('result-modal');
    const resultTitle = document.getElementById('result-title');
    const resultWinner = document.getElementById('result-winner');
    const resultStatsBody = document.getElementById('result-stats-body');
    const resultStatHeader1 = document.getElementById('result-stat-header-1');
    const resultStatHeader2 = document.getElementById('result-stat-header-2');
    const closeResultBtn = document.getElementById('close-result-btn');



    window.renderLiarUsers = function (users, hostStatus) {
        currentUsers = users;
        amIHost = hostStatus;
        const userGrid = document.getElementById('user-grid');
        userGrid.innerHTML = '';
        users.forEach(user => {
            const card = document.createElement('div');
            card.className = 'user-card';
            if (user.id === socket.id) card.classList.add('is-me');

            const infoDiv = document.createElement('div');
            infoDiv.className = 'user-info';

            const avatarWrapper = document.createElement('div');
            avatarWrapper.className = 'avatar-wrapper';
            const avatar = document.createElement('div');
            avatar.className = 'avatar';
            avatar.textContent = user.avatar || '😀';
            avatarWrapper.appendChild(avatar);

            const nickname = document.createElement('div');
            nickname.className = 'nickname';
            nickname.textContent = user.name;

            infoDiv.appendChild(nickname);

            // 방장인 경우 상대방 강퇴 버튼
            if (amIHost && user.id !== socket.id && setupArea.style.display !== 'none') {
                const kickBtn = document.createElement('button');
                kickBtn.className = 'kick-btn';
                kickBtn.textContent = 'X';
                kickBtn.onclick = () => {
                    if (confirm(`${user.name}님 강퇴?`)) socket.emit('kick user', user.id);
                };
                card.appendChild(kickBtn);
            }

            // 승리 도트: 게임 진행 중에만 표시
            if (liarGameStarted) {
                const myScore = window.gameScores ? (window.gameScores[user.id] || 0) : 0;
                const target = window.winTarget || 3;

                for (let i = 0; i < target; i++) {
                    const dot = document.createElement('div');
                    dot.style.width = '15px';
                    dot.style.height = '15px';
                    dot.style.borderRadius = '50%';
                    dot.style.border = '2px solid #ccc';
                    dot.style.background = (i < myScore) ? '#f1c40f' : 'transparent';
                    scoreWrapper.appendChild(dot);
                }
                card.appendChild(scoreWrapper);
            }

            card.appendChild(avatarWrapper);
            card.appendChild(infoDiv);
            userGrid.appendChild(card);
        });
    }

    // Event listeners for users removed here, handled by room.js calls
    // socket.on('update user list', ...);

    // Ready status logic removed because Liar game starts immediately without ready checks


    // Ready status logic removed because Liar game starts immediately without ready checks

    window.updateLiarRoleUI = function (isHostStatus) {
        amIHost = isHostStatus;

        setupArea.style.display = 'none';
        waitingArea.style.display = 'none';

        if (amIHost) {
            setupArea.style.display = 'block';
        } else {
            waitingArea.style.display = 'block';
        }

        // 결과창 방장 위임 반응형 로직
        const hostBtns = document.getElementById('host-buttons');
        const guestTxt = document.getElementById('guest-text');
        if (hostBtns && guestTxt) {
            hostBtns.style.display = amIHost ? 'block' : 'none';
            guestTxt.style.display = amIHost ? 'none' : 'block';
        }
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
                if (window.showToast) window.showToast('설정이 저장되었습니다!', 'success');
            });
        });
    }

    if (startGameBtn) {
        startGameBtn.addEventListener('click', () => {
            if (currentUsers.length < 3) {
                if (window.showToast) window.showToast('라이어 게임은 최소 3명 이상이어야 시작할 수 있습니다!', 'error');
                else alert('라이어 게임은 최소 3명 이상이어야 시작할 수 있습니다!');
                return;
            }
            const winTarget = parseInt(document.getElementById('win-target-select')?.value || '3');
            const categories = window.liarSelectedCategories; // 안 골랐으면 서버가 전체로 처리할 것임
            
            socket.emit('setup liar game', {
                winTarget: winTarget,
                categories: categories
            });
        });
    }

    // 점수 업데이트
    socket.on('update scores', (scores, target) => {
        window.gameScores = scores;
        window.winTarget = target;
        if (window.gameType === 'liar') {
            window.renderLiarUsers(currentUsers, amIHost); // 점수 반영해서 다시 그리기
        }
    });

    // 게임 타입 변경 감지 (로비 이동 시 초기화)
    socket.on('game changed', (mode) => {
        if (mode === 'lobby') {
            liarGameStarted = false;
            window.gameScores = {};
            if (window.gameType === 'liar') {
                window.renderLiarUsers(currentUsers, amIHost);
            }
        }
    });

    socket.on('liar role assigned', (data) => {
        liarGameStarted = true; // 역할 배정 = 게임 시작
        playerUI.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.2); text-align: center;">
            <div id="role-info-area">
                <h2 style="color: #2c3e50; font-size: 2rem;">당신의 역할: <span style="color: ${data.isLiar ? '#e74c3c' : '#27ae60'}">${data.isLiar ? '라이어' : '시민'}</span></h2>
                <hr style="margin: 20px 0; border: 0; border-top: 1px solid #eee;">
                <p style="font-size: 1.2rem; color: #7f8c8d; margin-bottom: 10px;">카테고리</p>
                <h3 style="font-size: 2.5rem; margin: 0; color: #34495e;">${data.category}</h3>
                
                <p style="font-size: 1.2rem; color: #7f8c8d; margin-top: 20px; margin-bottom: 10px;">제시어</p>
                <h1 style="font-size: 3.5rem; margin: 0; color: ${data.isLiar ? '#e74c3c' : '#2980b9'}; letter-spacing: 5px;">${data.word}</h1>
            </div>
            
            <!-- 실시간 힌트 리스트 영역 -->
            <div id="live-hint-container" style="margin-top: 30px; text-align: left; display: none;">
                <h3 style="color: #2c3e50; border-bottom: 2px solid #eee; padding-bottom: 10px;">유저들의 단어 설명</h3>
                <ul id="live-hint-list" style="list-style-type: none; padding: 0; font-size: 1.1rem; line-height: 1.6;"></ul>
            </div>

            <div id="turn-display-area" style="margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 10px; border: 1px solid #ddd;">
                <p id="turn-message" style="font-size: 1.2rem; font-weight: bold; color: #2c3e50;">순번을 정하는 중입니다...</p>
                <div id="turn-input-area" style="display: none; margin-top: 15px;">
                    <input type="text" id="desc-input" placeholder="단어 설명하기" style="width: 80%; padding: 12px; font-size: 1.1rem; border-radius: 5px; border: 1px solid #ccc; outline: none; margin-bottom: 10px;">
                    <br>
                    <button id="submit-desc-btn" class="start-btn" style="width: 80%; padding: 10px;">설명 제출하기</button>
                </div>
            </div>
        </div>
    `;
        setupArea.style.display = 'none';
        waitingArea.style.display = 'none';

        // 나중에 생성될 버튼을 위해 전역 핸들러 대신 여기서 로직 처리
        const inputArea = document.getElementById('turn-input-area');
        const submitBtn = document.getElementById('submit-desc-btn');
        const inputField = document.getElementById('desc-input');

        if (submitBtn) {
            submitBtn.onclick = () => {
                const desc = inputField.value.trim();
                if (!desc) {
                    if (window.showToast) window.showToast("설명을 입력해주세요!", "warning");
                    else alert("설명을 입력해주세요!");
                    return;
                }
                socket.emit('submit description', desc);
                inputArea.style.display = 'none';
                document.getElementById('turn-message').textContent = "제출 완료! 다음 순서를 기다립니다.";
            };
        }
    });

    // 순차 턴 알림 수신
    socket.on('liar next turn', (data) => {
        const turnMsg = document.getElementById('turn-message');
        const inputArea = document.getElementById('turn-input-area');
        const liveHintContainer = document.getElementById('live-hint-container');

        if (liveHintContainer) liveHintContainer.style.display = 'block';

        if (data.isMyTurn) {
            turnMsg.innerHTML = `<span style="color: #e74c3c;">당신의 차례입니다!</span>`;
            if (inputArea) inputArea.style.display = 'block';
        } else {
            turnMsg.textContent = `${data.playerName}님이 설명 중입니다...`;
            if (inputArea) inputArea.style.display = 'none';
        }
    });

    // 실시간 힌트 수신
    socket.on('liar hint received', (data) => {
        const hintList = document.getElementById('live-hint-list');
        const liveHintContainer = document.getElementById('live-hint-container');

        if (liveHintContainer) liveHintContainer.style.display = 'block';

        if (hintList) {
            const li = document.createElement('li');
            li.dataset.playerId = data.playerId;
            li.dataset.playerName = data.playerName;
            li.style.cssText = 'margin-bottom: 10px; padding: 12px; background: #fff; border-radius: 8px; border-left: 5px solid #3498db; box-shadow: 0 2px 4px rgba(0,0,0,0.05);';
            li.innerHTML = `<strong style="color: #3498db;">[${data.playerName}님의 단어]</strong> <span style="color: #555;">"${data.desc}"</span>`;
            hintList.appendChild(li);
        }
    });

    // 투표 단계 진입 (턴제 종료 시)
    socket.on('liar voting phase start', () => {
        const hintList = document.getElementById('live-hint-list');
        const turnDisplay = document.getElementById('turn-display-area');

        if (turnDisplay) turnDisplay.style.display = 'none';

        // 투표 버튼 생성 (이미 수집된 힌트 목록 기반)
        const hints = Array.from(hintList.querySelectorAll('li'));
        let voteButtonsHTML = '<div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 15px; margin-bottom: 20px;">';

        hints.forEach((hint) => {
            const pid = hint.dataset.playerId;
            const pName = hint.dataset.playerName;
            // 본인 힌트 버튼은 생성하지 않음 (자폭 방지)
            if (pid === socket.id) return;
            voteButtonsHTML += `<button class="vote-target-btn" data-target-id="${pid}" data-target-name="${pName}" style="padding: 15px 30px; font-size: 1.2rem; border-radius: 10px; border: 2px solid #3498db; background: white; color: #2c3e50; font-weight: bold; cursor: pointer; transition: 0.2s;">🕵️‍♂️ ${pName} 지목</button>`;
        });
        voteButtonsHTML += '</div>';

        const votingHtml = `
        <div id="voting-section" style="margin-top: 30px; padding: 30px; background: white; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.2); text-align: center;">
            <h2 style="color: #2c3e50; border-bottom: 2px solid #eee; padding-bottom: 10px;">🕵️‍♂️ 라이어 지목하기</h2>
            <p style="color: #7f8c8d; margin-bottom: 25px;">힌트 내용을 보고 라이어로 의심되는 번호를 클릭하세요!</p>
            ${voteButtonsHTML}
            <div id="waiting-vote-area" style="display: none; margin-top: 20px; padding: 15px; background: #fff3cd; color: #856404; border-radius: 10px; font-weight: bold;">
                ⏳ 다른 플레이어를 기다리는 중... ⏳
            </div>
        </div>
    `;

        // 롤 가이드 아래에 투표창 붙이기
        const card = playerUI.querySelector('div');
        if (card) {
            // 기존 턴 표시 영역 등 제거하고 투표 영역 삽입
            const existingVoting = document.getElementById('voting-section');
            if (existingVoting) existingVoting.remove();
            card.insertAdjacentHTML('beforeend', votingHtml);
        }

        // 버튼 이벤트 연결
        document.querySelectorAll('.vote-target-btn').forEach(btn => {
            btn.onmouseover = () => { btn.style.background = '#3498db'; btn.style.color = 'white'; };
            btn.onmouseout = () => { btn.style.background = 'white'; btn.style.color = '#2c3e50'; };
            btn.onclick = () => {
                const targetId = btn.getAttribute('data-target-id');
                const targetName = btn.getAttribute('data-target-name');
                if (confirm(`정말 "${targetName}"님을 라이어로 지목하시겠습니까?`)) {
                    socket.emit('vote liar', targetId);
                    btn.parentElement.style.display = 'none';
                    document.getElementById('waiting-vote-area').style.display = 'block';
                }
            };
        });
    });

    socket.on('game started', () => {
        window.isGamePlaying = false; // 제출 전이므로 아직 투표 불가
    });

    socket.on('all submissions received', (submissions) => {
        // 순차 턴제로 변경되어 이 이벤트는 더 이상 메인 흐름에서 사용되지 않거나
        // 투표 시작 시점에 전체 목록을 보정하는 용도로 남겨둡니다.
    });

    // 투표 진행 현황 표시 (간단히)
    socket.on('vote updated', (votes) => {
        // votes = { voterId: targetId }
        document.querySelectorAll('.user-card').forEach(card => card.style.borderRight = 'none');
        for (let voter in votes) {
            // 투표 완료된 사람 표시를 위해 (UI 다듬기 위해 추후 확장)
        }
    });

    socket.on('final guess phase', (data) => {
        // 라이어 최후 변론 단계
        window.isGamePlaying = false;

        if (socket.id === data.liarId) {
            playerUI.innerHTML = `
            <div style="background: #fdfefe; padding: 40px; border-radius: 15px; text-align: center; border: 3px solid #e74c3c;">
                <h1 style="color: #c0392b; margin-top:0;">🚨 정체가 발각되었습니다! 🚨</h1>
                <h3 style="color: #333;">하지만 아직 기회가 있습니다. 제시어 정답을 맞추면 <span style="color:#e74c3c">당신의 역전승</span>입니다!</h3>
                <p style="color: #7f8c8d;">카테고리와 다른 사람들의 힌트를 보고 추리하세요.</p>
                <input type="text" id="final-guess-input" placeholder="정답 단어 입력" style="width: 80%; padding: 15px; font-size: 1.5rem; text-align: center; border-radius: 10px; border: 2px solid #e74c3c; margin-top: 20px; outline: none;">
                <br><br>
                <button id="final-guess-btn" class="start-btn" style="background: #e74c3c; color: white; padding: 15px 40px; font-size: 1.2rem;">최후 변론 제출</button>
            </div>
        `;

            document.getElementById('final-guess-btn').onclick = () => {
                const val = document.getElementById('final-guess-input').value.trim();
                if (!val) {
                    if (window.showToast) window.showToast("정답을 입력해야 합니다!", "warning");
                    else alert("정답을 입력해야 합니다!");
                    return;
                }
                socket.emit('submit final guess', val);
                playerUI.innerHTML = "<h2>결과 판정 중...</h2>";
            };

            // 실시간 타이핑 전송
            const guessInput = document.getElementById('final-guess-input');
            if (guessInput) {
                guessInput.addEventListener('input', () => {
                    socket.emit('final guess typing', guessInput.value);
                });
            }
        } else {
            playerUI.innerHTML = `
            <div style="background: #e8f8f5; padding: 40px; border-radius: 15px; text-align: center; border: 3px solid #1abc9c;">
                <h1 style="color: #16a085; margin-top:0;">🎉 라이어 검거 성공!</h1>
                <h3 style="color: #333;">현재 라이어(<span style="color:#e74c3c">${data.liarName}</span>)가 정답을 추리하고 있습니다.</h3>
                <p style="color: #16a085; font-weight: bold; font-size: 1.2rem; margin-top: 20px;">라이어가 정답을 틀려야 완벽한 승리가 됩니다! ⏳</p>
                <div id="live-typing-box" style="margin-top: 30px; padding: 20px 30px; background: #fff; border-radius: 12px; border: 2px dashed #1abc9c; display: inline-block; min-width: 200px; min-height: 60px;">
                    <p style="color: #aaa; font-size: 0.95rem; margin: 0 0 8px 0;">라이어의 입력 중...</p>
                    <div id="live-typing-chars" style="font-size: 2.5rem; font-weight: bold; color: #e74c3c; letter-spacing: 8px; min-height: 50px;"></div>
                </div>
            </div>
        `;
        }
    });

    socket.on('round over', (result) => {
        window.isGamePlaying = false;
        if (liarTimerUI) liarTimerUI.style.display = 'none';

        if (result.isFinalGameOver) {
            showLiarResultModal(result);
        }

        const hostBtnId = result.isFinalGameOver ? 'restart-liar-btn' : 'next-round-btn';
        const hostBtnText = result.isFinalGameOver ? '게임 초기화' : '다음 라운드 시작';
        const hostBtnColor = result.isFinalGameOver ? '' : 'background:#3498db;';

        const hostBtnHtml = `<button id="${hostBtnId}" class="start-btn" style="${hostBtnColor} margin-top: 30px; width: auto; padding: 15px 40px;">${hostBtnText}</button>`;
        const guestText = result.isFinalGameOver ? '방장이 게임을 무효화할 때까지 대기해주세요.' : '방장이 다음 라운드를 준비 중입니다...';

        const hostDisplay = amIHost ? 'block' : 'none';
        const guestDisplay = amIHost ? 'none' : 'block';

        const btnHtml = `
        <div id="host-buttons" style="display: ${hostDisplay};">
            ${hostBtnHtml}
        </div>
        <div id="guest-text" style="display: ${guestDisplay};">
            <p style="margin-top:20px; color:#555;">${guestText}</p>
        </div>
    `;

        playerUI.innerHTML = `
        <div style="background: ${result.citizensWon ? '#d4edda' : '#f8d7da'}; padding: 40px; border-radius: 15px; text-align: center; border: 2px solid ${result.citizensWon ? '#c3e6cb' : '#f5c6cb'}; box-shadow: 0 10px 20px rgba(0,0,0,0.1); color: #2c3e50;">
            <h1 style="font-size: 2.5rem; color: ${result.citizensWon ? '#155724' : '#721c24'}; margin-top:0;">${result.isFinalGameOver ? '게임 완전 종료!' : '라운드 종료'}</h1>
            <h2 style="font-size: 1.8rem; line-height: 1.5; color: #2c3e50;">${result.message}</h2>
            ${result.isFinalGameOver ? `<h1 style="font-size: 3rem; color: #f39c12; margin: 20px 0;">${result.finalMessage}</h1>` : ''}
            
            <div style="margin: 20px auto; padding: 15px; background: #fff; border-radius: 10px; display: inline-block; text-align: left; border: 1px solid #ddd; color: #333;">
                <h4 style="margin-top: 0; color: #7f8c8d; border-bottom: 1px solid #eee; padding-bottom: 5px;">🧐 제출된 단어들</h4>
                <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.9rem; color: #333;">
                    ${result.turnOrder ? result.turnOrder.map(pid => {
            const name = result.playerNames[pid] || '알수없음';
            const desc = result.submissions[pid] || '';
            return `<li style="margin-bottom: 5px; color: #333;"><strong style="color: #2c3e50;">[${name}]</strong> "${desc}"</li>`;
        }).join('') : ''}
                </ul>
            </div>

            <hr style="margin: 30px 0; border-color: rgba(0,0,0,0.1);">
            <h3 style="font-size: 1.5rem; color: #333;">이번 판 진짜 라이어: <span style="color: #e74c3c; font-size: 2rem;">${result.liarName}</span></h3>
            <h3 style="font-size: 1.5rem; color: #333;">정답 단어: <span style="color: #2980b9; font-size: 2rem;">${result.word}</span></h3>
            
            ${btnHtml}
        </div>
    `;

        setTimeout(() => {
            const restartBtn = document.getElementById('restart-liar-btn');
            if (restartBtn) restartBtn.onclick = () => socket.emit('restart liar game');

            const nextBtn = document.getElementById('next-round-btn');
            if (nextBtn) nextBtn.onclick = () => socket.emit('next liar round');
        }, 100);
    });

    // 시민들: 라이어 실시간 타이핑 수신 및 글자 애니메이션 표시
    let _typingCursorTimer = null;

    socket.on('final guess typing update', (data) => {
        const charsDiv = document.getElementById('live-typing-chars');
        if (!charsDiv) return;

        const word = data.partialWord || '';
        const prevLen = charsDiv.querySelectorAll('span.liar-char').length;

        // 글자 수가 줄었으면 (백스페이스) 전체 재렌더 (애니메이션 없이)
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
            // 기존 글자 업데이트 (한글 IME 조합 문제 해결)
            const spans = charsDiv.querySelectorAll('span.liar-char');
            for (let i = 0; i < prevLen; i++) {
                spans[i].textContent = word[i] === ' ' ? '\u00A0' : word[i];
            }

            // 새로 추가된 글자만 애니메이션
            for (let i = prevLen; i < word.length; i++) {
                const span = document.createElement('span');
                span.className = 'liar-char';
                span.textContent = word[i] === ' ' ? '\u00A0' : word[i];
                span.style.cssText = `
                    display: inline-block;
                    opacity: 0;
                    transform: translateY(-10px);
                    animation: liarCharDrop 0.18s ease forwards;
                `;
                charsDiv.appendChild(span);
            }
        }

        // 커서: 타이핑 중엔 숨기고, 300ms 멈추면 나타남
        const existingCursor = document.getElementById('liar-type-cursor');
        if (existingCursor) existingCursor.remove();

        clearTimeout(_typingCursorTimer);
        _typingCursorTimer = setTimeout(() => {
            const currentCharsDiv = document.getElementById('live-typing-chars');
            if (!currentCharsDiv) return;
            const cursor = document.createElement('span');
            cursor.id = 'liar-type-cursor';
            cursor.textContent = '|';
            cursor.style.cssText = 'display: inline-block; color: #e74c3c; animation: liarBlink 0.7s step-end infinite; margin-left: 2px;';
            currentCharsDiv.appendChild(cursor);
        }, 300);
    });

    socket.on('game restarted', () => {
        liarGameStarted = false; // 게임 재시작 = 대기 상태로
        playerUI.innerHTML = '<h2>게임 준비 중입니다.</h2>';
        if (amIHost) {
            setupArea.style.display = 'block';
            waitingArea.style.display = 'none';
        } else {
            setupArea.style.display = 'none';
            waitingArea.style.display = 'block';
        }
        if (window.gameType === 'liar' && currentUsers.length > 0) {
            window.updateLiarRoleUI(amIHost);
        }
    });

    // 타이머 이벤트 리스너 추가
    socket.on('liar timer tick', (data) => {
        if (!liarTimerUI) return;
        liarTimerUI.style.display = 'block';

        // 남은 시간에 따른 색상 변화 (10초 이하일 때 붉은색)
        if (data.timeLeft <= 10) {
            liarTimerUI.style.color = '#721c24';
            liarTimerUI.style.background = '#f8d7da';
            liarTimerUI.style.borderColor = '#f5c6cb';
        } else if (data.timeLeft <= 20) {
            liarTimerUI.style.color = '#856404';
            liarTimerUI.style.background = '#fff3cd';
            liarTimerUI.style.borderColor = '#ffeeba';
        } else {
            liarTimerUI.style.color = '#155724';
            liarTimerUI.style.background = '#d4edda';
            liarTimerUI.style.borderColor = '#c3e6cb';
        }

        liarTimerUI.innerHTML = `⏳ [${data.phase}] 진행 중... 남은 시간: <span style="font-size:2rem; margin: 0 10px;">${data.timeLeft}</span>초`;
    });

    socket.on('liar timer clear', () => {
        if (liarTimerUI) liarTimerUI.style.display = 'none';
    });

    function showLiarResultModal(result) {
        if (!resultModal) return;

        resultTitle.textContent = "🕵️‍♂️ 라이어 게임 종료 🕵️‍♂️";
        // 승리팀 표시
        const winTeam = result.citizensWon ? "시민 승리" : "라이어 승리";
        const winColor = result.citizensWon ? "#27ae60" : "#e74c3c";

        resultWinner.innerHTML = `
        <div style="color: ${winColor}; font-size: 2.2rem; margin-bottom: 10px;">${winTeam}!</div>
        <div style="font-size: 1.1rem; color: #333;">진짜 라이어: <span style="color:#e74c3c; font-weight:bold;">${result.liarName}</span></div>
        <div style="font-size: 1.1rem; color: #333;">정답 단어: <span style="color:#2980b9; font-weight:bold;">${result.word}</span></div>
    `;

        // 헤더 텍스트 변경
        if (resultStatHeader1) resultStatHeader1.textContent = "최종 승수";
        if (resultStatHeader2) resultStatHeader2.textContent = "역할";

        resultStatsBody.innerHTML = '';
        if (result.stats) {
            result.stats.forEach(stat => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = "1px solid #eee";
                const roleText = stat.isLiar ? '<span style="color:#e74c3c">라이어</span>' : '시민';
                tr.innerHTML = `
                <td style="padding:15px;">${stat.id === socket.id ? '<b>(나) </b>' : ''}${stat.name}</td>
                <td style="padding:15px; font-weight:bold; color:#f39c12;">${stat.score}승</td>
                <td style="padding:15px;">${roleText}</td>
            `;
                if (stat.score >= window.winTarget) tr.style.backgroundColor = '#fff9c4';
                resultStatsBody.appendChild(tr);
            });
        }

        resultModal.style.display = 'block';

        // 닫기 버튼: 방장이 클릭하면 로비로 복귀
        closeResultBtn.onclick = () => {
            resultModal.style.display = 'none';
            if (amIHost) {
                socket.emit('return to lobby');
            }
        };
    }

})();
