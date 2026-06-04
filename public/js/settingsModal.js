// public/js/settingsModal.js
// 게임 설정 통합 모달 컨트롤러

(function () {
    const modal = document.getElementById('settings-modal');
    const modalBody = document.getElementById('settings-modal-body');
    const modalTitle = document.getElementById('settings-modal-title');
    const modalSubtitle = document.getElementById('settings-modal-subtitle');
    const modalIcon = document.getElementById('settings-modal-game-icon');
    const confirmBtn = document.getElementById('settings-modal-confirm');
    const cancelBtn = document.getElementById('settings-modal-cancel');
    const closeBtn = document.getElementById('settings-modal-close');

    let currentGame = null; // 'bingo' | 'liar' | 'bomb'
    let onConfirmCallback = null;

    // ─── 모달 열기 ───────────────────────────────────────────────
    window.openSettingsModal = function (game, onConfirm) {
        currentGame = game;
        onConfirmCallback = onConfirm;

        renderModalContent(game);
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    };

    // ─── 모달 닫기 ───────────────────────────────────────────────
    function closeModal() {
        modal.style.display = 'none';
        document.body.style.overflow = '';
        currentGame = null;
        onConfirmCallback = null;
    }

    cancelBtn.addEventListener('click', closeModal);
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    // ─── 확인(시작) ───────────────────────────────────────────────
    confirmBtn.addEventListener('click', () => {
        if (onConfirmCallback) {
            const settings = collectSettings(currentGame);
            if (settings === null) return; // 유효성 실패
            onConfirmCallback(settings);

            // 실시간 대기방 설정 동기화
            if (typeof socket !== 'undefined' && socket.emit) {
                socket.emit('update lobby settings', {
                    game: currentGame,
                    settings: settings
                });
            }
        }
        closeModal();
    });

    // ─── 게임별 설정값 수집 ───────────────────────────────────────
    function collectSettings(game) {
        if (game === 'bingo') {
            const winLines = parseInt(modalBody.querySelector('input[name="modal-win-lines"]:checked')?.value || '3');
            const turnOrder = modalBody.querySelector('#modal-turn-order').value;
            const turnTimeLimit = parseInt(modalBody.querySelector('#modal-turn-time').value);
            const topic = modalBody.querySelector('#modal-theme-topic').value.trim();
            const useEvents = modalBody.querySelector('#modal-bingo-use-events').checked;

            // hidden 필드에도 반영
            const hiddenTurnOrder = document.getElementById('turn-order-select');
            const hiddenTurnTime = document.getElementById('turn-time-limit');
            const hiddenTopic = document.getElementById('theme-topic-input');
            const hiddenWinLines = document.getElementById('win-lines-select');
            const hiddenEvents = document.getElementById('bingo-use-events');

            if (hiddenTurnOrder) hiddenTurnOrder.value = turnOrder;
            if (hiddenTurnTime) hiddenTurnTime.value = turnTimeLimit;
            if (hiddenTopic) hiddenTopic.value = topic;
            if (hiddenWinLines) hiddenWinLines.value = winLines;
            if (hiddenEvents) hiddenEvents.value = useEvents;

            return { winLines, turnOrder, turnTimeLimit, topic, useEvents };

        } else if (game === 'liar') {
            const winTarget = parseInt(modalBody.querySelector('#modal-liar-win-target').value);
            const checkedCbs = modalBody.querySelectorAll('.modal-liar-cat-cb:checked');
            const selectedCategories = Array.from(checkedCbs).map(cb => cb.value);

            if (checkedCbs.length === 0 && modalBody.querySelectorAll('.modal-liar-cat-cb').length > 0) {
                if (window.showToast) window.showToast('최소 1개 이상의 카테고리를 선택해야 합니다!', 'warning');
                return null;
            }

            // hidden 필드에 반영
            const hiddenTarget = document.getElementById('win-target-select');
            if (hiddenTarget) hiddenTarget.value = winTarget;

            return { winTarget, selectedCategories };

        } else if (game === 'bomb') {
            const hearts = parseInt(modalBody.querySelector('input[name="modal-bomb-hearts"]:checked')?.value || '3');
            const subMode = modalBody.querySelector('#modal-bomb-sub-mode').value;
            const showTimer = modalBody.querySelector('#modal-bomb-show-timer').checked;
            const timerRange = modalBody.querySelector('#modal-bomb-timer-range').value;
            const checkedCbs = modalBody.querySelectorAll('.modal-bomb-cat-cb:checked');
            const selectedCategories = Array.from(checkedCbs).map(cb => cb.value);

            // hidden 필드에 반영
            const hiddenHearts = document.getElementById('bomb-hearts');
            const hiddenSubMode = document.getElementById('bomb-sub-mode');
            const hiddenTimer = document.getElementById('bomb-show-timer');
            const hiddenRange = document.getElementById('bomb-timer-range');
            if (hiddenHearts) hiddenHearts.value = hearts;
            if (hiddenSubMode) hiddenSubMode.value = subMode;
            if (hiddenTimer) hiddenTimer.value = showTimer;
            if (hiddenRange) hiddenRange.value = timerRange;

            return { hearts, subMode, showTimer, timerRange, selectedCategories };
        }
        return {};
    }

    // ─── 게임별 모달 콘텐츠 렌더 ─────────────────────────────────
    function renderModalContent(game) {
        modalBody.innerHTML = '';

        if (game === 'bingo') {
            const hWinLines = document.getElementById('win-lines-select')?.value || '3';
            const hTurnOrder = document.getElementById('turn-order-select')?.value || 'host_first';
            const hTurnTime = document.getElementById('turn-time-limit')?.value || '15';
            const hTopic = document.getElementById('theme-topic-input')?.value || '';
            const hUseEvents = document.getElementById('bingo-use-events')?.value === 'true';

            modalTitle.textContent = '게임 설정';
            modalBody.innerHTML = `
                <div class="smodal-section">
                    <label class="smodal-label">승리 조건 (빙고 줄 수)</label>
                    <div class="smodal-radio-group">
                        <label class="smodal-radio-card"><input type="radio" name="modal-win-lines" value="2" ${hWinLines === '2' ? 'checked' : ''}> <span>2줄</span></label>
                        <label class="smodal-radio-card"><input type="radio" name="modal-win-lines" value="3" ${hWinLines === '3' ? 'checked' : ''}> <span>3줄</span></label>
                        <label class="smodal-radio-card"><input type="radio" name="modal-win-lines" value="4" ${hWinLines === '4' ? 'checked' : ''}> <span>4줄</span></label>
                        <label class="smodal-radio-card"><input type="radio" name="modal-win-lines" value="5" ${hWinLines === '5' ? 'checked' : ''}> <span>5줄</span></label>
                    </div>
                </div>
                <div class="smodal-section">
                    <label class="smodal-label">시작 순서</label>
                    <select id="modal-turn-order" class="smodal-select">
                        <option value="host_first" ${hTurnOrder === 'host_first' ? 'selected' : ''}>방장부터 시계방향</option>
                        <option value="random" ${hTurnOrder === 'random' ? 'selected' : ''}>랜덤</option>
                        <option value="join_asc" ${hTurnOrder === 'join_asc' ? 'selected' : ''}>입장 순서대로</option>
                    </select>
                </div>
                <div class="smodal-section">
                    <label class="smodal-label">턴 제한 시간</label>
                    <select id="modal-turn-time" class="smodal-select">
                        <option value="5" ${hTurnTime === '5' ? 'selected' : ''}>5초</option>
                        <option value="10" ${hTurnTime === '10' ? 'selected' : ''}>10초</option>
                        <option value="15" ${hTurnTime === '15' ? 'selected' : ''}>15초</option>
                        <option value="20" ${hTurnTime === '20' ? 'selected' : ''}>20초</option>
                        <option value="0" ${hTurnTime === '0' ? 'selected' : ''}>무제한</option>
                    </select>
                </div>
                <div class="smodal-section">
                    <label class="smodal-label">AI 빙고 주제 <span style="font-weight:400; color:#aaa;">(비워두면 자유 주제)</span></label>
                    <input type="text" id="modal-theme-topic" class="smodal-input" placeholder="예: K-POP 아이돌, 한국 음식..." value="${hTopic}">
                </div>
                <div class="smodal-section smodal-toggle-row">
                    <label class="smodal-label" style="margin:0;">이벤트 모드 (ON / OFF)</label>
                    <label class="smodal-toggle">
                        <input type="checkbox" id="modal-bingo-use-events" ${hUseEvents ? 'checked' : ''}>
                        <span class="smodal-toggle-slider"></span>
                    </label>
                </div>
            `;

        } else if (game === 'liar') {
            const hWinTarget = document.getElementById('win-target-select')?.value || '3';

            modalTitle.textContent = '게임 설정';
            modalBody.innerHTML = `
                <div class="smodal-section">
                    <label class="smodal-label">목표 승수</label>
                    <select id="modal-liar-win-target" class="smodal-select">
                        <option value="2" ${hWinTarget === '2' ? 'selected' : ''}>2승</option>
                        <option value="3" ${hWinTarget === '3' ? 'selected' : ''}>3승 </option>
                        <option value="4" ${hWinTarget === '4' ? 'selected' : ''}>4승</option>
                    </select>
                </div>
                <div class="smodal-section">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <label class="smodal-label" style="margin:0;">카테고리</label>
                        <div style="display:flex; gap:8px;">
                            <button id="liar-modal-all" class="smodal-small-btn smodal-btn-blue">모두 선택</button>
                            <button id="liar-modal-none" class="smodal-small-btn smodal-btn-red">모두 해제</button>
                        </div>
                    </div>
                    <div id="liar-modal-category-grid" class="smodal-check-grid">
                        <span style="color:#aaa; font-size:0.9rem;">카테고리를 불러오는 중...</span>
                    </div>
                </div>
            `;
            // 카테고리 로드
            socket.emit('request liar categories');
            socket.once('liar categories', (cats) => {
                const grid = document.getElementById('liar-modal-category-grid');
                if (!grid) return;

                const prevCat = window.liarSelectedCategories;
                grid.innerHTML = cats.map(cat => {
                    const isChecked = prevCat ? prevCat.includes(cat) : true;
                    return `
                    <label class="smodal-check-label">
                        <input type="checkbox" class="modal-liar-cat-cb" value="${cat}" ${isChecked ? 'checked' : ''}>
                        <span>${cat}</span>
                    </label>
                `}).join('');

                document.getElementById('liar-modal-all').onclick = () =>
                    grid.querySelectorAll('.modal-liar-cat-cb').forEach(cb => cb.checked = true);
                document.getElementById('liar-modal-none').onclick = () =>
                    grid.querySelectorAll('.modal-liar-cat-cb').forEach(cb => cb.checked = false);
            });

        } else if (game === 'bomb') {
            const hHearts = document.getElementById('bomb-hearts')?.value || '3';
            const hSubMode = document.getElementById('bomb-sub-mode')?.value || 'random';
            const hTimerRange = document.getElementById('bomb-timer-range')?.value || 'medium';
            const hShowTimerStr = document.getElementById('bomb-show-timer')?.value || 'true';
            const showTimerChecked = (hShowTimerStr === 'true');

            modalTitle.textContent = '폭탄 돌리기 설정';
            modalBody.innerHTML = `
                <div class="smodal-section">
                    <label class="smodal-label">시작 목숨</label>
                    <div class="smodal-radio-group">
                        <label class="smodal-radio-card"><input type="radio" name="modal-bomb-hearts" value="1" ${hHearts === '1' ? 'checked' : ''}> <span>1개</span></label>
                        <label class="smodal-radio-card"><input type="radio" name="modal-bomb-hearts" value="2" ${hHearts === '2' ? 'checked' : ''}> <span>2개</span></label>
                        <label class="smodal-radio-card"><input type="radio" name="modal-bomb-hearts" value="3" ${hHearts === '3' ? 'checked' : ''}> <span>3개</span></label>
                    </div>
                </div>
                <div class="smodal-section">
                    <label class="smodal-label">게임 모드</label>
                    <select id="modal-bomb-sub-mode" class="smodal-select">
                        <option value="random" ${hSubMode === 'random' ? 'selected' : ''}>랜덤 모드</option>
                        <option value="tactical" ${hSubMode === 'tactical' ? 'selected' : ''}>전략 모드</option>
                    </select>
                    <p style="font-size:0.8rem; color:#aaa; margin: 6px 0 0;">전략 모드: 단어 뒤에 번호를 입력해 지목하거나, 빠른 답변으로 반사할 수 있습니다.</p>
                </div>
                <div class="smodal-section">
                    <label class="smodal-label">폭탄 시간</label>
                    <select id="modal-bomb-timer-range" class="smodal-select">
                        <option value="short" ${hTimerRange === 'short' ? 'selected' : ''}>짧게 (15~30초) — 짧고 굵게</option>
                        <option value="medium" ${hTimerRange === 'medium' ? 'selected' : ''}>보통 (30~55초) — 적당한 긴장감</option>
                        <option value="long" ${hTimerRange === 'long' ? 'selected' : ''}>길게 (50~80초) — 길고 여유롭게</option>
                    </select>
                </div>
                <div class="smodal-section smodal-toggle-row">
                    <label class="smodal-label" style="margin:0;">타이머 표시</label>
                    <label class="smodal-toggle">
                        <input type="checkbox" id="modal-bomb-show-timer" ${showTimerChecked ? 'checked' : ''}>
                        <span class="smodal-toggle-slider"></span>
                    </label>
                </div>
                <div class="smodal-section">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <label class="smodal-label" style="margin:0;">카테고리</label>
                        <div style="display:flex; gap:8px;">
                            <button id="bomb-modal-all" class="smodal-small-btn smodal-btn-blue">모두 선택</button>
                            <button id="bomb-modal-none" class="smodal-small-btn smodal-btn-red">모두 해제</button>
                        </div>
                    </div>
                    <div id="bomb-modal-category-grid" class="smodal-check-grid">
                        <span style="color:#aaa; font-size:0.9rem;">카테고리를 불러오는 중...</span>
                    </div>
                </div>
            `;
            // 카테고리 로드
            socket.emit('request bomb categories');
            socket.once('bomb categories', (cats) => {
                const grid = document.getElementById('bomb-modal-category-grid');
                if (!grid) return;

                const prevCat = window.bombSelectedCategories;
                grid.innerHTML = cats.map(cat => {
                    const isChecked = prevCat ? prevCat.includes(cat) : true;
                    return `
                    <label class="smodal-check-label">
                        <input type="checkbox" class="modal-bomb-cat-cb" value="${cat}" ${isChecked ? 'checked' : ''}>
                        <span>${cat}</span>
                    </label>
                `}).join('');
                document.getElementById('bomb-modal-all').onclick = () =>
                    grid.querySelectorAll('.modal-bomb-cat-cb').forEach(cb => cb.checked = true);
                document.getElementById('bomb-modal-none').onclick = () =>
                    grid.querySelectorAll('.modal-bomb-cat-cb').forEach(cb => cb.checked = false);
            });
        }
    }
})();
