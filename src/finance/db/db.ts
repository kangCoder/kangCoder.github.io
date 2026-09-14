import Dexie, { type EntityTable } from 'dexie'
import type {
  Asset,
  Category,
  CycleBudget,
  Debt,
  FixedCost,
  Goal,
  Group,
  IncomeSetting,
  NetWorthSnapshot,
  Transaction,
} from './types'

/**
 * 가계부 저장소 — spec-finance-v0.2.md §1.1, §3.1
 *
 * 운동 기록(`workout-log`)과 **별도 데이터베이스**를 쓴다. 같은 오리진이라도
 * 이름이 다르면 완전히 독립이라, 백업을 따로 만들 수 있고 한쪽 스키마를
 * 올려도 다른 쪽이 영향받지 않는다.
 *
 * 스토어는 처음부터 전부 선언한다. 실사용 데이터가 들어간 뒤 추가하면
 * 마이그레이션을 써야 하지만, 빈 DB일 때 전부 선언하면 그럴 일이 없다(§1.2).
 */
class FinanceDB extends Dexie {
  transactions!: EntityTable<Transaction, 'id'>
  categories!: EntityTable<Category, 'id'>
  groups!: EntityTable<Group, 'id'>
  fixedCosts!: EntityTable<FixedCost, 'id'>
  assets!: EntityTable<Asset, 'id'>
  debts!: EntityTable<Debt, 'id'>
  goals!: EntityTable<Goal, 'id'>
  netWorthSnapshots!: EntityTable<NetWorthSnapshot, 'cycleKey'>
  incomeSettings!: EntityTable<IncomeSetting, 'id'>
  cycleBudgets!: EntityTable<CycleBudget, 'cycleKey'>

  constructor() {
    super('finance-log')
    this.version(1).stores({
      // 복합 인덱스가 사이클 집계와 고정비 중복 방지를 전담한다 — §3.1
      transactions:
        'id, date, cycleKey, categoryId, [cycleKey+type], [cycleKey+categoryId], [cycleKey+fixedCostId]',
      categories: 'id, sortOrder, type',
      fixedCosts: 'id, categoryId',
      assets: 'id, kind',
      debts: 'id',
      goals: 'id',
      netWorthSnapshots: 'cycleKey',
      incomeSettings: 'id',
    })

    /**
     * v2 — 그룹을 문자열에서 테이블로 승격한다.
     * 문자열이면 그룹 이름을 바꿀 때 카테고리를 전부 고쳐야 하고 순서도 못 정한다.
     * 이미 시드가 들어간 DB가 있을 수 있으므로 기존 group 문자열을 읽어
     * groups를 만들고 groupId를 채운다.
     */
    this.version(2)
      .stores({
        categories: 'id, sortOrder, type, groupId',
        groups: 'id, sortOrder',
      })
      .upgrade(async (tx) => {
        const categories = await tx.table('categories').toArray()
        const names = [
          ...new Set(
            categories
              .map((category) => category.group)
              .filter((name): name is string => typeof name === 'string'),
          ),
        ]

        const idByName = new Map<string, string>()
        for (const [index, name] of names.entries()) {
          const id = crypto.randomUUID()
          idByName.set(name, id)
          await tx.table('groups').add({ id, name, sortOrder: index })
        }

        await tx
          .table('categories')
          .toCollection()
          .modify((category: Category & { group?: string }) => {
            category.groupId = idByName.get(category.group ?? '') ?? ''
            delete category.group
          })
      })

    /** v3 — 사이클별 총예산. 기존 데이터는 건드리지 않는다. */
    this.version(3).stores({
      cycleBudgets: 'cycleKey',
    })
  }
}

export const financeDb = new FinanceDB()

export function newId(): string {
  return crypto.randomUUID()
}
