import { listCategories } from './categories'
import { financeDb } from './db'

/**
 * 사이클 총예산 — spec-finance §5.1.1
 *
 * 카테고리별 예산 합계를 그대로 쓰면 "이번 달은 좀 줄여 보자" 같은 조정을
 * 카테고리를 전부 고쳐야 할 수 있다. 사이클 단위 상한을 따로 둔다.
 */

export interface CycleBudgetInfo {
  amount: number
  /** 직접 정한 값인가, 카테고리 합계인가 */
  isCustom: boolean
  /** 카테고리 예산 합계 — 비교용으로 늘 함께 보여준다 */
  categoryTotal: number
}

export async function getCycleBudget(
  cycleKey: string,
): Promise<CycleBudgetInfo> {
  const [custom, categories] = await Promise.all([
    financeDb.cycleBudgets.get(cycleKey),
    listCategories(false),
  ])
  const categoryTotal = categories
    .filter((category) => category.type === 'EXPENSE')
    .reduce((sum, category) => sum + category.budget, 0)

  return {
    amount: custom?.amount ?? categoryTotal,
    isCustom: custom !== undefined,
    categoryTotal,
  }
}

export async function setCycleBudget(
  cycleKey: string,
  amount: number,
): Promise<void> {
  await financeDb.cycleBudgets.put({
    cycleKey,
    amount: Math.max(0, Math.trunc(amount)),
  })
}

/** 직접 정한 값을 지우면 카테고리 합계로 돌아간다 */
export async function clearCycleBudget(cycleKey: string): Promise<void> {
  await financeDb.cycleBudgets.delete(cycleKey)
}
