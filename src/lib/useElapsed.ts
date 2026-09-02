import { useEffect, useState } from 'react'

/**
 * 경과 시간을 1초마다 다시 계산한다 — §6.1
 *
 * 값을 1씩 더해 나가는 카운트업이 아니라, 매 틱마다 Date.now()와의 차이를
 * 새로 구한다. 그래서 백그라운드로 갔다 돌아와도(틱이 멈춰 있어도) 복귀 즉시
 * 정확한 값이 나온다. 인터벌은 화면을 다시 그리는 신호일 뿐이다.
 */
export function useElapsed(startedAt: number | undefined): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (startedAt === undefined) return
    // useState가 마운트 시점 값을 이미 잡아 두었으므로 여기서 다시 맞출 필요는 없다
    const timer = setInterval(() => setNow(Date.now()), 1000)

    // 탭 복귀 시 다음 틱을 기다리지 않고 바로 맞춘다
    const onVisible = () => {
      if (!document.hidden) setNow(Date.now())
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [startedAt])

  return startedAt === undefined ? 0 : Math.max(0, now - startedAt)
}
