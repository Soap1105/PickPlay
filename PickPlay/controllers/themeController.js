const ThemeModel = require('../models/themeModel');

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