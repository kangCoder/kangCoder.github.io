import type { WorkoutSet } from '../db/types'
import type { WorkoutItem } from '../db/workouts'

/**
 * 점진적 과부하 지표 — spec-v0.1.md §7
 *
 * 워밍업 세트를 본세트와 섞으면 볼륨 그래프가 오염되므로 전부 제외한다.
 * 완료 체크가 없는 세트는 수행하지 않은 것이므로 역시 제외한다.
 */

export function isCountedSet(set: WorkoutSet): boolean {
  return set.isCompleted && set.setType !== 'WARMUP'
}

/** Σ(weight × reps) */
export function totalVolume(sets: WorkoutSet[]): number {
  return sets
    .filter(isCountedSet)
    .reduce((sum, set) => sum + (set.weight ?? 0) * (set.reps ?? 0), 0)
}

/** Epley: weight × (1 + reps/30) */
export function estimatedOneRepMax(weight: number, reps: number): number {
  return weight * (1 + reps / 30)
}

/** 세션 안에서 이 종목의 최고 e1RM */
export function bestOneRepMax(sets: WorkoutSet[]): number | undefined {
  const values = sets
    .filter(isCountedSet)
    .filter((set) => set.weight !== undefined && set.reps !== undefined)
    .map((set) => estimatedOneRepMax(set.weight!, set.reps!))
  return values.length > 0 ? Math.max(...values) : undefined
}

/**
 * 종목별 소요 시간 — 앞 종목이 끝난 시점부터 이 종목이 끝난 시점까지.
 * 첫 종목은 세션 시작이 기준이다.
 *
 * WorkoutExercise에 시간 필드를 새로 넣는 대신 세트의 completedAt으로 계산한다.
 * 종목을 순서대로 수행한다는 전제가 깔려 있어서, 종목 사이를 왔다갔다 하면
 * 값이 흐려진다. 세팅 시간이 포함되므로 "이 종목에 쓴 시간"에 가깝다.
 *
 * 완료한 세트가 없는 종목(건너뛴 종목, 체크 안 한 체크리스트)은 undefined다.
 */
export function exerciseDurations(
  items: WorkoutItem[],
  startedAt: number,
): Map<string, number> {
  const durations = new Map<string, number>()
  let cursor = startedAt

  for (const item of items) {
    const finishedAt = lastCompletedAt(item)
    if (finishedAt === undefined) continue
    if (finishedAt > cursor) durations.set(item.id, finishedAt - cursor)
    cursor = Math.max(cursor, finishedAt)
  }
  return durations
}

function lastCompletedAt(item: WorkoutItem): number | undefined {
  const stamps = item.sets
    .map((set) => set.completedAt)
    .filter((at) => at !== undefined)
  return stamps.length > 0 ? Math.max(...stamps) : undefined
}
