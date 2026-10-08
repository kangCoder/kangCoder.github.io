import type Dexie from 'dexie'
import type { EntityTable } from 'dexie'

/**
 * 기기 간 동기화 상태 — spec-sync-v0.1.md §4
 *
 * 운동(`workout-log`)과 가계부(`finance-log`)가 **각자** 이 스토어를 갖는다.
 * 구조가 같으므로 타입과 접근 함수는 한 곳에 두고 Dexie 인스턴스를 받는다.
 *
 * **이 스토어는 백업·스냅샷에 담지 않는다.** 담으면 다른 기기의 스냅샷을
 * 복원할 때 baseRev와 dirty가 그 기기 값으로 덮여, "이미 올렸다"고 착각한
 * 변경이 조용히 사라진다. 동기화 장부는 기기에 속한 것이고 데이터가 아니다.
 *
 * localStorage를 쓰지 않는 이유는 기존 규약이기도 하지만(`appSettings.ts`),
 * 더 중요하게는 dirty가 데이터와 같은 저장소에 있어야 "데이터는 썼는데
 * dirty 표시는 못 썼다"가 생기지 않기 때문이다.
 */
export interface SyncState {
  id: 'default'
  /** 마지막으로 성공한 pull/push의 원격 rev. 0 = 원격에 아직 아무것도 없음 */
  baseRev: number
  /** 아직 올리지 못한 로컬 변경이 있는가 — §5.3의 자동 pull 차단 조건 */
  dirty: boolean
  /** 마지막 push 성공 시각(epoch ms). 0 = 없음. 표시용 */
  lastSyncedAt: number
  /** pull을 한 번이라도 성공했는가 — §7의 시드 가드 */
  everPulled: boolean
}

/**
 * WorkoutDB와 FinanceDB가 구조적으로 만족한다.
 * 동기화 코드가 두 DB 중 어느 쪽인지 모르고 동작하게 하는 최소 계약이다.
 */
export interface SyncableDb extends Dexie {
  syncState: EntityTable<SyncState, 'id'>
}

const ID = 'default' as const

export const DEFAULT_SYNC_STATE: SyncState = {
  id: ID,
  baseRev: 0,
  dirty: false,
  lastSyncedAt: 0,
  everPulled: false,
}

/** 레코드가 없으면 기본값을 돌려준다 — appSettings와 같은 규약 */
export async function getSyncState(db: SyncableDb): Promise<SyncState> {
  return (await db.syncState.get(ID)) ?? DEFAULT_SYNC_STATE
}

/**
 * 이 기기에서 동기화 코드가 **처음 도는 순간** 장부를 만든다.
 *
 * 로컬에 이미 기록이 있으면 `dirty = true`로 시작한다 — docs/spec-sync-v0.1.md §7.3
 *
 * 이게 없으면 다음이 일어난다:
 *   폰에 6개월치 기록이 있고 한 번도 동기화하지 않았다(baseRev=0, dirty=false).
 *   PC가 빈 DB로 먼저 로그인해 시드만 담긴 rev=1을 올린다.
 *   폰이 앱을 열면 rev=1 ≠ baseRev=0 이므로 자동 pull이 돌고,
 *   restoreBackup이 clear+bulkPut이라 6개월치가 사라진다.
 *
 * §5.3의 dirty 가드는 "올리지 못한 변경"만 보호한다. "한 번도 올린 적 없는
 * 기존 데이터"도 같은 것으로 취급해야 그 가드가 작동한다. 새 경로를 만들지
 * 않고 초기값만 바꾸는 이유다.
 *
 * userDataTables에서 시드 테이블(가계부의 groups·categories·incomeSettings)은
 * 제외한다. 포함하면 갓 시드된 새 기기까지 dirty가 되어, 정상적으로 원격을
 * 받아야 할 때마다 충돌 모달이 뜬다.
 */
export async function ensureSyncState(
  db: SyncableDb,
  userDataTables: readonly string[],
): Promise<SyncState> {
  const tables = userDataTables.map((name) => db.table(name))

  return db.transaction('rw', [db.syncState, ...tables], async () => {
    const existing = await db.syncState.get(ID)
    if (existing) return existing

    let hasLocalData = false
    for (const table of tables) {
      if ((await table.count()) > 0) {
        hasLocalData = true
        break
      }
    }

    const next: SyncState = { ...DEFAULT_SYNC_STATE, dirty: hasLocalData }
    await db.syncState.put(next)
    return next
  })
}

/**
 * 일부 필드만 바꾼다. 읽고-합치고-쓰기를 한 트랜잭션에 묶는다 —
 * dirty를 세우는 쪽과 push 성공을 기록하는 쪽이 겹치면 한쪽이 사라진다.
 */
export async function patchSyncState(
  db: SyncableDb,
  patch: Partial<Omit<SyncState, 'id'>>,
): Promise<SyncState> {
  return db.transaction('rw', db.syncState, async () => {
    const next: SyncState = { ...(await getSyncState(db)), ...patch, id: ID }
    await db.syncState.put(next)
    return next
  })
}
