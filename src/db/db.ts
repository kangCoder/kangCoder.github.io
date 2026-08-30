import Dexie, { type EntityTable } from 'dexie'
import type {
  Bodyweight,
  Exercise,
  Run,
  Template,
  TemplateExercise,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from './types'

/**
 * 로컬 온리 저장소 — spec-v0.1.md §2.1, §4.5
 *
 * 1주차에 실제로 쓰는 스토어는 exercises / templates / templateExercises 세 개뿐이지만,
 * 8개를 version(1)에 전부 선언한다. 실사용 데이터가 들어간 뒤 스키마를 올리면
 * 마이그레이션을 써야 하는데, 아직 빈 DB인 지금 전부 선언해 두면 그럴 일이 없다.
 */
class WorkoutDB extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>
  templates!: EntityTable<Template, 'id'>
  templateExercises!: EntityTable<TemplateExercise, 'id'>
  workouts!: EntityTable<Workout, 'id'>
  workoutExercises!: EntityTable<WorkoutExercise, 'id'>
  workoutSets!: EntityTable<WorkoutSet, 'id'>
  runs!: EntityTable<Run, 'id'>
  bodyweights!: EntityTable<Bodyweight, 'date'>

  constructor() {
    super('workout-log')
    this.version(1).stores({
      exercises: 'id, name, type',
      templates: 'id, sortOrder',
      templateExercises: 'id, templateId, sortOrder',
      workouts: 'id, startedAt',
      workoutExercises: 'id, workoutId, exerciseId, sortOrder',
      // 복합 인덱스가 "이 종목 최근 기록"과 과부하 그래프를 전담한다 — §4.5
      workoutSets: 'id, workoutExerciseId, [exerciseId+completedAt]',
      runs: 'id, startedAt',
      bodyweights: 'date',
    })
  }
}

export const db = new WorkoutDB()

/** §2.3 — 홈 화면 앱이면 이미 안전하지만 이중 보호는 무비용이다. */
export function requestPersistentStorage(): void {
  void navigator.storage?.persist?.()
}

export function newId(): string {
  return crypto.randomUUID()
}
