// public/js/bomb.js
(function () {
    const bombContainer = document.getElementById('bomb-container');
    const bombWordInput = document.getElementById('bomb-word-input');
    const bombThemeValue = document.getElementById('bomb-theme-value');
    const bombTypeBadge = document.getElementById('bomb-type-badge');
    const bombTimerText = document.getElementById('bomb-timer-text');
    const bombFuseFill = document.getElementById('bomb-fuse-fill');
    const bombUsedWordsList = document.getElementById('bomb-words-list');

    const bombCenterCore = document.getElementById('bomb-center-core');
    const bombCoreNormalView = document.getElementById('bomb-core-normal-view');
    const bombCoreExplodedView = document.getElementById('bomb-core-exploded-view');
    const bombCoreSuperView = document.getElementById('bomb-core-super-view');
    const bombCoreTargetingView = document.getElementById('bomb-core-targeting-view');
    const bombExplodedBadge = document.getElementById('bomb-exploded-badge');
    const bombCoreLabel = document.getElementById('bomb-core-label');
    const bombCoreWord = document.getElementById('bomb-core-word');
    const bombCoreOwnerName = document.getElementById('bomb-core-owner-name');
    const bombFloatingToken = document.getElementById('bomb-floating-token');
    const bombExplosionFx = document.getElementById('bomb-explosion-fx');
    const bombLaserSvg = document.getElementById('target-laser-svg');
    const bombLaserLine = document.getElementById('laser-line');
    const bombCrosshairLock = document.getElementById('crosshair-lock');
    let rouletteAnimTimer = null;
    let rouletteAnimActive = false;
    let rouletteRafId = null;
    let suppressTurnReveal = false;
    let isPassHoldClient = false;
    let passHoldTimer = null;

    const bombResultMsg = document.getElementById('bomb-result-msg');
    const bombResultHintBox = document.getElementById('bomb-result-hint-box');

    const bombDockBox = document.getElementById('bomb-dock-box');
    const bombTurnChip = document.getElementById('bomb-turn-chip');
    const bombInputErrorBadge = document.getElementById('bomb-input-error-badge');

    const startGameBombBtn = document.getElementById('start-game-bomb');
    const openSettingsBombBtn = document.getElementById('open-settings-bomb');
    const returnLobbyBtns = document.querySelectorAll('.return-lobby-btn');

    let isMyTurn = false;
    let localIsHost = false;
    let currentBombUsers = [];
    let bombMaxHearts = 3;
    let activeBubbleEntry = null; // { playerId, word }
    let usedWordsHistory = [];
    let currentTypingState = null; // { playerId, text }
    let rejectState = null;        // { playerId, word }
    let justReceivedId = null;
    let currentTimeLeft = 30;
    let redThreshold = 4;
    let fastThreshold = 9;
    let dockErrorTimer = null;
    let coreImpactTimer = null;
    let countdownLockTimer = null;
    let isCountingDownClient = false;
    let lastTypingEmitTime = 0;
    let lastBombSettings = { hearts: 3, subMode: 'random', showTimer: true, timerRange: 'medium', selectedCategories: [] };

    const HEART_SVG_PATH = '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>';

    function getHeartsSvgHtml(currentHearts, maxHearts = bombMaxHearts) {
        let html = '';
        const count = Math.max(0, currentHearts);
        for (let i = 0; i < maxHearts; i++) {
            const emptyClass = (i < count) ? '' : 'empty';
            html += `<svg class="heart-svg ${emptyClass}" viewBox="0 0 24 24">${HEART_SVG_PATH}</svg>`;
        }
        return html;
    }

    // 와이드 스타디움 타원: 좌우는 넓게(455px), 상하는 압축(162px)하여 12시 말풍선과 6시 하트가 위아래 UI와 절대 닿지 않도록 보장
    function getArenaGeometry(index, total) {
        const arenaEl = document.getElementById('bomb-arena');
        const w = arenaEl ? arenaEl.clientWidth : 1100;
        const h = arenaEl ? arenaEl.clientHeight : 520;
        const cx = w / 2;
        const cy = (h / 2) + 4;
        const rx = Math.min(w * 0.42, 455);
        const ry = Math.min(h * 0.33, 162);

        const angle = (Math.PI / 2) + (2 * Math.PI * index / Math.max(1, total));
        const x = cx + rx * Math.cos(angle);
        // 본인(6시) 좌석은 추가로 아래로 내려 말풍선이 코어 위가 아닌 머리 위에 뜨도록 확보
        const bottomSeatShift = (index === 0 && total > 1) ? 34 : 0;
        const y = cy + ry * Math.sin(angle) + bottomSeatShift;
        return { x, y, cx, cy, angle };
    }

    
    function stopLockOnMortarRoulette() {
        if (rouletteAnimTimer) {
            clearTimeout(rouletteAnimTimer);
            rouletteAnimTimer = null;
        }
        if (rouletteRafId) {
            cancelAnimationFrame(rouletteRafId);
            rouletteRafId = null;
        }
        rouletteAnimActive = false;
        suppressTurnReveal = false;
        if (bombLaserSvg) bombLaserSvg.style.display = 'none';
        if (bombCrosshairLock) {
            bombCrosshairLock.style.display = 'none';
            bombCrosshairLock.classList.remove('locked');
        }
        document.querySelectorAll('#bomb-arena-players .arena-player-slot').forEach(el => {
            el.classList.remove('roulette-highlight');
        });
        if (bombFloatingToken) {
            bombFloatingToken.style.transform = 'scale(1)';
            bombFloatingToken.style.transition = '';
            bombFloatingToken.classList.remove('charging');
        }
        switchCoreMode('normal');
    }

    function isBombPlayerAlive(userId) {
        const h = (window.bombHearts && window.bombHearts[userId] !== undefined) ? window.bombHearts[userId] : bombMaxHearts;
        return h > 0;
    }

    // 첫 폭탄 대상 추첨 연출: 레이저 스캔(감속) -> 록온 -> 고공 곡사포 낙하. 총 길이는 durationMs와 정확히 일치
    function playLockOnMortarRoulette(targetId, durationMs, onComplete) {
        stopLockOnMortarRoulette();
        rouletteAnimActive = true;
        suppressTurnReveal = true;

        const arenaEl = document.getElementById('bomb-arena');
        const w = arenaEl ? arenaEl.clientWidth : 1100;
        const h = arenaEl ? arenaEl.clientHeight : 520;
        const cx = w / 2;
        const cy = (h / 2) + 4;

        switchCoreMode('targeting');
        if (bombFloatingToken) {
            bombFloatingToken.style.transition = 'none';
            bombFloatingToken.style.left = `${cx}px`;
            bombFloatingToken.style.top = `${cy}px`;
            bombFloatingToken.style.transform = 'scale(1)';
            bombFloatingToken.style.opacity = '0';
        }

        const users = (currentBombUsers && currentBombUsers.length > 0) ? currentBombUsers : (window.roomPlayers || []);
        const ordered = getOrderedUsersForArena(users);
        let candidates = ordered.map((u, idx) => ({ u, idx })).filter(x => isBombPlayerAlive(x.u.id));
        if (candidates.length === 0) candidates = ordered.map((u, idx) => ({ u, idx }));
        if (candidates.length === 0) {
            stopLockOnMortarRoulette();
            if (onComplete) onComplete();
            return;
        }

        const n = candidates.length;
        let targetCand = candidates.findIndex(x => x.u.id === targetId);
        if (targetCand === -1) targetCand = 0;

        if (bombLaserSvg && bombLaserLine) {
            bombLaserSvg.style.display = 'block';
            bombLaserLine.setAttribute('x1', cx);
            bombLaserLine.setAttribute('y1', cy);
            bombLaserLine.setAttribute('x2', cx);
            bombLaserLine.setAttribute('y2', cy);
            bombLaserLine.setAttribute('stroke-width', '3');
        }

        flashCoreLabel('폭탄 대상 추첨 중', durationMs);

        // 시간 배분: 스캔(감속) / 록온 정지 / 낙하
        const launchMs = Math.max(600, Math.round(durationMs * 0.2));
        const lockMs = 380;
        const scanMs = Math.max(900, durationMs - launchMs - lockMs);

        // 스캔 스텝 시각표: 간격이 100ms에서 440ms까지 제곱 곡선으로 늘어남
        const A = 100;
        const B = 440;
        const times = [];
        let t = 0;
        while (t < scanMs - 150) {
            times.push(t);
            t += A + (B - A) * Math.pow(t / scanMs, 2);
        }
        if (times.length === 0) times.push(0);
        const steps = times.length;
        // 마지막 스텝이 정확히 타깃에 떨어지도록 시작 위치를 역산
        const startCand = (((targetCand - (steps - 1)) % n) + n) % n;

        const startTime = performance.now();
        let stepIdx = 0;

        function scanStep() {
            if (!rouletteAnimActive) return;
            const cand = candidates[(startCand + stepIdx) % n];
            const pos = getArenaGeometry(cand.idx, ordered.length);
            if (bombLaserLine) {
                // 레이저가 코어 텍스트를 가로지르지 않고 코어 외곽 테두리에서 타깃으로 뻗어나가도록 시작점 산출
                const dx = pos.x - cx;
                const dy = pos.y - cy;
                const dist = Math.hypot(dx, dy) || 1;
                const coreRadius = 95;
                bombLaserLine.setAttribute('x1', cx + (dx / dist) * coreRadius);
                bombLaserLine.setAttribute('y1', cy + (dy / dist) * coreRadius);
                bombLaserLine.setAttribute('x2', pos.x);
                bombLaserLine.setAttribute('y2', pos.y);
            }
            document.querySelectorAll('#bomb-arena-players .arena-player-slot').forEach(el => el.classList.remove('roulette-highlight'));
            const slot = document.querySelector(`#bomb-arena-players .arena-player-slot[data-player-id="${cand.u.id}"]`);
            if (slot) slot.classList.add('roulette-highlight');

            // 룰렛 스캔음 재생 (묵직한 기계 래칫)
            if (window.soundManager && typeof window.soundManager.playSfx === 'function') {
                window.soundManager.playSfx('bombRouletteTick');
            }

            stepIdx++;
            if (stepIdx < steps) {
                rouletteAnimTimer = setTimeout(scanStep, Math.max(0, startTime + times[stepIdx] - performance.now()));
            } else {
                rouletteAnimTimer = setTimeout(lockOn, Math.max(0, startTime + scanMs - performance.now()));
            }
        }

        const finalCand = candidates[targetCand];
        const finalPos = getArenaGeometry(finalCand.idx, ordered.length);

        function lockOn() {
            if (!rouletteAnimActive) return;
            if (bombLaserLine) {
                const dx = finalPos.x - cx;
                const dy = finalPos.y - cy;
                const dist = Math.hypot(dx, dy) || 1;
                const coreRadius = 95;
                bombLaserLine.setAttribute('x1', cx + (dx / dist) * coreRadius);
                bombLaserLine.setAttribute('y1', cy + (dy / dist) * coreRadius);
                bombLaserLine.setAttribute('x2', finalPos.x);
                bombLaserLine.setAttribute('y2', finalPos.y);
                bombLaserLine.setAttribute('stroke-width', '5');
            }
            if (bombCrosshairLock) {
                bombCrosshairLock.style.left = `${finalPos.x}px`;
                bombCrosshairLock.style.top = `${finalPos.y}px`;
                bombCrosshairLock.style.display = 'block';
                bombCrosshairLock.classList.remove('locked');
                void bombCrosshairLock.offsetWidth;
                bombCrosshairLock.classList.add('locked');
            }
            const targetSub = document.querySelector('.bomb-core-targeting-sub');
            if (targetSub) {
                targetSub.textContent = 'LOCK-ON!';
                targetSub.style.color = '#ef4444';
                targetSub.style.fontWeight = '900';
            }

            // 밀리터리 록온 사운드 재생
            if (window.soundManager && typeof window.soundManager.playSfx === 'function') {
                window.soundManager.playSfx('bombLockon');
            }

            rouletteAnimTimer = setTimeout(launch, lockMs);
        }

        function launch() {
            if (!rouletteAnimActive) return;
            if (bombLaserSvg) bombLaserSvg.style.display = 'none';
            if (bombFloatingToken) {
                bombFloatingToken.style.opacity = '1';
                bombFloatingToken.classList.remove('charging');
            }

            // 모타르 포격 발사 사운드 재생 (펑-슈우욱)
            if (window.soundManager && typeof window.soundManager.playSfx === 'function') {
                window.soundManager.playSfx('bombLaunch');
            }

            const isLeft = Math.cos(finalPos.angle) < -0.2;
            const destX = finalPos.x + (isLeft ? -54 : 54);
            const destY = finalPos.y - 12;
            const launchStart = performance.now();

            function frameArc(now) {
                if (!rouletteAnimActive) return;
                const p = Math.min(1, (now - launchStart) / launchMs);
                const curX = cx + (destX - cx) * p;
                const arcHeight = 190;
                const curY = cy + (destY - cy) * p - (4 * arcHeight * p * (1 - p));
                const scale = 1 + Math.sin(p * Math.PI) * 0.85;
                if (bombFloatingToken) {
                    bombFloatingToken.style.left = `${curX}px`;
                    bombFloatingToken.style.top = `${curY}px`;
                    bombFloatingToken.style.transform = `scale(${scale}) rotate(${p * 540}deg)`;
                }
                if (p < 1) {
                    rouletteRafId = requestAnimationFrame(frameArc);
                } else {
                    rouletteRafId = null;
                    stopLockOnMortarRoulette();
                    positionBombAtPlayer(targetId);

                    // 폭탄 바닥 착지 쿵! 사운드 재생
                    if (window.soundManager && typeof window.soundManager.playSfx === 'function') {
                        window.soundManager.playSfx('bombLand');
                    }

                    if (onComplete) onComplete();
                }
            }
            rouletteRafId = requestAnimationFrame(frameArc);
        }

        scanStep();
    }

    function positionBombAtPlayer(turnId) {
        if (!bombFloatingToken) return;
        const arenaEl = document.getElementById('bomb-arena');
        const w = arenaEl ? arenaEl.clientWidth : 1100;
        const h = arenaEl ? arenaEl.clientHeight : 520;

        if (!turnId || !currentBombUsers || currentBombUsers.length === 0) {
            bombFloatingToken.style.left = `${w / 2}px`;
            bombFloatingToken.style.top = `${h / 2}px`;
            return;
        }

        const ordered = getOrderedUsersForArena(currentBombUsers);
        const idx = ordered.findIndex(u => u.id === turnId);
        if (idx === -1) {
            bombFloatingToken.style.left = `${w / 2}px`;
            bombFloatingToken.style.top = `${h / 2}px`;
            return;
        }

        const pos = getArenaGeometry(idx, ordered.length);
        const isLeftSeat = Math.cos(pos.angle) < -0.2;
        const offsetX = isLeftSeat ? -54 : 54;
        const offsetY = -12;

        bombFloatingToken.style.left = `${pos.x + offsetX}px`;
        bombFloatingToken.style.top = `${pos.y + offsetY}px`;
    }

    
    function getOrderedUsersForArena(users) {
        if (!users || users.length === 0) return [];
        const myIdx = users.findIndex(u => u.id === socket.id);
        if (myIdx <= 0) return users.slice();
        return [...users.slice(myIdx), ...users.slice(0, myIdx)];
    }

    function switchCoreMode(mode) {
        if (!bombCenterCore) return;
        bombCenterCore.classList.remove('impact-normal', 'impact-fast', 'impact-critical');
        bombCenterCore.classList.remove('exploded-mode', 'super-intro-mode', 'targeting-mode');

        if (mode === 'super-intro') {
            bombCenterCore.classList.add('super-intro-mode');
            if (bombCoreNormalView) bombCoreNormalView.style.display = 'none';
            if (bombCoreExplodedView) bombCoreExplodedView.style.display = 'none';
            if (bombCoreSuperView) bombCoreSuperView.style.display = 'flex';
            if (bombCoreTargetingView) bombCoreTargetingView.style.display = 'none';
        } else if (mode === 'exploded') {
            bombCenterCore.classList.add('exploded-mode');
            if (bombCoreNormalView) bombCoreNormalView.style.display = 'none';
            if (bombCoreExplodedView) bombCoreExplodedView.style.display = 'flex';
            if (bombCoreSuperView) bombCoreSuperView.style.display = 'none';
            if (bombCoreTargetingView) bombCoreTargetingView.style.display = 'none';
        } else if (mode === 'targeting') {
            bombCenterCore.classList.add('targeting-mode');
            if (bombCoreNormalView) bombCoreNormalView.style.display = 'none';
            if (bombCoreExplodedView) bombCoreExplodedView.style.display = 'none';
            if (bombCoreSuperView) bombCoreSuperView.style.display = 'none';
            if (bombCoreTargetingView) bombCoreTargetingView.style.display = 'flex';
            const targetSub = document.querySelector('.bomb-core-targeting-sub');
            if (targetSub) {
                targetSub.textContent = '타깃 스캔 중...';
                targetSub.style.color = '#cbd5e1';
                targetSub.style.fontWeight = '700';
            }
        } else {
            if (bombCoreNormalView) bombCoreNormalView.style.display = 'flex';
            if (bombCoreExplodedView) bombCoreExplodedView.style.display = 'none';
            if (bombCoreSuperView) bombCoreSuperView.style.display = 'none';
            if (bombCoreTargetingView) bombCoreTargetingView.style.display = 'none';
        }
    }

    // 남은 시간에 비례하여 강화되는 3단계 단어 패스 임팩트 연출
    function triggerWordPassImpact(word, senderName) {
        if (!bombCenterCore || !bombCoreWord) return;
        if (coreImpactTimer) {
            clearTimeout(coreImpactTimer);
            coreImpactTimer = null;
        }

        let level = 'normal';
        if (currentTimeLeft <= redThreshold) {
            level = 'critical';
        } else if (currentTimeLeft <= fastThreshold) {
            level = 'fast';
        }

        bombCoreWord.textContent = word;
        bombCoreWord.classList.remove('empty');

        if (bombCoreLabel) {
            bombCoreLabel.classList.remove('pass-normal', 'pass-fast', 'pass-critical');
            const safeSender = senderName || '플레이어';
            bombCoreLabel.textContent = `${safeSender} 통과`;
            bombCoreLabel.classList.add(`pass-${level}`);
        }

        bombCenterCore.classList.remove('impact-normal', 'impact-fast', 'impact-critical');
        void bombCenterCore.offsetWidth;
        bombCenterCore.classList.add(`impact-${level}`);

        if (level === 'critical') {
            const arenaEl = document.getElementById('bomb-arena');
            if (arenaEl) {
                arenaEl.classList.remove('arena-clutch-hit');
                void arenaEl.offsetWidth;
                arenaEl.classList.add('arena-clutch-hit');
            }
        }

        coreImpactTimer = setTimeout(() => {
            if (bombCenterCore) {
                bombCenterCore.classList.remove('impact-normal', 'impact-fast', 'impact-critical');
            }
        }, 700);
    }

    // 코어 상단 라벨 자리를 잠시 알림 용도로 사용 (통과 라벨과 동일한 위치/크기)
    let coreLabelFlashTimer = null;
    function flashCoreLabel(text, ms) {
        if (!bombCoreLabel) return;
        if (coreLabelFlashTimer) clearTimeout(coreLabelFlashTimer);
        bombCoreLabel.classList.remove('pass-normal', 'pass-fast', 'pass-critical');
        bombCoreLabel.classList.add('label-alert');
        bombCoreLabel.textContent = text;
        coreLabelFlashTimer = setTimeout(() => {
            coreLabelFlashTimer = null;
            if (!bombCoreLabel.classList.contains('label-alert')) return;
            bombCoreLabel.classList.remove('label-alert');
            bombCoreLabel.textContent = '방금 통과한 단어';
        }, ms);
    }

    function showCenterReject(text) {
        if (bombCenterCore && !bombCenterCore.classList.contains('exploded-mode')) {
            bombCenterCore.classList.remove('core-reject');
            void bombCenterCore.offsetWidth;
            bombCenterCore.classList.add('core-reject');
            setTimeout(() => bombCenterCore.classList.remove('core-reject'), 450);
        }
        flashCoreLabel(text, 1200);
    }

    // 종료된 연출 클래스를 제거하지 않으면 컨테이너가 다시 표시될 때 CSS 애니메이션이 재생되어 시작 시 폭발이 한 번 더 나타남
    function resetBombEffectClasses() {
        stopLockOnMortarRoulette();
        if (bombExplosionFx) bombExplosionFx.classList.remove('boom');
        const arenaEl = document.getElementById('bomb-arena');
        if (arenaEl) arenaEl.classList.remove('screen-explosion-shake', 'arena-clutch-hit');
    }

    function triggerDockErrorFeedback(reasonText) {
        if (dockErrorTimer) {
            clearTimeout(dockErrorTimer);
            dockErrorTimer = null;
        }
        if (bombDockBox) {
            bombDockBox.classList.remove('dock-error-shake');
            void bombDockBox.offsetWidth;
            bombDockBox.classList.add('dock-error-shake');
        }
        if (bombInputErrorBadge) {
            bombInputErrorBadge.textContent = reasonText || '사용할 수 없는 단어!';
            bombInputErrorBadge.classList.add('show');
        }

        dockErrorTimer = setTimeout(() => {
            if (bombDockBox) bombDockBox.classList.remove('dock-error-shake');
            if (bombInputErrorBadge) bombInputErrorBadge.classList.remove('show');
        }, 1250);
    }

    function refreshBubbleDOM(playerId) {
        const slot = document.querySelector(`#bomb-arena-players .arena-player-slot[data-player-id="${playerId}"]`);
        if (!slot) return;
        const bubbleEl = slot.querySelector('.pod-last-word');
        if (!bubbleEl) return;

        if (rejectState && rejectState.playerId === playerId) {
            bubbleEl.className = 'pod-last-word show rejected';
            bubbleEl.textContent = `${rejectState.word} (오답)`;
        } else if (currentTypingState && currentTypingState.playerId === playerId && currentTypingState.text) {
            bubbleEl.className = 'pod-last-word show typing';
            bubbleEl.textContent = currentTypingState.text;
        } else if (activeBubbleEntry && activeBubbleEntry.playerId === playerId && activeBubbleEntry.word) {
            bubbleEl.className = 'pod-last-word show';
            bubbleEl.textContent = activeBubbleEntry.word;
        } else {
            bubbleEl.className = 'pod-last-word';
            bubbleEl.textContent = '';
        }
    }

    function refreshAllBubbles() {
        const slots = document.querySelectorAll('#bomb-arena-players .arena-player-slot');
        slots.forEach(slot => {
            if (slot.dataset.playerId) {
                refreshBubbleDOM(slot.dataset.playerId);
            }
        });
    }

    window.initBombUI = function (isHost) {
        localIsHost = isHost;
        const setupArea = bombContainer.querySelector('.bomb-setup');
        const waitingArea = bombContainer.querySelector('.bomb-waiting');
        const playerUI = bombContainer.querySelector('.bomb-player-ui');

        window.currentBombTurnId = null;
                activeBubbleEntry = null;
        usedWordsHistory = [];
        currentTypingState = null;
        rejectState = null;
        isCountingDownClient = false;
        if (countdownLockTimer) {
            clearTimeout(countdownLockTimer);
            countdownLockTimer = null;
        }
        switchCoreMode('normal');
        if (bombExplosionFx) {
            bombExplosionFx.style.display = 'none';
            bombExplosionFx.classList.remove('boom');
        }

        if (setupArea) setupArea.style.display = 'none';
        if (waitingArea) waitingArea.style.display = 'none';

        if (window.gameType === 'bomb' && typeof showContainer === 'function') {
            showContainer('lobby-container');
            const stageSelection = document.getElementById('selection-stage');
            const stageWaiting = document.getElementById('waiting-stage');
            if (stageSelection) stageSelection.style.display = 'none';
            if (stageWaiting) stageWaiting.style.display = 'flex';
        }

        if (playerUI) playerUI.style.display = 'none';

        const sidebar = document.getElementById('right-sidebar');
        if (sidebar) sidebar.classList.remove('bomb-game-active');

        if (bombThemeValue) bombThemeValue.textContent = '--';
        if (bombTimerText) bombTimerText.style.display = 'none';
        if (bombUsedWordsList) bombUsedWordsList.innerHTML = '';

        updateBombLobbySettingsUI(lastBombSettings);
    };

    window.renderBombUsers = function (users) {
        const rawUsers = (users && users.length > 0) ? users : (window.roomPlayers || []);
        currentBombUsers = rawUsers;
        const arenaPlayers = document.getElementById('bomb-arena-players');
        if (!arenaPlayers) return;
        arenaPlayers.innerHTML = '';

        const ordered = getOrderedUsersForArena(rawUsers);
        const isGameActive = window.currentBombTurnId !== undefined && window.currentBombTurnId !== null;


        // 생존자 2명 시 서든데스: 코어 테두리 톤 변경 + 전환 시 라벨 1회 안내
        let aliveCount = 0;
        ordered.forEach(user => {
            const h = (window.bombHearts && window.bombHearts[user.id] !== undefined) ? window.bombHearts[user.id] : bombMaxHearts;
            if (h > 0) aliveCount++;
        });
        const isSuddenDeath = isGameActive && aliveCount === 2;
        const arenaRoot = document.getElementById('bomb-arena');
        if (arenaRoot) {
            const wasSudden = arenaRoot.classList.contains('sudden-death');
            arenaRoot.classList.toggle('sudden-death', isSuddenDeath);
            if (isSuddenDeath && !wasSudden && bombCenterCore && !bombCenterCore.classList.contains('exploded-mode')) {
                flashCoreLabel('최후의 2인', 2000);
            }
        }

        ordered.forEach((user, index) => {
            const pos = getArenaGeometry(index, ordered.length);
            const slot = document.createElement('div');
            slot.className = 'arena-player-slot';
            slot.dataset.playerId = user.id;

            const isMe = (user.id === socket.id);
            if (isMe) slot.classList.add('is-me');
            if (isGameActive && !suppressTurnReveal && window.currentBombTurnId === user.id) slot.classList.add('is-turn');
            if (!suppressTurnReveal && justReceivedId === user.id) slot.classList.add('just-received');

            const heartCount = (window.bombHearts && window.bombHearts[user.id] !== undefined)
                ? window.bombHearts[user.id]
                : bombMaxHearts;
            const isDead = heartCount <= 0;
            if (isGameActive && isDead) slot.classList.add('is-dead');



            const heartsHtml = isGameActive ? getHeartsSvgHtml(heartCount, bombMaxHearts) : '';
            const userColor = user.color || '#FC944D';
            const mascotHtml = window.buildMascotSvg ? window.buildMascotSvg(userColor, user.costume || []) : '';

            slot.style.left = `${pos.x}px`;
            slot.style.top = `${pos.y}px`;
            slot.innerHTML = `
                <div class="pod-last-word"></div>
                <div class="arena-avatar-wrap">
                    <div class="pod-shockwave"></div>
                    <div class="arena-avatar">${mascotHtml}</div>
                    <div class="arena-dead-badge">탈락</div>
                </div>
                <div class="arena-player-name">
                    ${isMe ? '<span class="pod-me-tag">ME</span>' : ''}${user.name}
                </div>
                ${isGameActive ? `<div class="arena-hearts">${heartsHtml}</div>` : ''}
            `;
            arenaPlayers.appendChild(slot);
            refreshBubbleDOM(user.id);
        });

        positionBombAtPlayer(suppressTurnReveal ? null : window.currentBombTurnId);
    };

    window.addEventListener('resize', () => {
        const playerUI = bombContainer ? bombContainer.querySelector('.bomb-player-ui') : null;
        if (playerUI && playerUI.style.display !== 'none') {
            window.renderBombUsers(window.roomPlayers);
        }
    });

    if (openSettingsBombBtn) {
        openSettingsBombBtn.addEventListener('click', () => {
            window.openSettingsModal('bomb', (settings) => {
                window.bombSelectedCategories = settings.selectedCategories;
                if (window.showToast) window.showToast('설정이 저장되었습니다.', 'success');
            });
        });
    }

    if (startGameBombBtn) {
        startGameBombBtn.addEventListener('click', () => {
            const hHearts = parseInt(document.getElementById('bomb-hearts')?.value || '3');
            const hSubMode = document.getElementById('bomb-sub-mode')?.value || 'random';
            const hTimerRange = document.getElementById('bomb-timer-range')?.value || 'medium';
            const hShowTimerStr = document.getElementById('bomb-show-timer')?.value || 'true';

            socket.emit('setup bomb game', {
                hearts: hHearts,
                subMode: hSubMode,
                timerRange: hTimerRange,
                showTimer: (hShowTimerStr === 'true'),
                selectedCategories: window.bombSelectedCategories || []
            });
        });
    }

    returnLobbyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (window.gameType !== 'bomb') return;
            if (!localIsHost) return;
            socket.emit('return to lobby from bomb');
        });
    });

    if (bombWordInput) {
        // 복사/붙여넣기 및 우클릭 메뉴 원천 차단 (직접 타이핑 강제)
        bombWordInput.addEventListener('paste', (e) => {
            e.preventDefault();
            triggerDockErrorFeedback('직접 타이핑해야 합니다!');
        });
        bombWordInput.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        bombWordInput.addEventListener('keydown', (e) => {
            if (isCountingDownClient || isPassHoldClient) {
                e.preventDefault();
                return;
            }
            if (e.key === 'Enter' && isMyTurn) {
                e.preventDefault();
                const word = bombWordInput.value.trim();
                if (!word) return;

                socket.emit('submit bomb word', word);
                bombWordInput.value = '';
            }
        });

        function handleTypingEvent() {
            if (!isMyTurn) return;
            const rawVal = bombWordInput.value || '';
            const val = rawVal.trim();

            if (val && bombInputErrorBadge) {
                bombInputErrorBadge.classList.remove('show');
            }

            currentTypingState = rawVal ? { playerId: socket.id, text: rawVal } : null;
            if (rejectState && rejectState.playerId === socket.id) rejectState = null;
            refreshBubbleDOM(socket.id);

            const now = Date.now();
            if (!rawVal || now - lastTypingEmitTime >= 60) {
                lastTypingEmitTime = now;
                socket.emit('bomb typing', rawVal);
            }
        }

        bombWordInput.addEventListener('input', handleTypingEvent);
        bombWordInput.addEventListener('compositionupdate', handleTypingEvent);
        bombWordInput.addEventListener('compositionend', handleTypingEvent);
    }

    function updateCoreDisplay(passedWord, holderId) {
        if (bombCoreLabel) {
            bombCoreLabel.classList.remove('pass-normal', 'pass-fast', 'pass-critical');
            bombCoreLabel.textContent = '방금 통과한 단어';
        }
        if (bombCoreWord) {
            if (passedWord) {
                bombCoreWord.textContent = passedWord;
                bombCoreWord.classList.remove('empty');
            } else {
                bombCoreWord.textContent = '첫 단어 대기 중';
                bombCoreWord.classList.add('empty');
            }
        }
        if (bombCoreOwnerName) {
            const holder = (currentBombUsers || []).find(u => u.id === holderId);
            bombCoreOwnerName.textContent = (holder && !suppressTurnReveal) ? holder.name : '--';
        }
    }

    const MAX_RAIL_CHIPS = 9;

    function buildRailChip(word) {
        const chip = document.createElement('span');
        chip.className = 'used-word-chip';
        chip.textContent = word;
        return chip;
    }

    function markLatestChip() {
        if (!bombUsedWordsList) return;
        const chips = bombUsedWordsList.querySelectorAll('.used-word-chip');
        chips.forEach((c, i) => c.classList.toggle('latest', i === 0));
    }

    // 전체 재구성 (복구/초기화용, 애니메이션 없음)
    function updateBombTypeBadge(roundCount, isSuperBomb) {
        if (!bombTypeBadge) return;
        const totalPlayers = (window.roomPlayers || []).length;
        if (totalPlayers < 5) {
            bombTypeBadge.style.display = 'none';
            return;
        }
        bombTypeBadge.style.display = 'inline-flex';
        const curR = roundCount || 1;
        if (isSuperBomb) {
            bombTypeBadge.className = 'bomb-type-badge is-super';
            bombTypeBadge.textContent = curR >= 13 ? '슈퍼 폭탄 고정 (하트 -2)' : '슈퍼 폭탄 (하트 -2)';
        } else {
            bombTypeBadge.className = 'bomb-type-badge';
            const rem = (curR >= 13) ? 0 : (3 - (curR % 3));
            bombTypeBadge.textContent = `슈퍼 폭탄까지 ${rem}R`;
        }
    }

    function renderUsedWordChips(words) {
        if (!bombUsedWordsList) return;
        bombUsedWordsList.innerHTML = '';
        const list = (words || []).slice(-MAX_RAIL_CHIPS).reverse();
        if (list.length === 0) {
            const emptySpan = document.createElement('span');
            emptySpan.className = 'used-word-empty';
            emptySpan.textContent = '아직 사용된 단어가 없습니다';
            bombUsedWordsList.appendChild(emptySpan);
            return;
        }
        list.forEach(w => bombUsedWordsList.appendChild(buildRailChip(w)));
        markLatestChip();
    }

    // 새 단어는 왼쪽에서 인입되어 기존 단어를 오른쪽으로 밀어냄
    function pushWordToRail(word) {
        if (!bombUsedWordsList) return;
        const empty = bombUsedWordsList.querySelector('.used-word-empty');
        if (empty) empty.remove();
        const chip = buildRailChip(word);
        chip.classList.add('slide-in');
        bombUsedWordsList.insertBefore(chip, bombUsedWordsList.firstChild);
        while (bombUsedWordsList.children.length > MAX_RAIL_CHIPS) {
            bombUsedWordsList.removeChild(bombUsedWordsList.lastChild);
        }
        markLatestChip();
    }

    function updateTurnInternal(turnId) {
        isMyTurn = (turnId === socket.id);
        const holder = (currentBombUsers || []).find(u => u.id === turnId);
        const holderName = holder ? holder.name : '플레이어';

        if (bombCoreOwnerName) {
            bombCoreOwnerName.textContent = suppressTurnReveal ? '--' : holderName;
        }

        if (isCountingDownClient) {
            if (bombDockBox) bombDockBox.classList.remove('my-turn');
            if (bombTurnChip) {
                bombTurnChip.textContent = '준비';
                bombTurnChip.className = 'waiting';
            }
            if (bombWordInput) {
                bombWordInput.disabled = true;
                bombWordInput.value = '';
                bombWordInput.placeholder = '잠시 후 게임이 시작됩니다...';
            }
                return;
        }

        if (isPassHoldClient) {
            if (bombDockBox) bombDockBox.classList.remove('my-turn');
            if (bombTurnChip) {
                bombTurnChip.textContent = `${holderName} 차례`;
                bombTurnChip.className = 'waiting';
            }
            if (bombWordInput) {
                bombWordInput.disabled = true;
                bombWordInput.value = '';
                bombWordInput.placeholder = '폭탄이 넘어가는 중...';
            }
            return;
        }

        if (isMyTurn) {
            if (bombDockBox) bombDockBox.classList.add('my-turn');
            if (bombTurnChip) {
                bombTurnChip.textContent = '내 차례';
                bombTurnChip.className = 'my-turn';
            }
            if (bombWordInput) {
                bombWordInput.disabled = false;
                bombWordInput.value = '';
                bombWordInput.placeholder = '주제에 맞는 단어를 입력 후 Enter';
                bombWordInput.focus();
            }
        } else {
            if (bombDockBox) bombDockBox.classList.remove('my-turn');
            if (bombTurnChip) {
                bombTurnChip.textContent = `${holderName} 차례`;
                bombTurnChip.className = 'waiting';
            }
            if (bombWordInput) {
                bombWordInput.disabled = true;
                bombWordInput.value = '';
                bombWordInput.placeholder = `${holderName} 님이 단어를 입력하고 있습니다...`;
            }
        }
            }

    function applyFuseAndTimerVisual(timeLeft, maxTime, showTimer) {
        currentTimeLeft = typeof timeLeft === 'number' ? timeLeft : 30;
        const safeMax = Math.max(1, maxTime || 30);
        const pct = Math.max(0, Math.min(100, (currentTimeLeft / safeMax) * 100));
        if (bombFuseFill) {
            bombFuseFill.style.width = `${pct}%`;
        }

        if (bombFloatingToken) {
            if (currentTimeLeft <= redThreshold) {
                bombFloatingToken.className = 'danger';
            } else if (currentTimeLeft <= fastThreshold) {
                bombFloatingToken.className = 'fast';
            } else {
                bombFloatingToken.className = '';
            }
        }

        // 타이머 표시 OFF: 숫자와 도화선 바를 모두 숨김 (남은 시간 단서는 폭탄 박동 연출뿐)
        const hideTimer = (showTimer === false);
        const fuseTrackEl = document.getElementById('bomb-fuse-track');
        if (fuseTrackEl) fuseTrackEl.style.visibility = hideTimer ? 'hidden' : 'visible';
        if (bombTimerText) {
            bombTimerText.style.display = hideTimer ? 'none' : 'block';
            bombTimerText.textContent = `${currentTimeLeft}초`;
            bombTimerText.style.color = currentTimeLeft <= redThreshold ? '#ef4444' : '';
        }
    }

    socket.on('bomb hearts updated', (data) => {
        window.bombHearts = data.hearts || {};
        bombMaxHearts = data.maxHearts || 3;
        if (window.renderBombUsers) window.renderBombUsers(window.roomPlayers);
    });

    socket.on('bomb round started', (data) => {
        resetBombEffectClasses();
        if (typeof showContainer === 'function') showContainer('bomb-container');
        const setupArea = bombContainer.querySelector('.bomb-setup');
        const waitingArea = bombContainer.querySelector('.bomb-waiting');
        const playerUI = bombContainer.querySelector('.bomb-player-ui');

        if (setupArea) setupArea.style.display = 'none';
        if (waitingArea) waitingArea.style.display = 'none';
        if (playerUI) playerUI.style.display = 'flex';

        const sidebar = document.getElementById('right-sidebar');
        if (sidebar) sidebar.classList.add('bomb-game-active');

                if (data.hearts) window.bombHearts = data.hearts;
        if (data.maxHearts) bombMaxHearts = data.maxHearts;

        lastSenderId = null;
        activeBubbleEntry = null;
        usedWordsHistory = [];
        currentTypingState = null;
        rejectState = null;
        justReceivedId = data.currentTurnId;

        redThreshold = Math.floor(Math.random() * 4) + 4;
        fastThreshold = Math.floor(Math.random() * 5) + 10;

        switchCoreMode('normal');
        if (bombExplosionFx) {
            bombExplosionFx.style.display = 'none';
            bombExplosionFx.classList.remove('boom');
        }
        if (bombFloatingToken) {
            bombFloatingToken.style.opacity = '1';
            bombFloatingToken.className = data.isSuperBomb ? 'is-super' : '';
        }
        if (bombThemeValue) bombThemeValue.textContent = data.category || '--';
        updateBombTypeBadge(data.roundCount, !!data.isSuperBomb);

        suppressTurnReveal = true;
        window.currentBombTurnId = data.currentTurnId;
        updateCoreDisplay(null, data.currentTurnId);

        if (data.isSuperIntro) {
            flashCoreLabel('슈퍼 폭탄 등장! (폭발 시 하트 -2)', 2000);
        } else if (document.getElementById('bomb-arena')?.classList.contains('sudden-death')) {
            flashCoreLabel('최후의 2인', 2000);
        }

        renderUsedWordChips([]);
        applyFuseAndTimerVisual(data.maxTime || 30, data.maxTime || 30, data.showTimer);

        if (countdownLockTimer) {
            clearTimeout(countdownLockTimer);
            countdownLockTimer = null;
        }

                // 연출 종료 전까지 폭탄 대상(턴 강조, 폭탄 위치, 코어 보유자 이름)을 숨김
        isPassHoldClient = false;
        if (passHoldTimer) {
            clearTimeout(passHoldTimer);
            passHoldTimer = null;
        }
        justReceivedId = null;
        if (bombFloatingToken) {
            bombFloatingToken.style.transition = 'none';
            positionBombAtPlayer(null);
            bombFloatingToken.style.opacity = '0';
            void bombFloatingToken.offsetWidth;
            bombFloatingToken.style.transition = '';
        }

        const rDuration = data.rouletteDuration || 3600;
        const revealTarget = () => {
            isCountingDownClient = false;
            justReceivedId = data.currentTurnId;
            if (window.renderBombUsers) window.renderBombUsers(window.roomPlayers);
            updateTurnInternal(window.currentBombTurnId);
        };

        isCountingDownClient = true;
        if (window.renderBombUsers) window.renderBombUsers(window.roomPlayers);
        updateTurnInternal(data.currentTurnId);

        if (data.isSuperIntro) {
            // 슈퍼 폭탄 진입 라운드: 2초간 DANGER 브리핑(폭탄 숨김) 및 사이렌 효과음 재생
            if (window.soundManager && typeof window.soundManager.playSfx === 'function') {
                window.soundManager.playSfx('superBombSiren');
            }
            switchCoreMode('super-intro');
            countdownLockTimer = setTimeout(() => {
                switchCoreMode('normal');
                playLockOnMortarRoulette(data.currentTurnId, rDuration, revealTarget);
            }, 2000);
        } else {
            switchCoreMode('normal');
            playLockOnMortarRoulette(data.currentTurnId, rDuration, revealTarget);
        }
    });

    socket.on('bomb timer tick', (data) => {
        applyFuseAndTimerVisual(data.timeLeft, data.maxTime, data.showTimer);
    });

    socket.on('bomb typing update', (data) => {
        const { playerId, text } = data;
        currentTypingState = text ? { playerId, text } : null;
        if (rejectState && rejectState.playerId === playerId) {
            rejectState = null;
        }
        refreshBubbleDOM(playerId);
    });

    socket.on('bomb word rejected', (data) => {
        const { playerId, word, reason } = data;
        currentTypingState = null;
        rejectState = { playerId, word };
        refreshBubbleDOM(playerId);

        // 오답 거절 효과음 (따딱! 스냅 버저) 재생
        if (window.soundManager && typeof window.soundManager.playSfx === 'function') {
            window.soundManager.playSfx('bombWordReject');
        }

        const shortReason = reason === 'duplicate' ? '이미 사용된 단어!' : '주제에 없는 단어!';
        showCenterReject(shortReason);
        if (playerId === socket.id) {
            triggerDockErrorFeedback(shortReason);
        }

        setTimeout(() => {
            if (rejectState && rejectState.playerId === playerId && rejectState.word === word) {
                rejectState = null;
                refreshBubbleDOM(playerId);
            }
        }, 1200);
    });

    socket.on('bomb invalid word', (msg) => {
        // 클라이언트 단어 검증 오류 시 오답 효과음 재생
        if (window.soundManager && typeof window.soundManager.playSfx === 'function') {
            window.soundManager.playSfx('bombWordReject');
        }

        triggerDockErrorFeedback(msg);
        if (isMyTurn && bombWordInput) {
            bombWordInput.disabled = false;
            bombWordInput.value = '';
            bombWordInput.focus();
        }
    });

    socket.on('bomb word accepted', (data) => {
        const { word, senderId, senderName, reflect } = data;
        currentTypingState = null;
        rejectState = null;

        // 정답 통과 효과음 (크리스탈 벨 하모닉스) 재생
        if (window.soundManager && typeof window.soundManager.playSfx === 'function') {
            window.soundManager.playSfx('bombWordSuccess');
        }

        if (senderId) {
            activeBubbleEntry = { playerId: senderId, word: word };
            refreshAllBubbles();
        }

        if (word && !usedWordsHistory.includes(word)) {
            usedWordsHistory.push(word);
            pushWordToRail(word);
        }

        // 남은 시간에 비례하여 강화되는 3단계 패스 임팩트 실행
        triggerWordPassImpact(word, senderName);

    });

    socket.on('bomb turn changed', (data) => {
        const { nextTurnId, lastSenderId: senderId } = data;
        window.currentBombTurnId = nextTurnId;
                justReceivedId = nextTurnId;
        currentTypingState = null;

        // 서버가 전달한 패스 정지 시간 동안 폭탄 비행 속도를 맞추고 입력을 잠금
        const holdMs = data.holdMs || 0;
        if (passHoldTimer) {
            clearTimeout(passHoldTimer);
            passHoldTimer = null;
        }
        if (holdMs > 0) {
            isPassHoldClient = true;
            if (bombFloatingToken) {
                const ease = 'cubic-bezier(0.22, 1, 0.36, 1)';
                bombFloatingToken.style.transition = `left ${holdMs}ms ${ease}, top ${holdMs}ms ${ease}, opacity 0.2s ease`;
            }
            passHoldTimer = setTimeout(() => {
                passHoldTimer = null;
                isPassHoldClient = false;
                updateTurnInternal(window.currentBombTurnId);
            }, holdMs);
        } else {
            isPassHoldClient = false;
        }

        if (window.renderBombUsers) window.renderBombUsers(window.roomPlayers);
        updateTurnInternal(nextTurnId);
    });

        socket.on('bomb all words used', (data) => {
        // 1. 중앙 코어 긴급 단어 소진 경고
        if (bombCoreLabel) {
            bombCoreLabel.classList.remove('pass-normal', 'pass-fast', 'pass-critical');
            bombCoreLabel.classList.add('label-alert');
            bombCoreLabel.textContent = '비상 경고';
        }
        if (bombCoreWord) {
            bombCoreWord.classList.remove('empty');
            bombCoreWord.textContent = '모든 단어 소진!';
            bombCoreWord.style.color = '#ef4444';
            bombCoreWord.style.textShadow = '0 0 16px rgba(239, 68, 68, 0.8)';
        }

        // 2. 폭탄 구체 초고속 긴급 폭주(Danger) 모드
        if (bombFloatingToken) {
            bombFloatingToken.className = 'danger';
        }

        // 3. 하단 입력창 즉각 잠금 및 DANGER 알림
        if (bombWordInput) {
            bombWordInput.disabled = true;
            bombWordInput.value = '';
            bombWordInput.placeholder = '모든 단어 소진! 곧 폭발합니다.';
        }
        const turnChip = document.getElementById('bomb-turn-chip');
        if (turnChip) {
            turnChip.className = 'waiting';
            turnChip.textContent = 'DANGER';
            turnChip.style.background = '#ef4444';
            turnChip.style.color = '#ffffff';
        }
    });

    socket.on('bomb exploded', (data) => {
        stopLockOnMortarRoulette();
        isPassHoldClient = false;
        if (passHoldTimer) {
            clearTimeout(passHoldTimer);
            passHoldTimer = null;
        }
        if (countdownLockTimer) {
            clearTimeout(countdownLockTimer);
            countdownLockTimer = null;
        }
        const { loserName, victimHearts, isGameOver, winner, stats, revealWord } = data;

        currentTypingState = null;
        rejectState = null;
        activeBubbleEntry = null;
        refreshAllBubbles();

        if (bombWordInput) {
            bombWordInput.disabled = true;
            bombWordInput.value = '';
            bombWordInput.placeholder = '폭탄이 터졌습니다!';
        }


        // 1. 폭발 사운드 재생
        if (window.soundManager && typeof window.soundManager.playSfx === 'function') {
            window.soundManager.playSfx('bombExplosion');
        }

        // 2. 아레나 전체 지진 흔들림
        const arenaEl = document.getElementById('bomb-arena');
        if (arenaEl) {
            arenaEl.classList.remove('screen-explosion-shake');
            void arenaEl.offsetWidth;
            arenaEl.classList.add('screen-explosion-shake');
            setTimeout(() => arenaEl.classList.remove('screen-explosion-shake'), 600);
        }

        // 3. 중앙 코어 폭발 충격파 링 발동
        if (bombCenterCore) {
            bombCenterCore.classList.remove('core-exploded-burst');
            void bombCenterCore.offsetWidth;
            bombCenterCore.classList.add('core-exploded-burst');
            setTimeout(() => bombCenterCore.classList.remove('core-exploded-burst'), 800);
        }

        // 4. 피해자 아바타 피격 넉백 & 진동
        if (data && data.loserId) {
            positionBombAtPlayer(data.loserId);
            const victimSlot = document.querySelector(`#bomb-arena-players .arena-player-slot[data-player-id="${data.loserId}"]`);
            if (victimSlot) {
                victimSlot.classList.remove('slot-exploded');
                void victimSlot.offsetWidth;
                victimSlot.classList.add('slot-exploded');
                setTimeout(() => victimSlot.classList.remove('slot-exploded'), 800);
            }
        }

                // 5. 대형 폭발 마스코트(PickBomb2.png) 폭발 이펙트 트리거
        if (bombExplosionFx) {
            let targetLeft = '50%';
            let targetTop = '50%';
            if (data && data.loserId) {
                const victimSlot = document.querySelector(`#bomb-arena-players .arena-player-slot[data-player-id="${data.loserId}"]`);
                if (victimSlot && victimSlot.style.left && victimSlot.style.top) {
                    targetLeft = victimSlot.style.left;
                    targetTop = victimSlot.style.top;
                } else if (bombFloatingToken && bombFloatingToken.style.left) {
                    targetLeft = bombFloatingToken.style.left;
                    targetTop = bombFloatingToken.style.top;
                }
            } else if (bombFloatingToken && bombFloatingToken.style.left) {
                targetLeft = bombFloatingToken.style.left;
                targetTop = bombFloatingToken.style.top;
            }

            bombExplosionFx.style.display = 'block';
            bombExplosionFx.style.left = targetLeft;
            bombExplosionFx.style.top = targetTop;
            bombExplosionFx.classList.remove('boom');
            void bombExplosionFx.offsetWidth;
            bombExplosionFx.classList.add('boom');
            setTimeout(() => {
                bombExplosionFx.classList.remove('boom');
                bombExplosionFx.style.display = 'none';
            }, 1200);
            if (bombFloatingToken) bombFloatingToken.style.opacity = '0';
        }

        switchCoreMode('exploded');
        if (bombExplodedBadge) {
            const isSuper = (data.damage === 2);
        bombExplodedBadge.textContent = victimHearts <= 0 ? '탈락 발생' : (isSuper ? '슈퍼 폭탄 폭발 · 하트 -2' : '폭탄 폭발 · 하트 -1');
        }
        if (bombResultMsg) {
            bombResultMsg.textContent = victimHearts <= 0
                ? `${loserName} 님 탈락!`
                : `${loserName} 님 하트 차감 (남은 하트 ${victimHearts}개)`;
        }
        if (bombResultHintBox) {
            if (revealWord) {
                bombResultHintBox.style.display = 'block';
                bombResultHintBox.innerHTML = `남아있던 단어 예시: <strong>${revealWord}</strong>`;
            } else {
                bombResultHintBox.style.display = 'none';
            }
        }

        if (isGameOver) {
            setTimeout(() => {
                const formattedStats = (stats || []).map(s => ({
                    id: s.id,
                    name: s.name,
                    color: s.color || '#FC944D',
                    costume: s.costume || [],
                    stat1: `${s.hearts}개`,
                    stat2: s.isAlive ? `생존 (${s.passCount || 0}회)` : (s.eliminatedRound && s.eliminatedRound !== 999 ? `${s.eliminatedRound}R 탈락 (${s.passCount || 0}회)` : `탈락 (${s.passCount || 0}회)`),
                    isWinner: winner && s.id === winner.id
                }));

                const winnerObj = winner ? {
                    id: winner.id,
                    name: winner.name,
                    color: winner.color || '#FC944D',
                    costume: winner.costume || [],
                    scoreText: '최종 생존 우승'
                } : null;

                window.showGameResultModal({
                    mode: 'bomb',
                    modeName: '폭탄 돌리기',
                    winner: winnerObj,
                    stat1Header: '남은 하트',
                    stat2Header: '생존 결과 (패스 성공)',
                    rules: [
                        '1위: 최종 하트 보유자 (생존 우승)',
                        '동점 시: 더 늦은 라운드까지 생존한 순',
                        '라운드 동일 시: 누적 폭탄 패스(성공) 턴 수 순'
                    ],
                    stats: formattedStats,
                    history: (data && data.history) || [],
                    onConfirm: () => {
                        socket.emit('confirm result');
                        window.initBombUI(localIsHost);
                    }
                });
            }, 1450);
        }
    });

    socket.on('restore bomb state', (state) => {
        if (!state) return;
        if (typeof showContainer === 'function') showContainer('bomb-container');

        const setupArea = bombContainer.querySelector('.bomb-setup');
        const waitingArea = bombContainer.querySelector('.bomb-waiting');
        const playerUI = bombContainer.querySelector('.bomb-player-ui');

        if (setupArea) setupArea.style.display = 'none';
        if (waitingArea) waitingArea.style.display = 'none';
        if (playerUI) playerUI.style.display = 'flex';

        const sidebar = document.getElementById('right-sidebar');
        if (sidebar) sidebar.classList.add('bomb-game-active');

        window.bombHearts = state.hearts || {};
        bombMaxHearts = state.maxHearts || 3;
                window.currentBombTurnId = state.currentTurnId;
        lastSenderId = state.lastSenderId || null;
        usedWordsHistory = state.usedWords || [];
        activeBubbleEntry = (state.lastSenderId && state.lastPassedWord)
            ? { playerId: state.lastSenderId, word: state.lastPassedWord }
            : null;
        currentTypingState = null;
        rejectState = null;
        justReceivedId = null;
        isCountingDownClient = false;

        if (bombThemeValue) bombThemeValue.textContent = state.category || '--';
        updateCoreDisplay(state.lastPassedWord, state.currentTurnId);
        renderUsedWordChips(usedWordsHistory);
        applyFuseAndTimerVisual(state.timeLeft || 15, state.maxTime || 30, state.showTimer);

        if (window.renderBombUsers) window.renderBombUsers(window.roomPlayers);

        if (state.status === 'ROUND_OVER' && state.lastExplosionData) {
            if (bombFloatingToken) bombFloatingToken.style.opacity = '0';
            switchCoreMode('exploded');
            const exp = state.lastExplosionData;
            if (bombExplodedBadge) {
                const isSuperExp = (exp.damage === 2);
            bombExplodedBadge.textContent = exp.victimHearts <= 0 ? '탈락 발생' : (isSuperExp ? '슈퍼 폭탄 폭발 · 하트 -2' : '폭탄 폭발 · 하트 -1');
            }
            if (bombResultMsg) {
                bombResultMsg.textContent = exp.victimHearts <= 0
                    ? `${exp.loserName} 님 탈락!`
                    : `${exp.loserName} 님 하트 차감 (남은 하트 ${exp.victimHearts}개)`;
            }
            if (bombResultHintBox) {
                if (exp.revealWord) {
                    bombResultHintBox.style.display = 'block';
                    bombResultHintBox.innerHTML = `남아있던 단어 예시: <strong>${exp.revealWord}</strong>`;
                } else {
                    bombResultHintBox.style.display = 'none';
                }
            }
            if (bombWordInput) bombWordInput.disabled = true;
        } else {
            switchCoreMode('normal');
            if (bombFloatingToken) bombFloatingToken.style.opacity = '1';
            updateTurnInternal(state.currentTurnId);
        }
    });

    function showSpeechBubble(playerId, text) {
        const playerUI = bombContainer.querySelector('.bomb-player-ui');
        if (!playerUI || playerUI.style.display === 'none') return;

        const slot = document.querySelector(`#bomb-arena-players .arena-player-slot[data-player-id="${playerId}"]`);
        if (!slot) return;

        const existing = slot.querySelector('.speech-bubble');
        if (existing) existing.remove();

        const bubble = document.createElement('div');
        bubble.className = 'speech-bubble';
        bubble.textContent = text.length > 20 ? text.slice(0, 20) + '…' : text;
        slot.appendChild(bubble);

        setTimeout(() => {
            bubble.style.opacity = '0';
            setTimeout(() => { if (bubble.parentNode) bubble.remove(); }, 400);
        }, 3000);
    }

    socket.on('chat message', (data) => {
        if (data.socketId) {
            showSpeechBubble(data.socketId, data.message);
        }
    });

    window.updateBombRoleUI = function (isHost) {
        localIsHost = isHost;
        const setupArea = bombContainer.querySelector('.bomb-setup');
        const waitingArea = bombContainer.querySelector('.bomb-waiting');
        const playerUI = bombContainer.querySelector('.bomb-player-ui');

        if (setupArea) setupArea.style.display = 'none';
        if (waitingArea) waitingArea.style.display = 'none';

        const isGamePlaying = playerUI && playerUI.style.display !== 'none';
        if (!isGamePlaying && window.gameType === 'bomb') {
            if (typeof showContainer === 'function') {
                showContainer('lobby-container');
                const stageSelection = document.getElementById('selection-stage');
                const stageWaiting = document.getElementById('waiting-stage');
                if (stageSelection) stageSelection.style.display = 'none';
                if (stageWaiting) stageWaiting.style.display = 'flex';
            }
        }
    };

    socket.on('game changed', (game) => {
        if (game === 'lobby') {
            window.bombHearts = null;
            window.currentBombTurnId = null;
            window.initBombUI(localIsHost);
        }
    });

    function updateBombLobbySettingsUI(settings) {
        const previewEl = document.getElementById('bomb-lobby-settings-preview');
        const hostPreviewEl = document.getElementById('bomb-host-settings-preview');
        if (!settings) return;


        let timerText = "보통 (30~55초)";
        if (settings.timerRange === 'short') timerText = "짧게 (15~30초)";
        else if (settings.timerRange === 'long') timerText = "길게 (50~80초)";

        const showTimerText = settings.showTimer ? "ON" : "OFF";
        const categoriesText = settings.selectedCategories && settings.selectedCategories.length > 0
            ? settings.selectedCategories.join(', ')
            : "전체 랜덤";

        const html = `
            <div class="lobby-settings-title" style="justify-content: center; font-size: 0.95rem; margin-bottom: 14px; color: #fdcb6e; font-weight: 800; border-bottom: 1px solid rgba(253,203,110,0.15); padding-bottom: 6px;">게임 설정</div>
            <div class="lobby-settings-grid">
                <div class="lobby-settings-item">
                    <span class="lobby-settings-label">시작 목숨</span>
                    <span class="lobby-settings-val"><span style="background: rgba(230, 126, 34, 0.12); border: 1px solid rgba(230, 126, 34, 0.3); color: #fdcb6e; padding: 2px 8px; border-radius: 6px; font-size: 0.8rem;">${settings.hearts}개</span></span>
                </div>
                <div class="lobby-settings-item">
                    <span class="lobby-settings-label">폭탄 시간</span>
                    <span class="lobby-settings-val"><span style="background: rgba(230, 126, 34, 0.12); border: 1px solid rgba(230, 126, 34, 0.3); color: #fdcb6e; padding: 2px 8px; border-radius: 6px; font-size: 0.8rem;">${timerText}</span></span>
                </div>
                <div class="lobby-settings-item">
                    <span class="lobby-settings-label">타이머 표시</span>
                    <span class="lobby-settings-val"><span style="background: rgba(230, 126, 34, 0.12); border: 1px solid rgba(230, 126, 34, 0.3); color: #fdcb6e; padding: 2px 8px; border-radius: 6px; font-size: 0.8rem;">${showTimerText}</span></span>
                </div>
                <div class="lobby-settings-item" style="grid-column: span 2; text-align: center; margin-top: 4px;">
                    <span class="lobby-settings-label" style="margin-bottom: 4px;">선택 카테고리</span>
                    <span class="lobby-settings-val"><span style="background: rgba(230, 126, 34, 0.12); border: 1px solid rgba(230, 126, 34, 0.3); color: #fdcb6e; padding: 4px 12px; border-radius: 8px; font-size: 0.85rem; font-weight: bold; display: inline-block; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${categoriesText}">${categoriesText}</span></span>
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
        if (data && data.bomb) {
            lastBombSettings = data.bomb;
            updateBombLobbySettingsUI(data.bomb);
        }
    });

})();
