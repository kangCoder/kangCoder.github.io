# 계정 기반 기기 간 동기화 — spec-sync-v0.1

운동 기록(`workout-log`)과 가계부(`finance-log`)를 이름+PIN 계정에 묶어
폰과 PC에서 같은 기록을 보게 한다. 전체 DB 스냅샷을 Firestore에 올리고
내리는 방식이다.

관련 문서: `spec-v0.4.md`(운동), `spec-finance-v0.11.md`(가계부)

---

## 0. 목표와 비목표

### 목표

- 한 사람이 폰과 PC에서 **같은 기록**을 본다
- 여러 사람이 쓴다. 이름으로 기록이 **격리**된다
- 기존 Dexie 쿼리 코드(`src/db/`, `src/finance/db/` 약 3,300줄)를 **고치지 않는다**
- 서버를 만들지 않는다. GitHub Pages 정적 배포를 유지한다

### 비목표 (v0.1에서 하지 않는다)

- **동시 편집 병합.** 두 기기에서 같은 시점에 입력하면 레코드 단위로 합치지
  않는다. 어느 쪽 스냅샷을 쓸지 사용자에게 묻는다(§6)
- **레코드 단위 동기화.** `updatedAt`·tombstone을 도입하지 않는다.
  현재 코드는 삭제가 전부 하드 삭제이고 레코드별 타임스탬프가 없어서,
  레코드 단위로 가려면 모든 쓰기 경로를 고쳐야 한다. 그 비용을 지금 치르지 않는다
- **오프라인 첫 로그인.** 새 계정의 최초 진입은 온라인을 요구한다(§7)
- **비밀번호 재설정.** 이메일이 없으므로 PIN을 잊으면 복구 수단이 없다(§2.4)

### 왜 스냅샷인가

혼자 쓰는 앱에서 두 기기를 **동시에** 쓰는 일은 거의 없다. 그 전제가 맞다면
"DB 전체를 통째로 주고받기"가 레코드 단위 동기화와 결과가 같고, 비용은
한 자릿수 분의 일이다. 전제가 깨지는 순간(동시 편집)에만 사용자에게 묻고,
덮이는 쪽은 원격 이력에 남겨 복구 가능하게 한다(§5.4).

---

## 1. 전체 구조

```
[기기 A: Dexie workout-log / finance-log]  ← 로컬 원본, 모든 읽기·쓰기
        │  gzip 스냅샷 push (rev CAS)
        ▼
[Firestore users/{uid}/snapshots/{area}/...]  ← 단일 진실 공급원 아님, 전달 매체
        ▲
        │  pull → 로컬 DB 전체 교체
[기기 B: Dexie]
```

**Dexie가 로컬 원본이다.** 화면은 지금처럼 `useLiveQuery`로 Dexie만 본다.
Firestore는 기기 사이의 전달 매체일 뿐이다. 그래서:

- 오프라인에서 앱이 그대로 동작한다. 동기화만 멈춘다
- **Firestore 오프라인 캐시(persistence)를 켜지 않는다.** 로컬 저장은 Dexie가
  담당한다. 두 군데에 같은 데이터를 두면 어느 쪽이 맞는지 알 수 없게 된다
- 읽기 경로에 네트워크가 끼지 않아 화면 응답이 현재와 동일하다

---

## 2. 인증 — 이름 + PIN

### 2.1 사용자가 보는 것

입력 칸 두 개. **이름**(`hyunsu`)과 **숫자 4자리**.

### 2.2 내부 구현

Firebase Auth 이메일/비밀번호를 쓰되, 이메일과 비밀번호를 **앱이 합성**한다.
사용자는 이메일을 모른다.

