import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, IconButton } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { ExerciseTypeBadge } from '../components/ExerciseTypeBadge'
import type { ExerciseType } from '../db/types'
import { SET_TYPE_LABEL } from '../components/setTypeMeta'
import { getSessionProgress, type ExerciseProgress } from '../db/sessionReview'
import {
  discardWorkout,
  getWorkout,
  listWorkoutItems,
  type WorkoutItem,
} from '../db/workouts'
import { bestOneRepMax, exerciseDurations, totalVolume } from '../lib/metrics'
import { formatMinutes } from '../lib/duration'

/**
 * 종료된 세션 상세 — 최근 기록에서 눌러 들어온다. 읽기 전용이다.
 * 끝난 기록을 고칠 수 있게 하면 "그날 실제로 뭘 했는지"가 흔들린다.
 */
export function WorkoutDetailScreen({ workoutId }: { workoutId: string }) {
  const navigate = useNavigate()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const workout = useLiveQuery(() => getWorkout(workoutId), [workoutId])
  const items = useLiveQuery(() => listWorkoutItems(workoutId), [workoutId])
  // 직전 세션 대비 변화 — 끝난 기록을 다시 볼 때도 진척이 보여야 한다
  const progress = useLiveQuery(() => getSessionProgress(workoutId), [workoutId])

  if (workout === undefined || items === undefined) return null

  const durations = exerciseDurations(items, workout.startedAt)
  const progressByItem = new Map(
    (progress ?? []).map((row) => [row.workoutExerciseId, row]),
  )
  const volume = totalVolume(items.flatMap((item) => item.sets))
  const completed = items.reduce(
    (sum, item) => sum + item.sets.filter((set) => set.isCompleted).length,
    0,
  )
  const total =
    workout.endedAt !== undefined
      ? formatMinutes(workout.endedAt - workout.startedAt)
      : undefined

  async function remove() {
    await discardWorkout(workoutId)
    navigate('/', { replace: true })
  }

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-1 bg-zinc-100/90 px-2 pt-2 pb-2 backdrop-blur">
        <IconButton onClick={() => navigate('/')} aria-label="뒤로">
          <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
            <path
              d="M12 4l-6 6 6 6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </IconButton>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-semibold text-zinc-900">
            {workout.templateName ?? '세션'}
          </h1>
          <p className="text-[12px] text-zinc-500">
            {format(workout.startedAt, 'M월 d일 (EEE) HH:mm', { locale: ko })}
          </p>
        </div>
      </header>

      <section className="px-4 pt-1 pb-3">
        <div className="flex gap-2">
          <Stat label="소요" value={total ?? '—'} />
          <Stat label="세트" value={`${completed}`} />
          <Stat
            label="볼륨"
            value={
              volume > 0 ? `${Math.round(volume).toLocaleString('ko-KR')}kg` : '—'
            }
          />
        </div>
      </section>

      {items.length === 0 ? (
        <EmptyState title="기록된 종목이 없습니다" />
      ) : (
        <ul className="flex flex-col gap-2 px-4">
          {items.map((item) => (
            <DetailItemCard
              key={item.id}
              item={item}
              durationMs={durations.get(item.id)}
              progress={progressByItem.get(item.id)}
            />
          ))}
        </ul>
      )}

      <section className="px-4 py-4">
        <h2 className="mb-2 text-[13px] font-medium text-zinc-500">컨디션</h2>
        <div className="rounded-xl bg-white p-3 text-[14px] ring-1 ring-zinc-200">
          <ConditionRow
            label="수면"
            value={
              workout.sleepHours !== undefined
                ? `${workout.sleepHours}h`
                : undefined
            }
          />
          <ConditionRow label="허리" value={scaleLabel(workout.backCondition)} />
          <ConditionRow label="무릎" value={scaleLabel(workout.kneeCondition)} />
          {workout.note && (
            <p className="mt-2 border-t border-zinc-100 pt-2 text-[13px] leading-relaxed text-zinc-600">
              {workout.note}
            </p>
          )}
        </div>

        <Button
          variant="danger"
          className="mt-6 w-full"
          onClick={() => setConfirmingDelete(true)}
        >
          이 기록 삭제
        </Button>
      </section>

      {confirmingDelete && (
        <ConfirmDialog
          title="이 기록을 삭제할까요?"
          description="세트와 컨디션까지 함께 사라지며 되돌릴 수 없습니다."
          onConfirm={remove}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  )
}

function DetailItemCard({
  item,
  durationMs,
  progress,
}: {
  item: WorkoutItem
  durationMs: number | undefined
  progress: ExerciseProgress | undefined
}) {
  const done = item.sets.filter((set) => set.isCompleted)
  const volume = totalVolume(item.sets)
  const e1rm = bestOneRepMax(item.sets)

  return (
    <li className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-zinc-900">
          {item.exerciseName}
        </span>
        <ExerciseTypeBadge type={item.exerciseType} />
        {durationMs !== undefined && (
          <span className="shrink-0 text-[12px] tabular-nums text-zinc-400">
            {formatMinutes(durationMs)}
          </span>
        )}
      </div>

      {item.exerciseType === 'CHECKLIST' ? (
        <p className="mt-1.5 text-[13px] text-zinc-500">
          {item.isChecked ? '✓ 완료' : '수행하지 않음'}
        </p>
      ) : done.length === 0 ? (
        <p className="mt-1.5 text-[13px] text-zinc-400">수행하지 않음</p>
      ) : (
        <>
          <p className="mt-1.5 text-[13px] tabular-nums text-zinc-600">
            {done.map((set) => describeSet(set, item.exerciseType)).join(', ')}
          </p>
          {(volume > 0 || e1rm !== undefined) && (
            <p className="mt-1 text-[12px] tabular-nums text-zinc-400">
              {volume > 0 &&
                `볼륨 ${Math.round(volume).toLocaleString('ko-KR')}kg`}
              {volume > 0 && e1rm !== undefined && ' · '}
              {e1rm !== undefined && `e1RM ${e1rm.toFixed(1)}kg`}
            </p>
          )}
          {progress && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 border-t border-zinc-100 pt-1.5 text-[11px] tabular-nums">
              <Change
                label="최고 중량"
                current={progress.topWeight}
                previous={progress.previousTopWeight}
                unit="kg"
              />
              <Change
                label="e1RM"
                current={progress.e1rm}
                previous={progress.previousE1rm}
                unit="kg"
                digits={1}
              />
            </div>
          )}
        </>
      )}
    </li>
  )
}

