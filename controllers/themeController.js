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

// [NEW] AI 빙고 주제 자동 생성 (DB 캐싱)
exports.generateThemeWords = async (req, res) => {
    const { title, userId } = req.body;
    
    if (!title) return res.status(400).json({ error: '주제가 필요합니다.' });
    if (!userId) return res.status(400).json({ error: '사용자 식별자가 없습니다.' });

    try {
        // 1. DB 캐싱 확인 (이미 만들어진 주제인지)
        const cachedTheme = await ThemeModel.getThemeByTitle(title);
        if (cachedTheme) {
            console.log(`[Cache Hit] '${title}' - DB에서 바로 가져옵니다.`);
            // words가 문자열이면 파싱
            if (typeof cachedTheme.words === 'string') {
                cachedTheme.words = JSON.parse(cachedTheme.words);
            }
            return res.json({ success: true, themeId: cachedTheme.id, words: cachedTheme.words, source: 'cache' });
        }

        console.log(`[Cache Miss] '${title}' - AI에게 생성을 요청합니다.`);
        // 2. DB에 없으면 Gemini 호출
        const aiResult = await geminiService.generateBingoWords(title);

        if (aiResult.status === "error") {
            // 주제가 너무 좁거나 부적절할 경우 실패 응답
            return res.status(400).json({ error: aiResult.message });
        }

        if (aiResult.status === "success" && aiResult.words && aiResult.words.length >= 25) {
            // 중복 제거 (Grounding 시 두 번 나오는 경우 대비)
            aiResult.words = [...new Set(aiResult.words)];
            
            if (aiResult.words.length < 25) {
                return res.status(500).json({ error: "중복 제거 후 25개 이하로 남았습니다. 다시 시도해주세요." });
            }
            
            // 3. AI가 생성 성공 시 -> 학교 DB에 시스템 작성자로 추가
            const themeId = await ThemeModel.createTheme(userId, title, aiResult.words, 'System-GeminiAI');
            return res.json({ success: true, themeId, words: aiResult.words, source: 'ai' });
        } else {
            return res.status(500).json({ error: 'AI가 단어 풀을 충분히 생성하지 못했습니다.' });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '주제 생성 및 저장 실패' });
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