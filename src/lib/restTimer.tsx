import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  cancelAlarm,
  resumeAlarmContext,
  scheduleAlarm,
  vibrateAlarm,
} from './alarm'
import { RestTimerContext, type RestState } from './restTimerContext'
import { useCountdown } from './useCountdown'

/**
 * 휴식 타이머 상태 — spec-v0.5.md §6.2
 *
 * **라우터 위에 둔다.** 원래 WorkoutScreen의 useState에 있었는데, 다른
 * 화면으로 가면 컴포넌트가 언마운트되며 타이머와 상태가 통째로 사라져
 * 알람이 울리지 않았다. 세션 중에 종목 목록이나 지난 기록을 보러 가는 건
 * 흔한 동작이라 화면에 묶어 둘 상태가 아니다.
 *
 * 타이머 바도 셸에서 그린다 — 어느 화면에 있든 남은 시간이 보여야 한다.
 */

/** 복귀 후 이만큼 지난 예약은 뒤늦게 울리지 않도록 버린다 */
const STALE_MS = 3000

export function RestTimerProvider({ children }: { children: ReactNode }) {
  const [rest, setRest] = useState<RestState>()

  const onFinish = useCallback(() => {
    // 소리는 scheduleAlarm이 WebAudio 클럭에 미리 걸어 두었다.
    // 여기서는 예약할 수 없는 진동만 울린다.
    vibrateAlarm()
  }, [])
  const remainingMs = useCountdown(rest?.startedAt, rest?.endsAt, onFinish)

  const start = useCallback((label: string, seconds: number) => {
    const startedAt = Date.now()
    const endsAt = startedAt + seconds * 1000
    setRest({ startedAt, endsAt, label })
    scheduleAlarm(endsAt)
  }, [])

  const extend = useCallback((seconds: number) => {
    setRest((current) => {
      if (!current) return current
      const endsAt = current.endsAt + seconds * 1000
      // 연장은 같은 타이머의 종료 시각만 바꾼다. 예약을 다시 걸어야
      // 옛 시각에 울리지 않는다.
      scheduleAlarm(endsAt)
      return { ...current, endsAt }
    })
  }, [])

  const dismiss = useCallback(() => {
    cancelAlarm()
    setRest(undefined)
  }, [])

  /**
   * iOS는 앱을 벗어나면 AudioContext를 suspend한다. 그동안 예약된 소리는
   * 울리지 않으므로, 복귀 시 컨텍스트를 되살리고 이미 지난 예약은 버린다.
   * 버리지 않으면 돌아온 순간 뜬금없이 비프가 울린다.
   */
  useEffect(() => {
    const onVisible = () => {
      if (document.hidden) return
      resumeAlarmContext()
      if (rest && Date.now() - rest.endsAt > STALE_MS) cancelAlarm()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [rest])

  return (
    <RestTimerContext value={{ rest, remainingMs, start, extend, dismiss }}>
      {children}
    </RestTimerContext>
  )
}
