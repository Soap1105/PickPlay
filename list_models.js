require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listModels() {
  try {
    // SDK의 내장 모델 리스트 조회 기능 사용
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    const data = await response.json();
    
    if (data.error) {
        console.error("API 오류:", data.error.message);
        return;
    }

    console.log("=== 사용 가능한 모델 목록 (v1beta) ===");
    data.models.filter(m => m.name.includes('flash')).forEach(model => {
      console.log(`- ID: ${model.name.split('/').pop()}`); // 모델 ID만 추출
      console.log(`  Full Name: ${model.name}`);
      console.log(`  Methods: ${model.supportedGenerationMethods.join(", ")}`);
      console.log('----------------------------');
    });
  } catch (error) {
    console.error("조회 중 예외 발생:", error.message);
  }
}

listModels();
