/**
 * 예상 연 수익률 값 규칙.
 *
 * 몇 %를 가정할지는 사람마다 다르므로 직접 입력받는다.
 * 컴포넌트와 파일을 나눠 두어야 fast refresh가 동작한다.
 */
export const DEFAULT_RATE_PERCENT = 6

export const MAX_RATE_PERCENT = 100

/** 계산 시점에만 자른다. 입력 도중에 값이 튀지 않게 하기 위해서다. */
export function clampRatePercent(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0
  return Math.min(MAX_RATE_PERCENT, Math.max(0, value))
}
