import { SYNC_AREAS, type SyncArea } from './area'
import {
  pull,
  push,
  readRemoteHead,
  type PullResult,
  type PushResult,
} from './engine'
import { watchMutations } from './mutations'
import { getSyncState, patchSyncState } from './syncState'

/**
 * 자동 동기화 — docs/spec-sync-v0.1.md §5.1, §5.5
 *
 * 3단계의 수동 버튼은 그대로 남는다. 이 모듈은 그것을 **언제** 부를지만 정한다.
 *
 * | 시점 | 동작 |
 * |---|---|
 * | 로그인 직후 | pull |
 * | 탭이 보이게 됨 | pull |
 * | 로컬 변경 후 2초 | push |
 * | 탭이 숨겨짐 | push 즉시 |
 */

const DEBOUNCE_MS = 2000

export interface Conflict {
  remoteRev: number
  baseRev: number
  deviceLabel?: string
  updatedAt?: Date
}

export type Blocked =
  | { kind: 'dbVersion'; remote: number; local: number }
  | { kind: 'tooLarge'; table: string; bytes: number }
  | { kind: 'partial'; table: string }

export interface AreaSyncStatus {
  phase: 'idle' | 'pulling' | 'pushing'
  /** 두 기기가 같은 rev에서 갈라졌다. §6 모달이 받는다 */
  conflict?: Conflict
  blocked?: Blocked
  /** 네트워크 등 일시적 실패. 다음 기회에 다시 시도한다 */
  error?: string
  /** 사용자가 "나중에"를 골랐다. 새로고침이나 재로그인까지 멈춘다 */
  paused: boolean
}

const IDLE: AreaSyncStatus = { phase: 'idle', paused: false }

// ─── 구독 가능한 상태 ────────────────────────────────────────────────
// useSyncExternalStore가 요구하는 대로 **불변 스냅샷**을 유지한다.
// 매 호출에 새 객체를 만들면 렌더 루프에 빠진다.

type StatusMap = Readonly<Record<string, AreaSyncStatus>>

let statuses: StatusMap = Object.fromEntries(
  SYNC_AREAS.map((area) => [area.id, IDLE]),
)
const listeners = new Set<() => void>()

export function subscribeSyncStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSyncStatuses(): StatusMap {
  return statuses
}

function update(area: SyncArea, patch: Partial<AreaSyncStatus>): void {
  const next = { ...statuses[area.id], ...patch }
  statuses = { ...statuses, [area.id]: next }
  for (const listener of listeners) listener()
}

/** 충돌·차단을 지운다. 해결을 시도하기 직전에 부른다 */
export function clearSyncIssue(area: SyncArea): void {
  update(area, { conflict: undefined, blocked: undefined, error: undefined })
}

export function pauseSync(area: SyncArea): void {
  update(area, { paused: true, conflict: undefined })
}

export function resumeSync(area: SyncArea): void {
  update(area, { paused: false, error: undefined })
}

// ─── 결과 해석 ───────────────────────────────────────────────────────

/**
 * 네트워크 실패와 진짜 오류를 구분한다. 오프라인은 흔한 정상 상태라
 * 사용자에게 오류로 들이밀지 않는다 — Firestore 캐시를 끈 대가다(§1).
 */
function describeError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''
  if (code === 'unavailable' || code === 'failed-precondition') {
    return '연결되지 않아 동기화를 미뤘습니다'
  }
  if (code === 'permission-denied') {
    return '권한이 없습니다. 보안 규칙을 확인하세요'
  }
  return error instanceof Error ? error.message : '동기화하지 못했습니다'
}

async function toConflict(
  area: SyncArea,
  remoteRev: number,
  baseRev: number,
): Promise<Conflict> {
  // 모달에 "MacBook · 10월 7일 21:14"을 띄우기 위한 한 번의 추가 읽기.
  // 충돌은 드물므로 평상시 비용이 아니다.
  try {
    const head = await readRemoteHead(area)
    return {
      remoteRev,
      baseRev,
      deviceLabel: head?.deviceLabel,
      updatedAt: head?.updatedAt,
    }
  } catch {
    return { remoteRev, baseRev }
  }
}

async function applyPush(area: SyncArea, result: PushResult): Promise<void> {
  if (result.status === 'stale') {
    update(area, {
      conflict: await toConflict(area, result.remoteRev, result.baseRev),
    })
    return
  }
  if (result.status === 'blocked') {
    update(area, {
      blocked:
        result.reason === 'dbVersion'
          ? { kind: 'dbVersion', remote: result.remote, local: result.local }
          : { kind: 'tooLarge', table: result.table, bytes: result.bytes },
    })
    return
  }
  update(area, { error: undefined, blocked: undefined })
}

