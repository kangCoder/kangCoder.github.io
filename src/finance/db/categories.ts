import { financeDb, newId } from './db'
import type { Category, Group, TxType } from './types'

/**
 * 카테고리 쿼리 — 컴포넌트는 이 함수들만 호출하고 financeDb를 직접 만지지 않는다.
 * isArchived는 인덱스가 아니라 메모리에서 거른다(§3.1).
 */

export function listCategories(includeArchived = false): Promise<Category[]> {
  const query = financeDb.categories.orderBy('sortOrder')
  return includeArchived
    ? query.toArray()
    : query.filter((category) => !category.isArchived).toArray()
}

export function getCategory(id: string): Promise<Category | undefined> {
  return financeDb.categories.get(id)
}

export interface CategoryInput {
  name: string
  groupId: string
  type: TxType
  budget: number
  isFixed: boolean
}

/** 화면용: 카테고리 + 표시 시점에 붙인 그룹 */
export interface CategoryItem extends Category {
  group: Group | undefined
}

/** 그룹별로 묶은 카테고리 — 관리 화면과 대시보드가 쓴다 */
export interface GroupedCategories {
  group: Group
  categories: Category[]
}

export async function listCategoryItems(
  includeArchived = false,
): Promise<CategoryItem[]> {
  const categories = await listCategories(includeArchived)
  const groups = await financeDb.groups.bulkGet(
    categories.map((category) => category.groupId),
  )
  return categories.map((category, i) => ({ ...category, group: groups[i] }))
}

/** 그룹 순서 → 카테고리 순서로 정렬한다. 빈 그룹도 포함한다. */
export async function listGrouped(
  includeArchived = false,
): Promise<GroupedCategories[]> {
  const [categories, groups] = await Promise.all([
    listCategories(includeArchived),
    financeDb.groups.orderBy('sortOrder').toArray(),
  ])
  return groups.map((group) => ({
    group,
    categories: categories.filter((category) => category.groupId === group.id),
  }))
}

export async function createCategory(input: CategoryInput): Promise<string> {
  const id = newId()
  const last = await financeDb.categories.orderBy('sortOrder').last()
  await financeDb.categories.add({
    id,
    ...input,
    name: input.name.trim(),
    sortOrder: (last?.sortOrder ?? -1) + 1,
    isArchived: false,
  })
  return id
}

export async function updateCategory(
  id: string,
  input: Partial<CategoryInput>,
): Promise<void> {
  await financeDb.categories.update(id, input)
}

export async function setCategoryArchived(
  id: string,
  isArchived: boolean,
): Promise<void> {
  await financeDb.categories.update(id, { isArchived })
}

/** 이 카테고리를 쓰는 거래 건수 — 하드 삭제 확인문에 보여준다(§2.5) */
export async function countCategoryUsages(categoryId: string): Promise<number> {
  return financeDb.transactions
    .where('categoryId')
    .equals(categoryId)
    .count()
}

/** '미분류' 카테고리. 하드 삭제 시 고아 거래가 갈 곳이다. */
export async function getOrCreateUncategorized(): Promise<string> {
  const existing = await financeDb.categories
    .filter((category) => category.name === UNCATEGORIZED)
    .first()
  if (existing) return existing.id
  const groupId = await getOrCreateEtcGroup()
  return createCategory({
    name: UNCATEGORIZED,
    groupId,
    type: 'EXPENSE',
    budget: 0,
    isFixed: false,
  })
}

export const UNCATEGORIZED = '미분류'
const ETC_GROUP = '기타'

async function getOrCreateEtcGroup(): Promise<string> {
  const existing = await financeDb.groups
    .filter((group) => group.name === ETC_GROUP)
    .first()
  if (existing) return existing.id

  const id = newId()
  const last = await financeDb.groups.orderBy('sortOrder').last()
  await financeDb.groups.add({
    id,
    name: ETC_GROUP,
    sortOrder: (last?.sortOrder ?? -1) + 1,
  })
  return id
}

/**
 * 하드 삭제. 이 카테고리를 쓰던 거래는 지우지 않고 '미분류'로 옮긴다(§2.5).
 * 거래를 함께 지우면 과거 지출 총액이 소급해서 줄어든다.
 */
export async function deleteCategoryCascade(id: string): Promise<void> {
  const fallbackId = await getOrCreateUncategorized()
  await financeDb.transaction(
    'rw',
    financeDb.categories,
    financeDb.transactions,
    financeDb.fixedCosts,
    async () => {
      const orphans = await financeDb.transactions
        .where('categoryId')
        .equals(id)
        .toArray()
      await financeDb.transactions.bulkPut(
        orphans.map((tx) => ({ ...tx, categoryId: fallbackId })),
      )
      const fixed = await financeDb.fixedCosts
        .where('categoryId')
        .equals(id)
        .toArray()
      await financeDb.fixedCosts.bulkDelete(fixed.map((cost) => cost.id))
      await financeDb.categories.delete(id)
    },
  )
}

/** 인접 항목과 sortOrder를 맞바꾼다. 운동 쪽과 같은 방식이다(§2.5). */
export async function moveCategory(
  id: string,
  direction: 'up' | 'down',
): Promise<void> {
  await financeDb.transaction('rw', financeDb.categories, async () => {
    const list = await financeDb.categories
      .orderBy('sortOrder')
      .filter((category) => !category.isArchived)
      .toArray()
    const index = list.findIndex((category) => category.id === id)
    const target = direction === 'up' ? index - 1 : index + 1
    if (index === -1 || target < 0 || target >= list.length) return

    await financeDb.categories.update(list[index].id, {
      sortOrder: list[target].sortOrder,
    })
    await financeDb.categories.update(list[target].id, {
      sortOrder: list[index].sortOrder,
    })
  })
}
