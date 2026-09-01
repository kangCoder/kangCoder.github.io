import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, IconButton } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { ExerciseTypeBadge } from '../components/ExerciseTypeBadge'
import { NumberField } from '../components/fields'
import {
  SET_TYPE_CLASS,
  SET_TYPE_MARK,
  nextSetType,
} from '../components/setTypeMeta'
import type { Exercise, WorkoutSet } from '../db/types'
import {
  addExerciseToWorkout,
  addWorkoutSet,
  discardWorkout,
  getWorkout,
  listWorkoutItems,
  removeLastWorkoutSet,
  removeWorkoutExercise,
  setChecklistChecked,
  setWorkoutSetCompleted,
  updateWorkoutSet,
  type WorkoutItem,
} from '../db/workouts'
import { ExercisePickerSheet } from './ExercisePickerSheet'
import { WorkoutFinishSheet } from './WorkoutFinishSheet'

/**
 * 세션 진행 화면 — §5.1
 * 헬스장에서 땀난 손으로, 세트 사이 짧은 시간에, 한 손으로 조작한다.
 */
export function WorkoutScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [picking, setPicking] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)

  const workout = useLiveQuery(
    () => (id ? getWorkout(id) : undefined),
    [id],
    undefined,
  )
  const items = useLiveQuery(() => (id ? listWorkoutItems(id) : []), [id])

  if (!id) return null

  if (items !== undefined && workout === undefined) {
    return (
      <EmptyState
        title="세션을 찾을 수 없습니다"
        action={<Button onClick={() => navigate('/')}>홈으로</Button>}
      />
    )
  }

  const completedSets =
    items?.reduce(
      (sum, item) => sum + item.sets.filter((set) => set.isCompleted).length,
      0,
    ) ?? 0
  const totalSets =
    items?.reduce((sum, item) => sum + item.sets.length, 0) ?? 0

  async function discard() {
    await discardWorkout(id!)
    navigate('/', { replace: true })
  }

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-zinc-100/90 px-4 pt-3 pb-2 backdrop-blur">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[20px] font-bold text-zinc-900">
            {workout?.templateName ?? '세션'}
          </h1>
          <p className="text-[12px] text-zinc-500">
            세트 {completedSets}/{totalSets} 완료
          </p>
        </div>
        <Button variant="primary" onClick={() => setFinishing(true)}>
          종료
        </Button>
      </header>

      {items === undefined ? null : items.length === 0 ? (
        <EmptyState
          title="종목이 비어 있습니다"
          action={
            <Button variant="primary" onClick={() => setPicking(true)}>
              종목 추가
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3 px-4 pt-1">
          {items.map((item) => (
            <WorkoutItemCard key={item.id} item={item} />
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 px-4 py-4">
        <Button onClick={() => setPicking(true)}>+ 종목 추가</Button>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => setConfirmingDiscard(true)}
        >
          세션 버리기
        </Button>
      </div>

      {picking && (
        <ExercisePickerSheet
          onPick={async (exercise: Exercise) => {
            await addExerciseToWorkout(id, exercise)
          }}
          onClose={() => setPicking(false)}
        />
      )}

      {finishing && (
        <WorkoutFinishSheet
          workoutId={id}
          incompleteSets={totalSets - completedSets}
          onClose={() => setFinishing(false)}
          onFinished={() => navigate('/', { replace: true })}
        />
      )}

      {confirmingDiscard && (
        <ConfirmDialog
          title="이 세션을 버릴까요?"
          description="입력한 세트가 모두 사라지고 기록이 남지 않습니다."
          confirmLabel="버리기"
          onConfirm={discard}
          onCancel={() => setConfirmingDiscard(false)}
        />
      )}
    </div>
  )
}

function WorkoutItemCard({ item }: { item: WorkoutItem }) {
  const done = item.sets.filter((set) => set.isCompleted).length
  // 지역 const로 받아야 아래 map 콜백 안에서도 타입 내로잉이 유지된다
  const type = item.exerciseType

  return (
    <li className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-zinc-900">
          {item.exerciseName}
        </span>
        <ExerciseTypeBadge type={type} />
        {type !== 'CHECKLIST' && (
          <span className="shrink-0 text-[12px] tabular-nums text-zinc-400">
            {done}/{item.sets.length}
          </span>
        )}
        <IconButton
          aria-label="종목 제거"
          className="text-zinc-300"
          onClick={() => removeWorkoutExercise(item.id)}
        >
          <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
            <path
              d="M5 5l10 10M15 5L5 15"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </IconButton>
      </div>

      {type === 'CHECKLIST' ? (
        <button
          type="button"
          onClick={() => setChecklistChecked(item.id, !item.isChecked)}
          className={`mt-2 flex min-h-12 w-full items-center gap-3 rounded-xl px-3 transition-colors ${
            item.isChecked
              ? 'bg-zinc-900 text-white'
              : 'bg-zinc-50 text-zinc-500 ring-1 ring-zinc-200'
          }`}
        >
          <CheckMark checked={!!item.isChecked} />
          <span className="text-[15px] font-medium">완료</span>
        </button>
      ) : (
        <>
          <ul className="mt-2 flex flex-col gap-1.5">
            {item.sets.map((set) => (
              <SetRow key={set.id} set={set} type={type} />
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <Button className="flex-1" onClick={() => addWorkoutSet(item.id)}>
              + 세트
            </Button>
            <Button
              className="flex-1"
              disabled={item.sets.length === 0}
              onClick={() => removeLastWorkoutSet(item.id)}
            >
              − 마지막 세트
            </Button>
          </div>
        </>
      )}
    </li>
  )
}

function SetRow({
  set,
  type,
}: {
  set: WorkoutSet
  type: 'WEIGHT_REPS' | 'TIME'
}) {
  return (
    <li className="flex items-center gap-1.5">
      {/* 세트 번호를 탭하면 워밍업·실패·드롭으로 순환한다 — §7 */}
      <button
        type="button"
        aria-label={`세트 ${set.setNumber} 타입 변경`}
        onClick={() =>
          updateWorkoutSet(set.id, { setType: nextSetType(set.setType) })
        }
        className={`size-11 shrink-0 rounded-xl text-[13px] font-semibold tabular-nums ${SET_TYPE_CLASS[set.setType]}`}
      >
        {SET_TYPE_MARK[set.setType] || set.setNumber}
      </button>

      {type === 'WEIGHT_REPS' ? (
        <>
          <NumberField
            key={`${set.id}-weight`}
            value={set.weight}
            suffix="kg"
            decimal
            onChange={(weight) => updateWorkoutSet(set.id, { weight })}
          />
          <NumberField
            key={`${set.id}-reps`}
            value={set.reps}
            suffix="회"
            onChange={(reps) => updateWorkoutSet(set.id, { reps })}
          />
        </>
      ) : (
        <NumberField
          key={`${set.id}-seconds`}
          value={set.seconds}
          suffix="초"
          onChange={(seconds) => updateWorkoutSet(set.id, { seconds })}
        />
      )}

      <button
        type="button"
        aria-label={set.isCompleted ? '완료 취소' : '완료'}
        onClick={() => setWorkoutSetCompleted(set.id, !set.isCompleted)}
        className={`flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
          set.isCompleted
            ? 'bg-zinc-900 text-white'
            : 'bg-zinc-50 text-zinc-300 ring-1 ring-zinc-200'
        }`}
      >
        <CheckMark checked={set.isCompleted} />
      </button>
    </li>
  )
}

function CheckMark({ checked }: { checked: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="size-5 shrink-0" aria-hidden="true">
      <path
        d="M4 10.5l4 4 8-9"
        stroke="currentColor"
        strokeWidth={checked ? 2.2 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
