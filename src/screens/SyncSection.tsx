import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Button } from '../components/Button'
import { SYNC_AREAS, type SyncArea } from '../sync/area'
import {
  resumeSync,
  syncPull,
  syncPush,
  type AreaSyncStatus,
} from '../sync/auto'
import type { PullResult, PushResult } from '../sync/engine'
import { getSyncState } from '../sync/syncState'
import { useSyncStatuses } from '../sync/useSyncStatus'

/**
 * 동기화 상태와 수동 조작 — docs/spec-sync-v0.1.md §5
 *
 * 자동 동기화가 붙은 뒤에도 이 화면은 남는다. "지금 올라갔는지"를 확인할
 * 곳이 없으면 사용자가 앱을 믿지 못한다 — 특히 `dirty`가 남아 있을 때.
 *
 * 버튼은 `auto.ts`의 직렬화 경로를 지난다. 직접 engine을 부르면 디바운스된
 * 자동 push와 동시에 돌아 서로의 CAS를 깨뜨린다.
 */
export function SyncSection() {
  return (
    <section className="px-4 pb-6">
      <h2 className="mb-2 text-[13px] font-medium text-zinc-500">
        기기 간 동기화
      </h2>
      <div className="flex flex-col gap-2">
        {SYNC_AREAS.map((area) => (
          <AreaRow key={area.id} area={area} />
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
        변경 후 약 2초, 그리고 앱을 열거나 덮을 때 자동으로 동기화됩니다.
        <b> 올릴 변경 있음</b>이 남아 있으면 아직 올라가지 않은 것입니다.
      </p>
    </section>
  )
}

function AreaRow({ area }: { area: SyncArea }) {
  const state = useLiveQuery(() => getSyncState(area.db), [area.id])
  const status = useSyncStatuses()[area.id]
  const [message, setMessage] = useState<string>()

  async function run(mode: 'push' | 'pull') {
    setMessage(undefined)
    const result =
      mode === 'push' ? await syncPush(area, true) : await syncPull(area, true)
    setMessage(result ? describe(result) : undefined)
  }

  const busy = status?.phase !== 'idle'

  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-zinc-900">{area.label}</p>
          <p className="text-[12px] text-zinc-500 tabular-nums">
            {state === undefined ? '…' : summarize(state, status)}
          </p>
        </div>
        <Button disabled={busy} onClick={() => void run('push')}>
          {status?.phase === 'pushing' ? '…' : '올리기'}
        </Button>
        <Button disabled={busy} onClick={() => void run('pull')}>
          {status?.phase === 'pulling' ? '…' : '받기'}
        </Button>
      </div>

      {message && (
        <p className="mt-2 text-[13px] text-emerald-700">{message}</p>
      )}
      {status?.blocked && (
        <p className="mt-2 text-[13px] text-red-600">
          {describeBlocked(status.blocked)}
        </p>
      )}
      {status?.error && (
        <p className="mt-2 text-[13px] text-amber-700">{status.error}</p>
      )}
      {status?.paused && (
        <div className="mt-2 flex items-center gap-2">
          <p className="flex-1 text-[13px] text-amber-700">
            동기화를 멈춘 상태입니다
          </p>
          <Button onClick={() => resumeSync(area)}>다시 켜기</Button>
        </div>
      )}
    </div>
  )
}

function summarize(
  state: { baseRev: number; dirty: boolean; lastSyncedAt: number },
  status: AreaSyncStatus | undefined,
): string {
  const parts = [`rev ${state.baseRev}`]
  if (state.dirty) parts.push('올릴 변경 있음')
  if (status?.phase === 'pulling') parts.push('받는 중')
  if (status?.phase === 'pushing') parts.push('올리는 중')
  if (state.lastSyncedAt > 0) {
    parts.push(new Date(state.lastSyncedAt).toLocaleString('ko-KR'))
  }
  return parts.join(' · ')
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function describeBlocked(blocked: NonNullable<AreaSyncStatus['blocked']>) {
  switch (blocked.kind) {
    case 'dbVersion':
      return `앱 버전이 다릅니다 (원격 DB v${blocked.remote}, 이 기기 v${blocked.local}). 양쪽 모두 새로고침하세요`
    case 'tooLarge':
      return `${blocked.table}이 문서 한도를 넘습니다 (${formatBytes(blocked.bytes)})`
    case 'partial':
      return `원격 스냅샷이 불완전합니다 (${blocked.table}). 다시 올려주세요`
  }
}

function describe(result: PushResult | PullResult): string {
  switch (result.status) {
    case 'pushed':
      return (
        `rev ${result.rev}로 올렸습니다 (${formatBytes(result.bytes)})` +
        (result.nearLimit
          ? ` · 주의: ${result.nearLimit.table}이 ${formatBytes(result.nearLimit.bytes)}로 문서 한도(1 MiB)에 가깝습니다`
          : '')
      )
    case 'pulled':
      return `rev ${result.rev}를 받았습니다 (${result.rows}건)`
    case 'clean':
      return '마지막 동기화 이후 바뀐 것이 없습니다'
    case 'refused':
      return `이 기기에는 기록이 없어 올리지 않았습니다 (원격 rev ${result.remoteRev}). 먼저 받기를 눌러주세요`
    case 'uptodate':
      return `최신입니다 (rev ${result.rev})`
    case 'empty':
      return '원격에 아직 기록이 없습니다. 먼저 올려주세요'
    case 'stale':
      return `다른 기기가 먼저 올렸습니다 (원격 rev ${result.remoteRev}). 선택 창이 뜹니다`
    case 'blocked':
      return result.reason === 'dirty'
        ? `올리지 못한 변경이 있어 받기를 멈췄습니다 (원격 rev ${result.remoteRev})`
        : describeBlocked(
            result.reason === 'dbVersion'
              ? { kind: 'dbVersion', remote: result.remote, local: result.local }
              : result.reason === 'tooLarge'
                ? {
                    kind: 'tooLarge',
                    table: result.table,
                    bytes: result.bytes,
                  }
                : { kind: 'partial', table: result.table },
          )
  }
}
