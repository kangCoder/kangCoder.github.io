import { createContext, useContext } from 'react'

/**
 * 휴식 타이머 컨텍스트 — spec-v0.5.md §6.2
 *
 * 프로바이더 컴포넌트(`restTimer.tsx`)와 분리해 둔다. 한 파일이 컴포넌트와
 * 그 밖의 것을 함께 export하면 fast refresh가 동작하지 않는다
 * (`exerciseTypeMeta.ts`와 같은 이유).
 */
export interface RestState {
  /** 이 타이머를 식별하고, 첫 프레임의 기준 시각이 된다 */
  startedAt: number
  endsAt: number
  label: string
}

export interface RestTimer {
  rest: RestState | undefined
  remainingMs: number
  start: (label: string, seconds: number) => void
  extend: (seconds: number) => void
  dismiss: () => void
}

export const RestTimerContext = createContext<RestTimer | undefined>(undefined)

export function useRestTimer(): RestTimer {
  const value = useContext(RestTimerContext)
  if (!value) throw new Error('RestTimerProvider 안에서만 쓸 수 있습니다')
  return value
}