```
이름 정규화:  trim → 소문자 → /^[a-z0-9_-]{2,20}$/ 검증
합성 이메일:  `${정규화된이름}@kangcoder.local`
비밀번호:     `${pin}#kangcoder-sync-v1`
```

- **왜 Firebase Auth를 끼는가.** 인증이 없으면 Firestore 보안 규칙이 사람을
  구분할 근거가 없어 `allow read, write: if true`가 된다. 그러면 공개 번들의
  설정값을 본 외부인이 **전원의 기록**을 지울 수 있다. 입력 칸 하나로 그걸 막는다
- **왜 이름을 정규화하는가.** `Hyunsu`와 `hyunsu`가 다른 계정이 되면
  "기록이 사라졌다"로 보인다. 정규화해서 같은 계정으로 모은다
- **왜 비밀번호에 접미사를 붙이는가.** Firebase Auth는 비밀번호 최소 6자다.
  4자리 PIN을 그대로 쓸 수 없다. 접미사에 `v1`을 박아 두는 이유는,
  **이 문자열을 나중에 바꾸면 기존 계정 전원이 로그인 불가**가 되기 때문이다.
  바꿀 일이 생기면 버전을 올리고 마이그레이션 경로를 따로 설계한다

### 2.3 PIN 4자리의 위협 모델

4자리는 1만 가지다. 이름을 아는 사람이 무차별 시도할 수 있다는 뜻이다.
받아들이는 근거:

- 막으려는 주 대상은 **인터넷의 외부인**이고, 이름을 모르는 그들에게는
  이름+PIN이 사실상 조합 공간이다
- Firebase Auth가 IP별 시도 횟수를 제한한다(`auth/too-many-requests`)
- 더 민감한 데이터가 들어오면 6자리로 올린다. 그때는 §2.2의 접미사 버전을
  올리지 않고 PIN 길이만 늘리면 되므로 기존 계정이 깨지지 않는다

### 2.4 PIN 분실

복구 수단이 없다. 이메일도 서버도 없다.

완화: 기존 JSON 백업 내보내기를 **유지한다**. 최악의 경우 새 이름을 만들고
파일에서 복원한다. 설정 화면에 "PIN을 잊으면 복구할 수 없습니다. 백업을
내려두세요"를 명시한다.

### 2.5 로그인 실패 메시지

신규 Firebase 프로젝트는 이메일 열거 방지가 켜져 있어 "계정 없음"과
"비밀번호 틀림"을 구분해 주지 않는다(`auth/invalid-credential`로 통합).
그래서 UI를 이렇게 나눈다:

- 로그인 실패 → **"이름 또는 PIN이 맞지 않습니다"** 한 문장
- 새 계정은 **"새 이름으로 시작하기"** 별도 버튼 → `createUserWithEmailAndPassword`
- 이미 있는 이름으로 등록 시도 → `auth/email-already-in-use` →
  "이미 쓰는 이름입니다"

조용히 빈 계정이 생기는 경로가 없다는 것이 이 설계의 요점이다.

### 2.6 세션 유지

Firebase Auth의 기본 persistence(IndexedDB)를 쓴다. 한 번 로그인하면
브라우저·홈화면 앱에서 계속 유지된다. 로그인 화면은 매번 보이지 않는다.

---

## 3. Firestore 데이터 모델

```
users/{uid}
  name: string                 # 'hyunsu' — 표시용
  createdAt: timestamp

users/{uid}/snapshots/{area}             # area = 'workout' | 'finance'
  rev: number                  # 단조 증가. 충돌 판정의 유일한 기준
  dbVersion: number            # Dexie db.verno — §8 가드
  tableNames: string[]         # 이 rev가 담은 테이블 목록
  updatedAt: timestamp         # serverTimestamp() — 표시용
  deviceLabel: string          # '마지막: iPhone' 표시용

users/{uid}/snapshots/{area}/tables/{tableName}
  rev: number                  # 소속 rev. 부분 쓰기 감지용
  gz: Bytes                    # gzip된 JSON 배열

users/{uid}/snapshots/{area}/history/{rev}
  rev, dbVersion, updatedAt, deviceLabel, tables: { [name]: Bytes }
