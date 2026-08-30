import type { ExerciseType } from '../db/types'
import {
  EXERCISE_TYPE_BADGE_CLASS,
  EXERCISE_TYPE_LABEL,
} from './exerciseTypeMeta'

export function ExerciseTypeBadge({ type }: { type: ExerciseType }) {
  return (
    <span
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${EXERCISE_TYPE_BADGE_CLASS[type]}`}
    >
      {EXERCISE_TYPE_LABEL[type]}
    </span>
  )
}
