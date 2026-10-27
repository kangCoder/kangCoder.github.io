/**
 * 유산소는 분으로 입력받고 초로 저장한다.
 * 다른 타입과 단위를 맞춰 두면 집계·리포트에서 분기가 줄어든다.
 */
export function secondsToMinutes(
  seconds: number | undefined,
): number | undefined {
  return seconds === undefined ? undefined : Math.round(seconds / 60)
}

export function minutesToSeconds(
  minutes: number | undefined,
): number | undefined {
  return minutes === undefined ? undefined : Math.round(minutes * 60)
}

/**
 * 초 → 분·초 분해. TIME 타입 입력에서 쓴다 — spec-v0.5.md §4.1.1
 *
 * 러닝을 '시간' 타입으로 등록하면 32분 30초를 1950초로 적어야 했다.
 * 분·초를 따로 받으면 플랭크(초)와 러닝(분)이 한 타입에서 모두 자연스럽다.
 */
export function splitSeconds(seconds: number | undefined): {
  minutes: number | undefined
  seconds: number | undefined
} {
  if (seconds === undefined) return { minutes: undefined, seconds: undefined }
  return { minutes: Math.floor(seconds / 60), seconds: seconds % 60 }
}

/** 분·초를 합쳐 초로. 둘 다 비면 undefined — 미입력과 0초를 구분한다 */
export function joinSeconds(
  minutes: number | undefined,
  seconds: number | undefined,
): number | undefined {
  if (minutes === undefined && seconds === undefined) return undefined
  return (minutes ?? 0) * 60 + (seconds ?? 0)
}

/** "32분 30초" / "45초" — 0분은 숨긴다 */
export function formatMinutesSeconds(total: number | undefined): string {
  if (total === undefined) return '-'
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes === 0) return `${seconds}초`
  if (seconds === 0) return `${minutes}분`
  return `${minutes}분 ${seconds}초`
}
