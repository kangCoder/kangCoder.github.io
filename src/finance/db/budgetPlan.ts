import { listCategories } from './categories'
import { setCycleBudget } from './cycleBudget'
import { financeDb } from './db'
import type { Category, CycleCategoryBudget } from './types'

/**
 * 사이클 예산 설정 — spec-finance §5.1.3
 *
 * 사이클을 시작하기 전에 "이번 달 얼마까지, 카테고리마다 얼마씩"을 정한다.
 *
 * 저장은 두 곳에 한다.
 *   1. `cycleCategoryBudgets` — 그 사이클에 정한 값. 과거 리포트가 변하지 않는다
 *   2. `Category.budget` — 다음 사이클의 출발점. 매달 처음부터 정하지 않아도 된다
 *
 * 1번만 하면 다음 달에 빈 화면에서 시작하고, 2번만 하면 과거 리포트가 소급 변형된다.
 */

export interface PlanRow {
  categoryId: string
  name: string
  groupName: string
  type: Category['type']
  /** 이 사이클에 정한 값. 없으면 Category.budget을 출발점으로 쓴다 */
  amount: number
  /** 직전 사이클에 실제로 쓴 금액 — 얼마를 잡을지 판단할 근거 */
  previousSpent: number
}

export interface BudgetPlan {
  cycleKey: string
  /** 이 사이클 예산을 이미 정했는가 */
  isPlanned: boolean
  rows: PlanRow[]
}

function budgetId(cycleKey: string, categoryId: string): string {
  return `${cycleKey}:${categoryId}`
}

export async function getBudgetPlan(
  cycleKey: string,
  previousCycleKey: string,
): Promise<BudgetPlan> {
  const [categories, groups, saved, previousTx] = await Promise.all([
    listCategories(false),
    financeDb.groups.orderBy('sortOrder').toArray(),
    financeDb.cycleCategoryBudgets.where('cycleKey').equals(cycleKey).toArray(),
    financeDb.transactions.where('cycleKey').equals(previousCycleKey).toArray(),
  ])

  const groupName = new Map(groups.map((group) => [group.id, group.name]))
  const savedById = new Map(saved.map((row) => [row.categoryId, row.amount]))
  const spentById = new Map<string, number>()
  for (const tx of previousTx) {
    spentById.set(tx.categoryId, (spentById.get(tx.categoryId) ?? 0) + tx.amount)
  }

  // 수입은 예산 개념이 아니다. 지출·저축·상환만 배분한다.
  const planned = categories.filter((category) => category.type !== 'INCOME')
  const order = new Map(groups.map((group, index) => [group.id, index]))

  return {
    cycleKey,
    isPlanned: saved.length > 0,
    rows: planned
      .map((category) => ({
        categoryId: category.id,
        name: category.name,
        groupName: groupName.get(category.groupId) ?? '기타',
        type: category.type,
        amount: savedById.get(category.id) ?? category.budget,
        previousSpent: spentById.get(category.id) ?? 0,
      }))
      .sort((a, b) => {
        const byGroup =
          (order.get(categoryGroupId(planned, a.categoryId)) ?? 0) -
          (order.get(categoryGroupId(planned, b.categoryId)) ?? 0)
        return byGroup !== 0 ? byGroup : a.name.localeCompare(b.name)
      }),
  }
}

function categoryGroupId(categories: Category[], categoryId: string): string {
  return categories.find((category) => category.id === categoryId)?.groupId ?? ''
}

/**
 * 예산을 확정한다. 지출 합계는 사이클 총예산으로도 함께 저장해
 * 대시보드가 바로 그 값을 쓰게 한다.
 */
export async function saveBudgetPlan(
  cycleKey: string,
  rows: { categoryId: string; amount: number; type: Category['type'] }[],
): Promise<void> {
  const entries: CycleCategoryBudget[] = rows.map((row) => ({
    id: budgetId(cycleKey, row.categoryId),
    cycleKey,
    categoryId: row.categoryId,
    amount: Math.max(0, Math.trunc(row.amount)),
  }))

  await financeDb.transaction(
    'rw',
    [financeDb.cycleCategoryBudgets, financeDb.categories],
    async () => {
      // 이 사이클의 옛 스냅샷을 걷어내고 다시 넣는다 — diff보다 단순하다
      const stale = await financeDb.cycleCategoryBudgets
        .where('cycleKey')
        .equals(cycleKey)
        .toArray()
      await financeDb.cycleCategoryBudgets.bulkDelete(
        stale.map((row) => row.id),
      )
      await financeDb.cycleCategoryBudgets.bulkAdd(entries)

      for (const row of rows) {
        await financeDb.categories.update(row.categoryId, {
          budget: Math.max(0, Math.trunc(row.amount)),
        })
      }
    },
  )

  const expenseTotal = rows
    .filter((row) => row.type === 'EXPENSE')
    .reduce((sum, row) => sum + Math.max(0, Math.trunc(row.amount)), 0)
  await setCycleBudget(cycleKey, expenseTotal)
}

/**
 * 그 사이클에 정한 카테고리 예산. 정하지 않았으면 비어 있고,
 * 호출부는 Category.budget으로 폴백한다.
 */
export async function getCycleCategoryBudgets(
  cycleKey: string,
): Promise<Map<string, number>> {
  const rows = await financeDb.cycleCategoryBudgets
    .where('cycleKey')
    .equals(cycleKey)
    .toArray()
  return new Map(rows.map((row) => [row.categoryId, row.amount]))
}

export async function isCyclePlanned(cycleKey: string): Promise<boolean> {
  return (
    (await financeDb.cycleCategoryBudgets
      .where('cycleKey')
      .equals(cycleKey)
      .count()) > 0
  )
}
