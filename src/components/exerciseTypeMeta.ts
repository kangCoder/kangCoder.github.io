import type { ExerciseType } from '../db/types'

/**
 * 종목 타입의 표시용 메타데이터.
 * 컴포넌트 파일과 분리해 두어야 fast refresh가 동작한다.
 */

export const EXERCISE_TYPES: ExerciseType[] = [
  'WEIGHT_REPS',
  'TIME',
  'CARDIO',
  'CHECKLIST',
]

export const EXERCISE_TYPE_LABEL: Record<ExerciseType, string> = {
  WEIGHT_REPS: '중량×렙',
  TIME: '시간',
  CARDIO: '유산소',
  CHECKLIST: '체크',
}

/** §4.1의 볼륨 집계 규칙을 폼에서 그대로 읽히게 한다 */
export const EXERCISE_TYPE_DESCRIPTION: Record<ExerciseType, string> = {
  WEIGHT_REPS: 'kg·렙 입력, 볼륨 집계 포함',
  TIME: '초 입력, 세트별로 기록',
  CARDIO: '분 입력, 세트 없이 한 번',
  CHECKLIST: '체크만, 볼륨·세트 수 모두 제외',
}

export const EXERCISE_TYPE_BADGE_CLASS: Record<ExerciseType, string> = {
  WEIGHT_REPS: 'bg-zinc-200 text-zinc-700',
  TIME: 'bg-sky-100 text-sky-700',
  CARDIO: 'bg-teal-100 text-teal-700',
  CHECKLIST: 'bg-amber-100 text-amber-700',
}
