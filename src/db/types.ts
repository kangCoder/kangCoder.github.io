/**
 * 도메인 엔티티 정의 — spec-v0.1.md §4.2
 *
 * 타임스탬프는 전부 epoch ms(number)다. §6.1의 `Date.now() - startedAt` 계산과
 * §2.3의 JSON 백업 직렬화가 모두 number에서 가장 단순해진다.
 * 예외는 Bodyweight.date로, 하루에 한 건이므로 'yyyy-MM-dd' 문자열을 기본키로 쓴다.
 */

/**
 * §4.1 — BODYWEIGHT_REPS는 의도적으로 제외했다(kg 칸에 추가 중량을 넣으면 된다).
 *
 * TIME과 CARDIO를 나눈 이유 — 플랭크는 초 단위로 여러 세트를 하지만,
 * 유산소는 분 단위로 한 번 한다. 입력 단위와 세트 유무가 모두 달라서
 * 한 타입으로 묶으면 화면이 둘 다 어정쩡해진다.
 */
export type ExerciseType =
  | 'WEIGHT_REPS'
  | 'TIME'
  | 'CHECKLIST'
  | 'CARDIO'

/** §7 — 워밍업을 본세트와 구분하지 않으면 볼륨 그래프가 오염된다. */
export type SetType = 'WARMUP' | 'NORMAL' | 'FAILURE' | 'DROP'

/** 종목 마스터 */
export interface Exercise {
  id: string
  name: string
  type: ExerciseType
  note?: string
  isArchived: boolean
  createdAt: number
}

/** "Bench Main" 등 세션 템플릿 */
export interface Template {
  id: string
  name: string
  sortOrder: number
  isArchived: boolean
}

/**
 * 템플릿 안의 종목 + 목표치.
 * exerciseId는 살아 있는 참조다(스냅샷 복사는 Workout에서만 한다 — §4.3).
 * 목표치 필드는 종목 타입에 따라 일부만 쓰인다:
 *   WEIGHT_REPS → targetSets/targetReps/targetWeight
 *   TIME        → targetSets/targetSeconds
 *   CARDIO      → targetSeconds (분 단위로 입력받아 초로 저장)
 *   CHECKLIST   → 목표치 없음
 */
export interface TemplateExercise {
  id: string
  templateId: string
  exerciseId: string
  sortOrder: number
  targetSets?: number
  targetReps?: number
  targetWeight?: number
  targetSeconds?: number
  /** §4.4 — 슈퍼세트는 앞 종목의 휴식을 0으로 두어 갈음한다 */
  restSeconds?: number
  note?: string
}

/**
 * 실제 수행 세션.
 * templateId는 "어느 템플릿에서 시작했는지" 라벨일 뿐 조회 시 조인하지 않는다.
 * templateName은 표시용 복사본이다 — 템플릿 이름이 바뀌어도 과거 기록은 그대로여야 한다.
 */
export interface Workout {
  id: string
  templateId?: string
  templateName?: string
  startedAt: number
  endedAt?: number
  sleepHours?: number
  backCondition?: number
  kneeCondition?: number
  conditionScore?: number
  note?: string
}

/**
 * 세션에 복사된 종목. exerciseName과 exerciseType은 표시용 비정규화 복사본이다.
 *
 * 타입까지 복사하는 이유 — 어떤 입력 칸을 그릴지가 타입으로 정해지므로,
 * 조인해서 읽으면 나중에 종목 타입을 바꾸거나 종목을 삭제했을 때
 * 과거 기록을 그리지 못한다. 이름을 복사하는 이유와 같다(§4.3).
 */
export interface WorkoutExercise {
  id: string
  workoutId: string
  exerciseId: string
  exerciseName: string
  exerciseType: ExerciseType
  sortOrder: number
  /**
   * 세트 사이 휴식(초). 템플릿에서 복사한 값이다 — 진행 중에 템플릿을 고쳐도
   * 이번 세션의 휴식이 바뀌면 안 되고, 세션 중 즉석 추가한 종목은 참조할
   * 템플릿 행 자체가 없다.
   * 0은 §4.4의 슈퍼세트 표현이므로 타이머를 걸지 않는다.
   */
  restSeconds?: number
  /** CHECKLIST 타입용 */
  isChecked?: boolean
}

export interface WorkoutSet {
  id: string
  workoutExerciseId: string
  exerciseId: string
  setNumber: number
  setType: SetType
  weight?: number
  reps?: number
  seconds?: number
  isCompleted: boolean
  /** 복합 인덱스 [exerciseId+completedAt]의 두 번째 축 */
  completedAt?: number
}

/** 러닝은 웨이트와 기록 항목·화면·지표가 전부 달라 별도 세션으로 다룬다 — §4.1 */
export interface Run {
  id: string
  startedAt: number
  durationSec: number
  distanceKm: number
  note?: string
  feelScore?: number
}

export interface Bodyweight {
  /** 'yyyy-MM-dd' */
  date: string
  weightKg: number
}
