require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 공용 범용 프롬프트 생성 함수 (검색 기반 정확성 강화 버전)
function getUniversalPrompt(topic) {
  return `
너는 빙고 게임용 단어 목록을 생성하는 AI야.
주제: "${topic}"

### [핵심 작업 지시 - 반드시 이 순서로 수행]
**Step 1: 지금 즉시 구글 검색을 수행해.**
- 검색어 예시: "${topic} 목록", "${topic} 위키", "${topic} 등장인물 전체"
- 공식 위키, 나무위키, 공식 홈페이지 등 신뢰할 수 있는 페이지를 찾아.

**Step 2: 검색 결과 페이지에서 직접 이름을 추출해.**
- 오직 검색 결과에 실제로 등장한 텍스트에서만 이름을 가져와.
- 네 기억이나 학습 데이터를 절대 사용하지 마. 검색 결과가 유일한 근거야.
- 검색 결과에 없는 이름은 아무리 확실해 보여도 목록에 넣지 마.

**Step 3: 추출한 이름을 아래 규칙으로 정제한 뒤 JSON으로 반환해.**

### [정제 규칙]
1. **수량**: 최소 30개 ~ 최대 50개. 35개 전후의 확실한 이름이 모이면 더 찾지 말고 즉시 반환해. 30개 미만이면 실패(error) 반환.
2. **대중성 우선**: 유명하고 친숙한 이름 위주로. 마이너하거나 애매한 이름은 과감히 제외.
3. **이름 표기**: 한국 공식 번역명 또는 나무위키 기준 표준 표기를 사용해. 관계 묘사("X의 언니" 등)는 금지.
4. **길이 제한**: 각 이름은 12글자 이내. 초과하면 목록에서 제외해. 절대 임의로 자르지 마.
5. **필터링 금지 항목**: 등급(3성/SSR), 시스템 메뉴(픽업/공지), 각주([1][2]), 광고 문구 등은 제거.
6. **중복 금지**: 동일하거나 의미상 같은 이름 중복 입력 금지.

### [Self-Correction]
JSON 반환 직전, "이 이름이 검색 결과에 실제로 존재했는가?"를 단어마다 확인해. 
검색 결과에 없었던 이름이 섞여 있으면 즉시 삭제해.

[출력 형식 - 인사말/설명 없이 오직 JSON만 반환]
성공: { "status": "success", "words": ["단어1", "단어2", ...최소 30개] }
실패: { "status": "error", "message": "'${topic}'에 해당하는 실존 단어를 30개 이상 찾을 수 없습니다." }
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

    // 강제 중복 제거 및 수량 커팅 방어벽 (AI의 실수 방지)
    if (data.status === "success" && Array.isArray(data.words)) {
        data.words = [...new Set(data.words)].slice(0, 50);
    }

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
