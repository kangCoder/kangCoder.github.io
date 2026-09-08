# 운동 기록 PWA

개인 사용 목적의 운동 기록 앱. 상세 스펙은 `docs/spec-v0.2.md` 참조.

# 가계부 기능

`docs/spec-finance-v0.1.md` 참조. 운동 기록과 독립 모듈이며
기존 운동 코드는 수정하지 않는다. Dexie DB를 분리한다(`finance-log`).

## 명령어

- 개발: `npm run dev`
- 빌드: `npm run build`
- 타입체크: `npx tsc --noEmit`

## 스택

- React + TypeScript (strict), Vite
- 저장소: IndexedDB via Dexie.js — **서버 없음, 로컬 온리**
- Tailwind CSS, Recharts, date-fns
- GitHub Pages 배포

## 아키텍처 원칙

- 백엔드 API를 만들지 않는다. 모든 데이터는 IndexedDB에 있다.
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
