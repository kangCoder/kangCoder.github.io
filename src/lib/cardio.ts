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
