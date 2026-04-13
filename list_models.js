require('dotenv').config();

async function listModels() {
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
        const data = await res.json();
        
        if (data.models) {
            console.log("=== 현재 사용 가능한 생성형 AI 모델 목록 ===");
            data.models.forEach(m => {
                if(m.supportedGenerationMethods.includes("generateContent")) {
                    console.log(m.name.replace('models/', ''));
                }
            });
            console.log("=========================================");
        } else {
            console.log("API 키 오류 또는 불러오기 실패:", data);
        }
    } catch (e) {
        console.error("실행 중 오류 발생:", e);
    }
}

listModels();
