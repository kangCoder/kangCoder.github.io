import { useEffect, useRef, useState } from 'react'

/**
 * 남은 시간을 계산한다 — useElapsed와 같은 방식이다(§6.1, §6.2).
 *
 * 값을 1씩 빼 나가는 카운트다운이 아니라, 매 틱마다 종료 시각과 Date.now()의
 * 차이를 새로 구한다. 백그라운드에 있는 동안 틱이 멈춰도 복귀 즉시 정확하다.
 *
 * 시작 시각(startedAt)을 함께 받는 이유 — 새 타이머가 걸린 첫 프레임에는 아직
 * 틱이 한 번도 돌지 않아 기준 시각이 이전 타이머의 것이다. 이때 기준을
 * startedAt으로 맞추면 렌더 중에 Date.now()를 부르지 않고도(순수하게) 정확한
 * 첫 값이 나온다. 연장은 startedAt을 그대로 두고 endsAt만 늘리므로 이미 흐른
 * 시간이 보존된다.
 *
 * 틱은 250ms다. 표시는 초 단위지만, 종료 시점을 1초 이내로 잡아야 알람이
 * 늦게 울리지 않는다.
 */
export function useCountdown(
  startedAt: number | undefined,
  endsAt: number | undefined,
  onFinish: () => void,
): number {
  const [now, setNow] = useState(startedAt ?? 0)

  const [trackedStart, setTrackedStart] = useState(startedAt)
  if (trackedStart !== startedAt) {
    setTrackedStart(startedAt)
    setNow(startedAt ?? 0)
  }

  // onFinish가 매 렌더 새 함수여도 인터벌을 재시작하지 않도록 ref에 담아 둔다
  const onFinishRef = useRef(onFinish)
  useEffect(() => {
    onFinishRef.current = onFinish
  })

  useEffect(() => {
    if (endsAt === undefined) return

    const timer = setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= endsAt) {
        clearInterval(timer)
        onFinishRef.current()
      }
    }, 250)

    // 탭 복귀 시 다음 틱을 기다리지 않고 바로 맞춘다
    const onVisible = () => {
      if (!document.hidden) setNow(Date.now())
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [endsAt])

  return endsAt === undefined ? 0 : Math.max(0, endsAt - now)
}
