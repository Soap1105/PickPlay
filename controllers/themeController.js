const ThemeModel = require('../models/themeModel');
const geminiService = require('./geminiService');

exports.getThemes = async (req, res) => {
    try {
        // 클라이언트가 보낸 내 식별자 확인
        const userId = req.query.userId;
        if (!userId) return res.json([]); // 식별자 없으면 빈 목록

        const themes = await ThemeModel.getThemesByUserId(userId);
        res.json(themes);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'DB 오류 발생' });
    }
};

exports.getThemeById = async (req, res) => {
    try {
        const theme = await ThemeModel.getThemeById(req.params.id);
        if (theme) {
            if (typeof theme.words === 'string') theme.words = JSON.parse(theme.words);
            res.json(theme);
        } else {
            res.status(404).json({ error: '테마 없음' });
        }
    } catch (err) {
        res.status(500).json({ error: 'DB 오류 발생' });
    }
};

exports.createTheme = async (req, res) => {
    const { title, words, userId } = req.body;

    if (!userId) return res.status(400).json({ error: '사용자 식별자가 없습니다.' });
    if (!words || words.length !== 25) return res.status(400).json({ error: '단어는 25개여야 합니다.' });

    try {
        const themeId = await ThemeModel.createTheme(userId, title, words);
        res.json({ success: true, themeId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '저장 실패' });
    }
};

// 방(Room)별 및 사용자별 AI 생성 쿨타임 관리 맵 (단위: ms)
const AI_COOLDOWN_MAP = {
    rooms: {}, // roomId: timestamp
    users: {}  // userId: timestamp
};
const COOLDOWN_DURATION = 30 * 1000; // 30초

// 진행 중인 AI 주제 생성 상태 저장용 맵 (roomId -> { step, percent })
const ACTIVE_GENERATIONS = {};
exports.ACTIVE_GENERATIONS = ACTIVE_GENERATIONS;

