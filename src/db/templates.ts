import { db, newId } from './db'
import type { Exercise, Template, TemplateExercise } from './types'

/**
 * 템플릿 쿼리 — 컴포넌트는 이 함수들만 호출하고 db를 직접 만지지 않는다.
 */

/** 목록 화면용: 템플릿 + 종목 수 */
export interface TemplateSummary extends Template {
  itemCount: number
}

/**
 * 편집 화면용: 템플릿 종목 행 + 표시 시점에 붙인 종목 정보.
 * 저장된 비정규화 복사본이 아니라 bulkGet으로 매번 조인한 결과다.
 * 종목 이름을 고치면 템플릿에도 즉시 반영되는 것이 맞다 —
 * 스냅샷 복사(§4.3)는 Workout에만 적용된다.
 */
export interface TemplateItem extends TemplateExercise {
  exercise: Exercise | undefined
}

export function getTemplate(id: string): Promise<Template | undefined> {
  return db.templates.get(id)
}

export function listTemplates(includeArchived = false): Promise<Template[]> {
  const query = db.templates.orderBy('sortOrder')
  return includeArchived
    ? query.toArray()
    : query.filter((t) => !t.isArchived).toArray()
}

export async function listTemplateSummaries(
  includeArchived = false,
): Promise<TemplateSummary[]> {
  const templates = await listTemplates(includeArchived)
  const items = await db.templateExercises.toArray()
  return templates.map((t) => ({
    ...t,
    itemCount: items.filter((te) => te.templateId === t.id).length,
  }))
}

export async function createTemplate(name: string): Promise<string> {
  const id = newId()
  const last = await db.templates.orderBy('sortOrder').last()
  await db.templates.add({
    id,
    name: name.trim(),
    sortOrder: (last?.sortOrder ?? -1) + 1,
    isArchived: false,
  })
  return id
}

export async function renameTemplate(id: string, name: string): Promise<void> {
  await db.templates.update(id, { name: name.trim() })
}

export async function setTemplateArchived(
  id: string,
  isArchived: boolean,
): Promise<void> {
  await db.templates.update(id, { isArchived })
}

/** 템플릿과 그 안의 종목 행을 함께 삭제한다. 과거 Workout 기록은 영향 없다. */
export async function deleteTemplateCascade(id: string): Promise<void> {
  await db.transaction('rw', db.templates, db.templateExercises, async () => {
    const items = await db.templateExercises
      .where('templateId')
      .equals(id)
      .toArray()
    await db.templateExercises.bulkDelete(items.map((te) => te.id))
    await db.templates.delete(id)
  })
}

export async function moveTemplate(
  id: string,
  direction: 'up' | 'down',
): Promise<void> {
  await db.transaction('rw', db.templates, async () => {
    const list = await db.templates
      .orderBy('sortOrder')
      .filter((t) => !t.isArchived)
      .toArray()
    await swapSortOrder(list, id, direction, (t, sortOrder) =>
      db.templates.update(t.id, { sortOrder }),
    )
  })
}

// --- 템플릿 안의 종목 ---

export async function listTemplateItems(
  templateId: string,
): Promise<TemplateItem[]> {
  const rows = await db.templateExercises
    .where('templateId')
    .equals(templateId)
    .sortBy('sortOrder')
  // IndexedDB에는 조인이 없다 — 필요한 종목만 한 번에 가져와 앱에서 붙인다(§4.5)
  const exercises = await db.exercises.bulkGet(rows.map((r) => r.exerciseId))
  return rows.map((row, i) => ({ ...row, exercise: exercises[i] }))
}

export async function addExerciseToTemplate(
  templateId: string,
  exercise: Exercise,
): Promise<string> {
  const id = newId()
  const last = await db.templateExercises
    .where('templateId')
    .equals(templateId)
    .sortBy('sortOrder')
    .then((rows) => rows.at(-1))

  // CHECKLIST는 볼륨·세트 카운트에서 모두 제외되므로 목표 세트 개념이 없다(§4.1)
  const defaults =
    exercise.type === 'CHECKLIST'
      ? {}
      : { targetSets: 3, restSeconds: 120 }

  await db.templateExercises.add({
    id,
    templateId,
    exerciseId: exercise.id,
    sortOrder: (last?.sortOrder ?? -1) + 1,
    ...defaults,
  })
  return id
}

export type TemplateExercisePatch = Partial<
  Pick<
    TemplateExercise,
    | 'targetSets'
    | 'targetReps'
    | 'targetWeight'
    | 'targetSeconds'
    | 'restSeconds'
    | 'note'
  >
>

export async function updateTemplateExercise(
  id: string,
  patch: TemplateExercisePatch,
): Promise<void> {
  await db.templateExercises.update(id, patch)
}

export async function removeTemplateExercise(id: string): Promise<void> {
  await db.templateExercises.delete(id)
}

export async function moveTemplateExercise(
  templateId: string,
  id: string,
  direction: 'up' | 'down',
): Promise<void> {
  await db.transaction('rw', db.templateExercises, async () => {
    const list = await db.templateExercises
      .where('templateId')
      .equals(templateId)
      .sortBy('sortOrder')
    await swapSortOrder(list, id, direction, (te, sortOrder) =>
      db.templateExercises.update(te.id, { sortOrder }),
    )
  })
}

/**
 * 정렬된 목록에서 대상과 이웃의 sortOrder를 맞바꾼다.
 * 전체 재인덱싱 대신 두 행만 갱신하므로 호출부는 트랜잭션 하나로 끝난다.
 */
async function swapSortOrder<T extends { id: string; sortOrder: number }>(
  sorted: T[],
  id: string,
  direction: 'up' | 'down',
  update: (row: T, sortOrder: number) => Promise<unknown>,
): Promise<void> {
  const index = sorted.findIndex((row) => row.id === id)
  const neighborIndex = direction === 'up' ? index - 1 : index + 1
  if (index === -1 || neighborIndex < 0 || neighborIndex >= sorted.length) return

  const current = sorted[index]
  const neighbor = sorted[neighborIndex]
  await update(current, neighbor.sortOrder)
  await update(neighbor, current.sortOrder)
}
