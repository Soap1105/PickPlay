// liar.js
(function() {
// common.js에서 생성된 전역 변수(window.socket, window.myName, window.roomId)를 활용합니다.

const setupArea = document.querySelector('#liar-container .setup-area');
const waitingArea = document.querySelector('#liar-container .waiting-area');
const playerUI = document.querySelector('#liar-container .player-ui');
const startGameBtn = document.getElementById('start-liar-btn');

let amIHost = false;
let currentUsers = [];

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
    } else {
        waitingArea.style.display = 'block';
    }
};

window.initLiarUI = function(isHostStatus) {
    window.updateLiarRoleUI(isHostStatus);
};

// 라이어 게임 전역 상태
window.isGamePlaying = false;

startGameBtn.addEventListener('click', () => {
    const target = document.getElementById('win-target-select') ? parseInt(document.getElementById('win-target-select').value) : 3;
    socket.emit('setup liar game', { winTarget: target });
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
            <h2 style="color: #2c3e50; font-size: 2rem;">당신의 역할: <span style="color: ${data.isLiar ? '#e74c3c' : '#27ae60'}">${data.isLiar ? '라이어 🕵️‍♂️' : '시민 🧑‍🌾'}</span></h2>
            <hr style="margin: 20px 0; border: 0; border-top: 1px solid #eee;">
            <p style="font-size: 1.2rem; color: #7f8c8d; margin-bottom: 10px;">카테고리</p>
            <h3 style="font-size: 2.5rem; margin: 0; color: #34495e;">${data.category}</h3>
            
            <p style="font-size: 1.2rem; color: #7f8c8d; margin-top: 20px; margin-bottom: 10px;">제시어</p>
            <h1 style="font-size: 3.5rem; margin: 0; color: ${data.isLiar ? '#e74c3c' : '#2980b9'}; letter-spacing: 5px;">${data.word}</h1>
            
            <div id="submission-area" style="margin-top: 30px; padding: 20px; background: #ecf0f1; border-radius: 10px;">
                <p style="font-weight: bold; margin-bottom: 10px; color: #2c3e50;">이 단어를 설명하는 짧은 문장을 하나 써주세요!</p>
                <input type="text" id="desc-input" placeholder="예: 이건 주로 여름에 먹어요." style="width: 80%; padding: 10px; font-size: 1.1rem; border-radius: 5px; border: 1px solid #ccc; outline: none; margin-bottom: 10px;">
                <br>
                <button id="submit-desc-btn" class="start-btn" style="width: 80%; padding: 10px;">제출하기</button>
            </div>
            
            <div id="waiting-submit-area" style="display: none; margin-top: 30px; padding: 15px; background: #fff3cd; color: #856404; border-radius: 10px; font-weight: bold;">
               ⏳ 다른 플레이어를 기다리는 중... ⏳
            </div>
        </div>
    `;
    setupArea.style.display = 'none';
    waitingArea.style.display = 'none';

    document.getElementById('submit-desc-btn').onclick = () => {
        const desc = document.getElementById('desc-input').value.trim();
        if (!desc) { alert("설명을 입력해주세요!"); return; }
        socket.emit('submit description', desc);
        document.getElementById('submission-area').style.display = 'none';
        document.getElementById('waiting-submit-area').style.display = 'block';
    };
});

socket.on('game started', () => {
    window.isGamePlaying = false; // 제출 전이므로 아직 투표 불가
});

socket.on('all submissions received', (submissions) => {
    window.isGamePlaying = true; // 이제 교차 투표 가능
    let html = `
        <div style="background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.2); text-align: left;">
            <h2 style="color: #2c3e50; border-bottom: 2px solid #eee; padding-bottom: 10px;">참가자들의 힌트</h2>
            <ul style="list-style-type: none; padding: 0; font-size: 1.2rem; line-height: 1.8;">
    `;

    // 배열 섞기 (누가 먼저 냈는지 유추하기 힘들게)
    submissions.sort(() => Math.random() - 0.5);

    submissions.forEach(sub => {
        html += `<li style="margin-bottom: 10px; padding: 15px; background: #f8f9fa; border-radius: 10px; border-left: 5px solid #3498db;">
            <strong>${sub.name}</strong> 님의 설명:<br>
            <span style="color: #555;">"${sub.desc}"</span>
        </li>`;
    });

    // 투표 UI 추가 (본인 제외)
    let voteButtonsHTML = '<div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 15px; margin-bottom: 20px;">';
    currentUsers.forEach(u => {
        if (u.id !== socket.id) {
            voteButtonsHTML += `<button class="vote-target-btn" data-target-id="${u.id}" data-target-name="${u.name}" style="padding: 15px 30px; font-size: 1.2rem; border-radius: 10px; border: 2px solid #3498db; background: white; color: #2c3e50; font-weight: bold; cursor: pointer; transition: 0.2s;">🙋‍♂️ ${u.name}</button>`;
        }
    });
    voteButtonsHTML += '</div>';

    html += `
            </ul>
            
            <div id="voting-area" style="margin-top: 30px; padding: 20px; background: #e8f4f8; border-radius: 10px; text-align: center; border: 2px solid #bce8f1;">
                <h3 style="color: #31708f; margin-top: 0;">🕵️‍♂️ 라이어 투표하기</h3>
                <p style="color: #5bc0de; margin-bottom: 20px;">채팅으로 충분히 토론한 뒤, 의심되는 사람의 닉네임을 클릭해 지목하세요!</p>
                
                ${voteButtonsHTML}
            </div>
            
            <div id="waiting-vote-area" style="display: none; margin-top: 20px; padding: 15px; background: #fff3cd; color: #856404; border-radius: 10px; font-weight: bold; text-align: center;">
                ⏳ 다른 플레이어를 기다리는 중... ⏳
            </div>
        </div>
    `;
    playerUI.innerHTML = html;

    // 호버 효과 및 클릭 이벤트 추가
    document.querySelectorAll('.vote-target-btn').forEach(btn => {
        btn.onmouseover = () => { btn.style.background = '#3498db'; btn.style.color = 'white'; };
        btn.onmouseout = () => { btn.style.background = 'white'; btn.style.color = '#2c3e50'; };

        btn.onclick = () => {
            const targetId = btn.getAttribute('data-target-id');
            const targetName = btn.getAttribute('data-target-name');
            if (confirm(`정말 ${targetName}님을 라이어로 지목하시겠습니까?`)) {
                socket.emit('vote liar', targetId);
                document.getElementById('voting-area').style.display = 'none';
                document.getElementById('waiting-vote-area').style.display = 'block';
            }
        };
    });
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

    let btnHtml = "";
    if (result.isFinalGameOver) {
        btnHtml = amIHost ? '<button id="restart-liar-btn" class="start-btn" style="margin-top: 30px; width: auto; padding: 15px 40px;">게임 초기화</button>' : '<p style="margin-top:20px; color:#555;">방장이 게임을 무효화할 때까지 대기해주세요.</p>';
    } else {
        btnHtml = amIHost ? '<button id="next-round-btn" class="start-btn" style="background:#3498db; margin-top: 30px; width: auto; padding: 15px 40px;">다음 라운드 시작</button>' : '<p style="margin-top:20px; color:#555;">방장이 다음 라운드를 준비 중입니다...</p>';
    }

    playerUI.innerHTML = `
        <div style="background: ${result.citizensWon ? '#d4edda' : '#f8d7da'}; padding: 40px; border-radius: 15px; text-align: center; border: 2px solid ${result.citizensWon ? '#c3e6cb' : '#f5c6cb'}; box-shadow: 0 10px 20px rgba(0,0,0,0.1);">
            <h1 style="font-size: 2.5rem; color: ${result.citizensWon ? '#155724' : '#721c24'}; margin-top:0;">${result.isFinalGameOver ? '게임 완전 종료!' : '라운드 종료'}</h1>
            <h2 style="font-size: 1.8rem; line-height: 1.5;">${result.message}</h2>
            ${result.isFinalGameOver ? `<h1 style="font-size: 3rem; color: #f39c12; margin: 20px 0;">${result.finalMessage}</h1>` : ''}
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
})();