// [NEW] AI 빙고 주제 자동 생성 (DB 캐싱 + 실시간 진행률 중계 + 서버 복합 쿨타임 보호)
exports.generateThemeWords = async (req, res) => {
    const { title, userId, roomId } = req.body;
    const io = req.io;
    
    if (!title) return res.status(400).json({ error: '주제가 필요합니다.' });
    if (!userId) return res.status(400).json({ error: '사용자 식별자가 없습니다.' });

    // 진행률 중계 헬퍼 함수
    const reportProgress = (step, percent, extra = {}) => {
        if (io && roomId) {
            ACTIVE_GENERATIONS[roomId] = { step, percent, ...extra };
            io.to(roomId).emit('theme progress', { step, percent, ...extra });
        }
    };

    try {
        reportProgress("기존 단어 목록 확인 중...", 10);
        
        // 1. DB 캐싱 확인 (이미 만들어진 주제인지)
        const cachedTheme = await ThemeModel.getThemeByTitle(title);
        if (cachedTheme) {
            console.log(`[Cache Hit] '${title}' - DB에서 바로 가져옵니다.`);
            reportProgress("기존 단어 목록 발견! 즉시 로드 중...", 100);
            delete ACTIVE_GENERATIONS[roomId]; // 캐시 히트는 즉시 완료되므로 캐시 삭제
            
            if (typeof cachedTheme.words === 'string') {
                cachedTheme.words = JSON.parse(cachedTheme.words);
            }
            return res.json({ success: true, themeId: cachedTheme.id, words: cachedTheme.words, source: 'cache' });
        }

        // 2. 쿨타임 검증 (캐시 미스로 인해 실제 AI 호출이 필요한 시점에만 검사)
        const now = Date.now();
        
        // 방 기준 쿨타임 검사
        if (roomId && AI_COOLDOWN_MAP.rooms[roomId]) {
            const timePassed = now - AI_COOLDOWN_MAP.rooms[roomId];
            if (timePassed < COOLDOWN_DURATION) {
                const remaining = Math.ceil((COOLDOWN_DURATION - timePassed) / 1000);
                reportProgress("쿨타임 대기 중...", 0);
                delete ACTIVE_GENERATIONS[roomId];
                return res.status(429).json({ 
                    error: 'cooldown', 
                    message: `AI 테마 생성 쿨타임 대기 중입니다. (남은 시간: ${remaining}초)`,
                    remainingTime: remaining
                });
            }
        }

        // 유저 기준 쿨타임 검사
        if (userId && AI_COOLDOWN_MAP.users[userId]) {
            const timePassed = now - AI_COOLDOWN_MAP.users[userId];
            if (timePassed < COOLDOWN_DURATION) {
                const remaining = Math.ceil((COOLDOWN_DURATION - timePassed) / 1000);
                reportProgress("쿨타임 대기 중...", 0);
                delete ACTIVE_GENERATIONS[roomId];
                return res.status(429).json({ 
                    error: 'cooldown', 
                    message: `과도한 요청 방지를 위해 쿨타임 대기 중입니다. (남은 시간: ${remaining}초)`,
                    remainingTime: remaining
                });
            }
        }

        reportProgress("주제 관련 단어 수집 중 (약 10~20초)...", 30);
        console.log(`[Cache Miss] '${title}' - AI에게 생성을 요청합니다.`);
        
        // 3. DB에 없으면 Gemini 호출
        const aiResult = await geminiService.generateBingoWords(title);

        if (aiResult.status === "error") {
            reportProgress("단어 생성 실패: 부적절하거나 너무 좁은 주제입니다.", 0);
            delete ACTIVE_GENERATIONS[roomId];
            return res.status(400).json({ error: aiResult.message });
        }

        if (aiResult.status === "success" && aiResult.words && aiResult.words.length >= 25) {
            reportProgress("단어 필터링 및 품질 검수 중...", 70);
            
            // 중복 제거
            aiResult.words = [...new Set(aiResult.words)];
            
            if (aiResult.words.length < 25) {
                reportProgress("단어 필터링 결과 수량 부족으로 다시 진행 중...", 0);
                delete ACTIVE_GENERATIONS[roomId];
                return res.status(500).json({ error: "중복 제거 후 25개 이하로 남았습니다. 다시 시도해주세요." });
            }
            
            reportProgress("단어판 배치 준비 중...", 90);
            // 4. AI가 생성 성공 시 -> DB 저장
            const themeId = await ThemeModel.createTheme(userId, title, aiResult.words, 'System-GeminiAI');
            
            // ★ AI 호출 최종 성공 시에만 쿨타임 타임스탬프 갱신 ★
            const finalNow = Date.now();
            if (roomId) AI_COOLDOWN_MAP.rooms[roomId] = finalNow;
            if (userId) AI_COOLDOWN_MAP.users[userId] = finalNow;

            reportProgress("완료! 단어판에 적용합니다.", 100, { words: aiResult.words });
            delete ACTIVE_GENERATIONS[roomId];
            return res.json({ success: true, themeId, words: aiResult.words, source: 'ai' });
        } else {
            reportProgress("단어 목록 구성에 실패했습니다.", 0);
            delete ACTIVE_GENERATIONS[roomId];
            return res.status(500).json({ error: 'AI가 단어 풀을 충분히 생성하지 못했습니다.' });
        }

    } catch (err) {
        console.error(err);
        // Gemini 503 과부하 에러 여부 판별
        const isUnavailable = err.status === 503 || (err.message && err.message.includes('503'));
        const errMsg = isUnavailable 
            ? "단어 생성 실패: 서버가 혼잡합니다. 잠시 후 다시 시도해 주세요."
            : "단어 생성 실패: 오류가 발생했습니다.";
        
        reportProgress(errMsg, 0);
        delete ACTIVE_GENERATIONS[roomId];
        res.status(500).json({ error: errMsg });
    }
};

exports.deleteTheme = async (req, res) => {
    const userId = req.query.userId; 
    const themeId = req.params.id;

    try {
        // 1. 삭제하려는 테마 정보 먼저 조회
        const theme = await ThemeModel.getThemeById(themeId);
        
        if (!theme) {
            return res.status(404).json({ error: '테마가 존재하지 않습니다.' });
        }

        // 2. [핵심] 작성자가 'System'이면 삭제 절대 불가!
        if (theme.creator === 'System') {
            return res.status(403).json({ error: '기본 테마는 삭제할 수 없습니다!' });
        }

        // 3. 내 테마인지 확인하고 삭제 (기존 로직)
        // 주의: ThemeModel.deleteTheme 함수는 userId가 일치해야만 지우도록 되어있으므로
        // 'System'이 만든 걸 내 userId로 지우려 해도 어차피 안 지워지긴 합니다.
        // 하지만 명확한 에러 메시지를 위해 위 2번 코드를 넣는 게 좋습니다.

        const affected = await ThemeModel.deleteTheme(themeId, userId);
        if (affected > 0) res.json({ success: true });
        else res.status(403).json({ error: '삭제 권한이 없거나 이미 삭제됨' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '삭제 실패' });
    }
};