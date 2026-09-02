/** 시간 표기 — React에 의존하지 않는 순수 함수 */

/** 1:05:23 / 5:23 형식 */
export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, '0')
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

/** 62분 — 목록에서 쓰는 거친 표기 */
export function formatMinutes(ms: number): string {
  return `${Math.max(1, Math.round(ms / 60000))}분`
}
