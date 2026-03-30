const db = require('./config/db');
const readline = require('readline');

// Helper to read a line from stdin
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

// Fetch all themes (id, title)
async function fetchThemes() {
  const [rows] = await db.query('SELECT id, title FROM themes ORDER BY id DESC');
  return rows;
}

// Fetch full data for a single theme by id
async function fetchThemeDetail(id) {
  const [rows] = await db.query('SELECT * FROM themes WHERE id = ?', [id]);
  return rows[0];
}

// Display list of themes with index numbers
function displayThemes(rows) {
  if (rows.length === 0) {
    console.log('현재 저장된 테마가 없습니다.');
    return;
  }
  console.log('\n=== 테마 목록 ===');
  rows.forEach((row, idx) => console.log(`${idx + 1}. [${row.id}] ${row.title}`));
  console.log('================\n');
}

// Show detailed info of a theme (title, creator, words array, user_id)
async function showDetail(theme) {
  console.log('\n--- 테마 상세 정보 ---');
  console.log(`ID      : ${theme.id}`);
  console.log(`제목    : ${theme.title}`);
  console.log(`작성자  : ${theme.creator}`);
  console.log(`사용자ID: ${theme.user_id}`);
  let words = theme.words;
  if (typeof words === 'string') {
    try { words = JSON.parse(words); } catch (e) { /* keep as string */ }
  }
  if (Array.isArray(words)) {
    console.log('단어 목록 (총 ' + words.length + '개):');
    words.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
  } else {
    console.log('단어 데이터: ', words);
  }
  console.log('----------------------\n');
}

// Delete selected themes by index numbers (e.g., "1,3,5")
async function deleteBySelection(rows, selection) {
  const numbers = selection.split(/[ ,]+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n) && n > 0 && n <= rows.length);
  const toDelete = numbers.map(n => rows[n - 1]);
  if (toDelete.length === 0) {
    console.log('선택된 번호에 해당하는 테마가 없습니다.');
    return;
  }
  const ids = toDelete.map(r => r.id);
  try {
    const [result] = await db.query('DELETE FROM themes WHERE id IN (?)', [ids]);
    console.log(`✅ ${result.affectedRows}개의 테마가 삭제되었습니다.`);
  } catch (err) {
    console.error('삭제 중 오류 발생:', err);
  }
}

// [Update] 단어 수정 기능 추가
async function updateThemeWord(rows) {
  const sel = await ask('수정할 테마 번호를 입력하세요: ');
  const n = parseInt(sel, 10);
  if (isNaN(n) || n <= 0 || n > rows.length) {
    console.log('잘못된 번호입니다.');
    return;
  }
  
  const theme = await fetchThemeDetail(rows[n - 1].id);
  if (!theme) return console.log('테마를 찾을 수 없습니다.');
  
  await showDetail(theme);
  
  const wordIdxSel = await ask('수정할 단어 번호를 입력하세요 (취소: c): ');
  if (wordIdxSel.toLowerCase() === 'c') return;
  
  const wordIdx = parseInt(wordIdxSel, 10);
  let words = theme.words;
  if (typeof words === 'string') words = JSON.parse(words);
  
  if (isNaN(wordIdx) || wordIdx <= 0 || wordIdx > words.length) {
    console.log('잘못된 단어 번호입니다.');
    return;
  }
  
  const newWord = await ask(`'${words[wordIdx - 1]}'를 무엇으로 바꿀까요?: `);
  if (!newWord) return console.log('수정 취소');
  
  words[wordIdx - 1] = newWord;
  
  try {
    await db.query('UPDATE themes SET words = ? WHERE id = ?', [JSON.stringify(words), theme.id]);
    console.log(`✅ 성공적으로 수정되었습니다: ${newWord}`);
  } catch (err) {
    console.error('DB 업데이트 오류:', err);
  }
}

async function mainLoop() {
  while (true) {
    const rows = await fetchThemes();
    displayThemes(rows);
    console.log('옵션:');
    console.log('  1) 테마 상세 보기');
    console.log('  2) 테마 삭제');
    console.log('  3) 테마 단어 수정 (개발자용)');
    console.log('  4) 다시 조회');
    console.log('  5) 종료');
    const choice = await ask('원하는 번호를 입력하세요 (1-5): ');
    if (choice === '1') {
      const sel = await ask('상세 볼 번호를 입력하세요 (예: 1 2 3): ');
      const nums = sel.split(/[ ,]+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n) && n > 0 && n <= rows.length);
      for (const n of nums) {
        const theme = await fetchThemeDetail(rows[n - 1].id);
        if (theme) await showDetail(theme);
        else console.log('해당 ID의 테마를 찾을 수 없습니다.');
      }
    } else if (choice === '2') {
      const sel = await ask('삭제할 번호를 콤마 혹은 공백으로 구분해 입력하세요 (예: 1,3,5): ');
      await deleteBySelection(rows, sel);
    } else if (choice === '3') {
      await updateThemeWord(rows);
    } else if (choice === '4') {
      continue;
    } else {
      console.log('프로그램을 종료합니다.');
      break;
    }
  }
  process.exit(0);
}

mainLoop();
