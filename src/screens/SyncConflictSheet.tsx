import { useState } from 'react'
import { Button } from '../components/Button'
import type { SyncArea } from '../sync/area'
import { SYNC_AREAS } from '../sync/area'
import { clearSyncIssue, pauseSync, type Conflict } from '../sync/auto'
import { keepLocal, takeRemote } from '../sync/engine'
import { useSyncStatuses } from '../sync/useSyncStatus'

/**
 * 충돌 — docs/spec-sync-v0.1.md §6
 *
 * **전면 모달로 띄운다.** 배너로 하면 무시하고 계속 입력해서 상황이
 * 나빠진다. 어느 쪽을 골라도 반대쪽이 Firestore 이력에 남으므로
 * 되돌릴 수 없는 선택이 아니라는 점을 문구로 알린다(§5.4).
 *
 * 영역이 둘 다 충돌하면 하나씩 처리한다. 한 모달에 둘을 담으면 선택이
 * 섞여 무엇에 동의했는지 불분명해진다.
 */
export function SyncConflictSheet() {
  const statuses = useSyncStatuses()
  const area = SYNC_AREAS.find((candidate) => statuses[candidate.id]?.conflict)
  const conflict = area ? statuses[area.id].conflict : undefined

  if (!area || !conflict) return null
  return <ConflictDialog key={area.id} area={area} conflict={conflict} />
}

function ConflictDialog({
  area,
  conflict,
}: {
  area: SyncArea
  conflict: Conflict
}) {
  const [busy, setBusy] = useState<'local' | 'remote'>()
  const [error, setError] = useState<string>()

  async function resolve(choice: 'local' | 'remote') {
    setBusy(choice)
    setError(undefined)
    try {
      const result =
        choice === 'local' ? await keepLocal(area) : await takeRemote(area)

      if (result.status === 'stale') {
        setError('그 사이 다른 기기가 또 올렸습니다. 다시 선택해 주세요')
        setBusy(undefined)
        return
      }
      if (result.status === 'blocked') {
        setError('동기화가 막혀 있습니다. 양쪽 앱을 새로고침해 주세요')
        setBusy(undefined)
        return
      }
      clearSyncIssue(area)
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리하지 못했습니다')
      setBusy(undefined)
    }
  }

  const when = conflict.updatedAt
    ? conflict.updatedAt.toLocaleString('ko-KR')
    : '시각 미확인'

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-zinc-900/50" />
      <div
        role="alertdialog"
        aria-label={`${area.label} 동기화 충돌`}
        className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
      >
        <h2 className="text-[17px] font-semibold text-zinc-900">
          {area.label} — 다른 기기에서도 변경되었습니다
        </h2>

        <dl className="mt-3 flex flex-col gap-1 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">이 기기</dt>
            <dd className="text-right text-zinc-900 tabular-nums">
              올릴 변경 있음 · rev {conflict.baseRev}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">다른 기기</dt>
            <dd className="text-right text-zinc-900 tabular-nums">
              {conflict.deviceLabel ?? '알 수 없는 기기'} · rev{' '}
              {conflict.remoteRev}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">마지막 변경</dt>
            <dd className="text-right text-zinc-500 tabular-nums">{when}</dd>
          </div>
        </dl>

        {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}

        <div className="mt-4 flex flex-col gap-2">
          <Button
            variant="primary"
            disabled={busy !== undefined}
            onClick={() => void resolve('local')}
          >
            {busy === 'local' ? '올리는 중…' : '이 기기 내용으로 올리기'}
          </Button>
          <Button
            disabled={busy !== undefined}
            onClick={() => void resolve('remote')}
          >
            {busy === 'remote' ? '받는 중…' : '다른 기기 내용 받기'}
          </Button>
          <Button
            variant="ghost"
            disabled={busy !== undefined}
            onClick={() => pauseSync(area)}
          >
            나중에
          </Button>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-zinc-400">
          어느 쪽을 골라도 반대쪽 내용은 원격 이력에 보관됩니다. 되돌릴 수 없는
          선택이 아닙니다. <b>나중에</b>를 고르면 이 기기에서 계속 작업하되
          동기화가 멈춥니다.
        </p>
      </div>
    </div>
  )
}
