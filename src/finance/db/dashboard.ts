import { shiftCycle } from '../lib/cycle'
import { calculateSavingsRate, type SavingsRate } from '../lib/savingsRate'
import { getCycleCategoryBudgets } from './budgetPlan'
import { listCategories } from './categories'
import { getCycleBudget } from './cycleBudget'
import { financeDb } from './db'
import { DEFAULT_PAYDAY, getIncomeSetting } from './income'
import type { Category, Group, Transaction } from './types'

/**
 * 대시보드 집계 — spec-finance-v0.2.md §5.1
 * 사이클 합계는 복합 인덱스 [cycleKey+type]이 전담한다(§3.1).
 */

/** 카테고리 한 줄 — 전 사이클 대비 증감을 함께 담는다 */
export interface CategorySpending {
  categoryId: string
  name: string
  spent: number
  budget: number
  /** 이번 − 전 사이클. 양수면 더 쓴 것 */
  delta: number
}

export interface GroupSpending {
  groupId: string
  group: string
  spent: number
  budget: number
  delta: number
  categories: CategorySpending[]
}

/**
 * 지출과 저축은 해석이 반대다.
 * 지출은 전 사이클보다 덜 쓴 게 좋고, 저축은 더 모은 게 좋다.
 * 같은 목록에 섞으면 증감 색이 뒤집혀 읽히므로 갈라서 담는다.
 */
export interface GroupBreakdown {
  expense: GroupSpending[]
  saving: GroupSpending[]
}

export interface CycleSummary {
  payday: number
  netPay: number
  spent: number
  /** 전 사이클 같은 시점이 아니라 전 사이클 전체 지출이다 */
  previousSpent: number
  /** 사이클 총예산 — 직접 정한 값이 있으면 그것, 없으면 카테고리 합계 */
  expenseBudget: number
  /** 총예산을 직접 정했는가 */
  budgetIsCustom: boolean
  /** 카테고리 예산 합계 — 총예산과 비교해 보여준다 */
  categoryBudgetTotal: number
  savingsRate: SavingsRate
  byGroup: GroupSpending[]
  /** 저축·투자·원금상환 그룹 */
  savingGroups: GroupSpending[]
  /** 이 사이클 예산을 따로 정했는가 — 안 했으면 설정을 권한다 */
  isPlanned: boolean
  netWorth: number
  goalTarget: number | undefined
  goalName: string | undefined
  /** 월 순자산 증가 페이스 — 저축 + 부채 원금 상환 */
  monthlyContribution: number
  /** 그중 저축·투자만 — 수익률이 붙는 부분 */
  monthlySaving: number
  /** 그중 부채 원금 상환만 — 복리가 붙지 않는 부분 */
  monthlyPrincipal: number
}

export async function getCycleSummary(cycleKey: string): Promise<CycleSummary> {
  const income = await getIncomeSetting()
  const payday = income?.payday ?? DEFAULT_PAYDAY
  const netPay = income?.netPay ?? 0
  const previousCycle = shiftCycle(cycleKey, -1)

  const [
    current,
    previous,
    categories,
    groups,
    assets,
    debts,
    goal,
    budget,
    planned,
  ] = await Promise.all([
      financeDb.transactions.where('cycleKey').equals(cycleKey).toArray(),
      financeDb.transactions.where('cycleKey').equals(previousCycle).toArray(),
      listCategories(false),
      financeDb.groups.orderBy('sortOrder').toArray(),
      financeDb.assets.toArray(),
      financeDb.debts.toArray(),
      financeDb.goals.toArray().then((goals) => goals[0]),
      getCycleBudget(cycleKey),
      getCycleCategoryBudgets(cycleKey),
    ])

  // 그 사이클에 정한 값이 있으면 그것을 쓴다. 없으면 Category.budget이 기준이다.
  const budgetOf = (category: Category) =>
    planned.get(category.id) ?? category.budget

  const sumOf = (rows: Transaction[], type: Transaction['type']) =>
    rows
      .filter((tx) => tx.type === type)
      .reduce((sum, tx) => sum + tx.amount, 0)

  const savingsRate = calculateSavingsRate({
    saving: sumOf(current, 'SAVING'),
    // 원천 차감분은 여기 넣지 않는다 — deductions에서만 읽어야 이중 계산을 피한다(§2.3.1)
    paidTransfer: sumOf(current, 'TRANSFER'),
    netPay,
    deductions: income?.deductions ?? [],
  })

  // 예산 기준 월 페이스 — 실제 입력이 아니라 계획값이라 목표 판정이 안정적이다
  const plannedSaving = categories
    .filter((category) => category.type === 'SAVING')
    .reduce((sum, category) => sum + category.budget, 0)
  const plannedTransfer = categories
    .filter((category) => category.type === 'TRANSFER')
    .reduce((sum, category) => sum + category.budget, 0)

  return {
    payday,
    netPay,
    spent: sumOf(current, 'EXPENSE'),
    previousSpent: sumOf(previous, 'EXPENSE'),
    expenseBudget: budget.amount,
    budgetIsCustom: budget.isCustom,
    categoryBudgetTotal: budget.categoryTotal,
    savingsRate,
    byGroup: buildGroups(current, previous, categories, groups, ['EXPENSE'], budgetOf),
    savingGroups: buildGroups(
      current,
      previous,
      categories,
      groups,
      ['SAVING', 'TRANSFER'],
      budgetOf,
    ),
    isPlanned: planned.size > 0,
    netWorth:
      assets.reduce((sum, asset) => sum + asset.balance, 0) -
      debts.reduce((sum, debt) => sum + debt.balance, 0),
    goalTarget: goal?.targetAmount,
    goalName: goal?.name,
    monthlyContribution:
      plannedSaving + plannedTransfer + savingsRate.withheldTransfer,
    monthlySaving: plannedSaving,
    monthlyPrincipal: plannedTransfer + savingsRate.withheldTransfer,
  }
}

function buildGroups(
  current: Transaction[],
  previous: Transaction[],
  categories: Category[],
  groups: Group[],
  types: Transaction['type'][],
  budgetOf: (category: Category) => number,
): GroupSpending[] {
  const spentOf = (rows: Transaction[], categoryId: string) =>
    rows
      .filter(
        (tx) => types.includes(tx.type) && tx.categoryId === categoryId,
      )
      .reduce((sum, tx) => sum + tx.amount, 0)

  const result: GroupSpending[] = []

  for (const group of groups) {
    const own = categories.filter(
      (category) =>
        category.groupId === group.id && types.includes(category.type),
    )
    if (own.length === 0) continue

    const rows: CategorySpending[] = own.map((category) => {
      const spent = spentOf(current, category.id)
      return {
        categoryId: category.id,
        name: category.name,
        spent,
        budget: budgetOf(category),
        delta: spent - spentOf(previous, category.id),
      }
    })

    const entry: GroupSpending = {
      groupId: group.id,
      group: group.name,
      spent: rows.reduce((sum, row) => sum + row.spent, 0),
      budget: rows.reduce((sum, row) => sum + row.budget, 0),
      delta: rows.reduce((sum, row) => sum + row.delta, 0),
      categories: rows.sort((a, b) => b.spent - a.spent),
    }
    if (entry.budget > 0 || entry.spent > 0) result.push(entry)
  }

  return result.sort((a, b) => b.spent - a.spent)
}
