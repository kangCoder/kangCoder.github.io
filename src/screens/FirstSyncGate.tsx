import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '../components/Button'
import { SYNC_AREAS, type SyncArea } from '../sync/area'
import { pull } from '../sync/engine'
import { ensureSyncState } from '../sync/syncState'

/**
 * 최초 동기화 게이트 — docs/spec-sync-v0.1.md §7
 *
 * **시드보다 pull이 먼저여야 한다.** 가계부는 진입 시 `seedIfEmpty()`로
 * 카테고리 40여 건을 넣는다. 기존 계정으로 로그인했는데 시드가 먼저 들어가면
 * dirty=true가 되고, 받아야 할 원격 데이터가 있는데도 충돌 모달이 뜬다.
 *
 * 영역별로 따로 판단한다. 운동만 쓰다가 가계부를 처음 켜는 경우가 있어서,
 * 한쪽이 준비됐다고 다른 쪽도 준비된 것으로 볼 수 없다.
 *
 * 들여보내도 되는 조건(영역별 OR):
 *   - `everPulled` — 원격 상태를 한 번 확인했다
 *   - `dirty` — 이 기기에 올릴 기록이 있다. 시드가 덮을 것이 없다
 *
 * 둘 다 아니면(빈 로컬 + 원격 확인 실패) 들여보내지 않는다. 그대로 들어가면
 * 시드가 들어가고, 온라인 복귀 시 원격의 실제 데이터와 충돌한다.
 */
export function FirstSyncGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<'working' | 'ready' | 'stuck'>('working')
  const [pending, setPending] = useState<string[]>([])
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const blocked: string[] = []

      for (const area of SYNC_AREAS) {
        if (await isReady(area)) continue

        // 원격을 확인한다. 'empty'(원격 없음)도 확인 성공이므로 everPulled가 선다.
        // 'blocked:dirty'는 이 기기에 올릴 것이 있다는 뜻이라 통과시킨다.
        try {
          await pull(area)
        } catch {
          // 네트워크 실패. 아래 isReady가 다시 판단한다
        }
        if (!(await isReady(area))) blocked.push(area.label)
      }

      if (cancelled) return
      setPending(blocked)
      setPhase(blocked.length === 0 ? 'ready' : 'stuck')
    }

    // 'working'으로 되돌리는 것은 재시도 버튼이 한다. 효과 본문에서 동기
    // setState를 부르면 연쇄 렌더가 난다(react-hooks/set-state-in-effect).
    void run()
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (phase === 'ready') return <>{children}</>

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 text-center">
      {phase === 'working' ? (
        <p className="text-[14px] text-zinc-500">기록을 확인하는 중…</p>
      ) : (
        <>
          <h1 className="text-[18px] font-semibold text-zinc-900">
            최초 동기화가 필요합니다
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">
            {pending.join(' · ')}의 원격 기록을 확인하지 못했습니다. 이
            기기에는 아직 기록이 없어서, 지금 들어가면 기본값이 만들어진 뒤
            나중에 원격 기록과 충돌합니다.
          </p>
          <p className="mt-2 text-[13px] text-zinc-500">
            연결을 확인하고 다시 시도해 주세요. 최초 1회만 필요하고, 그 뒤로는
            오프라인에서도 동작합니다.
          </p>
          <Button
            variant="primary"
            className="mt-5"
            onClick={() => {
              setPhase('working')
              setAttempt((n) => n + 1)
            }}
          >
            다시 시도
          </Button>
        </>
      )}
    </div>
  )
}

async function isReady(area: SyncArea): Promise<boolean> {
  const state = await ensureSyncState(area.db, area.userDataTables)
  return state.everPulled || state.dirty
}
