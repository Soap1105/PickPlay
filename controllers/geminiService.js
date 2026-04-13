const { GoogleGenerativeAI } = require("@google/generative-ai");

// .env에 설정된 API 키를 가져옵니다.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const geminiService = {
    async generateBingoWords(topic) {
        try {
            // Google Search Grounding 사용: AI의 기억이 아닌 검색 결과에서 직접 추출
            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                tools: [{ googleSearch: {} }]
            });

            const prompt = `
너는 빙고 게임을 위해 정확하고 일관된 단어 목록을 생성하는 전문가 AI야.
주제: "${topic}"

### [필수 지침 - 원칙의 우선순위 (Strict Hierarchy)]
1. **제1원칙 (정확성)**: 무조건 해당 주제 "${topic}"에 완벽히 부합하는 **실존하는 고유 명칭**이어야 해. 개수를 채우기 위해 근거 없는 단어를 지어내는 것은 절대 금지야.
2. **제2원칙 (수량 및 속도)**: 실존하는 단어를 **최소 30개에서 최대 50개** 범위로 찾아내. 응답 속도가 중요하므로, 35개 전후의 확실한 단어를 찾았다면 무리해서 더 찾지 말고 **즉시 탐색을 멈추고 반환(Early Exit)**해. 실존 단어가 30개조차 되지 않을 때만 **실패(error)**를 반환해.
3. **제3원칙 (대중성 우선)**: 무조건 대중에게 가장 친숙하고 유명한 단어(주인공, 간판 캐릭터 등) 위주로 추출해. 억지로 개수를 채우기 위해 인지도가 떨어지는 마이너한 타겟이나 애매한 단어를 무리하게 끼워넣는 것은 금지야. 버릴 건 과감히 버려.

### [카테고리별 특화 규칙]
1. **인물/캐릭터**: 일본식(성 이름), 서양식/한국식 표준 풀네임을 사용해. 관계 묘사(X의 언니 등)는 금지하고 진짜 이름만 사용해.
2. **미디어(노래, 영화 등)**: 오직 **순수 제목**만 추출해. 아티스트명, 제작사, 연도 등 부가 정보는 제외해.
3. **제품/브랜드(식품 등)**: 카테고리명(라면)이 아닌 구체적인 **고유 상품명**(신라면) 위주로 구성해.

### [범용 메타데이터 필터링 (강력 금지)]
등급(3성/엘다인/SSR 등), 스토리구분(메인/서브), 시스템 메뉴(픽업/공지), 광고 문구, 관련 없는 지명 등은 절대 포함하지 마. 
"삼성(3성 오해)"이나 "티아나(디아나 오해)" 같은 고질적인 오타나 오역을 주의해.

### [단어 품질 규칙]
1. **중복 금지**: words 배열 안에 동일하거나 의미상 같은 단어를 중복으로 넣지 마. (예: "나루토"와 "우즈마키 나루토"를 동시에 넣는 것 금지)
2. **길이 제한**: 각 단어는 최대 12글자 이내여야 해. 12글자를 초과하는데 널리 쓰이는 공식 줄임말조차 없다면, **억지로 뎅강 자르지 말고 아예 그 단어는 목록에서 빼(탈락시켜).** 다른 짧은 단어로 대체할 것.

### [Self-Correction 최종 검토]
결과를 출력하기 직전에 모든 단어를 훑어보고, "이 단어가 주제에 맞는 진짜 이름이 맞는가?", "중복은 없는가?", "12글자를 초과하는 단어는 없는가?"를 자문해라. 개수를 채우려고 '이상한 단어'를 넣었다면 즉시 삭제하고 정답으로 교체하거나, 정답이 없으면 실패를 반환해.

[출력 형식 - JSON만, 다른 텍스트 절대 금지]
성공: { "status": "success", "words": ["단어1", "단어2", ...최소 30개] }
실패: { "status": "error", "message": "'${topic}'은(는) 검색 결과에서 30개를 찾을 수 없습니다. 더 유명하거나 넓은 주제를 입력해주세요." }
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

            const parsed = JSON.parse(responseText.substring(startIdx, endIdx + 1));
            
            // [강제 방어 로직] AI가 프롬프트를 무시하고 중복을 넣거나 50개를 넘길 경우 자바스크립트 단에서 강제 커팅
            if (parsed.status === "success" && Array.isArray(parsed.words)) {
                parsed.words = [...new Set(parsed.words)].slice(0, 50);
            }
            
            return parsed;

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

            if (error.message === "TIMEOUT") {
                return { status: "error", message: "AI 응답 시간이 초과되었습니다. 주제가 너무 모호하거나 오타가 있는지 확인해주세요." };
            }

            return { status: "error", message: "AI 서버 응답이 지연되거나 형식이 깨졌습니다. 다시 한 번 생성 버튼을 눌러주세요!" };
        }
    },

    // Google Search Grounding 미지원 시 폴백용 (일반 주제용)
    async generateBingoWordsNoGrounding(topic) {
        try {
            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                generationConfig: { responseMimeType: "application/json" }
            });

            const prompt = `
너는 빙고 게임 단어 풀 40~50개를 만들어주는 AI야. 주제: "${topic}"

### [필수 지침]
- **Entity Purity**: 주제 "${topic}"에 완벽히 부합하는 **고유 명칭**만 추출. 설명, 관계 묘사, 시스템 용어 절대 금지.
- **네이밍 규칙**: 각 문화권 표준 풀네임 준수, '성 이름' 순서 준수.
- **범용 필터링**: 등급(3성/엘다인), 스토리구분(메인/서브), 아이템/음식 명칭 절대 배제. (12글자 초과 시 억지로 자르지 말고 그냥 그 단어는 통째로 배제할 것)
- **Self-Correction**: 출력 전 스스로 블랙리스트 및 명칭 순서를 검토하여 부적절한 단어는 수정할 것.
- 30개 채우기 불가능하거나 부적절한 주제면 error 반환.

성공: { "status": "success", "words": ["단어1", ...최소 30개] }
실패: { "status": "error", "message": "적합하지 않은 주제입니다. 더 넓은 범위를 입력해주세요." }
            `;

            // 타임아웃 래퍼 함수 (90초 제한 - gemini-2.5-flash thinking 감안)
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("AI 응답 시간 초과 (90초 제한). 주제가 너무 모호하거나 네트워크가 불안정합니다. 잠시 후 다시 시도해주세요.")), 90000)
            );
            const result = await Promise.race([model.generateContent(prompt), timeoutPromise]);
            let responseText = result.response.text();
            responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(responseText);

            if (parsed.status === "success" && Array.isArray(parsed.words)) {
                parsed.words = [...new Set(parsed.words)].slice(0, 50);
            }
            return parsed;

        } catch (error) {
            console.error("Fallback Gemini Error:", error);
            if (error.status === 429) {
                return { status: "error", message: "무료 API 제공량을 초과했습니다. 약 1분 뒤에 다시 시도해주세요 ⏳" };
            }

            if (error.message === "TIMEOUT") {
                return { status: "error", message: "AI 응답 시간이 초과되었습니다. 주제가 너무 모호하거나 오타가력 확인해주세요." };
            }

            return { status: "error", message: "AI 서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요." };
        }
    }
};

module.exports = geminiService;