```

### 3.1 왜 area를 나누는가

운동과 가계부는 DB부터 독립이다(CLAUDE.md). rev를 따로 두면 한쪽만
변경됐을 때 다른 쪽을 올리지 않고, 한쪽 충돌이 다른 쪽을 막지 않는다.

### 3.2 왜 테이블당 문서 1개인가

Firestore 문서 한도는 **1 MiB**다. 단일 문서에 다 넣으면 한계에 부딪힌다.
실측 추정:

| | 건수 추정 | 1건 | 합계 |
|---|---|---|---|
| `workoutSets` 10년 | 주4회 × 30세트 × 520주 ≈ 62,000 | ~120 B | **~7.5 MB** |
| `transactions` 10년 | 월 100건 × 120개월 = 12,000 | ~150 B | ~1.8 MB |

둘 다 단일 문서로는 못 담는다. 테이블별로 쪼개면 각각 1 MiB를 쓰고,
gzip이 JSON을 3~5배 줄이므로 테이블 하나당 실데이터 3~5 MB까지 간다.
수십 년 치가 들어간다.

- **왜 base64가 아니라 `Bytes`인가.** base64는 용량을 33% 늘린다.
  Firestore `Bytes`(Uint8Array)는 gzip 결과를 그대로 담는다
- **gzip은 `CompressionStream`으로 한다.** 라이브러리가 필요 없다.
  Safari 16.4+ / iOS 16.4+ 가 요구 사양이다. 미지원 브라우저는
  비압축 JSON 문자열로 폴백하되 "용량 한계가 낮습니다"를 설정 화면에 표시한다
- 읽기 횟수가 pull 1회당 테이블 수(운동 8, 가계부 12)만큼 든다.
  하루 수십 회 pull이어도 무료 한도(일 5만 읽기)의 1% 미만이다

### 3.3 쓰기 원자성

`area` 문서와 그 아래 `tables/*`, `history/{rev}`를 **하나의 Firestore
트랜잭션**으로 쓴다. 테이블 수(최대 12) + 문서 2개로 배치 한도(500)에
한참 못 미친다. 부분 쓰기로 "rev는 5인데 테이블 하나는 4"가 되는 상태가
생기지 않는다. 혹시 생겨도 `tables/*.rev`로 감지해 pull을 거부한다.

### 3.4 보안 규칙

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
      match /{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
    }
  }
}
```

자기 서브트리 밖은 읽기도 쓰기도 불가다. 이름 목록을 조회하는 경로도 없다
(이름 존재 확인은 로그인 시도의 에러 코드로만 드러난다).

### 3.5 설정값 노출

Firebase 설정값(apiKey 등)은 클라이언트 번들에 들어가고, **그것이 정상이다.**
apiKey는 비밀이 아니고 실제 방어선은 §3.4의 규칙이다.

다만 저장소 소스에 직접 박지 않고 Vite 환경변수(`VITE_FIREBASE_*`)로 받아
`.github/workflows/deploy.yml`에서 GitHub Actions secrets로 주입한다.
이유는 보안이 아니라 **프로젝트 교체·분리를 코드 수정 없이 하기 위함**이다.
`.env.local`을 `.gitignore`에 넣는다.

선택: Firebase App Check(reCAPTCHA v3)를 켜면 내 사이트 출처가 아닌 요청을
걸러 계정 생성 남용을 줄일 수 있다. 데이터 격리는 §3.4가 이미 하므로
v0.1 필수는 아니다.

---

## 4. 로컬 동기화 상태

양쪽 Dexie DB에 스토어 하나를 추가한다.

```ts
export interface SyncState {
  id: 'default'
  /** 마지막으로 성공한 pull/push의 원격 rev. 0 = 아직 없음 */
  baseRev: number
  /** 올리지 못한 로컬 변경이 있는가 */
  dirty: boolean
  /** 마지막 push 성공 시각 (표시용) */
  lastSyncedAt: number
  /** pull을 한 번이라도 성공했는가 — §7 시드 가드 */
  everPulled: boolean
}
```

- `src/db/db.ts` → `this.version(3).stores({ syncState: 'id' })`
- `src/finance/db/db.ts` → `this.version(5).stores({ syncState: 'id' })`

기존 스토어를 건드리지 않는 추가라 마이그레이션 함수가 필요 없다.
v2(appSettings)·v3(cycleBudgets)와 같은 패턴이다.

**왜 localStorage가 아닌가.** 기존 규약이기도 하고(`appSettings.ts` 주석),
더 중요하게는 `dirty`를 Dexie 트랜잭션과 같은 저장소에 두면
"데이터는 썼는데 dirty 표시는 못 썼다"가 생기지 않는다.

---

## 5. 동기화 프로토콜

### 5.1 dirty 표시 — DB 레이어를 고치지 않는 방법

모든 쓰기 함수에 `markDirty()`를 끼우면 3,300줄을 건드리게 되고 A안의
이점이 사라진다. 대신 **Dexie 테이블 훅**을 한 곳에서 등록한다.

```ts
for (const table of db.tables) {
  if (table.name === 'syncState') continue
  table.hook('creating', onMutate)
  table.hook('updating', onMutate)
  table.hook('deleting', onMutate)
}
```

`onMutate`는 두 가지를 한다:

1. `setTimeout(0)`으로 **현재 트랜잭션 밖에서** `syncState.dirty = true`를 쓴다.
   훅 안에서 같은 DB에 바로 쓰면 트랜잭션이 꼬인다. 한 틱 미루는 이유가 이것이다
2. push 디바운스 타이머(2초)를 재설정한다

`dirty`를 **push 시도 전에 먼저 영속화**하는 것이 핵심이다. 순서가 반대면
"변경 직후 앱 종료 → dirty 기록 안 됨 → 다음에 자동 pull이 덮음"이 된다.

### 5.2 push

```
1. dirty가 false면 종료
2. dbVersion 가드 확인 (§8)
3. 로컬 전체 테이블 → gzip 스냅샷 생성
4. Firestore 트랜잭션:
     remote = get(snapshots/{area})
     remoteRev = remote?.rev ?? 0
     if (remoteRev !== baseRev) → STALE 반환하고 중단      ★ CAS
     newRev = remoteRev + 1
     set(snapshots/{area}, { rev: newRev, dbVersion, updatedAt: serverTimestamp(), ... })
     set(snapshots/{area}/tables/*, { rev: newRev, gz })
     set(snapshots/{area}/history/{newRev}, {...})
     delete(snapshots/{area}/history/{newRev - 10})        # 이력 10개 유지
5. 성공 → syncState = { baseRev: newRev, dirty: false, lastSyncedAt: now }
6. STALE → 충돌 처리(§6). 로컬은 그대로 두고 dirty를 유지한다
```

★ **이 비교 하나가 §0의 "순서 역전"을 막는다.** 오프라인에 있던 폰의
`baseRev`는 4인데 원격은 이미 5이므로, 폰은 덮지 못하고 충돌로 간다.

### 5.3 pull

```
1. remote = get(snapshots/{area})
2. 원격 없음 → 첫 로그인. everPulled=true로 표시하고 §7로
3. remote.rev === baseRev → 할 일 없음
4. remote.dbVersion !== db.verno → 동기화 중단 (§8)
5. dirty === true → 자동으로 덮지 않는다. 충돌 처리(§6)        ★
6. tables/* 읽어 gunzip → restoreBackup()으로 전체 교체
     (clear + bulkPut. 병합하면 다른 기기에서 지운 항목이 되살아난다)
7. syncState = { baseRev: remote.rev, dirty: false, everPulled: true }
```

★ **이 조건 하나가 §0의 "업로드 전 종료"를 막는다.** 올리지 못한 변경이
있으면 pull이 로컬을 조용히 덮지 않는다.

6단계의 `restoreBackup`은 Dexie 트랜잭션 안에서 돈다. 그 사이 §5.1 훅이
`dirty=true`를 세우므로, 복원 직후 `dirty=false`로 되돌리는 순서가 중요하다.
복원 중에는 훅을 억제하는 플래그(`suppressMutations`)를 둔다.

### 5.4 덮이는 쪽을 남긴다

`history/{rev}`가 있어서, 사용자가 충돌에서 "내 것으로 올리기"를 골라
원격을 덮어도 이전 rev가 남는다. 반대로 "원격 받기"를 골라 로컬이 덮일
때는, **덮기 전에 로컬 스냅샷을 `history/local-{timestamp}`로 먼저 올린다.**

PIN 재설정이 불가능한 설계라서, 유실이 복구 가능하다는 보장이 특히 중요하다.

### 5.5 언제 도는가

| 시점 | 동작 |
|---|---|
| 로그인 직후 | pull (양쪽 area) |
| `visibilitychange` → visible | pull |
| 로컬 변경 후 2초 (디바운스) | push |
| `visibilitychange` → hidden | push 즉시 시도 |
| 설정 화면 "지금 동기화" | pull → push |

`beforeunload`/`pagehide`보다 `visibilitychange: hidden`을 쓴다.
iOS Safari에서 더 확실히 불린다. 그래도 네트워크 요청이 끝나기 전에
탭이 죽을 수 있으므로, **끝까지 올라갔다는 보장은 `dirty=false`뿐이다.**
설정 화면에 "올리지 못한 변경 있음"을 표시한다.

---

## 6. 충돌 — 유일하게 사용자에게 묻는 지점

조건: `dirty === true && remote.rev > baseRev`.
"두 기기가 같은 rev에서 각자 갈라졌다"는 뜻이다.

전면 모달로 띄운다. 배너로 하면 무시하고 계속 입력해서 상황이 나빠진다.

```
다른 기기에서도 기록이 변경되었습니다

  이 기기   : 마지막 동기화 이후 변경 있음
  다른 기기 : MacBook · 10월 7일 21:14

  [ 이 기기 내용으로 올리기 ]   원격은 이력에 보관됩니다
  [ 다른 기기 내용 받기     ]   이 기기 내용은 이력에 보관됩니다
  [ 나중에                 ]   동기화를 멈추고 이 기기에서 계속 작업
```

- **올리기**: `baseRev`를 원격 rev로 맞추고 push를 재시도한다(CAS 통과)
- **받기**: 로컬을 `history/local-*`로 올린 뒤 pull을 강행한다
- **나중에**: `dirty`를 유지하고 자동 동기화를 이 세션 동안 멈춘다

어느 쪽을 골라도 반대쪽이 Firestore 이력에 남는다. 되돌릴 수 없는 선택이
아니라는 점을 문구로 알린다.

---

## 7. 부트스트랩 순서

현재 `useFinanceBootstrap`은 가계부 진입 시 `seedIfEmpty()`로 카테고리
40여 건을 넣는다. 로그인·pull보다 먼저 돌면 두 가지가 깨진다:

- 기존 계정으로 로그인했는데 시드가 먼저 들어가 `dirty=true`가 되고,
  곧장 §6 충돌 모달이 뜬다 (첫 로그인마다)
- 오프라인에서 시드가 들어간 뒤 온라인 복귀하면, 원격에 실제 데이터가
  있는데 로컬엔 기본 카테고리만 있는 상태로 충돌한다

새 순서:

```
1. Firebase Auth 상태 복원 대기          → 스플래시
2. 미로그인                              → LoginScreen
3. 로그인됨 + everPulled === false
     ├─ 온라인 → pull. 원격 있으면 복원, 없으면 seedIfEmpty() + 첫 push
     └─ 오프라인 → "최초 동기화가 필요합니다. 연결을 확인하세요" 화면
                   (시드를 넣지 않는다)
4. 로그인됨 + everPulled === true        → 즉시 앱 진입, pull은 백그라운드
5. 앱 진입 후 ensurePreviousSnapshot 등 나머지 부트스트랩
```

3단계의 오프라인 차단이 §0의 비목표 "오프라인 첫 로그인"이다.
**최초 1회만** 온라인을 요구하고, 그 뒤로는 오프라인에서 완전히 동작한다.

`seedIfEmpty()`는 이미 "categories 0건이면"으로 가드돼 있어 pull 성공 후에는
돌지 않는다. 호출 지점만 옮긴다.

### 7.1 로그인 게이트 위치

`App.tsx`의 `AppShell`에서 `if (settings === undefined) return null` **위**에
들어간다. `appSettings`(운동·가계부 표시 토글)도 Dexie에 있으므로
사용자별 데이터이고, 로그인 전에 읽어선 안 된다.

### 7.2 로그아웃과 계정 전환

Dexie DB는 오리진당 하나다. 로컬에 남기면 다음 사람이 남의 기록을 본다.

```
1. dirty면 push 시도. 실패하면 "올리지 못한 변경이 있습니다. 그래도 로그아웃?"
2. signOut()
3. db.delete() + financeDb.delete()
4. location.reload()
```

`db.delete()` 후 reload를 쓰는 이유: `export const db = new WorkoutDB()`가
모듈 수준 싱글톤이다. DB 이름을 `workout-log-{uid}`로 분기하면 더 깔끔하지만
싱글톤을 팩토리로 바꿔야 하고, 그러면 `db`를 import하는 모든 지점
(`useLiveQuery` 24곳 포함)에 파급이 간다. 삭제 후 reload는 그 비용 없이
같은 결과를 낸다.

### 7.3 이미 기록이 있는 기기 — 최초 도입

**이 절이 없으면 기존 사용자의 기록이 사라진다.** 동기화를 붙이기 전에
폰에서 몇 달째 쓰고 있었다면, 그 기기는 `baseRev=0`이고 `dirty=false`다.
§5.3의 dirty 가드는 "올리지 못한 변경"만 보호하므로 이 상태를 보호하지 않는다.

```
폰: 6개월치 기록, 한 번도 동기화 안 함 (baseRev=0, dirty=false)
PC: 빈 DB로 처음 로그인 → 시드만 담긴 rev=1 을 push
폰: 앱 열기 → rev=1 ≠ baseRev=0 → 자동 pull → clear+bulkPut → 6개월치 소멸
```

해결은 새 경로가 아니라 **초기값**이다. 동기화 코드가 그 기기에서 처음 도는
순간(= `syncState` 레코드가 아직 없는 순간) 로컬에 기록이 있으면
`dirty = true`로 장부를 만든다. 그러면 §5.3의 자동 pull 차단과 §6의 충돌
모달이 그대로 이 데이터를 보호하고, 사용자는 "이 기기 내용으로 올리기"를
골라 자기 기록을 원격의 출발점으로 삼을 수 있다.

`ensureSyncState(db, userDataTables)`가 이것을 한다. 판단에 쓰는 테이블에서
**시드 테이블은 제외한다** — 가계부의 `groups`·`categories`·`incomeSettings`는
`seedIfEmpty`가 채우므로, 포함하면 갓 시드된 새 기기까지 dirty가 되어
정상적으로 원격을 받아야 할 때마다 충돌 모달이 뜬다. 운동 쪽은 시드가 없고
`appSettings`만 제외한다(영역 토글은 기록이 아니다).

알려진 한계 — 거래를 한 건도 넣지 않고 카테고리만 고친 기기는 "기록 없음"으로
잡힌다. 실사용에서는 §7의 순서(새 기기는 시드 전에 pull)가 이 경우도 덮는다.

### 7.4 도입 절차

기존 기록을 지키는 순서다.

1. **1·2단계를 배포한다.** 로그인 게이트는 화면만 가리고 IndexedDB를 건드리지
   않는다. 지우는 코드가 아직 없다(로그아웃도 `signOut`만 한다)
2. **폰에서 양쪽 JSON 백업을 내려받아 보관한다.** 1단계가 운동 백업 UI를
   추가하므로 이때 처음 가능해진다. 아래의 어떤 설계 장치보다 이 파일이 확실하다
3. 3단계 이후 동기화를 켠다. 폰은 §7.3에 따라 `dirty=true`로 시작하므로
   자동 pull이 돌지 않고, 첫 push에서 폰의 기록이 rev=1이 된다
4. PC는 빈 상태로 로그인해 그 rev=1을 받는다

---

## 8. 스키마 버전 가드

스냅샷에 `dbVersion`(= `db.verno`)을 담는다. `backup.ts`가 이미 하고 있다.

**로컬 `verno`와 원격 `dbVersion`이 정확히 같을 때만 pull·push한다.**
다르면 양방향 동기화를 멈추고 "앱을 새로고침해 주세요"를 띄운다.

왜 한쪽 방향도 허용하지 않는가:

- **원격이 높을 때**: 구버전 앱이 모르는 필드를 복원하면, 다음 push에서
  그 필드가 사라진 채 올라간다. 데이터가 조용히 깎인다
- **원격이 낮을 때**: `restoreBackup`은 이미 최신 스키마로 열린 DB에
  `bulkPut`한다. **Dexie 업그레이드 함수는 DB를 열 때만 돈다.** 즉
  finance v1 스냅샷(`category.group`이 문자열)을 v4 DB에 넣으면
  `groupId` 없는 카테고리가 생기고 `upgrade()`는 돌지 않는다

현재 서비스워커가 없으므로(`vite-plugin-pwa`가 `vite.config.ts`에 설정되지
않았다) 새로고침 한 번으로 해소된다. 나중에 PWA를 켤 때는 `autoUpdate`를
써서 이 교착이 길어지지 않게 한다.

---

## 9. 비용

Firestore Spark(무료): 저장 1 GiB, 일 읽기 5만 / 쓰기 2만.

1인 하루 사용을 후하게 잡아 pull 20회 × 테이블 20개 = 400 읽기,
push 30회 × 문서 25개 = 750 쓰기. 한 자릿수 퍼센트다.
사용자가 열 명이어도 한도 안이다. Firebase Auth는 무료다.

문서 한도 1 MiB는 §3.2에서 테이블 분할 + gzip으로 대응한다.
한 테이블의 gzip 결과가 800 KB를 넘으면 설정 화면에 경고를 띄우고,
그때 연도별 샤딩을 v0.2로 설계한다.

---

## 10. 파일 단위 작업

### 새로 만드는 것

| 파일 | 역할 |
|---|---|
| `src/sync/firebase.ts` | 앱 초기화, Auth·Firestore 인스턴스 (persistence 끔) |
| `src/sync/auth.ts` | 이름 정규화, 합성 이메일·비밀번호, 로그인/등록/로그아웃 |
| `src/sync/useAuthUser.ts` | 로그인 상태 훅 — misconfigured/loading/signedOut/signedIn |
| `src/sync/snapshot.ts` | gzip 인코딩·디코딩, 테이블 묶기/풀기 |
| `src/sync/engine.ts` | pull / push(CAS) / 훅 등록 / 디바운스 / 이벤트 배선 |
| `src/sync/syncState.ts` | §4 스토어 접근 + §7.3 `ensureSyncState` (area 양쪽 공용) |
| `src/sync/area.ts` | area 어댑터 — `{ name, db, tableNames }` 두 개 |
| `src/screens/LoginScreen.tsx` | 이름 + PIN, 새 이름으로 시작하기 |
| `src/screens/SyncConflictSheet.tsx` | §6 모달 |
| `src/screens/ConfigErrorScreen.tsx` | env 누락 시 어느 키가 비었는지 띄운다 — §3.5 |
| `src/vite-env.d.ts` | `VITE_FIREBASE_*` 타입 선언 (오타를 컴파일에서 잡는다) |
| `src/db/backup.ts` | 운동용 export/parse/restore — finance 것을 미러링 |
| `firestore.rules` | §3.4 규칙. 콘솔에 붙여넣는 원본을 저장소에 둔다 |
| `.env.local.example` | §3.5 설정값 템플릿 |
| `scripts/check-db.ts` | DB·백업·동기화 장부 하네스 (`npm run check:db`) |
| `scripts/check-auth.ts` | 자격 증명 합성·검증·오류 메시지 하네스 (`npm run check:auth`) |
| `tsconfig.scripts.json` | 하네스용 프로젝트 — src를 import하므로 DOM lib이 필요하고 tsx로 돌리므로 node types도 필요해 app·node 어느 쪽에도 못 끼운다. **루트 `tsconfig.json`에서 참조하지 않는다**: 참조하면 app과 같은 src 파일을 두 프로젝트가 공유해 `tsc -b`가 끝나지 않고, `npm run build`까지 멈춘다. `npm run typecheck`가 따로 본다 |

### 고치는 것

| 파일 | 변경 |
|---|---|
| `src/db/db.ts` | `version(3)` syncState 추가 |
| `src/finance/db/db.ts` | `version(5)` syncState 추가 |
| `src/App.tsx` | 로그인 게이트(§7.1), 동기화 배선 |
| `src/finance/lib/useFinanceBootstrap.ts` | 시드를 pull 이후로(§7) |
| `src/screens/AppSettingsScreen.tsx` | 운동 백업 UI, 계정·동기화 상태, 로그아웃 |
| `vite.config.ts` | 없음 (env는 Vite 기본 동작) |
| `.github/workflows/deploy.yml` | `VITE_FIREBASE_*` secrets 주입 |
| `.gitignore` | `.env.local` |
| `package.json` | deps `firebase`, devDeps `fake-indexeddb`·`tsx`, `check:*` 스크립트 |
| `eslint.config.js` | `node_modules.nosync` 무시 (아래 참고) |
| `CLAUDE.md` | "모든 데이터는 IndexedDB에 있다" 원칙 갱신, 이 문서 참조 |

### 건드리지 않는 것

`src/db/` 와 `src/finance/db/` 의 **쿼리·도메인 로직 약 3,300줄**,
`useLiveQuery` 24곳, 화면 컴포넌트 전부. 이것이 스냅샷 방식을 고른 이유다.

### 구현 순서

CLAUDE.md의 "한 번에 한 화면씩"에 맞춰 나눈다.

1. `syncState` 스토어 + 운동 `backup.ts` (동기화 없이, 백업 UI로 검증)
2. Firebase 프로젝트·규칙·env 배선, `firebase.ts` + `auth.ts` + LoginScreen
3. `snapshot.ts` + push/pull (수동 버튼만. 자동 없음)
4. 훅 기반 dirty + 디바운스 자동 동기화
5. 충돌 모달(§6) + 이력(§5.4)
6. 부트스트랩 순서 변경(§7), 로그아웃(§7.2)

1·2·3·4는 Node 하네스로 검증한다 — DB는 `fake-indexeddb`, 자격 증명 합성은
순수 함수다(`npm run check`).

### 검증 명령

| 명령 | 범위 |
|---|---|
| `npm run typecheck` | `tsc -b`(app·node) + scripts 프로젝트 |
| `npm run check` | Node 하네스 — DB·백업·장부, 자격 증명 |
| `npm run lint` | ESLint |
| `npm run build` | 배포와 같은 경로 |

`npx tsc --noEmit` 은 **쓰지 않는다.** 루트 `tsconfig.json`이 `"files": []` +
references 구조라 `-b` 없이 돌리면 대상 파일이 0개여서 아무것도 검사하지
않고 통과한다.

### 개발 환경 참고 — node_modules와 iCloud

저장소가 iCloud Drive 안에 있어서 `node_modules`(firebase 설치 후 +157MB)를
iCloud가 동기화하면 tsc·vite가 수 분씩 걸린다. iCloud는 `.nosync`로 끝나는
디렉터리를 건너뛰므로 다음처럼 빼 둔다:

```
mv node_modules node_modules.nosync
ln -s node_modules.nosync node_modules
```

부작용 하나 — ESLint의 기본 무시 패턴이 `node_modules/**`라 실제 경로
`node_modules.nosync/...`에 걸리지 않아 의존성 안까지 린트한다.
`eslint.config.js`의 `globalIgnores`에 추가해 둔다. Firestore는
`@firebase/rules-unit-testing` 에뮬레이터로 §3.4 규칙과 CAS를 테스트한다.
