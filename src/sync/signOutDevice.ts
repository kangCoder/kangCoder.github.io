import { db } from '../db/db'
import { financeDb } from '../finance/db/db'
import { SYNC_AREAS } from './area'
import { signOutAccount } from './auth'
import { push } from './engine'
import { getSyncState } from './syncState'

/**
 * 로그아웃 — docs/spec-sync-v0.1.md §7.2
 *
 * **로컬 DB를 지운다.** Dexie DB는 오리진당 하나다. 남기면 다음에 다른
 * 이름으로 들어온 사람이 남의 기록을 보게 된다.
 *
 * 지우기 전에 올리지 못한 변경을 올린다. 못 올리면 **지우지 않고** 무엇이
 * 남았는지 돌려준다 — 호출부가 사용자에게 다시 묻는다.
 */

/** 올리지 못한 영역 이름. 빈 배열이면 전부 올라갔다 */
export async function pushBeforeSignOut(): Promise<string[]> {
  const failed: string[] = []
  for (const area of SYNC_AREAS) {
    const state = await getSyncState(area.db)
    if (!state.dirty) continue
    try {
      const result = await push(area)
      if (result.status !== 'pushed') failed.push(area.label)
    } catch {
      failed.push(area.label)
    }
  }
  return failed
}

/**
 * 세션을 끊고 이 기기의 DB를 지운 뒤 새로 시작한다.
 *
 * `db.delete()` 후 reload를 쓰는 이유 — `export const db = new WorkoutDB()`가
 * 모듈 수준 싱글톤이다. DB 이름을 `workout-log-{uid}`로 분기하면 더 깔끔하지만
 * 싱글톤을 팩토리로 바꿔야 하고, `db`를 import하는 모든 지점(useLiveQuery
 * 24곳 포함)에 파급이 간다. 삭제 후 reload는 그 비용 없이 같은 결과를 낸다.
 */
export async function signOutAndClearDevice(): Promise<void> {
  // 먼저 세션을 끊는다. 남아 있으면 삭제 중에 자동 동기화가 깨어나 실패한다.
  await signOutAccount()
  await db.delete()
  await financeDb.delete()
  location.reload()
}
