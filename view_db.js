const db = require('./config/db');

async function viewDatabase() {
    try {
        console.log("데이터베이스에서 테마 목록을 불러오는 중...\n");
        // themes 테이블에서 id, 제목, 작성자, 생성자 정보를 가져옵니다.
        // 단어(words) 데이터는 표 공간을 너무 많이 차지하므로 제외하고 요약 정보만 표시합니다.
        const [rows] = await db.query("SELECT id, title, creator, user_id FROM themes ORDER BY id DESC");
        
        if (rows.length === 0) {
            console.log("현재 데이터베이스에 저장된 테마가 없습니다.");
        } else {
            // 터미널에 예쁜 표 형태로 데이터 출력
            console.table(rows);
            console.log(`\n총 ${rows.length}개의 주제가 저장되어 있습니다.`);
        }
    } catch (error) {
        console.error("데이터베이스 조회 중 오류 발생:", error);
    } finally {
        process.exit(0); // 스크립트 종료
    }
}

viewDatabase();