async function applyPull(area: SyncArea, result: PullResult): Promise<void> {
  if (result.status === 'blocked' && result.reason === 'dirty') {
    const state = await getSyncState(area.db)
    // 원격이 앞서 있지 않으면 충돌이 아니다. 올릴 것이 남아 있을 뿐이라
    // 디바운스된 push가 곧 처리한다.
    if (result.remoteRev > state.baseRev) {
      update(area, {
        conflict: await toConflict(area, result.remoteRev, state.baseRev),
      })
    }
    return
  }
  if (result.status === 'blocked') {
    update(area, {
      blocked:
        result.reason === 'dbVersion'
          ? { kind: 'dbVersion', remote: result.remote, local: result.local }
          : { kind: 'partial', table: result.table },
    })
    return
  }
  update(area, { error: undefined, blocked: undefined })
}

// ─── 실행 ────────────────────────────────────────────────────────────

/**
 * 같은 영역에서 pull과 push가 겹치지 않게 한다.
 *
 * 수동 버튼도 **반드시 이 경로를 지난다.** 우회하면 디바운스된 자동 push와
 * 동시에 돌아 서로의 CAS를 깨고, 상태 표시도 어긋난다.
 */
const running = new Map<string, Promise<unknown>>()

function skip(area: SyncArea): boolean {
  const status = statuses[area.id]
  return status.paused || status.conflict !== undefined
}

async function serialize<T>(
  area: SyncArea,
  run: () => Promise<T>,
): Promise<T> {
  const previous = running.get(area.id) ?? Promise.resolve()
  const next = previous.then(run, run)
  running.set(area.id, next)
  return next
}

/** 건너뛰면 undefined. 일시 중지·충돌 중이거나 네트워크가 실패한 경우다 */
export async function syncPull(
  area: SyncArea,
  force = false,
): Promise<PullResult | undefined> {
  if (!force && skip(area)) return undefined
  return serialize(area, async () => {
    update(area, { phase: 'pulling' })
    try {
      const result = await pull(area)
      await applyPull(area, result)
      return result
    } catch (error) {
      update(area, { error: describeError(error) })
      return undefined
    } finally {
      update(area, { phase: 'idle' })
    }
  })
}

export async function syncPush(
  area: SyncArea,
  force = false,
): Promise<PushResult | undefined> {
  if (!force && skip(area)) return undefined
  return serialize(area, async () => {
    update(area, { phase: 'pushing' })
    try {
      const result = await push(area, force)
      await applyPush(area, result)
      return result
    } catch (error) {
      update(area, { error: describeError(error) })
      return undefined
    } finally {
      update(area, { phase: 'idle' })
    }
  })
}

// ─── 배선 ────────────────────────────────────────────────────────────

/**
 * 변경 훅과 이벤트를 붙인다. 반환값을 부르면 전부 떼어 낸다.
 *
 * 로그인된 동안에만 돌아야 한다 — 로그아웃 상태에서 push하면
 * `NotSignedInError`가 난다.
 */
export function startAutoSync(): () => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const stops: Array<() => void> = []

  const flush = (area: SyncArea) => {
    const timer = timers.get(area.id)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.delete(area.id)
    }
    void syncPush(area)
  }

  for (const area of SYNC_AREAS) {
    stops.push(
      watchMutations(area.db, area.tableNames, () => {
        /**
         * **dirty를 push보다 먼저 영속화한다** — §5.1
         *
         * 순서가 반대면 "변경 직후 앱 종료 → dirty 기록 안 됨 → 다음에
         * 자동 pull이 그 변경을 덮음"이 된다.
         *
         * setTimeout(0)으로 현재 트랜잭션 밖으로 미루는 이유: 훅은 Dexie
         * 트랜잭션 안에서 불리고, 그 안에서 같은 DB에 다시 쓰면 꼬인다.
         */
        setTimeout(() => {
          void patchSyncState(area.db, { dirty: true })
        }, 0)

        const existing = timers.get(area.id)
        if (existing !== undefined) clearTimeout(existing)
        timers.set(
          area.id,
          setTimeout(() => {
            timers.delete(area.id)
            void syncPush(area)
          }, DEBOUNCE_MS),
        )
      }),
    )

    // 로그인 직후 1회
    void syncPull(area)
  }

  /**
   * `pagehide`/`beforeunload`보다 visibilitychange를 쓴다 — iOS Safari에서
   * 더 확실히 불린다. 그래도 요청이 끝나기 전에 탭이 죽을 수 있으므로,
   * 끝까지 올라갔다는 보장은 `dirty=false`뿐이다(§5.5).
   */
  const onVisibility = () => {
    for (const area of SYNC_AREAS) {
      if (document.visibilityState === 'visible') void syncPull(area)
      else flush(area)
    }
  }
  document.addEventListener('visibilitychange', onVisibility)
  stops.push(() =>
    document.removeEventListener('visibilitychange', onVisibility),
  )

  return () => {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
    for (const stop of stops) stop()
  }
}
