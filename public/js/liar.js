// liar.js
(function() {
// common.js에서 생성된 전역 변수(window.socket, window.myName, window.roomId)를 활용합니다.

const setupArea = document.querySelector('#liar-container .setup-area');
const waitingArea = document.querySelector('#liar-container .waiting-area');
const playerUI = document.querySelector('#liar-container .player-ui');
const startGameBtn = document.getElementById('start-liar-btn');

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
let allLiarCategories = [];
let selectedLiarCategories = [];

// 체크박스 렌더링 함수
function renderCategoryCheckboxes() {
    if (!amIHost) return;
    
    let catArea = document.getElementById('liar-category-area');
    if (!catArea) {
        catArea = document.createElement('div');
        catArea.id = 'liar-category-area';
        catArea.style.cssText = 'margin-top:10px; margin-bottom:15px; text-align:left; background:#f9f9f9; padding: 15px; border-radius:10px; border:1px solid #ddd; max-height: 200px; overflow-y: auto;';
        startGameBtn.parentNode.insertBefore(catArea, startGameBtn);
    }
    
    let html = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <strong style="color:#2c3e50;"><i class="fas fa-list"></i> 카테고리 선택 (체크박스)</strong>
            <div>
                <button id="liar-cat-all-btn" style="cursor:pointer; padding:5px 10px; background:#3498db; color:white; border:none; border-radius:5px; font-weight:bold; font-size: 0.8rem;">모두 선택</button>
                <button id="liar-cat-none-btn" style="cursor:pointer; padding:5px 10px; background:#e74c3c; color:white; border:none; border-radius:5px; font-weight:bold; font-size: 0.8rem; margin-left:5px;">모두 해제</button>
            </div>
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px;">
    `;
    
    allLiarCategories.forEach((cat) => {
        const isChecked = selectedLiarCategories.includes(cat) ? 'checked' : '';
        html += `
            <label style="font-size: 0.9rem; cursor:pointer; display:flex; align-items:center; color:#333;">
                <input type="checkbox" class="liar-cat-cb" value="${cat}" ${isChecked} style="margin-right:5px; width:16px; height:16px;"> ${cat}
            </label>
        `;
    });
    html += `</div>`;
    catArea.innerHTML = html;
    
    document.getElementById('liar-cat-all-btn').onclick = () => {
        document.querySelectorAll('.liar-cat-cb').forEach(cb => cb.checked = true);
    };
    document.getElementById('liar-cat-none-btn').onclick = () => {
        document.querySelectorAll('.liar-cat-cb').forEach(cb => cb.checked = false);
    };
}

// 서버로부터 카테고리 리스트 수신
socket.on('liar categories', (cats) => {
    allLiarCategories = cats;
    if (selectedLiarCategories.length === 0) {
        selectedLiarCategories = [...cats]; // 맨 처음은 무조건 전체 선택 상태
    }
    renderCategoryCheckboxes();
});

window.renderLiarUsers = function(users, hostStatus) {
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

        // 점수(동그라미) 표시 영역 추가
        const scoreWrapper = document.createElement('div');
        scoreWrapper.className = 'score-wrapper';
        scoreWrapper.style.marginTop = '10px';
        scoreWrapper.style.display = 'flex';
        scoreWrapper.style.justifyContent = 'center';
        scoreWrapper.style.gap = '5px';

        const myScore = window.gameScores ? (window.gameScores[user.id] || 0) : 0;
        const target = window.winTarget || 3;

        for (let i = 0; i < target; i++) {
            const dot = document.createElement('div');
            dot.style.width = '15px';
            dot.style.height = '15px';
            dot.style.borderRadius = '50%';
            dot.style.border = '2px solid #ccc';
            dot.style.background = (i < myScore) ? '#f1c40f' : 'transparent'; // 점수 채워지면 노란색
            scoreWrapper.appendChild(dot);
        }

        card.appendChild(avatarWrapper);
        card.appendChild(infoDiv);
        card.appendChild(scoreWrapper); // 점수 표시 붙이기
        userGrid.appendChild(card);
    });
}

// Event listeners for users removed here, handled by room.js calls
// socket.on('update user list', ...);

// Ready status logic removed because Liar game starts immediately without ready checks

window.updateLiarRoleUI = function(isHostStatus) {
    amIHost = isHostStatus;

    setupArea.style.display = 'none';
    waitingArea.style.display = 'none';

    if (amIHost) {
        setupArea.style.display = 'block';
        socket.emit('request liar categories'); // 방장이 되면 최신 카테고리 요청
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

window.initLiarUI = function(isHostStatus) {
    window.updateLiarRoleUI(isHostStatus);
};

// 라이어 게임 전역 상태
window.isGamePlaying = false;

startGameBtn.addEventListener('click', () => {
    // [UX 개선] 시작 전 인원 체크 (최소 3명)
    if (currentUsers.length < 3) {
        if (window.showToast) {
            window.showToast('라이어 게임은 최소 3명 이상이어야 시작할 수 있습니다!', 'error');
        } else {
            alert('라이어 게임은 최소 3명 이상이어야 시작할 수 있습니다!');
        }
        return;
    }

    const target = document.getElementById('win-target-select') ? parseInt(document.getElementById('win-target-select').value) : 3;
    
    // 카테고리 체크박스 순회
    const checkedCbs = document.querySelectorAll('.liar-cat-cb:checked');
    const selectedCats = Array.from(checkedCbs).map(cb => cb.value);
    
    if (selectedCats.length === 0 && allLiarCategories.length > 0) {
        alert("최소 1개 이상의 카테고리를 선택해야 합니다!");
        return;
    }
    
    selectedLiarCategories = selectedCats; // 세팅 저장
    
    socket.emit('setup liar game', { winTarget: target, categories: selectedCats });
});

// 점수 업데이트
socket.on('update scores', (scores, target) => {
    window.gameScores = scores;
    window.winTarget = target;
    if (window.gameType === 'liar') {
        window.renderLiarUsers(currentUsers, amIHost); // 점수 반영해서 다시 그리기
    }
});

socket.on('liar role assigned', (data) => {
    playerUI.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.2); text-align: center;">
            <div id="role-info-area">
                <h2 style="color: #2c3e50; font-size: 2rem;">당신의 역할: <span style="color: ${data.isLiar ? '#e74c3c' : '#27ae60'}">${data.isLiar ? '라이어 🕵️‍♂️' : '시민 🧑‍🌾'}</span></h2>
                <hr style="margin: 20px 0; border: 0; border-top: 1px solid #eee;">
                <p style="font-size: 1.2rem; color: #7f8c8d; margin-bottom: 10px;">카테고리</p>
                <h3 style="font-size: 2.5rem; margin: 0; color: #34495e;">${data.category}</h3>
                
                <p style="font-size: 1.2rem; color: #7f8c8d; margin-top: 20px; margin-bottom: 10px;">제시어</p>
                <h1 style="font-size: 3.5rem; margin: 0; color: ${data.isLiar ? '#e74c3c' : '#2980b9'}; letter-spacing: 5px;">${data.word}</h1>
            </div>
            
            <!-- 실시간 힌트 리스트 영역 -->
            <div id="live-hint-container" style="margin-top: 30px; text-align: left; display: none;">
                <h3 style="color: #2c3e50; border-bottom: 2px solid #eee; padding-bottom: 10px;">실시간 힌트 목록</h3>
                <ul id="live-hint-list" style="list-style-type: none; padding: 0; font-size: 1.1rem; line-height: 1.6;"></ul>
            </div>

            <div id="turn-display-area" style="margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 10px; border: 1px solid #ddd;">
                <p id="turn-message" style="font-size: 1.2rem; font-weight: bold; color: #2c3e50;">순번을 정하는 중입니다...</p>
                <div id="turn-input-area" style="display: none; margin-top: 15px;">
                    <input type="text" id="desc-input" placeholder="이 단어를 설명하는 한 문장 입력" style="width: 80%; padding: 12px; font-size: 1.1rem; border-radius: 5px; border: 1px solid #ccc; outline: none; margin-bottom: 10px;">
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
            if (!desc) { alert("설명을 입력해주세요!"); return; }
            socket.emit('submit description', desc);
            inputArea.style.display = 'none';
            document.getElementById('turn-message').textContent = "제출 완료! 다음 순서를 기다립니다.";
        };
    }
});

// 순차 턴 알림 수신
let myLabel = null; // 본인의 익명 라벨 저장
socket.on('liar next turn', (data) => {
    const turnMsg = document.getElementById('turn-message');
    const inputArea = document.getElementById('turn-input-area');
    const liveHintContainer = document.getElementById('live-hint-container');

    if (liveHintContainer) liveHintContainer.style.display = 'block';

    if (data.isMyTurn) {
        myLabel = data.label; // 본인 라벨 저장
        turnMsg.innerHTML = `<span style="color: #e74c3c;">⭐ 당신의 차례입니다! (익명 ${data.label})</span>`;
        if (inputArea) inputArea.style.display = 'block';
    } else {
        turnMsg.textContent = `익명 ${data.label}가 설명 중입니다...`;
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
        li.style.cssText = 'margin-bottom: 10px; padding: 12px; background: #fff; border-radius: 8px; border-left: 5px solid #3498db; box-shadow: 0 2px 4px rgba(0,0,0,0.05);';
        li.innerHTML = `<strong style="color: #3498db;">[힌트 ${data.label}]</strong> <span style="color: #555;">"${data.desc}"</span>`;
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
    
    hints.forEach((hint, idx) => {
        const label = String.fromCharCode(65 + idx);
        // 본인 힌트 버튼은 생성하지 않음 (자폭 방지)
        if (label === myLabel) return;
        voteButtonsHTML += `<button class="vote-target-btn" data-target-label="${label}" style="padding: 15px 30px; font-size: 1.2rem; border-radius: 10px; border: 2px solid #3498db; background: white; color: #2c3e50; font-weight: bold; cursor: pointer; transition: 0.2s;">🕵️‍♂️ 힌트 ${label} 지목</button>`;
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
            const label = btn.getAttribute('data-target-label');
            if (confirm(`정말 "힌트 ${label}" 제출자를 라이어로 지목하시겠습니까?`)) {
                socket.emit('vote liar', label);
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
            if (!val) { alert("정답을 입력해야 합니다!"); return; }
            socket.emit('submit final guess', val);
            playerUI.innerHTML = "<h2>결과 판정 중...</h2>";
        };
    } else {
        playerUI.innerHTML = `
            <div style="background: #e8f8f5; padding: 40px; border-radius: 15px; text-align: center; border: 3px solid #1abc9c;">
                <h1 style="color: #16a085; margin-top:0;">🎉 라이어 검거 성공!</h1>
                <h3 style="color: #333;">현재 라이어(<span style="color:#e74c3c">${data.liarName}</span>)가 정답을 추리하고 있습니다.</h3>
                <p style="color: #16a085; font-weight: bold; font-size: 1.2rem; margin-top: 20px;">라이어가 정답을 틀려야 완벽한 승리가 됩니다! ⏳</p>
            </div>
        `;
    }
});

socket.on('round over', (result) => {
    window.isGamePlaying = false;

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
        <div style="background: ${result.citizensWon ? '#d4edda' : '#f8d7da'}; padding: 40px; border-radius: 15px; text-align: center; border: 2px solid ${result.citizensWon ? '#c3e6cb' : '#f5c6cb'}; box-shadow: 0 10px 20px rgba(0,0,0,0.1);">
            <h1 style="font-size: 2.5rem; color: ${result.citizensWon ? '#155724' : '#721c24'}; margin-top:0;">${result.isFinalGameOver ? '게임 완전 종료!' : '라운드 종료'}</h1>
            <h2 style="font-size: 1.8rem; line-height: 1.5;">${result.message}</h2>
            ${result.isFinalGameOver ? `<h1 style="font-size: 3rem; color: #f39c12; margin: 20px 0;">${result.finalMessage}</h1>` : ''}
            
            <div style="margin: 20px auto; padding: 15px; background: #fff; border-radius: 10px; display: inline-block; text-align: left; border: 1px solid #ddd;">
                <h4 style="margin-top: 0; color: #7f8c8d; border-bottom: 1px solid #eee; padding-bottom: 5px;">🧐 힌트 정체 공개</h4>
                <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.9rem;">
                    ${result.anonymousMapping ? result.anonymousMapping.map((pid, idx) => {
                        const label = String.fromCharCode(65 + idx);
                        const name = result.playerNames[pid] || '알수없음';
                        const desc = result.submissions[pid] || '';
                        return `<li style="margin-bottom: 5px;"><strong>[힌트 ${label}]</strong> ${name}: "${desc}"</li>`;
                    }).join('') : ''}
                </ul>
            </div>

            <hr style="margin: 30px 0;">
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

socket.on('game restarted', () => {
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

})();
