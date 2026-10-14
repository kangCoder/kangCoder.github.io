import type { SyncableDb } from './syncState'

/**
 * 로컬 변경 감지 — docs/spec-sync-v0.1.md §5.1
 *
 * **DB 레이어 3,300줄을 고치지 않기 위한 장치다.** 모든 쓰기 함수에
 * `markDirty()`를 끼우면 스냅샷 방식을 고른 이유가 사라진다. 대신 Dexie
 * 테이블 훅을 한 곳에서 등록한다.
 *
 * 이 모듈은 아무것도 import하지 않는다(타입 제외). engine과 auto가 이쪽을
 * 가져다 쓰는 단방향이어야 순환이 생기지 않는다.
 */

/**
 * 억제 깊이. pull의 전체 교체도 훅을 때리므로, 억제하지 않으면 받아온 직후
 * dirty=true가 되어 남의 스냅샷을 자기 변경으로 착각해 되올린다.
 *
 * 카운터인 이유 — 중첩 호출에서 안쪽이 끝날 때 억제가 풀리면 안 된다.
 */
let suppressDepth = 0

export async function suppressMutations<T>(run: () => Promise<T>): Promise<T> {
  suppressDepth += 1
  try {
    return await run()
  } finally {
    suppressDepth -= 1
  }
}

export function mutationsSuppressed(): boolean {
  return suppressDepth > 0
}

/**
 * 테이블 변경을 구독한다. 억제 중이면 콜백을 부르지 않는다.
 *
 * `tableNames`에 syncState가 없어야 한다 — 있으면 장부를 쓸 때마다 콜백이
 * 돌아 무한 루프가 된다. area.tableNames가 이미 제외하고 있다(§4).
 */
export function watchMutations(
  db: SyncableDb,
  tableNames: readonly string[],
  onMutate: () => void,
): () => void {
  const fire = () => {
    if (!mutationsSuppressed()) onMutate()
  }

  // Dexie는 구독 해제에 같은 함수 참조를 요구한다. 이벤트별로 따로 만든다.
  const creating = () => fire()
  const updating = () => {
    fire()
    // undefined = 추가 수정 없음. 값을 돌려주면 레코드를 바꿔 버린다
    return undefined
  }
  const deleting = () => fire()

  const tables = tableNames.map((name) => db.table(name))
  for (const table of tables) {
    table.hook('creating', creating)
    table.hook('updating', updating)
    table.hook('deleting', deleting)
  }

  return () => {
    for (const table of tables) {
      table.hook('creating').unsubscribe(creating)
      table.hook('updating').unsubscribe(updating)
      table.hook('deleting').unsubscribe(deleting)
    }
  }
}
