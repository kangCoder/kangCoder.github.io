import {
  Bytes,
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
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
import { ensureSyncState, patchSyncState } from './syncState'

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

export type PushResult =
  | {
      status: 'pushed'
      rev: number
      bytes: number
      /** 한도에 가까운 테이블. 10년치쯤에서 처음 뜬다 — §9 */
      nearLimit?: { table: string; bytes: number }
    }
  /** 올릴 변경이 없다. 빈 로컬로 원격을 덮는 사고를 막는다 */
  | { status: 'clean' }
  /** CAS 실패 — 다른 기기가 먼저 올렸다. 5단계의 충돌 모달이 받는다 */
  | { status: 'stale'; remoteRev: number; baseRev: number }
  | { status: 'blocked'; reason: 'dbVersion'; remote: number; local: number }
  | { status: 'blocked'; reason: 'tooLarge'; table: string; bytes: number }

/**
 * 로컬 스냅샷을 올린다 — §5.2
 *
 * `dirty`가 false면 올리지 않는다. 수동 버튼이라도 그렇다 — 막 로그인한
 * 빈 기기에서 누르면 원격의 실제 기록을 빈 스냅샷으로 덮기 때문이다.
 * 예외는 원격이 아직 비어 있을 때로, 그때는 올릴 것이 없어도 무해하다.
 */
export async function push(area: SyncArea): Promise<PushResult> {
  const state = await ensureSyncState(area.db, area.userDataTables)
  const head = await readRemoteHead(area)

  if (!state.dirty && head !== undefined) return { status: 'clean' }

  if (head !== undefined && head.dbVersion !== area.db.verno) {
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
    stale = undefined
    const current = await tx.get(areaDoc(area))
    const remoteRev = current.exists() ? Number(current.data().rev ?? 0) : 0

    // ★ 이 비교가 §0의 "순서 역전"을 막는다. 오프라인에 있던 기기의
    //    baseRev는 원격보다 뒤처져 있으므로 덮지 못한다.
    if (remoteRev !== state.baseRev) {
      stale = { remoteRev, baseRev: state.baseRev }
      return
    }

    pushedRev = remoteRev + 1
    tx.set(areaDoc(area), {
      rev: pushedRev,
      dbVersion: area.db.verno,
      tableNames: [...area.tableNames],
      updatedAt: serverTimestamp(),
      deviceLabel: deviceLabel(),
    })
    for (const [name, table] of Object.entries(encoded)) {
      tx.set(tableDoc(area, name), {
        rev: pushedRev,
        ...(table.gz
          ? { gz: Bytes.fromUint8Array(table.gz) }
          : { json: table.json }),
      })
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
  if (head.dbVersion !== area.db.verno) {
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

  return area.db.transaction('rw', [area.db.syncState, ...tables], async () => {
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
  })
}
