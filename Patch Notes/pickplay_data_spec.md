# PickPlay 시스템 데이터 구조 & 웹소켓 API 명세서 (AI 분석용)

이 문서는 다음 AI 파트너가 서버 및 클라이언트 코드를 통째로 읽어서 토큰을 낭비하지 않고도, 방의 메모리 구조와 웹소켓 이벤트 규약을 즉시 파악하여 버그 없이 빠른 고품질 구현을 수행할 수 있도록 돕는 시스템 명세서입니다.

---

## 1. 전역 메모리 방 구조 (`gameRooms[roomId]`)

서버 메모리(`sockets/socketManager.js`)에 유지되는 개별 방의 공통 속성 정의입니다.

```javascript
gameRooms[roomId] = {
    // 1. 방 정보 및 상태
    hostId: "socket.id",        // 방장의 소켓 ID
    status: "WAITING",          // 방 상태 ('WAITING', 'INPUTTING', 'PLAYING')
    mode: "lobby",              // 현재 활성화된 게임 모드 ('lobby', 'bingo', 'liar', 'bomb')
    players: {                  // 방에 참여 중인 유저 맵
        "socket.id": {
            id: "socket.id",
            name: "유저 닉네임",
            avatar: "이모지 아바타",
            ready: false,       // 준비 완료 상태
            board: [],          // 빙고판 등 단어 배열
            confirmedResult: true, // 게임 종료 모달 확인 여부 (false 시 다음 게임 시작 차단)
            isSkipped: false,   // 빙고/폭탄 등 턴 건너뜀 여부
            skipCount: 0,       // 턴 건너뜀 누적 횟수
            usedEventCount: 0   // 빙고 이벤트 모드 사용 횟수
        }
    },
    joinOrder: [],              // 입장 순서 배열 (소켓 ID 목록)
    clientIds: {                // 브라우저 세션 복구용 맵
        "clientId_string": "socket.id"
    },

    // 2. 대기실 투표 및 설정값 캐시
    lobbyVotes: { bingo: 0, liar: 0 },
    votedUsers: { "socket.id": "bingo" },
    
    // 게임별 세부 설정 정보
    bingoSettings: {
        winLines: 3,            // 목표 줄 수 (3, 4, 5)
        turnOrder: "host_first",// 순서 규칙 ('host_first', 'random', 'join_asc')
        turnTimeLimit: 15,      // 제한시간 (초, 0은 무제한)
        topic: "",              // AI 생성 주제 명칭
        useEvents: true         // 이벤트 모드 ON/OFF
    },
    liarSettings: {
        winTarget: 3,           // 목표 승수 (3, 4, 5)
        selectedCategories: []  // 선택된 라이어 카테고리 배열
    },
    bombSettings: {
        hearts: 3,              // 시작 목숨 개수
        subMode: "random",      // 폭탄 모드 ('random', 'tactical')
        showTimer: true,        // 폭탄 타이머 노출 여부
        timerRange: "medium",   // 타이머 시간 길이 ('short', 'medium', 'long')
        selectedCategories: []  // 폭탄돌리기 카테고리 배열
    }
};
```

---

## 2. 빙고 게임 (Bingo) 소켓 API 및 이벤트 흐름

### 서버 수신 이벤트 (Client → Server)
- `'init theme mode'` (`{ topic, winLines, turnOrder, turnTimeLimit, useEvents }`)
  - 방장이 대기실에서 게임 설정을 마치고 테마 빙고 셋업 모드를 시작할 때 전송.
- `'submit theme board'` (`{ roomId, board, name, useEvents }`)
  - 각 플레이어가 25칸의 단어 입력을 완료하고 "준비 완료"를 누를 때 단어 리스트와 함께 전송.
- `'host manual start bingo'`
  - 전원 준비 완료 상태에서 방장이 수동으로 게임 시작을 누를 때 전송.
- `'theme word selected'` (`{ roomId, word }`)
  - 자신의 턴일 때 빙고판의 특정 단어를 클릭하여 호명할 때 전송.
- `'trigger event'` (`{ name }`)
  - 빙고 줄이 늘어났을 때 이벤트 사용 버튼을 눌러 랜덤 이벤트를 유발할 때 전송.
- `'bingo declared'` (`{ name }`)
  - 목표 줄 수 이상이 완성되어 승리 선언을 누를 때 전송.
- `'confirm result'`
  - 게임 종료 모달창에서 "확인" 버튼을 눌러 결과 확인을 완료했음을 알림.

### 클라이언트 수신 이벤트 (Server → Client)
- `'setup theme input'` (`{ topic, winLines, useEvents, presetWords }`)
  - 테마 보드에 25칸 단어 입력 창을 노출하라는 지령.
- `'start theme game'` (`{ board, winLines }`)
  - 서버에서 25칸의 빙고판 배치가 확정되어 본 게임을 구동하라는 지령.
- `'turn update'` (`{ currentTurnId, currentTurnName, turnTimeLimit }`)
  - 턴이 교체되었을 때 대상자와 턴 제한시간을 전송.
- `'number called'` (`number`)
  - 특정 플레이어에 의해 호명된 단어를 공유하여 체크하도록 유도.
