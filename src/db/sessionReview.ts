import { bestOneRepMax, isCountedSet } from '../lib/metrics'
import { db } from './db'
import type { TemplateExercise, WorkoutSet } from './types'
import { listWorkoutItems, previousBestOneRepMax } from './workouts'

/**
 * 세션 종료 요약 — 직전 세션 대비 변화와 템플릿 갱신 제안
 */

export interface ExerciseProgress {
  workoutExerciseId: string
  exerciseName: string
  /** 이번 세션 최고 중량 (워밍업·미완료 제외) */
  topWeight: number | undefined
  /** 직전 세션 최고 중량 */
  previousTopWeight: number | undefined
  e1rm: number | undefined
  previousE1rm: number | undefined
}

/** 본세트로 집계할 세트만 — §7.1과 같은 규칙 */
function countedSets(sets: WorkoutSet[]): WorkoutSet[] {
  return sets.filter(isCountedSet)
}

function topWeightOf(sets: WorkoutSet[]): number | undefined {
  const weights = countedSets(sets)
    .map((set) => set.weight)
    .filter((weight): weight is number => weight !== undefined)
  return weights.length > 0 ? Math.max(...weights) : undefined
}

/** 직전 세션의 같은 종목 최고 중량 — [exerciseId+completedAt] 인덱스로 찾는다 */
async function previousTopWeight(
  exerciseId: string,
  before: number,
): Promise<number | undefined> {
  const sets = await db.workoutSets
    .where('[exerciseId+completedAt]')
    .between([exerciseId, 0], [exerciseId, before], true, false)
    .toArray()
  if (sets.length === 0) return undefined

  // 가장 최근 세션의 것만 본다
  const byItem = new Map<string, WorkoutSet[]>()
  for (const set of sets) {
    const group = byItem.get(set.workoutExerciseId)
    if (group) group.push(set)
    else byItem.set(set.workoutExerciseId, [set])
  }
  let latest: WorkoutSet[] | undefined
  let latestAt = -1
  for (const group of byItem.values()) {
    const at = Math.max(...group.map((set) => set.completedAt ?? 0))
    if (at > latestAt) {
      latestAt = at
      latest = group
    }
  }
  return latest ? topWeightOf(latest) : undefined
}

export async function getSessionProgress(
  workoutId: string,
): Promise<ExerciseProgress[]> {
  const workout = await db.workouts.get(workoutId)
  if (!workout) return []
  const items = await listWorkoutItems(workoutId)

  const result: ExerciseProgress[] = []
  for (const item of items) {
    if (item.exerciseType !== 'WEIGHT_REPS') continue
    const done = countedSets(item.sets)
    if (done.length === 0) continue

    result.push({
      workoutExerciseId: item.id,
      exerciseName: item.exerciseName,
      topWeight: topWeightOf(item.sets),
      previousTopWeight: await previousTopWeight(
        item.exerciseId,
        workout.startedAt,
      ),
      e1rm: bestOneRepMax(item.sets),
      previousE1rm: await previousBestOneRepMax(
        item.exerciseId,
        workout.startedAt,
      ),
    })
  }
  return result
}

// --- 템플릿 갱신 제안 ---

export interface TemplateDiff {
  templateExerciseId: string
  exerciseName: string
  /** 템플릿에 저장된 값 */
  before: { sets?: number; reps?: number; weight?: number }
  /** 이번 세션에서 실제로 한 값 */
  after: { sets: number; reps?: number; weight?: number }
}

/** 가장 많이 나온 값. 동률이면 큰 쪽 — 증량한 세트를 기준으로 삼는다. */
function mode(values: number[]): number | undefined {
  if (values.length === 0) return undefined
  const counts = new Map<number, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)

  let best = values[0]
  let bestCount = 0
  for (const [value, count] of counts) {
    if (count > bestCount || (count === bestCount && value > best)) {
      best = value
      bestCount = count
    }
  }
  return best
}

/**
 * 이번 세션이 템플릿과 달라진 점.
 *
 * 세션은 스냅샷이라 템플릿과 독립이고(§4.3), 다음 세션은 직전 세션 값을
 * 복사하므로(§4.3.2) 템플릿을 고치지 않아도 동작은 이어진다.
 * 다만 템플릿 편집 화면에 옛 목표치가 남아 혼란스러우므로 갱신을 제안한다.
 */
export async function getTemplateDiff(
  workoutId: string,
): Promise<TemplateDiff[]> {
  const workout = await db.workouts.get(workoutId)
  if (!workout?.templateId) return []

  const rows = await db.templateExercises
    .where('templateId')
    .equals(workout.templateId)
    .toArray()
  if (rows.length === 0) return []

  const items = await listWorkoutItems(workoutId)
  const byExercise = new Map<string, TemplateExercise>()
  for (const row of rows) byExercise.set(row.exerciseId, row)

  const diffs: TemplateDiff[] = []
  for (const item of items) {
    if (item.exerciseType === 'CHECKLIST') continue
    const row = byExercise.get(item.exerciseId)
    if (!row) continue

    const done = countedSets(item.sets)
    if (done.length === 0) continue

    const after = {
      sets: done.length,
      reps: mode(
        done.map((set) => set.reps).filter((v): v is number => v !== undefined),
      ),
      weight: mode(
        done
          .map((set) => set.weight)
          .filter((v): v is number => v !== undefined),
      ),
    }
    const before = {
      sets: row.targetSets,
      reps: row.targetReps,
      weight: row.targetWeight,
    }

    const changed =
      before.sets !== after.sets ||
      before.reps !== after.reps ||
      before.weight !== after.weight
    if (changed) {
      diffs.push({
        templateExerciseId: row.id,
        exerciseName: item.exerciseName,
        before,
        after,
      })
    }
  }
  return diffs
}

/** 고른 항목만 템플릿에 반영한다 */
export async function applyTemplateDiff(diffs: TemplateDiff[]): Promise<void> {
  if (diffs.length === 0) return
  await db.transaction('rw', db.templateExercises, async () => {
    for (const diff of diffs) {
      await db.templateExercises.update(diff.templateExerciseId, {
        targetSets: diff.after.sets,
        targetReps: diff.after.reps,
        targetWeight: diff.after.weight,
      })
    }
  })
}
