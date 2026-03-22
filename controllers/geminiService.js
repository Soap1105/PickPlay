const { GoogleGenerativeAI } = require("@google/generative-ai");

// .env에 설정된 API 키를 가져옵니다.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const geminiService = {
    async generateBingoWords(topic) {
        try {
            // Google Search Grounding 사용: AI의 기억이 아닌 검색 결과에서 직접 추출
            const model = genAI.getGenerativeModel({ 
                model: "gemini-2.5-flash-lite",
                tools: [{ googleSearch: {} }]
            });

            const prompt = `
너는 빙고 게임을 위한 단어 목록을 만들어주는 AI야.
주제: "${topic}"

★ [언어 규칙 - 반드시 지킬 것] 출력하는 모든 단어는 반드시 한국어로만 표기해. 영어 이름도 한국어 발음 표기로 통일해 (예: Deadlock → 데드록, Sage → 세이지, Fade → 페이드). 영어와 한국어가 섞이는 것은 절대 금지!

[핵심 지침 - 반드시 따를 것]
지금 즉시 구글에서 "${topic} 목록" 또는 "${topic} list"를 검색해서 실제 검색 결과 페이지에서 발견한 이름들을 그대로 추출해.

★ 검색 결과에서 직접 발견한 이름만 포함해. 
★ 네 기억이나 학습 데이터에서 꺼낸 이름은 절대 포함하지 마.
★ 검색 결과에서 찾은 이름이 40개 미만이면 억지로 채우지 말고 error를 반환해.
★ 주제가 게임/애니/만화 캐릭터라면 해당 작품의 공식 위키/나무위키 페이지를 찾아서 거기서 이름을 추출해.

[추가 규칙]
- 주제가 시판 식품(아이스크림, 과자 등)이면 실제 제품명을 검색해서 추출해.
- 단어가 주제 범위를 벗어나거나, 40개를 검색 결과에서 실제로 찾을 수 없으면 반드시 error.
- 밈, 오타, 인사말, 단일 사물은 무조건 error.

[출력 형식 - JSON만, 다른 텍스트 절대 금지]
성공: { "status": "success", "words": ["이름1", "이름2", ...최소 40개] }
실패: { "status": "error", "message": "'${topic}'은(는) 검색 결과에서 40개를 찾을 수 없습니다. 더 유명하거나 넓은 주제를 입력해주세요." }
            `;

            const result = await model.generateContent(prompt);
            let responseText = result.response.text();
            
            // 마크다운 코드블럭 제거
            responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
            
            // 괄호 짝애기로 정확한 JSON 합체만 추출 (Grounding 시 뽙는 URL/각주 텍스트 제거)
            const startIdx = responseText.indexOf('{');
            if (startIdx === -1) throw new Error("No JSON found in response");
            
            let depth = 0;
            let endIdx = -1;
            for (let i = startIdx; i < responseText.length; i++) {
                if (responseText[i] === '{') depth++;
                else if (responseText[i] === '}') {
                    depth--;
                    if (depth === 0) { endIdx = i; break; }
                }
            }
            
            if (endIdx === -1) throw new Error("Malformed JSON: no closing brace");
            
            return JSON.parse(responseText.substring(startIdx, endIdx + 1));

        } catch (error) {
            console.error("Gemini API Error:", error);
            
            // Google Search Grounding이 무료 티어에서 지원 안 될 경우 폴백
            if (error.status === 400 || (error.message && error.message.includes('googleSearch'))) {
                console.log("[Grounding 미지원] 일반 모드로 폴백합니다.");
                return geminiService.generateBingoWordsNoGrounding(topic);
            }
            
            if (error.status === 429) {
                return { status: "error", message: "무료 API 일일/분당 제공량을 초과했습니다. 약 1분 뒤에 다시 시도해주세요 ⏳" };
            }
            
            return { status: "error", message: "AI 서버 응답이 지연되거나 형식이 깨졌습니다. 다시 한 번 생성 버튼을 눌러주세요!" };
        }
    },

    // Google Search Grounding 미지원 시 폴백용 (일반 주제용)
    async generateBingoWordsNoGrounding(topic) {
        try {
            const model = genAI.getGenerativeModel({ 
                model: "gemini-2.5-flash-lite",
                generationConfig: { responseMimeType: "application/json" }
            });

            const prompt = `
너는 빙고 게임 단어 풀 40~50개를 만들어주는 AI야. 주제: "${topic}"
반드시 아래 JSON 형식으로만 답해.
오직 해당 주제 범위 안의 단어만 사용해. 절대 관련 카테고리로 범위 확장 금지.
40개 채우기 불가능하거나 무관한 주제면 error 반환.
주제가 시판 식품이면 실제 제품명으로 40개 이상.

성공: { "status": "success", "words": ["단어1", ...최소 40개] }
실패: { "status": "error", "message": "적합하지 않은 주제입니다. 더 넓은 범위를 입력해주세요." }
            `;

            const result = await model.generateContent(prompt);
            let responseText = result.response.text();
            responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
            return JSON.parse(responseText);

        } catch (error) {
            console.error("Fallback Gemini Error:", error);
            if (error.status === 429) {
                return { status: "error", message: "무료 API 제공량을 초과했습니다. 약 1분 뒤에 다시 시도해주세요 ⏳" };
            }
            return { status: "error", message: "AI 서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요." };
        }
    }
};

module.exports = geminiService;
