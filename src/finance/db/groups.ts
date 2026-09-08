import { financeDb, newId } from './db'
import type { Group } from './types'

/** 그룹 쿼리 — 카테고리를 묶는 상위 분류(§3.2) */

export function listGroups(): Promise<Group[]> {
  return financeDb.groups.orderBy('sortOrder').toArray()
}

export async function createGroup(name: string): Promise<string> {
  const id = newId()
  const last = await financeDb.groups.orderBy('sortOrder').last()
  await financeDb.groups.add({
    id,
    name: name.trim(),
    sortOrder: (last?.sortOrder ?? -1) + 1,
  })
  return id
}

export async function renameGroup(id: string, name: string): Promise<void> {
  await financeDb.groups.update(id, { name: name.trim() })
}

export async function countGroupCategories(groupId: string): Promise<number> {
  return financeDb.categories.where('groupId').equals(groupId).count()
}

/**
 * 그룹 삭제. 안에 카테고리가 남아 있으면 거부한다 —
 * 그룹을 지우면서 카테고리까지 없애면 거래가 통째로 고아가 된다.
 */
export async function deleteGroup(id: string): Promise<boolean> {
  if ((await countGroupCategories(id)) > 0) return false
  await financeDb.groups.delete(id)
  return true
}

export async function moveGroup(
  id: string,
  direction: 'up' | 'down',
): Promise<void> {
  await financeDb.transaction('rw', financeDb.groups, async () => {
    const list = await financeDb.groups.orderBy('sortOrder').toArray()
    const index = list.findIndex((group) => group.id === id)
    const target = direction === 'up' ? index - 1 : index + 1
    if (index === -1 || target < 0 || target >= list.length) return

    await financeDb.groups.update(list[index].id, {
      sortOrder: list[target].sortOrder,
    })
    await financeDb.groups.update(list[target].id, {
      sortOrder: list[index].sortOrder,
    })
  })
}
