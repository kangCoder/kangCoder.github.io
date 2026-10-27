# 운동 기록 PWA

개인 사용 목적의 운동 기록 앱. 상세 스펙은 `docs/spec-v0.5.md` 참조.

# 가계부 기능

`docs/spec-finance-v0.13.md` 참조. 운동 기록과 독립 모듈이며
기존 운동 코드는 수정하지 않는다. Dexie DB를 분리한다(`finance-log`).

# 기기 간 동기화

`docs/spec-sync-v0.1.md` 참조. 이름 + PIN 계정으로 폰과 PC가 같은 기록을
보게 한다. 전체 DB 스냅샷을 Firestore에 올리고 내리는 방식이고,
레코드 단위 병합은 하지 않는다.

**6단계까지 완료.** 변경 후 약 2초와 앱을 열거나 덮을 때 자동으로 돈다.
앱 설정 → 기기 간 동기화에서 상태 확인과 수동 조작도 된다.

동기화를 건드릴 때 깨뜨리지 말아야 하는 것들:

- `syncState`는 스냅샷·백업에 담지 않는다. 담으면 복원이 baseRev·dirty를
  남의 기기 값으로 덮어써 "이미 올렸다"고 착각한 변경이 사라진다
- 새 Dexie 테이블을 추가하면 `backup.ts`의 `TABLE_NAMES`에도 넣어야 한다.
  빠지면 그 테이블은 영원히 동기화되지 않고, 조용한 유실이라 눈에 안 띈다
  (`npm run check:mutations`가 운동 쪽은 잡아 준다)
- `pull`의 전체 교체는 `suppressMutations` 안에서 돌아야 한다. 아니면
  받아온 직후 dirty=true가 되어 남의 스냅샷을 자기 변경으로 되올린다
- 수동 버튼은 `auto.ts`의 `syncPush`/`syncPull`을 쓴다. `engine`을 직접
  부르면 디바운스된 자동 push와 동시에 돌아 서로의 CAS를 깨뜨린다

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

- **잔액·순자산 공식은 한 곳에만 둔다.** 자산·부채 잔액은
  `finance/db/balances.ts`의 `loadBalances()`, 순자산은
  `finance/lib/netWorth.ts`의 `computeNetWorth()`가 유일한 출처다.
  `financeDb.assets`를 직접 reduce하면 거래 반영분과 보증금 제외가 빠진
  숫자가 나오고, 화면마다 다른 순자산이 보이게 된다
  (`docs/spec-finance-v0.13.md` §5.7, §5.8)
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
