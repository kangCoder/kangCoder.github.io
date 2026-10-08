# 운동 기록 PWA

개인 사용 목적의 운동 기록 앱. 상세 스펙은 `docs/spec-v0.4.md` 참조.

# 가계부 기능

`docs/spec-finance-v0.11.md` 참조. 운동 기록과 독립 모듈이며
기존 운동 코드는 수정하지 않는다. Dexie DB를 분리한다(`finance-log`).

# 기기 간 동기화

`docs/spec-sync-v0.1.md` 참조. 이름 + PIN 계정으로 폰과 PC가 같은 기록을
보게 한다. 전체 DB 스냅샷을 Firestore에 올리고 내리는 방식이고,
레코드 단위 병합은 하지 않는다.

**구현 진행 중.** 현재 2단계까지 완료 — 로그인과 로컬 JSON 백업만 있고
클라우드 업로드(`src/sync/snapshot.ts`, `engine.ts`)는 아직 없다.
그래서 지금은 **기록이 한 바이트도 서버로 가지 않는다.**

## 명령어

- 개발: `npm run dev`
- 빌드: `npm run build`
- 타입체크: `npm run typecheck`
- 검증 하네스: `npm run check` (브라우저 없이 Node에서 DB·인증 로직 검사)

`npx tsc --noEmit`은 **쓰지 말 것.** 루트 `tsconfig.json`이 `"files": []` +
references 구조라 `-b` 없이 돌리면 대상 파일이 0개여서 아무것도 검사하지
않고 통과한다.

## 스택

- React + TypeScript (strict), Vite
- 저장소: IndexedDB via Dexie.js — 모든 읽기·쓰기가 로컬이다
- Firebase Auth(로그인) + Firestore(스냅샷 전달 매체) — `docs/spec-sync-v0.1.md`
- Tailwind CSS, Recharts, date-fns
- GitHub Pages 배포

## 아키텍처 원칙

- 백엔드 API를 만들지 않는다. Dexie가 로컬 원본이고 화면은 Dexie만 본다.
  Firestore는 기기 사이의 전달 매체일 뿐 진실 공급원이 아니다.
  Firestore 오프라인 캐시는 끈다 — 두 군데에 같은 데이터를 두면 안 된다.
- **세션은 템플릿을 참조하지 않고 복사한다.** 템플릿 수정이
  과거 기록을 변형시키면 안 된다. 표시용 이름도 비정규화해 복사.
- 타이머는 카운트업 루프가 아니라 timestamp 차이로 계산한다.
  백그라운드 복귀 후에도 값이 정확해야 한다.
- IndexedDB는 조인이 없다. 서버 DB처럼 정규화하지 말 것.

## 코드 규칙

- named export 사용, default export 금지
- 함수형 컴포넌트만
- Dexie 쿼리는 `src/db/` 아래에 모으고 컴포넌트에서 직접 쓰지 않는다

## 작업 방식

- 구현 전에 설계 의도와 이유를 먼저 설명한다
- 한 번에 한 화면씩. 여러 기능을 동시에 건드리지 않는다
