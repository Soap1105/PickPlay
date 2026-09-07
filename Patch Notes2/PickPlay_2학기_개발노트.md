# PickPlay 2학기 개발 인수인계 노트

**작성일**: 2026-08-24  
**작성자**: Antigravity (Claude Sonnet 4.6 Thinking)  
**대상**: 2학기 PickPlay 개발을 재개할 모든 AI 파트너 및 개발자  
**프로젝트 경로**: `e:\My_Code\PickPlay\`

> 이 문서는 1학기(16주) 개발의 최종 상태를 빠르게 복원하고,  
> 17주차부터 무엇을 이어서 해야 하는지를 정리한 핵심 인수인계 노트다.

---

## ⚠️ AI 파트너 필독 지침 (업데이트본)

### [MANDATORY] 작업 순서
1. **이 문서를 먼저 읽는다.**
2. `Patch Notes/pickplay_data_spec.md` 를 조회한다 → gameRooms 구조 + 소켓 이벤트 전체 명세
3. 소스 코드는 필요한 파일만 핀포인트로 로드한다 (전체 로드 금지, 토큰 낭비)
4. 분석안(implementation_plan.md) 먼저 제출 → 사용자 **승인 후** 코드 수정

### [MANDATORY] 소통 원칙
- **반말(구어체)** 로 단도직입적으로 소통 (토큰 절약 및 실리적 소통)
- 불명확한 사항은 **반드시 먼저 물어본다** (혼자 짐작하고 수정하지 않는다)
- 코드 수정 완료 후 → `node -c [파일]` 으로 문법 검증 → walkthrough.md 작성
- 조언 요청 시: 동조나 칭찬 없이 **냉철하고 객관적인 팩트**만 제시

---

## 0. 프로젝트 디렉토리 구조 및 파일 역할

```
e:\My_Code\PickPlay\
│
├── 📁 Patch Notes\              ★ 1학기 전용 개발 기록 아카이브
│   ├── 1주차_개발노트.txt ~ 15주차_개발노트.txt
│   │                            각 주차별 작업 내역, 버그 수정 기록, 보류 항목 목록
│   ├── 13주차_pickplay_피드백.txt
│   │                            3게임 코드 분석 기반 종합 피드백 보고서
│   │                            (Pain Points + 우선순위 개선 처방 포함, 2학기 작업의 핵심 참조 문서)
│   ├── PickPlay_피드백.txt       초기 버전 피드백 (구버전)
│   ├── UI_평가보고서.txt          로비/대기방/빙고/라이어 UI 평가 보고서 (초기)
│   └── pickplay_data_spec.md   ★★ gameRooms 전역 구조 + 3게임 소켓 이벤트 전체 명세
│                                작업 전 반드시 1순위로 조회할 것
│
├── 📁 Patch Notes2\             ★ 2학기 전용 개발 기록 폴더 (이 폴더)
│   ├── 프롬프트_인수인계.txt       AI 파트너용 사용자 성향 및 소통 스타일 가이드
│   └── PickPlay_2학기_개발노트.md  ★ 이 파일. 1학기 완료 현황 + 2학기 할 일 정리
│
├── 📁 Screenshot\               게임 스크린샷 보관 폴더 (포트폴리오/발표용)
│
├── 📁 config\
│   └── db.js                    MySQL 연결 설정 래퍼 (db_set.js와 별개의 구버전 또는 별도 모듈)
│
├── 📁 controllers\
│   ├── geminiService.js         Google Gemini API 호출, 단어 추출, 품질 검수 (자음 단독 차단 등)
│   └── themeController.js       빙고 주제 생성 총괄 컨트롤러
│                                순서: DB 캐시 조회 → 없으면 Gemini AI 호출 → DB 저장
│                                AI 생성 중 재접속 복구 로직 포함
│
├── 📁 data\
│   ├── bombWords.json           폭탄 돌리기 카테고리별 단어 사전 (로컬 JSON, DB 없이 동작)
│   └── liarWords.json           라이어 게임 카테고리별 제시어 사전 (로컬 JSON, DB 없이 동작)
│
├── 📁 models\
│   └── themeModel.js            빙고 테마 DB 쿼리 모음 (저장/조회/목록 CRUD)
│
├── 📁 routes\
│   └── themeRoutes.js           REST API 라우터 /api/theme/* (빙고 테마 저장/불러오기 엔드포인트)
│
├── 📁 sockets\                  ★ 핵심 서버 로직. 게임별로 분리된 소켓 이벤트 핸들러 모음
│   ├── socketManager.js         gameRooms 전역 객체 정의 및 내보내기 (서버 메모리 상태 저장소)
│   ├── commonSocket.js          공통 소켓: 방 입장/퇴장, 채팅, 세션 복구, 방장 권한 관리
│   ├── bingoSocket.js           빙고 게임 소켓 (27KB) - 턴 진행, 이벤트 4종, 격리 메커니즘
│   ├── liarSocket.js            라이어 게임 소켓 (25KB) - 역할 배분, 발언/투표/역전추리 흐름
│   ├── bombSocket.js            폭탄 돌리기 소켓 (20KB) - 아레나 턴, 타이머, 전략 모드
│   ├── bingoHelpers.js          빙고 이벤트 발동 헬퍼 함수 분리 모음
│   └── utils.js                 getSortedUserList() 등 공통 유틸 (방장 index 0 보장 포함)
│
├── 📁 public\                   클라이언트 정적 파일 (브라우저에서 직접 실행)
│   ├── index.html               메인 로비 페이지 (닉네임, 아바타 선택, 방 생성/입장)
│   ├── mockup_lobby.html        개발 초기 UI 목업 (현재 미사용, 참고용 보존)
│   ├── call.mp3                 단어 호명 시 효과음
│   ├── event.wav                빙고 이벤트 발생 시 효과음
│   │
│   ├── 📁 games\
│   │   └── game.html            ★ 게임 허브 (대기방 + 빙고/라이어/폭탄 컨테이너 통합 단일 페이지)
│   │
│   ├── 📁 js\
│   │   ├── room.js              대기방 + 로비 소켓 클라이언트, window.roomPlayers 전역 캐시 관리
│   │   ├── bingo.js             빙고 게임 클라이언트 (85KB, 최대 파일)
│   │   ├── liar.js              라이어 게임 클라이언트 (57KB)
│   │   ├── bomb.js              폭탄 돌리기 클라이언트 (28KB)
│   │   ├── common.js            클라이언트 공통 유틸 (showContainer 등 컨테이너 전환 함수)
│   │   └── settingsModal.js     게임 설정 모달 공통 JS (빙고/라이어/폭탄 설정값 수집 및 emit)
│   │
│   └── 📁 css\
│       ├── common.css           공통 스타일 (대기방, 로비, 채팅, 글로벌 레이아웃) - 41KB
│       ├── bingo.css            빙고 게임 전용 스타일 (이벤트 팝업, 빙고판, 타이머바 등)
│       ├── bingo.css.bak        bingo.css 백업본 (수동 보관, 현재 미사용)
│       ├── liar.css             라이어 게임 전용 스타일 (카드 플립, 채팅 내장 모달 등)
│       └── bomb.css             폭탄 돌리기 전용 스타일 (원형 아레나, 말풍선 등)
│
├── server.js                    서버 진입점. Express 앱 + Socket.io 초기화, 소켓 핸들러 연결
├── db_set.js                    MySQL2 connection pool 생성 및 내보내기
├── bingo_db_dump.sql            DB 초기화용 SQL 덤프 (기본 내장 테마 포함)
├── .env                         환경변수 파일 (DB 접속정보, Gemini API 키, PORT) - Git 제외
├── .env.example                 .env 작성 예시 템플릿
│
├── presentation.html            발표용 슬라이드 (F11 전체화면 최적화, 게임 설명 4종 + 이벤트 4종)
├── test_bingo_ui.html           빙고 UI 단독 테스트용 파일 (서버 없이 UI 확인용)
├── test_new_prompt.js           Gemini 프롬프트 테스트 스크립트
├── list_models.js               사용 가능한 Gemini AI 모델 목록 출력 유틸
├── view_db.js                   DB 데이터 콘솔 확인 유틸
└── all_code_fixed.txt           전체 소스코드 스냅샷 텍스트 (특정 시점 백업, 현재 최신 아님)
```

---

## 1. 프로젝트 개요

**PickPlay**는 Socket.io 기반 실시간 소셜 보드 게임 플랫폼이다.  
Node.js + Express + MySQL 백엔드, Vanilla HTML/CSS/JS 프론트엔드, Google Gemini API 연동.

### 핵심 기술 스택
| 구분 | 기술 |
|---|---|
| 서버 | Node.js + Express + Socket.io |
| DB | MySQL 8.x (`bingo_db`) |
| AI | Google Gemini API (`@google/generative-ai`) |
| 인증 | 세션 기반 (`uuid` + 브라우저 localStorage clientId) |

### 파일 구조 한눈에 보기
```
PickPlay/
├── server.js                  # 서버 진입점
├── db_set.js                  # MySQL 연결 풀
├── .env                       # DB/API 환경변수 (공유 금지)
├── controllers/
│   ├── geminiService.js       # Gemini API 호출 & 단어 품질 검수
│   └── themeController.js     # 빙고 주제 생성 컨트롤러 (DB 캐싱 + AI 폴백)
├── models/
│   └── themeModel.js          # DB 쿼리 (테마 저장/조회)
├── routes/
│   └── themeRoutes.js         # REST API 라우터 (/api/theme/*)
├── sockets/
│   ├── socketManager.js       # gameRooms 전역 상태 저장소
│   ├── commonSocket.js        # 공통 소켓 (입장/퇴장/채팅/세션복구)
│   ├── bingoSocket.js         # 빙고 게임 소켓 로직 (27KB, 핵심 파일)
│   ├── liarSocket.js          # 라이어 게임 소켓 로직 (25KB)
│   ├── bombSocket.js          # 폭탄 돌리기 소켓 로직 (20KB)
│   ├── bingoHelpers.js        # 빙고 이벤트 헬퍼 함수들
│   └── utils.js               # getSortedUserList 등 공통 유틸
└── public/
    ├── index.html             # 메인 로비 (닉네임/아바타 선택 + 방 입장)
    ├── games/
    │   └── game.html          # 게임 허브 (대기방 + 3개 게임 컨테이너 통합)
    ├── js/
    │   ├── room.js            # 대기방 & 로비 소켓 클라이언트
    │   ├── bingo.js           # 빙고 게임 클라이언트
    │   ├── liar.js            # 라이어 게임 클라이언트
    │   ├── bomb.js            # 폭탄 돌리기 클라이언트
    │   └── settingsModal.js   # 게임 설정 모달 공통 JS
    └── css/
        ├── common.css         # 공통 스타일 (대기방, 로비, 레이아웃)
        ├── bingo.css          # 빙고 전용 스타일
        ├── liar.css           # 라이어 전용 스타일
        └── bomb.css           # 폭탄 전용 스타일
```

---

## 2. 1학기(1~16주차) 개발 완료 현황

### 완전 구현 및 안정화된 기능

#### 공통 시스템
- [x] 닉네임 + 이모지 아바타 선택 로비
- [x] 방 생성/입장, 초대 링크 공유
- [x] 이모지 폭죽 발사 (소셜 인터랙션)
- [x] 실시간 채팅 (대기방 + 게임 중)
- [x] **세션 복구 시스템**: F5 새로고침 시 clientId로 1.5초 유예 후 재접속 → 방장 권한 복원
- [x] **방장 권한 안전화**: 방장이 index 0 고정, 전원 새로고침 시 방 폐기 방지 (pendingDisconnects 카운터)
- [x] 중복 접속 방지 (동일 브라우저 탭 세션 공유 차단)
- [x] 소켓 직렬화 RangeError 크래시 버그 완전 수정 (disconnectTimeouts 맵 분리)
- [x] 대기실 게임 투표 시스템 (방장 수동 지정 or 다수결 투표)
- [x] 게스트 대기방 UI (방장 설정 중 전용 안내 화면)
- [x] 게임별 설정값 실시간 프리뷰 동기화 (방장/게스트 동일 화면)

#### 빙고 게임
- [x] AI(Gemini) 주제 생성 → 25칸 단어판 자동 구성 (DB 캐싱 + 30초 쿨다운)
- [x] 수동 단어 직접 입력 (자음 단독 입력 차단 등 5중 어뷰징 방지)
- [x] 단어 셔플 및 타깃 리롤 (준비 단계에서 배치/교체 가능)
- [x] DB 저장/불러오기 + localStorage Fallback 이중화
- [x] AI 생성 중 새로고침 시 로딩 복구 (서버 단어 생성 완료 후 재접속 유저에게 자동 전달)
- [x] 실시간 턴제 진행 (턴 타이머 + 서버/클라이언트 싱크 보정)
- [x] **빙고 특수 이벤트 4종**:
  - 시간 왜곡: 다음 턴 한 번 더 선택 (timeWarpRemaining 서버 관리)
  - 유령의 장난: 상대 판 단어 2개 잠금 고정 2라운드
  - 차원 뒤틀림: 상대 판 셔플 + 체크 2개 해제 (발동자 본인 판 안전)
  - 블랙홀: 발동자가 직접 타깃 선택 → 격리(Stasis) 상태 → 마킹 보류 + 이벤트 효과 면제
- [x] 이벤트 사용 시 타이머 일시 정지 (3.5초 팝업 동안 서버 타이머 지연)
- [x] 빙고 완성 → 승리 선언 → 게임 종료 모달 (통계 포함)
- [x] 반응형 빙고판 (최대 8명 참가 시 사이드바 2열 레이아웃, 스크롤 없음)

#### 라이어 게임
- [x] 역할 배분 (시민/라이어) 3D 카드 플립 연출
- [x] 순차 턴 발언 시스템 (25초 제한, 타이머 3단계 색상 전환)
- [x] 투표 단계 → 쇼다운 → 최후 역전 추리 (라이어가 제시어 맞추기)
- [x] **최후 변론 실시간 타이핑 동기화** (liarCharDrop, 시민들이 라이어 타이핑 훔쳐보기)
- [x] 라운드/최종 게임 결과 모달 (승수 누적 통계)
- [x] **결과창 내 빌트인 채팅** (글래스모피즘 컴팩트 채팅 섹션 내장)
- [x] 라이어 결과창 게스트 갇힘 버그 수정 (확인 후 대기방 자동 복귀)
- [x] 라이어/폭탄 플레이어 렌더링 누락 버그 수정 (window.roomPlayers 전역 캐시 폴백)

#### 폭탄 돌리기 게임
- [x] 랜덤/전략 지목 모드 (전략 모드: 번호로 특정 플레이어 지목 + 반사 기능)
- [x] 원형 아레나 레이아웃 + 하트 목숨 시스템
- [x] 폭발 시 화면 플래시 연출
- [x] 타이머 노출/숨김 설정 (short/medium/long 범위)
- [x] 말풍선 형태 단어 표시 (아레나 캐릭터 위)
- [x] 이전 판 인원 + 신규 입장 인원 렌더링 동기화 버그 수정

#### 기타
- [x] `presentation.html` — 발표용 슬라이드 (F11 전체화면 최적화, 게임 설명 4종)
- [x] Gemini AI 모델 목록 조회 유틸 (`list_models.js`)

---

## 3. 미완성 / 보류 항목 (17주차부터 진행할 것들)

> 13주차 피드백 보고서 + 15주차 보류 항목 기준으로 정리한 잔여 과제 목록.  
> 우선순위는 수정 공수 대비 효과 순.

### 최우선 (즉시 수정, 공수 작음)

| # | 항목 | 게임 | 설명 |
|---|---|---|---|
| 1 | **폭탄 지목 번호 배지 추가** | 폭탄 | `bomb.js` renderBombUsers에 `${index+1}` 한 줄이 없어 전략 모드가 사실상 데드 피처 상태. 즉시 추가 필요. |
| 2 | **빙고 체크 스탬프 애니메이션** | 빙고 | `.board-cell.checked`에 `scale(1.2)→scale(1.0)` keyframes 없음. 1~2시간 공수로 게임 질감 극적 개선. |
| 3 | **라이어 자기 투표 오류 문구 수정** | 라이어 | `"자신의 힌트에는"` → `"본인에게는"` 로 수정 (`liarSocket.js` 302줄 부근) |

### 중우선 (기능 개선, 공수 보통)

| # | 항목 | 게임 | 설명 |
|---|---|---|---|
| 4 | **빙고 폰트 clamp 리팩터링** | 빙고 | 기존 2단계 `text-small/medium` 분기를 `clamp(0.55rem, 1.6cqw, 1.1rem)` 한 줄로 교체 |
| 5 | **폭탄 하트 렌더링 함수화** | 폭탄 | `renderBombUsers`와 `updateBombScoreboard` 두 곳의 중복 이모지 루프를 `getHeartHtml()` 헬퍼로 통합 |
| 6 | **라이어 투표 레이아웃 분리** | 라이어 | 힌트 리스트와 투표 버튼이 동일 스크롤 영역. 투표 패널을 `sticky` 또는 우측 고정으로 분리 |
| 7 | **라이어 연결 끊긴 유저 즉시 건너뛰기** | 라이어 | disconnect 시 해당 플레이어 turnOrder에서 즉시 제거 → 25초 대기 낭비 차단 |
| 8 | **폭탄 주제(턴) 타이머 UI 도입** | 폭탄 | 개인 입력 제한시간 15초(AFK)를 시각적으로 보여주는 별도 턴 타이머 UI |

### 저우선 (폴리싱, 여유 있을 때)

| # | 항목 | 게임 | 설명 |
|---|---|---|---|
| 9 | **빙고 줄 완성 라인 드로우 연출** | 빙고 | 완성된 줄 위로 빛나는 선이 그어지는 애니메이션 (2~3시간 공수) |
| 10 | **방어 장막 이벤트 추가** | 빙고 | 빙고판 특정 칸에 쉴드 설치 → 상대 첫 체크 1회 방어 (신규 이벤트 기믹) |
| 11 | **폭탄 반응형 반지름 적용** | 폭탄 | `const radius = 180;` 절댓값 고정 → `Math.min(180, window.innerWidth * 0.38)` 로 변경 |
| 12 | **라이어 게스트 대기 안내 문구** | 라이어 | `liar.js` 580줄 `guestText = ''` 방치 → "방장이 다음 라운드를 시작할 때까지 대기해주세요." 보완 |
| 13 | **빙고 선언 버튼 pulse 강조** | 빙고 | 목표 줄 달성 시 빙고! 버튼에 glow pulse 애니메이션 추가 |

---

## 4. 알려진 설계 결정 및 비자명한 구현 사항

> 코드만 봐서는 "왜 이렇게 했는지" 알기 어려운 부분 정리.

| 사항 | 위치 | 이유 |
|---|---|---|
| `disconnectTimeouts` 를 room 레벨 맵에 분리 저장 | commonSocket.js | player 객체에 직접 setTimeout을 붙이면 socket.io-parser 직렬화 시 RangeError(무한 재귀) 크래시 발생. 15주차에 발견된 치명적 버그의 수정 결과. |
| `pendingDisconnects` 카운터 | commonSocket.js | 전원 새로고침 시 disconnect가 동시에 발생해 players가 비는 순간 방이 삭제되는 문제 방지. |
| `confirmedResult` 플래그 | socketManager.js | 모든 플레이어가 결과 모달을 확인 완료해야 다음 게임 시작 가능. 한 명이라도 확인 전이면 차단. |
| Bingo `stasisPlayers` 격리 메커니즘 | bingoSocket.js | 블랙홀 이벤트 대상자는 격리 중 마킹 보류 + 이벤트 효과 면제. 해제 시 밀린 마킹 일괄 적용. |
| `timeWarpRemaining` 서버 관리 | bingoSocket.js | 시간 왜곡 이벤트는 클라이언트가 아닌 서버에서 상태 관리. passTurn() 시 강제 0 리셋으로 bleed-through 방지. |
| `window.roomPlayers` 전역 캐시 | room.js | 게임 전환 시 서버가 userList를 재방출하지 않아 클라이언트 캐시가 초기화되는 문제의 폴백. 항상 최신 유저 리스트를 보장. |

---

## 5. 환경 설정 빠른 참조

```env
# .env
DB_HOST=localhost
DB_USER=root
DB_PASS=your_password
DB_NAME=bingo_db
GEMINI_API_KEY=your_key   # 없어도 DB 기본 테마로 구동 가능
PORT=3000                  # 80은 관리자 권한 필요
```

```bash
# 실행
npm install        # 최초 1회
npm run dev        # 개발 (nodemon 핫리로드)
npm start          # 프로덕션

# DB 초기화 (최초 1회)
mysql -u root -p bingo_db < bingo_db_dump.sql
```

**멀티 접속 테스트**: Chrome 일반 / Chrome 시크릿 / Edge / 기타 브라우저 각각 창으로 동시 접속 (동일 브라우저 탭은 세션 공유로 중복 차단됨)

---

## 6. 핵심 참조 문서

| 문서 | 경로 | 용도 |
|---|---|---|
| 소켓 이벤트 전체 명세 | `Patch Notes/pickplay_data_spec.md` | gameRooms 구조 + 3게임 이벤트 파라미터 완전 정리 |
| 13주차 종합 피드백 | `Patch Notes/13주차_pickplay_피드백.txt` | 게임별 코드 분석 기반 Pain Points 및 개선 처방 |
| 발표용 슬라이드 | `presentation.html` | 게임 설명 4종, 이벤트 4종 슬라이드 (F11 최적화) |

---

*마지막 업데이트: 2026-08-24 | 16주차(1학기) 종료 기준*
