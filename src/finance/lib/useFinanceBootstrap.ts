import { useEffect, useState } from 'react'
import { DEFAULT_PAYDAY, getIncomeSetting } from '../db/income'
import { seedIfEmpty } from '../db/seed'
import { ensurePreviousSnapshot } from '../db/snapshots'
import { getCurrentCycleKey } from './cycle'

/**
 * 가계부 진입 시 한 번 도는 초기화 — §4, §5.6
 *
 * 1. DB가 비었으면 시드를 넣는다
 * 2. 직전 사이클의 순자산 스냅샷이 없으면 남긴다(§5.4)
 *
 * **고정비 거래는 자동으로 만들지 않는다.** 실제로 빠져나가지 않은 달에도
 * 지출로 잡히고, 직접 입력한 건과 중복된다. 고정비 화면에서 사용자가
 * 직접 반영한다(§5.6).
 *
 * 사이클이 시작되는 순간 앱이 켜져 있으리라는 보장이 없으므로 진입 시 소급한다.
 * 중복은 [cycleKey+fixedCostId] 인덱스가 막으므로 여러 번 돌아도 안전하다.
 */
export function useFinanceBootstrap(): boolean {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const payday = (await getIncomeSetting())?.payday ?? DEFAULT_PAYDAY
      await seedIfEmpty()

      // 시드 직후에는 급여일이 생겼을 수 있으니 다시 읽는다
      const settled = (await getIncomeSetting())?.payday ?? payday
      await ensurePreviousSnapshot(getCurrentCycleKey(settled))
      if (!cancelled) setReady(true)
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [])

  return ready
}
