import { useEffect } from 'react'

/**
 * 세션 동안 화면이 꺼지지 않게 잡아 둔다 — §6.2의 1순위 대책.
 *
 * iOS PWA는 백그라운드에서 JS 타이머를 이어갈 수 없다. 화면만 켜져 있으면
 * 타이머가 정상 동작하고 소리·진동도 즉시 울린다. Safari 18.4부터 홈 화면
 * 웹앱에서 쓸 수 있고, 지원하지 않는 환경에서는 조용히 넘어간다.
 *
 * 브라우저는 탭이 백그라운드로 가면 잠금을 자동 해제하므로 복귀 시 다시 잡는다.
 * 실기기에서만 검증 가능하다 — 데스크톱·시뮬레이터로는 확인되지 않는다.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return

    let sentinel: WakeLockSentinel | undefined
    let cancelled = false

    const acquire = async () => {
      try {
        const next = await navigator.wakeLock.request('screen')
        if (cancelled) {
          void next.release()
          return
        }
        sentinel = next
      } catch {
        // 배터리 절약 모드 등으로 거부될 수 있다. 앱은 그대로 동작해야 한다.
      }
    }

    void acquire()

    const onVisible = () => {
      if (!document.hidden && sentinel?.released !== false) void acquire()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release()
    }
  }, [active])
}
