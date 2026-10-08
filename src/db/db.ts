import Dexie, { type EntityTable } from 'dexie'
import type { AppSettings } from './appSettings'
import type { SyncState } from '../sync/syncState'
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
  appSettings!: EntityTable<AppSettings, 'id'>
  syncState!: EntityTable<SyncState, 'id'>

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

    /** v2 — 어느 영역(운동·가계부)을 쓸지 저장할 곳. 기존 데이터는 건드리지 않는다. */
    this.version(2).stores({
      appSettings: 'id',
    })

    /**
     * v3 — 기기 간 동기화 장부 — spec-sync-v0.1.md §4
     *
     * 레코드 한 건('default')만 들어가므로 인덱스가 필요 없다.
     * 기존 스토어를 건드리지 않는 추가라 upgrade 함수가 없다(v2와 같은 패턴).
     */
    this.version(3).stores({
      syncState: 'id',
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
