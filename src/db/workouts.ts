import { totalVolume } from '../lib/metrics'
import { db, newId } from './db'
import type {
  Exercise,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from './types'

/**
 * 세션 쿼리 — 컴포넌트는 이 함수들만 호출하고 db를 직접 만지지 않는다.
 */

/** 진행 화면용: 세션 종목 + 그 종목의 세트들 */
export interface WorkoutItem extends WorkoutExercise {
  sets: WorkoutSet[]
}

/** 홈 목록용: 세션 + 미리 계산한 요약 */
export interface WorkoutSummary extends Workout {
  setCount: number
  volume: number
}

export interface ConditionInput {
  sleepHours?: number
  backCondition?: number
  kneeCondition?: number
  note?: string
}

/**
 * 템플릿에서 세션을 시작한다 — §4.3의 스냅샷 복사.
 *
 * TemplateExercise를 WorkoutExercise로 복사하고, 목표 세트 수만큼
 * WorkoutSet을 미리 만들어 목표 중량·렙을 채워 둔다(§5.1 "미리 채워둔다").
 * 복사가 끝나면 세션은 템플릿과 완전히 독립이다. 이후 템플릿을 어떻게
 * 고치든 이 기록은 변하지 않는다.
 */
export async function startWorkoutFromTemplate(
  templateId: string,
): Promise<string> {
  // 테이블이 6개라 가변인자 오버로드(최대 5개)를 넘어서므로 배열 형태를 쓴다
  return db.transaction(
    'rw',
    [
      db.templates,
      db.templateExercises,
      db.exercises,
      db.workouts,
      db.workoutExercises,
      db.workoutSets,
    ],
    async () => {
      const template = await db.templates.get(templateId)
      if (!template) throw new Error('템플릿을 찾을 수 없습니다')

      const templateItems = await db.templateExercises
        .where('templateId')
        .equals(templateId)
        .sortBy('sortOrder')
      const exercises = await db.exercises.bulkGet(
        templateItems.map((item) => item.exerciseId),
      )

      const workoutId = newId()
      await db.workouts.add({
        id: workoutId,
        templateId,
        // 표시용 복사본 — 템플릿 이름이 바뀌어도 이 기록은 그대로다
        templateName: template.name,
        startedAt: Date.now(),
      })

      const workoutExercises: WorkoutExercise[] = []
      const workoutSets: WorkoutSet[] = []

      templateItems.forEach((item, index) => {
        const exercise = exercises[index]
        if (!exercise) return

        const workoutExerciseId = newId()
        workoutExercises.push({
          id: workoutExerciseId,
          workoutId,
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          exerciseType: exercise.type,
          sortOrder: item.sortOrder,
          ...(exercise.type === 'CHECKLIST' ? { isChecked: false } : {}),
        })

        // CHECKLIST는 세트 수 카운트에서 제외되므로 세트를 만들지 않는다 — §4.1
        if (exercise.type === 'CHECKLIST') return

        const setCount = Math.max(1, item.targetSets ?? 1)
        for (let setNumber = 1; setNumber <= setCount; setNumber++) {
          workoutSets.push({
            id: newId(),
            workoutExerciseId,
            exerciseId: exercise.id,
            setNumber,
            setType: 'NORMAL',
            weight: item.targetWeight,
            reps: item.targetReps,
            seconds: item.targetSeconds,
            isCompleted: false,
          })
        }
      })

      await db.workoutExercises.bulkAdd(workoutExercises)
      await db.workoutSets.bulkAdd(workoutSets)
      return workoutId
    },
  )
}

export function getWorkout(id: string): Promise<Workout | undefined> {
  return db.workouts.get(id)
}

/**
 * 진행 중인 세션. 새 세션은 항상 startedAt이 가장 크므로 최신 한 건만 본다.
 * 종료하지 않고 버린 옛 세션이 있어도 새 세션을 시작하는 순간 밀려나는데,
 * 그게 의도한 동작이다.
 */
export async function getActiveWorkout(): Promise<Workout | undefined> {
  const latest = await db.workouts.orderBy('startedAt').last()
  return latest && latest.endedAt === undefined ? latest : undefined
}

export async function listWorkoutItems(
  workoutId: string,
): Promise<WorkoutItem[]> {
  const items = await db.workoutExercises
    .where('workoutId')
    .equals(workoutId)
    .sortBy('sortOrder')

  const sets = await db.workoutSets
    .where('workoutExerciseId')
    .anyOf(items.map((item) => item.id))
    .toArray()

  return items.map((item) => ({
    ...item,
    sets: sets
      .filter((set) => set.workoutExerciseId === item.id)
      .sort((a, b) => a.setNumber - b.setNumber),
  }))
}

/** 홈의 최근 기록. 종료된 세션만 최신순으로. */
export async function listRecentWorkouts(
  limit = 10,
): Promise<WorkoutSummary[]> {
  const workouts = await db.workouts
    .orderBy('startedAt')
    .reverse()
    .filter((workout) => workout.endedAt !== undefined)
    .limit(limit)
    .toArray()

  const items = await db.workoutExercises
    .where('workoutId')
    .anyOf(workouts.map((workout) => workout.id))
    .toArray()
  const sets = await db.workoutSets
    .where('workoutExerciseId')
    .anyOf(items.map((item) => item.id))
    .toArray()

  return workouts.map((workout) => {
    const itemIds = new Set(
      items.filter((i) => i.workoutId === workout.id).map((i) => i.id),
    )
    const own = sets.filter((set) => itemIds.has(set.workoutExerciseId))
    return {
      ...workout,
      setCount: own.filter((set) => set.isCompleted).length,
      volume: totalVolume(own),
    }
  })
}

// --- 세트 ---

export type WorkoutSetPatch = Partial<
  Pick<WorkoutSet, 'weight' | 'reps' | 'seconds' | 'setType'>
>

export async function updateWorkoutSet(
  id: string,
  patch: WorkoutSetPatch,
): Promise<void> {
  await db.workoutSets.update(id, patch)
}

/**
 * 완료 체크. completedAt은 복합 인덱스 [exerciseId+completedAt]의 축이므로
 * 체크를 풀면 반드시 함께 지운다 — 안 그러면 "최근 기록" 조회에 유령이 남는다.
 */
export async function setWorkoutSetCompleted(
  id: string,
  isCompleted: boolean,
): Promise<void> {
  await db.workoutSets.update(id, {
    isCompleted,
    completedAt: isCompleted ? Date.now() : undefined,
  })
}

/** 세트 하나를 마지막에 덧붙인다. 직전 세트 값을 복사해 입력을 줄인다(§5.1). */
export async function addWorkoutSet(workoutExerciseId: string): Promise<void> {
  await db.transaction('rw', db.workoutExercises, db.workoutSets, async () => {
    const item = await db.workoutExercises.get(workoutExerciseId)
    if (!item) return
    const sets = await db.workoutSets
      .where('workoutExerciseId')
      .equals(workoutExerciseId)
      .sortBy('setNumber')
    const last = sets.at(-1)

    await db.workoutSets.add({
      id: newId(),
      workoutExerciseId,
      exerciseId: item.exerciseId,
      setNumber: (last?.setNumber ?? 0) + 1,
      setType: last?.setType === 'WARMUP' ? 'NORMAL' : (last?.setType ?? 'NORMAL'),
      weight: last?.weight,
      reps: last?.reps,
      seconds: last?.seconds,
      isCompleted: false,
    })
  })
}

/** 마지막 세트를 뺀다. 중간 세트 삭제는 번호가 흔들려 실익이 없다. */
export async function removeLastWorkoutSet(
  workoutExerciseId: string,
): Promise<void> {
  await db.transaction('rw', db.workoutSets, async () => {
    const sets = await db.workoutSets
      .where('workoutExerciseId')
      .equals(workoutExerciseId)
      .sortBy('setNumber')
    const last = sets.at(-1)
    if (last) await db.workoutSets.delete(last.id)
  })
}

export async function setChecklistChecked(
  workoutExerciseId: string,
  isChecked: boolean,
): Promise<void> {
  await db.workoutExercises.update(workoutExerciseId, { isChecked })
}

// --- 세션 중 종목 추가/삭제 (§4.3의 부수 효과) ---

/** 랙이 차 있거나 컨디션이 나쁠 때의 즉석 변경. 여기서도 이름·타입을 복사한다. */
export async function addExerciseToWorkout(
  workoutId: string,
  exercise: Exercise,
): Promise<void> {
  await db.transaction('rw', db.workoutExercises, db.workoutSets, async () => {
    const existing = await db.workoutExercises
      .where('workoutId')
      .equals(workoutId)
      .sortBy('sortOrder')
    const id = newId()

    await db.workoutExercises.add({
      id,
      workoutId,
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      exerciseType: exercise.type,
      sortOrder: (existing.at(-1)?.sortOrder ?? -1) + 1,
      ...(exercise.type === 'CHECKLIST' ? { isChecked: false } : {}),
    })

    if (exercise.type !== 'CHECKLIST') {
      await db.workoutSets.add({
        id: newId(),
        workoutExerciseId: id,
        exerciseId: exercise.id,
        setNumber: 1,
        setType: 'NORMAL',
        isCompleted: false,
      })
    }
  })
}

export async function removeWorkoutExercise(id: string): Promise<void> {
  await db.transaction('rw', db.workoutExercises, db.workoutSets, async () => {
    const sets = await db.workoutSets
      .where('workoutExerciseId')
      .equals(id)
      .toArray()
    await db.workoutSets.bulkDelete(sets.map((set) => set.id))
    await db.workoutExercises.delete(id)
  })
}

// --- 종료 ---

/**
 * 세션 종료. endedAt이 찍히는 순간 기록이 확정된다.
 * 미완료 세트는 지우지 않는다 — 체크를 깜빡한 경우를 복구할 수 없게 되고,
 * 집계는 isCompleted로 거르면 충분하다(§7).
 */
export async function finishWorkout(
  id: string,
  condition: ConditionInput,
): Promise<void> {
  await db.workouts.update(id, {
    endedAt: Date.now(),
    sleepHours: condition.sleepHours,
    backCondition: condition.backCondition,
    kneeCondition: condition.kneeCondition,
    note: condition.note?.trim() || undefined,
  })
}

/** 잘못 시작한 세션 버리기 */
export async function discardWorkout(id: string): Promise<void> {
  await db.transaction(
    'rw',
    db.workouts,
    db.workoutExercises,
    db.workoutSets,
    async () => {
      const items = await db.workoutExercises
        .where('workoutId')
        .equals(id)
        .toArray()
      const sets = await db.workoutSets
        .where('workoutExerciseId')
        .anyOf(items.map((item) => item.id))
        .toArray()
      await db.workoutSets.bulkDelete(sets.map((set) => set.id))
      await db.workoutExercises.bulkDelete(items.map((item) => item.id))
      await db.workouts.delete(id)
    },
  )
}
