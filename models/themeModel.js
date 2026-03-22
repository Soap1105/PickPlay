const db = require('../config/db');

class ThemeModel {
    // [수정] 내 테마 + 시스템 기본 테마 가져오기
    static async getThemesByUserId(userId) {
        const [rows] = await db.query(
            "SELECT * FROM themes WHERE user_id = ? OR creator = 'System' ORDER BY id DESC", 
            [userId]
        );
        return rows;
    }

    static async getThemeById(id) {
        const [rows] = await db.query('SELECT * FROM themes WHERE id = ?', [id]);
        return rows[0];
    }

    // 테마 제목으로 찾기 (DB 캐싱용)
    static async getThemeByTitle(title) {
        const [rows] = await db.query('SELECT * FROM themes WHERE title = ?', [title]);
        return rows[0];
    }

    // 테마 저장
    static async createTheme(userId, title, words, creatorName = '익명') {
        const [result] = await db.query(
            'INSERT INTO themes (title, creator, words, user_id) VALUES (?, ?, ?, ?)',
            [title, creatorName, JSON.stringify(words), userId]
        );
        return result.insertId;
    }

    // 테마 삭제
    static async deleteTheme(id, userId) {
        const [result] = await db.query(
            'DELETE FROM themes WHERE id = ? AND user_id = ?', 
            [id, userId]
        );
        return result.affectedRows;
    }
}

module.exports = ThemeModel;