- `'locked words updated'` (`lockedWords`)
  - 유령의 장난 이벤트 등으로 선택 불가 상태로 잠긴 단어 리스트 갱신.
- `'event happened'` (`{ icon, title, msg, type }`)
  - 이벤트 트리거 시 대형 이벤트 팝업 연출 및 연출 기간 타이머 일시 정지용 정보 공유.
- `'game over'` (`{ winner, stats }`)
  - 최종 빙고 완성자가 승리하여 게임 통계 및 모달을 띄우도록 전송.

---

## 3. 라이어 게임 (Liar) 소켓 API 및 이벤트 흐름

### 서버 수신 이벤트 (Client → Server)
- `'setup liar game'` (`{ winTarget, categories }`)
  - 방장이 라이어 게임을 셋업하고 시작할 때 전송.
- `'submit description'` (`desc`)
  - 자신의 발언 턴일 때 30자 이내의 제시어 힌트 설명을 전송.
- `'vote liar'` (`targetId`)
  - 투표 단계에서 투표할 플레이어를 지목해 전송.
- `'submit final guess'` (`guessWord`)
  - 검거된 라이어가 최후의 제시어 역전 추리 정답을 작성해 제출할 때 전송.
- `'final guess typing'` (`partialText`)
  - 라이어가 실시간으로 텍스트 입력 칸에 작성 중인 타이핑 텍스트 전송 (훔쳐보기 기능 연동).
- `'restart liar game'`
  - 방장이 게임 결과 모달을 닫고 다시 대기실로 게임을 복귀시킬 때 전송.

### 클라이언트 수신 이벤트 (Server → Client)
- `'liar role assigned'` (`{ isLiar, category, word/null }`)
  - 각자의 역할(시민/라이어)과 라이어용 카테고리 또는 시민용 제시어 전송 및 3D 카드 플립 연출.
- `'liar next turn'` (`{ playerId, playerName, isMyTurn }`)
  - 설명할 사람의 순서를 공유하고 발언 턴 광원 하이라이트 부여.
- `'liar hint received'` (`{ playerId, desc }`)
  - 특정 플레이어가 제출한 설명 힌트를 말풍선 형태로 화면에 동적 렌더링.
- `'liar voting phase start'`
  - 발언이 모두 종료되어 각 유저 카드를 투표 표적으로 활성화하라는 신호.
- `'vote updated'` / `'liar player voted'`
  - 투표 완료된 플레이어들의 체크 아이콘 및 투표 배지를 실시간 동기화.
- `'liar showdown start'` (`{ votes }`)
  - 투표 결과의 지목 화살표 및 투표자 칩들을 아바타 슬롯 하단에 쇼다운 렌더링.
- `'final guess phase'` (`{ liarId, liarName, category }`)
  - 라이어가 검거되어 최후의 추리 판독 입력창을 띄우거나, 시민들에게 훔쳐보기 패널을 띄우도록 유도.
- `'round over'` (`{ isFinalGameOver, citizensWon, word, liarName, message, stats }`)
  - 라운드 또는 최종 게임 종료 시 통계 및 결과 모달을 표출하는 신호.

---

## 4. 주제 폭탄 돌리기 (Bomb) 소켓 API 및 이벤트 흐름

### 서버 수신 이벤트 (Client → Server)
- `'setup bomb game'` (`{ hearts, subMode, timerRange, showTimer, categories }`)
  - 방장이 설정을 마친 후 폭탄 돌리기 게임을 가동할 때 전송.
- `'submit bomb word'` (`word`)
  - 자신의 폭탄 턴일 때 단어를 적어 전송.
- `'next bomb round'`
  - 라운드 종료 후 방장이 다음 라운드를 개시할 때 전송.
- `'return to lobby from bomb'`
  - 방장이 폭탄돌리기 도중 또는 종료 후 대기실로 완전히 빠져나갈 때 전송.

### 클라이언트 수신 이벤트 (Server → Client)
- `'bomb round started'` (`{ round, theme, hearts, activePlayers, initialTurnId }`)
  - 새로운 폭탄 라운드가 시작되었음을 알리고 주제와 순서를 설정.
- `'bomb turn update'` (`{ currentTurnId, currentTurnName, timerShow, isMyTurn }`)
  - 폭탄이 넘어간 플레이어를 알리고 입력 폼을 활성화.
- `'bomb timer tick'` (`{ timeLeft }`)
  - 폭탄 타이머 표시 모드일 때 남은 시간을 실시간으로 갱신 (전략적 폭탄 위기감 조성).
- `'bomb word approved'` (`{ word, nextTurnId }`)
  - 단어가 올바르게 통과되었으며 다음 유저에게 폭탄을 전달하라는 알림.
- `'bomb word rejected'` (`reason`)
  - 이미 사용한 단어이거나 오답일 때 경고 메시지 공유.
- `'bomb exploded'` (`{ loserName, message, heartsState, isGameOver, stats, winner }`)
  - 시간 초과로 폭탄이 터졌을 때 라운드 패배 및 하트 삭감 정보 표출, 게임 완전 종료 여부 판독.
