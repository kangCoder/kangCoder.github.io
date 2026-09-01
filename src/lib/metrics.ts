import type { WorkoutSet } from '../db/types'

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
