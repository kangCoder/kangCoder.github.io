/** 금액 표시·파싱 — 원 단위 정수만 다룬다(§2.4) */

export function formatWon(amount: number): string {
  return Math.round(amount).toLocaleString('ko-KR')
}

/** "1,143,420원" */
export function formatWonUnit(amount: number): string {
  return `${formatWon(amount)}원`
}

/** 입력 문자열에서 숫자만 남겨 정수로. 빈 값이면 undefined. */
export function parseAmount(text: string): number | undefined {
  const digits = text.replace(/[^\d-]/g, '')
  if (digits === '' || digits === '-') return undefined
  const parsed = Number(digits)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined
}

/** 입력 중에도 천단위 콤마를 유지한다 */
export function formatAmountInput(text: string): string {
  const amount = parseAmount(text)
  return amount === undefined ? '' : amount.toLocaleString('ko-KR')
}

export function formatPercent(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)}%`
}
