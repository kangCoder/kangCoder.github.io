import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Button } from '../components/Button'
import { SYNC_AREAS, type SyncArea } from '../sync/area'
import { pull, push, type PullResult, type PushResult } from '../sync/engine'
import { getSyncState } from '../sync/syncState'

/**
 * 수동 동기화 — docs/spec-sync-v0.1.md §5, 구현 3단계
 *
 * 자동 동기화(4단계)가 붙기 전까지 버튼으로만 돈다. 이 단계에서 수동으로
 * 두는 이유는 push/pull과 CAS 가드를 **눈으로 확인하고 넘어가기** 위해서다.
 * 자동부터 붙이면 뭐가 언제 돌았는지 알 수 없다.
 *
 * 영역별로 따로 보여준다. rev가 독립이므로 한쪽만 올라가 있는 상태가 정상이다(§3.1).
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
        아직 수동입니다. <b>올리기</b>는 이 기기 기록을 원격에 쓰고,{' '}
        <b>받기</b>는 원격으로 이 기기를 덮습니다. 올리지 못한 변경이 있으면
        받기가 멈춥니다 — 덮이기 전에 먼저 올리세요.
      </p>
    </section>
  )
}

function AreaRow({ area }: { area: SyncArea }) {
  const state = useLiveQuery(() => getSyncState(area.db), [area.id])
  const [busy, setBusy] = useState<'push' | 'pull'>()
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()

  async function run(mode: 'push' | 'pull') {
    setBusy(mode)
    setMessage(undefined)
    setError(undefined)
    try {
      const result = mode === 'push' ? await push(area) : await pull(area)
      const text = describe(result)
      if (result.status === 'pushed' || result.status === 'pulled') {
        setMessage(text)
      } else if (result.status === 'clean' || result.status === 'uptodate') {
        setMessage(text)
      } else {
        setError(text)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '동기화하지 못했습니다')
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-zinc-900">{area.label}</p>
          <p className="text-[12px] text-zinc-500 tabular-nums">
            {state === undefined
              ? '…'
              : `rev ${state.baseRev}${state.dirty ? ' · 올릴 변경 있음' : ''}${
                  state.lastSyncedAt > 0
                    ? ` · ${new Date(state.lastSyncedAt).toLocaleString('ko-KR')}`
                    : ''
                }`}
          </p>
        </div>
        <Button disabled={busy !== undefined} onClick={() => void run('push')}>
          {busy === 'push' ? '…' : '올리기'}
        </Button>
        <Button disabled={busy !== undefined} onClick={() => void run('pull')}>
          {busy === 'pull' ? '…' : '받기'}
        </Button>
      </div>
      {message && (
        <p className="mt-2 text-[13px] text-emerald-700">{message}</p>
      )}
      {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
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
      return '올릴 변경이 없습니다'
    case 'uptodate':
      return `최신입니다 (rev ${result.rev})`
    case 'empty':
      return '원격에 아직 기록이 없습니다. 먼저 올려주세요'
    case 'stale':
      return `다른 기기가 먼저 올렸습니다 (원격 rev ${result.remoteRev}, 이 기기 ${result.baseRev}). 덮어쓰기 선택은 다음 단계에서 붙습니다`
    case 'blocked':
      switch (result.reason) {
        case 'dirty':
          return `올리지 못한 변경이 있어 받기를 멈췄습니다 (원격 rev ${result.remoteRev}). 먼저 올리세요`
        case 'dbVersion':
          return `앱 버전이 다릅니다 (원격 DB v${result.remote}, 이 기기 v${result.local}). 양쪽 모두 새로고침하세요`
        case 'tooLarge':
          return `${result.table}이 문서 한도를 넘습니다 (${formatBytes(result.bytes)})`
        case 'partial':
          return `원격 스냅샷이 불완전합니다 (${result.table}). 다시 올려주세요`
      }
  }
}
