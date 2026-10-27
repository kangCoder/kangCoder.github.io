import { financeDb } from './db'
import { getIncomeSetting } from './income'

/**
 * 급여 입력과 원천 공제 — spec-finance-v0.15 §5.9
 *
 * 회사대출 원금처럼 급여에서 바로 빠지는 상환은 **Transaction을 만들지
 * 않는다.** 만들면 저축률의 분자가 두 번 계산된다(§2.3.1). 그래서 부채
 * 잔액을 줄일 근거를 `appliedDeductions`에 따로 남긴다.
 *
 * v0.12까지는 고정비 화면에서 "반영"을 누를 때만 적용됐다. 급여를 입력하는
 * 순간이 자연스러운 시점이고, 그때 이번 달 공제액이 설정값과 다른지도 물을
 * 수 있다 — 상여나 중도 변경이 있으면 매달 같지 않다.
 */

export interface WithheldLink {
  /** 공제 항목 이름. `appliedDeductions`의 키 일부가 된다 */
  label: string
  debtId: string
  debtName: string
  /** 소득 설정에 적어 둔 금액 */
  configured: number
}

/** 부채에 연결된 원천 공제 목록. 없으면 빈 배열 */
export async function listWithheldLinks(): Promise<WithheldLink[]> {
  const [income, debts] = await Promise.all([
    getIncomeSetting(),
    financeDb.debts.toArray(),
  ])
  const debtById = new Map(debts.map((debt) => [debt.id, debt]))

  return (income?.deductions ?? [])
    .filter((deduction) => deduction.isTransfer && deduction.linkedDebtId)
    .map((deduction) => {
      const debt = debtById.get(deduction.linkedDebtId!)
      return {
        label: deduction.label || '(이름 없음)',
        debtId: deduction.linkedDebtId!,
        debtName: debt?.name ?? '(삭제된 부채)',
        configured: deduction.amount,
      }
    })
    .filter((link) => link.debtName !== '(삭제된 부채)')
}

/**
 * 이번 사이클의 원천 공제를 기록한다.
 *
 * `put`이므로 같은 사이클에 다시 부르면 **덮어쓴다.** 급여를 잘못 입력해
 * 고칠 때 공제액도 함께 고쳐져야 하고, 파생 방식이라 덮어쓰기만으로
 * 잔액이 맞는다.
 *
 * `amounts`에 없는 항목은 설정값을 쓴다.
 */
export async function applySalaryDeductions(
  cycleKey: string,
  date: string,
  amounts: Record<string, number> = {},
  /** 이 기록을 만든 급여 거래. 그 거래를 지우면 함께 지워진다 — §5.9 */
  sourceTransactionId?: string,
): Promise<number> {
  const links = await listWithheldLinks()
  if (links.length === 0) return 0

  const now = Date.now()
  await financeDb.appliedDeductions.bulkPut(
    links.map((link) => ({
      id: `${cycleKey}:${link.label}`,
      cycleKey,
      label: link.label,
      debtId: link.debtId,
      amount: Math.max(0, Math.trunc(amounts[link.label] ?? link.configured)),
      appliedAt: now,
      date,
      sourceTransactionId,
    })),
  )
  return links.length
}
