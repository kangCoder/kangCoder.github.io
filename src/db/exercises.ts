import { db, newId } from './db'
import type { Exercise, ExerciseType } from './types'

/**
 * 종목 쿼리 — 컴포넌트는 이 함수들만 호출하고 db를 직접 만지지 않는다.
 */

export interface ExerciseInput {
  name: string
  type: ExerciseType
  note?: string
}

export function listExercises(includeArchived = false): Promise<Exercise[]> {
  const query = db.exercises.orderBy('name')
  return includeArchived
    ? query.toArray()
    : query.filter((e) => !e.isArchived).toArray()
}

export function getExercise(id: string): Promise<Exercise | undefined> {
  return db.exercises.get(id)
}

/** 이름 중복 검사용. 대소문자·공백을 무시하고 비교한다. */
export async function findExerciseByName(
  name: string,
  excludeId?: string,
): Promise<Exercise | undefined> {
  const normalized = name.trim().toLowerCase()
  const all = await db.exercises.toArray()
  return all.find(
    (e) => e.id !== excludeId && e.name.trim().toLowerCase() === normalized,
  )
}

export async function createExercise(input: ExerciseInput): Promise<string> {
  const id = newId()
  await db.exercises.add({
    id,
    name: input.name.trim(),
    type: input.type,
    note: input.note?.trim() || undefined,
    isArchived: false,
    createdAt: Date.now(),
  })
  return id
}

export async function updateExercise(
  id: string,
  input: ExerciseInput,
): Promise<void> {
  await db.exercises.update(id, {
    name: input.name.trim(),
    type: input.type,
    note: input.note?.trim() || undefined,
  })
}

export async function setExerciseArchived(
  id: string,
  isArchived: boolean,
): Promise<void> {
  await db.exercises.update(id, { isArchived })
}

/**
 * 이 종목을 참조하는 템플릿 수.
 * templateExercises에는 exerciseId 인덱스가 없으므로(§4.5 스키마) 메모리에서 센다.
 * 템플릿 4개 × 종목 몇 개 규모라 전체 스캔이 인덱스보다 싸다.
 */
export async function countTemplateUsages(exerciseId: string): Promise<number> {
  const rows = await db.templateExercises
    .filter((te) => te.exerciseId === exerciseId)
    .toArray()
  return new Set(rows.map((te) => te.templateId)).size
}

/**
 * 하드 삭제. 참조하는 templateExercises 행까지 한 트랜잭션에서 정리한다.
 * 과거 Workout 기록은 종목 이름을 복사해 두었으므로(§4.3) 영향받지 않는다.
 */
export async function deleteExerciseCascade(exerciseId: string): Promise<void> {
  await db.transaction('rw', db.exercises, db.templateExercises, async () => {
    const orphans = await db.templateExercises
      .filter((te) => te.exerciseId === exerciseId)
      .toArray()
    await db.templateExercises.bulkDelete(orphans.map((te) => te.id))
    await db.exercises.delete(exerciseId)
  })
}
