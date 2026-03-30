require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 공용 범용 프롬프트 생성 함수 (최종 버전 반영)
function getUniversalPrompt(topic) {
  return `
너는 빙고 게임을 위해 정확하고 일관된 단어 목록을 생성하는 전문가 AI야.
주제: "${topic}"

### [필수 지침 - 원칙의 우선순위 (Strict Hierarchy)]
1. **제1원칙 (정확성)**: 무조건 해당 주제 "${topic}"에 완벽히 부합하는 **실존하는 고유 명칭**이어야 해. 40개를 채우기 위해 근거 없는 단어를 지어내는 것은 절대 금지야.
2. **제2원칙 (수량)**: 1원칙을 지키면서 **최소 40개**를 찾아내. 만약 실존하는 단어가 40개 미만이라면 억지로 채우지 말고 무조건 **실패(error)**를 반환해.
3. **제3원칙 (대중성)**: 1, 2원칙이 충족되는 선에서, 가급적 **한국인에게 친숙하고 대중적인 단어**를 우선적으로 리스트 상단에 배치해. 희귀하고 전문적인 단어는 40개를 채우기 위해 부족한 경우에만 보조적으로 포함해.

### [카테고리별 특화 규칙]
1. **인물/캐릭터**: 일본식(성 이름), 서양식/한국식 표준 풀네임을 사용해. 관계 묘사(X의 언니 등)는 금지하고 진짜 이름만 사용해.
2. **미디어(노래, 영화 등)**: 오직 **순수 제목**만 추출해. 아티스트명, 제작사, 연도 등 부가 정보는 제외해.
3. **제품/브랜드(식품 등)**: 카테고리명(라면)이 아닌 구체적인 **고유 상품명**(신라면) 위주로 구성해.

### [범용 메타데이터 필터링 (강력 금지)]
등급(3성/엘다인/SSR 등), 스토리구분(메인/서브), 시스템 메뉴(픽업/공지), 광고 문구, 관련 없는 지명 등은 절대 포함하지 마. 
"삼성(3성 오해)"이나 "티아나(디아나 오해)" 같은 고질적인 오타나 오역을 주의해.

### [단어 품질 규칙 - 테스트 중]
1. **중복 금지**: words 배열 안에 동일하거나 의미상 같은 단어를 중복으로 넣지 마. (예: "나루토"와 "우즈마키 나루토"를 동시에 넣는 것 금지)
2. **길이 제한**: 각 단어는 최대 12글자 이내로 작성해. 초과하는 경우 널리 통용되는 줄임말이나 통칭을 사용해. 줄임말도 없으면 해당 단어는 제외해.

### [Self-Correction 최종 검토]
결과를 출력하기 직전에 모든 단어를 훑어보고, "이 단어가 주제에 맞는 진짜 이름이 맞는가?", "중복은 없는가?", "12글자를 초과하는 단어는 없는가?"를 자문해라. 40개를 채우려고 '이상한 단어'를 넣었다면 즉시 삭제하고 정답으로 교체하거나, 정답이 없으면 실패를 반환해.

[출력 형식 - JSON만]
성공: { "status": "success", "words": ["단어1", "단어2", ...최소 40개] }
실패: { "status": "error", "message": "'${topic}'에 해당하는 실존 단어를 40개 이상 찾을 수 없습니다." }
  `;
}

async function runTest(topic) {
  if (!topic) {
    console.log("❌ 오류: 주제를 입력해주세요.");
    console.log("사용법: node test_new_prompt.js \"주제명\"");
    process.exit(1);
  }

  console.log(`\n🔍 AI가 '${topic}' 주제로 단어를 뽑고 있습니다...`);
  console.log("-----------------------------------------");
  
  try {
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash", 
        tools: [{ googleSearch: {} }] 
    });

    // 타임아웃 래퍼 함수 (60초 제한 - gemini-2.5-flash는 thinking 과정으로 느릴 수 있음)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("AI 응답 시간 초과 (60초 제한). 주제가 너무 모호하거나 오타가 있는지 확인해주세요.")), 60000)
    );

    const generatePromise = model.generateContent(getUniversalPrompt(topic));
    
    // 타임아웃과 실제 요청 중 먼저 끝나는 쪽을 선택
    const result = await Promise.race([generatePromise, timeoutPromise]);
    let responseText = result.response.text();
    
    // JSON 추출 로직
    const startIdx = responseText.indexOf('{');
    const endIdx = responseText.lastIndexOf('}');
    const jsonStr = responseText.substring(startIdx, endIdx + 1);
    const data = JSON.parse(jsonStr);

    if (data.status === "success") {
      console.log(`✅ 생성 성공! (총 ${data.words.length}개)`);
      console.log("-----------------------------------------");
      data.words.forEach((word, index) => {
        process.stdout.write(`${String(index + 1).padStart(2, ' ')}. ${word.padEnd(15)} `);
        if ((index + 1) % 3 === 0) console.log(""); // 3열로 출력
      });
      console.log("\n-----------------------------------------");
      console.log("✨ 테스트 완료!");
    } else {
      console.log(`❌ 실패: ${data.message}`);
    }
  } catch (error) {
    console.error("❌ 오류 발생:", error.message);
  } finally {
    process.exit(0);
  }
}

// 인자로 받은 주제 실행
const inputTopic = process.argv[2];
runTest(inputTopic);