/** 직전 세션 대비. 비교할 기록이 없으면 "첫 기록"이라고만 적는다. */
function Change({
  label,
  current,
  previous,
  unit,
  digits = 0,
}: {
  label: string
  current: number | undefined
  previous: number | undefined
  unit: string
  digits?: number
}) {
  if (current === undefined) return null
  if (previous === undefined) {
    return (
      <span className="text-zinc-400">
        {label} 첫 기록
      </span>
    )
  }
  const diff = Math.round((current - previous) * 10 ** digits) / 10 ** digits
  return (
    <span
      className={
        diff > 0
          ? 'text-emerald-600'
          : diff < 0
            ? 'text-red-500'
            : 'text-zinc-400'
      }
    >
      {label} {diff > 0 ? '+' : ''}
      {diff.toFixed(digits)}
      {unit}
      <span className="text-zinc-300"> (이전 {previous.toFixed(digits)})</span>
    </span>
  )
}

function describeSet(
  set: { weight?: number; reps?: number; seconds?: number; setType: string },
  type: ExerciseType,
): string {
  const mark =
    set.setType === 'NORMAL'
      ? ''
      : `(${SET_TYPE_LABEL[set.setType as keyof typeof SET_TYPE_LABEL]})`
  if (type === 'CARDIO') return `${Math.round((set.seconds ?? 0) / 60)}분${mark}`
  if (type === 'TIME') return `${set.seconds ?? 0}초${mark}`
  return `${set.weight ?? 0}×${set.reps ?? 0}${mark}`
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-xl bg-white px-3 py-2 text-center ring-1 ring-zinc-200">
      <p className="text-[16px] font-semibold tabular-nums text-zinc-900">
        {value}
      </p>
      <p className="text-[11px] text-zinc-400">{label}</p>
    </div>
  )
}

function ConditionRow({
  label,
  value,
}: {
  label: string
  value: string | undefined
}) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-zinc-500">{label}</span>
      <span className="tabular-nums text-zinc-900">{value ?? '—'}</span>
    </div>
  )
}

const SCALE_LABEL = ['', '많이 나쁨', '나쁨', '보통', '좋음', '아주 좋음']

function scaleLabel(score: number | undefined): string | undefined {
  if (score === undefined) return undefined
  return `${SCALE_LABEL[score] ?? ''} (${score})`
}
