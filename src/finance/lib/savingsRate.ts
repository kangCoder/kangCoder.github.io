import type { Deduction } from '../db/types'

/**
 * 저축률 — spec-finance-v0.2.md §2.3
 *
 * 두 값을 병기한다. `(SAVING + TRANSFER) / 실수령액` 하나만 쓰면 분자·분모가
 * 어긋난다. 회사대출 원금과 학자금은 급여에서 원천 차감되어 실수령액에 애초에
 * 포함되지 않기 때문이다. 두 정의의 결과가 7%p 이상 차이나므로 어느 하나를
 * 고르지 않는다.
 */
export interface SavingsRate {
  /** 저축·투자 합 */
  saving: number
  /** 원천 차감된 부채 원금 (급여에서 이미 빠져나간 돈) */
  withheldTransfer: number
  /** 직접 이체한 부채 원금 (Transaction으로 기록된 것) */
  paidTransfer: number
  /** 실수령 기준 — "손에 쥔 돈 중 얼마를 남기는가" */
  rateNet: number
  /** 총소득 기준 — "버는 돈 전체 중 얼마를 남기는가" */
  rateGross: number
}

/**
 * transfer는 두 곳에서 온다. 섞으면 이중 계산된다(§2.3.1).
 * 원천 차감분은 deductions에서만 읽고, Transaction으로 만들지 않는다.
 */
export function calculateSavingsRate(params: {
  saving: number
  paidTransfer: number
  netPay: number
  deductions: Deduction[]
}): SavingsRate {
  const withheldTransfer = sumWithheldTransfer(params.deductions)
  const numerator = params.saving + withheldTransfer + params.paidTransfer

  return {
    saving: params.saving,
    withheldTransfer,
    paidTransfer: params.paidTransfer,
    rateNet: params.netPay > 0 ? numerator / params.netPay : 0,
    rateGross:
      params.netPay + withheldTransfer > 0
        ? numerator / (params.netPay + withheldTransfer)
        : 0,
  }
}

export function sumWithheldTransfer(deductions: Deduction[]): number {
  return deductions
    .filter((deduction) => deduction.isTransfer)
    .reduce((sum, deduction) => sum + deduction.amount, 0)
}
