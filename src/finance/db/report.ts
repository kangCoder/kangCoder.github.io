import { shiftCycle } from '../lib/cycle'
import { getCycleCategoryBudgets } from './budgetPlan'
import { listCategories } from './categories'
import { financeDb } from './db'
import type { Transaction } from './types'

/** 사이클 리포트 집계 — spec-finance §5.3 */

export interface ReportRow {
  categoryId: string
  name: string
  group: string
  isFixed: boolean
  budget: number
  spent: number
  /** 예산 − 실제. 음수면 초과 */
  diff: number
  /** 이번 − 전 사이클 */
  delta: number
}

export interface CycleReport {
  cycleKey: string
  rows: ReportRow[]
  totalBudget: number
  totalSpent: number
  previousSpent: number
  fixedSpent: number
  variableSpent: number
  /** 지출 상위 5개 */
  top: ReportRow[]
}

export async function getCycleReport(cycleKey: string): Promise<CycleReport> {
  const previousCycle = shiftCycle(cycleKey, -1)

  const [current, previous, categories, groups, planned] = await Promise.all([
    financeDb.transactions.where('cycleKey').equals(cycleKey).toArray(),
    financeDb.transactions.where('cycleKey').equals(previousCycle).toArray(),
    listCategories(false),
    financeDb.groups.toArray(),
    // 그 사이클에 정한 예산으로 평가해야 과거 리포트가 변하지 않는다
    getCycleCategoryBudgets(cycleKey),
  ])

  const groupName = new Map(groups.map((group) => [group.id, group.name]))
  const spentOf = (rows: Transaction[], categoryId: string) =>
    rows
      .filter((tx) => tx.type === 'EXPENSE' && tx.categoryId === categoryId)
      .reduce((sum, tx) => sum + tx.amount, 0)

  const rows: ReportRow[] = categories
    .filter((category) => category.type === 'EXPENSE')
    .map((category) => {
      const spent = spentOf(current, category.id)
      const budget = planned.get(category.id) ?? category.budget
      return {
        categoryId: category.id,
        name: category.name,
        group: groupName.get(category.groupId) ?? '기타',
        isFixed: category.isFixed,
        budget,
        spent,
        diff: budget - spent,
        delta: spent - spentOf(previous, category.id),
      }
    })
    // 예산도 지출도 없는 줄은 리포트를 길게만 만든다
    .filter((row) => row.budget > 0 || row.spent > 0)

  const totalSpent = rows.reduce((sum, row) => sum + row.spent, 0)

  return {
    cycleKey,
    rows: rows.sort((a, b) => b.spent - a.spent),
    totalBudget: rows.reduce((sum, row) => sum + row.budget, 0),
    totalSpent,
    previousSpent: current.length + previous.length === 0
      ? 0
      : previous
          .filter((tx) => tx.type === 'EXPENSE')
          .reduce((sum, tx) => sum + tx.amount, 0),
    fixedSpent: rows
      .filter((row) => row.isFixed)
      .reduce((sum, row) => sum + row.spent, 0),
    variableSpent: rows
      .filter((row) => !row.isFixed)
      .reduce((sum, row) => sum + row.spent, 0),
    top: rows.filter((row) => row.spent > 0).slice(0, 5),
  }
}

/** 최근 몇 사이클의 지출·저축 추이 — 리포트 최상단 그래프용 */
export interface TrendPoint {
  cycleKey: string
  /** "26-10" */
  label: string
  expense: number
  /** 저축·투자 + 부채 원금 상환 */
  saving: number
}

export async function getSpendingTrend(
  cycleKey: string,
  count = 6,
): Promise<TrendPoint[]> {
  const keys = Array.from({ length: count }, (_, i) =>
    shiftCycle(cycleKey, -(count - 1 - i)),
  )

  // 사이클마다 쿼리하지 않고 범위를 한 번에 읽는다
  const rows = await financeDb.transactions
    .where('cycleKey')
    .anyOf(keys)
    .toArray()

  return keys.map((key) => {
    const own = rows.filter((tx) => tx.cycleKey === key)
    const sumOf = (types: Transaction['type'][]) =>
      own
        .filter((tx) => types.includes(tx.type))
        .reduce((sum, tx) => sum + tx.amount, 0)
    return {
      cycleKey: key,
      label: key.slice(2),
      expense: sumOf(['EXPENSE']),
      saving: sumOf(['SAVING', 'TRANSFER']),
    }
  })
}
