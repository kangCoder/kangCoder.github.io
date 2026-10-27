import {
  Bytes,
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import type { Transaction } from 'firebase/firestore'
import { getFirebaseAuth, getFirestoreDb } from './firebase'
import type { SyncArea } from './area'
import {
  decodeTable,
  encodeTable,
  encodedSize,
  type EncodedTable,
} from './snapshot'
import { suppressMutations } from './mutations'
import { ensureSyncState, patchSyncState } from './syncState'
import { pullBlockedByVersion, pushBlockedByVersion } from './version'

/**
 * 동기화 엔진 — docs/spec-sync-v0.1.md §5
 *
 * 3단계에서는 **수동 호출만** 한다. 자동 디바운스와 변경 훅은 4단계,
 * 충돌 모달과 이력은 5단계다.
 */

export class NotSignedInError extends Error {}

/** 문서 한도 1 MiB. 여유를 두고 경고선을 잡는다 — §9 */
const WARN_BYTES = 800 * 1024
const DOC_LIMIT_BYTES = 1024 * 1024

function uid(): string {
  const user = getFirebaseAuth().currentUser
  if (!user) throw new NotSignedInError('로그인이 필요합니다')
  return user.uid
}

function areaDoc(area: SyncArea) {
  return doc(getFirestoreDb(), 'users', uid(), 'snapshots', area.id)
}

function tableDoc(area: SyncArea, tableName: string) {
  return doc(areaDoc(area), 'tables', tableName)
}

function historyDoc(area: SyncArea, rev: number) {
  return doc(areaDoc(area), 'history', String(rev))
}

function historyTableDoc(area: SyncArea, rev: number, tableName: string) {
  return doc(historyDoc(area, rev), 'tables', tableName)
}

/**
 * 이력 보관 개수 — §5.4
 *
 * PIN 재설정이 불가능한 설계라서, 덮어쓰기가 복구 가능하다는 보장이
 * 특히 중요하다. 10개면 실수를 알아차릴 시간이 충분하고, 최악의 경우에도
 * 1 MiB × 10 × 2영역 = 20 MB로 무료 한도(1 GiB) 안이다.
 */
const HISTORY_KEEP = 10

interface RemoteHead {
  rev: number
  dbVersion: number
  updatedAt?: Date
  deviceLabel?: string
}

/** 기기를 구분해 보여주기 위한 라벨. 식별자가 아니라 표시용이다 */
function deviceLabel(): string {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows'
  return '알 수 없는 기기'
}

export async function readRemoteHead(
  area: SyncArea,
): Promise<RemoteHead | undefined> {
  const snapshot = await getDoc(areaDoc(area))
  if (!snapshot.exists()) return undefined
  const data = snapshot.data()
  return {
    rev: Number(data.rev ?? 0),
    dbVersion: Number(data.dbVersion ?? 0),
    updatedAt: data.updatedAt?.toDate?.(),
    deviceLabel: data.deviceLabel,
  }
}

/**
 * 스냅샷 테이블 **전부**가 비었는가 — §5.2-a
 *
 * 처음에는 §7.3의 `userDataTables`(시드 테이블 제외)를 썼다. 그러면
 * 카테고리만 손보고 거래를 아직 넣지 않은 기기가 "비어 있음"으로 잡혀
 * 올리기가 거부된다 — 실제 작업을 했는데 아무 일도 안 일어난다.
 *
 * `userDataTables`를 좁게 둔 목적은 §7.3의 dirty 판정이었다. 거기서는
 * "갓 시드된 새 기기를 충돌로 몰지 않기"가 맞다. 여기서는 목적이 다르다 —
 * **원격을 빈 스냅샷으로 비우는 것**만 막으면 된다.
 *
 * 시드만 있는 기기가 원격의 실제 데이터를 덮는 위험은 FirstSyncGate(§7)가
 * 이미 막는다. 시드보다 pull이 먼저이므로 그 상태에 도달하지 않는다.
 */
async function isLocalEmpty(area: SyncArea): Promise<boolean> {
  for (const name of area.tableNames) {
    if ((await area.db.table(name).count()) > 0) return false
  }
  return true
}

export type PushResult =
  | {
      status: 'pushed'
      rev: number
      bytes: number
      /** 한도에 가까운 테이블. 10년치쯤에서 처음 뜬다 — §9 */
      nearLimit?: { table: string; bytes: number }
    }
  /** 마지막 동기화 이후 바뀐 것이 없다 */
  | { status: 'clean' }
  /**
   * 이 기기에 기록이 없는데 원격에는 있다. 빈 스냅샷으로 덮는 것을 막는다.
   * `force`로도 통과시키지 않는다 — 이 경우에 올려서 얻을 것이 없다.
   */
  | { status: 'refused'; reason: 'emptyLocal'; remoteRev: number }
  /** CAS 실패 — 다른 기기가 먼저 올렸다. 5단계의 충돌 모달이 받는다 */
  | { status: 'stale'; remoteRev: number; baseRev: number }
  | { status: 'blocked'; reason: 'dbVersion'; remote: number; local: number }
  | { status: 'blocked'; reason: 'tooLarge'; table: string; bytes: number }

/**
 * 로컬 스냅샷을 올린다 — §5.2
 *
 * `force`는 사용자가 올리기 버튼을 직접 누른 경우다. 자동 push는 `dirty`가
 * false면 올리지 않는다 — 바뀐 것이 없는데 rev를 올릴 이유가 없다.
 *
 * **`dirty`를 안전 가드로 쓰지 않는다.** 처음엔 그렇게 했는데 틀렸다.
 * 막으려던 위험은 "이 기기에 기록이 없는데 원격에는 있는 상태에서 올려
 * 원격을 비우는 것"이고, 그것은 직접 검사해야 한다. `dirty`를 대리
 * 지표로 쓰면 두 가지가 깨진다:
 *
 *   - 변경 훅이 붙기 전에 쓴 기록은 dirty가 서지 않아 영원히 올라가지 않는다
 *   - 훅이 놓친 쓰기가 생기면 그 기록도 조용히 묻힌다
 *
 * 둘 다 "사용자가 올리기를 눌렀는데 아무 일도 안 일어난다"로 나타난다.
 */
export async function push(
  area: SyncArea,
  force = false,
): Promise<PushResult> {
  const state = await ensureSyncState(area.db, area.userDataTables)
  const head = await readRemoteHead(area)

  if (head !== undefined && (await isLocalEmpty(area))) {
    return { status: 'refused', reason: 'emptyLocal', remoteRev: head.rev }
  }
  if (!force && !state.dirty && head !== undefined) return { status: 'clean' }

  /**
   * **원격이 더 새로울 때만 막는다** — docs/spec-sync-v0.1.md §8
   *
   * 처음엔 "정확히 같을 때만"으로 만들었는데 교착이 생겼다. 원격의
   * `dbVersion`은 *마지막으로 올린 기기의 스키마 기록*이지 상대 기기의
   * 현재 스키마가 아니다. 스키마를 올리면 양쪽 기기가 모두 새 버전이어도
   * 원격 기록은 옛 번호로 남아 있고, 그 상태에서 같을 것을 요구하면
   * 아무도 올릴 수 없어 원격이 영원히 옛 번호에 멈춘다.
   *
   * 올리는 것은 원격을 내 스키마로 **끌어올리는** 동작이므로 옛 원격을
   * 덮는 것이 정상이고, 그게 교착을 푸는 유일한 경로다.
   * 막아야 하는 경우는 반대 방향 하나다 — 내 앱이 원격 데이터보다 낡았으면,
   * 내가 모르는 필드를 떨어뜨린 채 덮어쓴다.
   */
  if (
    head !== undefined &&
    pushBlockedByVersion(head.dbVersion, area.db.verno)
  ) {
    return {
      status: 'blocked',
      reason: 'dbVersion',
      remote: head.dbVersion,
      local: area.db.verno,
    }
  }

  // 인코딩을 트랜잭션 밖에서 끝낸다. 트랜잭션 안에서 오래 걸리면 재시도가
  // 반복되고, 재시도마다 다시 압축하게 된다.
  const encoded: Record<string, EncodedTable> = {}
  let total = 0
  let nearLimit: { table: string; bytes: number } | undefined
  for (const name of area.tableNames) {
    const rows = await area.db.table(name).toArray()
    const table = await encodeTable(rows)
    const bytes = encodedSize(table)
    if (bytes >= DOC_LIMIT_BYTES) {
      return { status: 'blocked', reason: 'tooLarge', table: name, bytes }
    }
    // 한도를 넘기기 전에 알려야 연도별 샤딩(v0.2)을 설계할 시간이 생긴다
    if (bytes >= WARN_BYTES && bytes > (nearLimit?.bytes ?? 0)) {
      nearLimit = { table: name, bytes }
    }
    encoded[name] = table
    total += bytes
  }

  let pushedRev = 0
  let stale: { remoteRev: number; baseRev: number } | undefined

  await runTransaction(getFirestoreDb(), async (tx: Transaction) => {
    // 재시도될 수 있으므로 매번 초기화한다
    stale = undefined

    // --- 읽기를 모두 먼저 한다. Firestore 트랜잭션은 쓰기 뒤 읽기를 거부한다 ---
    const current = await tx.get(areaDoc(area))
    const remoteRev = current.exists() ? Number(current.data().rev ?? 0) : 0

    // ★ 이 비교가 §0의 "순서 역전"을 막는다. 오프라인에 있던 기기의
    //    baseRev는 원격보다 뒤처져 있으므로 덮지 못한다.
    if (remoteRev !== state.baseRev) {
      stale = { remoteRev, baseRev: state.baseRev }
      return
    }

    pushedRev = remoteRev + 1

    // 가지치기 대상의 테이블 목록을 읽어 둔다. 그 rev가 담았던 테이블이
    // 지금과 다를 수 있으므로 area.tableNames로 지우면 남는 문서가 생긴다.
    const prunedRev = pushedRev - HISTORY_KEEP
    const pruned =
      prunedRev > 0 ? await tx.get(historyDoc(area, prunedRev)) : undefined
    const prunedTables: string[] = pruned?.exists()
      ? (pruned.data().tableNames ?? [])
      : []

    // --- 여기서부터 쓰기 ---
    const meta = {
      rev: pushedRev,
      dbVersion: area.db.verno,
      tableNames: [...area.tableNames],
      updatedAt: serverTimestamp(),
      deviceLabel: deviceLabel(),
    }
    tx.set(areaDoc(area), meta)
    tx.set(historyDoc(area, pushedRev), meta)

    for (const [name, table] of Object.entries(encoded)) {
      const payload = table.gz
        ? { gz: Bytes.fromUint8Array(table.gz) }
        : { json: table.json }
      tx.set(tableDoc(area, name), { rev: pushedRev, ...payload })
      tx.set(historyTableDoc(area, pushedRev, name), payload)
    }

    if (pruned?.exists()) {
      for (const name of prunedTables) {
        tx.delete(historyTableDoc(area, prunedRev, name))
      }
      tx.delete(historyDoc(area, prunedRev))
    }
  })

  if (stale) return { status: 'stale', ...stale }

  await patchSyncState(area.db, {
    baseRev: pushedRev,
    dirty: false,
    lastSyncedAt: Date.now(),
    everPulled: true,
  })
  return { status: 'pushed', rev: pushedRev, bytes: total, nearLimit }
}

export type PullResult =
  | { status: 'pulled'; rev: number; rows: number }
  | { status: 'uptodate'; rev: number }
  /** 원격에 아직 아무것도 없다 — 첫 로그인 */
  | { status: 'empty' }
  /** 올리지 못한 로컬 변경이 있다. 조용히 덮지 않는다 — §5.3 */
  | { status: 'blocked'; reason: 'dirty'; remoteRev: number }
  | { status: 'blocked'; reason: 'dbVersion'; remote: number; local: number }
  /** area rev와 테이블 문서 rev가 어긋났다 — §3.3 */
  | { status: 'blocked'; reason: 'partial'; table: string }

/**
 * 원격 스냅샷으로 로컬을 교체한다 — §5.3
 *
 * 병합하지 않는다. 병합하면 다른 기기에서 지운 항목이 되살아난다.
 */
export async function pull(area: SyncArea): Promise<PullResult> {
  const state = await ensureSyncState(area.db, area.userDataTables)
  const head = await readRemoteHead(area)

  if (head === undefined) {
    if (!state.everPulled) await patchSyncState(area.db, { everPulled: true })
    return { status: 'empty' }
  }
  if (head.rev === state.baseRev && !state.dirty) {
    return { status: 'uptodate', rev: head.rev }
  }
  /**
   * 원격이 내 앱보다 새로우면 받지 않는다 — §8
   *
   * 모르는 필드를 복원하면 다음 push에서 그 필드가 사라진 채 올라가
   * 데이터가 조용히 깎인다. 새로고침하면 해소된다.
   *
   * 반대로 원격이 **낡은** 경우는 받는다. 스키마 변경을 필드 추가로만
   * 제한하므로(§8.2) 없는 필드는 그냥 비어 있을 뿐이고, 받지 않으면
   * 올릴 것이 없는 새 기기가 옛 원격을 영원히 못 받는다.
   */
  if (pullBlockedByVersion(head.dbVersion, area.db.verno)) {
    return {
      status: 'blocked',
      reason: 'dbVersion',
      remote: head.dbVersion,
      local: area.db.verno,
    }
  }
  // ★ 이 조건이 §0의 "업로드 전 종료"와 §7.3의 "기존 기록"을 지킨다
  if (state.dirty) {
    return { status: 'blocked', reason: 'dirty', remoteRev: head.rev }
  }

  const snapshot = await getDocs(collection(areaDoc(area), 'tables'))
  const rowsByTable: Record<string, unknown[]> = {}
  for (const document of snapshot.docs) {
    const data = document.data()
    if (Number(data.rev ?? 0) !== head.rev) {
      return { status: 'blocked', reason: 'partial', table: document.id }
    }
    rowsByTable[document.id] = await decodeTable(
      data.gz
        ? { gz: (data.gz as Bytes).toUint8Array() }
        : { json: String(data.json ?? '[]') },
    )
  }

  const rows = await replaceTables(area, rowsByTable, head.rev)
  return { status: 'pulled', rev: head.rev, rows }
}

/**
 * 전체 교체 + 장부 갱신을 **한 트랜잭션**에 묶는다.
 *
 * 나누면 "데이터는 바뀌었는데 baseRev는 그대로"가 생길 수 있고, 그 기기는
 * 다음에 또 pull해서 같은 데이터를 다시 쓴다. 더 나쁜 경우로 dirty가
 * 남아 있으면 남의 스냅샷을 자기 변경으로 착각해 올린다.
 *
 * 원격에 없는 테이블은 건드리지 않는다 — 스키마가 늘어난 직후
 * 구버전 스냅샷을 받을 때 그 테이블을 비우지 않기 위함이다(§8이 그 경우를
 * 이미 막지만 여기서도 파괴적으로 굴지 않는다).
 */
async function replaceTables(
  area: SyncArea,
  rowsByTable: Record<string, unknown[]>,
  rev: number,
): Promise<number> {
  const names = area.tableNames.filter((name) => name in rowsByTable)
  const tables = names.map((name) => area.db.table(name))

  // 억제 없이 돌리면 이 교체가 §5.1의 변경 훅을 때려 dirty=true가 되고,
  // 다음 push가 남의 스냅샷을 자기 변경으로 올린다.
  return suppressMutations(() =>
    area.db.transaction('rw', [area.db.syncState, ...tables], async () => {
      let count = 0
      for (const name of names) {
        const rows = rowsByTable[name]
        await area.db.table(name).clear()
        await area.db.table(name).bulkPut(rows)
        count += rows.length
      }
      await area.db.syncState.put({
        id: 'default',
        baseRev: rev,
        dirty: false,
        lastSyncedAt: Date.now(),
        everPulled: true,
      })
      return count
    }),
  )
}

/**
 * 충돌 해결: 이 기기 내용으로 올린다 — §6
 *
 * baseRev를 원격 rev로 맞춰 CAS를 통과시킨다. 덮이는 원격 rev는 그 기기가
 * 올릴 때 이미 `history/{rev}`에 들어갔으므로 복구 가능하다(§5.4).
 *
 * 맞추는 사이 원격이 또 올라가면 CAS가 다시 걸리고 `stale`이 돌아온다.
 * 그때는 사용자에게 다시 묻는 쪽이 맞다.
 */
export async function keepLocal(area: SyncArea): Promise<PushResult> {
  const head = await readRemoteHead(area)
  await patchSyncState(area.db, { baseRev: head?.rev ?? 0, dirty: true })
  return push(area, true)
}

/**
 * 충돌 해결: 다른 기기 내용을 받는다 — §6
 *
 * **덮기 전에 로컬 스냅샷을 원격 이력에 올린다.** 이 선택은 로컬을
 * 통째로 버리는 것이고, PIN 재설정이 없는 설계에서 복구 수단이 없으면
 * 되돌릴 수 없는 선택이 된다. rev를 쓰지 않고 `local-{timestamp}`에 넣어
 * 진행 중인 rev 번호와 부딪히지 않게 한다.
 */
export async function takeRemote(area: SyncArea): Promise<PullResult> {
  await archiveLocal(area)
  // pull은 dirty면 멈춘다(§5.3). 받겠다는 선택이 그 가드를 대체한다.
  await patchSyncState(area.db, { dirty: false })
  return pull(area)
}

/** 로컬 스냅샷을 `history/local-{timestamp}`로 보관한다 */
async function archiveLocal(area: SyncArea): Promise<string> {
  const id = `local-${Date.now()}`
  const meta = {
    rev: 0,
    dbVersion: area.db.verno,
    tableNames: [...area.tableNames],
    updatedAt: serverTimestamp(),
    deviceLabel: `${deviceLabel()} (덮기 전 보관)`,
  }

  const encoded: Array<[string, EncodedTable]> = []
  for (const name of area.tableNames) {
    encoded.push([name, await encodeTable(await area.db.table(name).toArray())])
  }

  const batch = writeBatch(getFirestoreDb())
  batch.set(doc(areaDoc(area), 'history', id), meta)
  for (const [name, table] of encoded) {
    batch.set(
      doc(areaDoc(area), 'history', id, 'tables', name),
      table.gz ? { gz: Bytes.fromUint8Array(table.gz) } : { json: table.json },
    )
  }
  await batch.commit()
  return id
}
