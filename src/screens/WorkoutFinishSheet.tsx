import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Button } from '../components/Button'
import { Label, NumberField, TextArea } from '../components/fields'
import { Sheet } from '../components/Sheet'
import {
  applyTemplateDiff,
  getSessionProgress,
  getTemplateDiff,
} from '../db/sessionReview'
import { finishWorkout } from '../db/workouts'

/**
 * 세션 종료 — §5의 6번 화면, §8.1
 *
 * 컨디션 입력을 여기서 강제하는 것이 설계 결정이다.
 * 주말에 몰아서 기억하면 부정확하고, 운동 직후 슬라이더 3개는 부담이 없다.
 */

const SCALE = [1, 2, 3, 4, 5]
const SCALE_HINT = '1 나쁨 · 5 좋음'

export function WorkoutFinishSheet({
  workoutId,
  incompleteSets,
  onClose,
  onFinished,
}: {
  workoutId: string
  incompleteSets: number
  onClose: () => void
  onFinished: () => void
}) {
  const [sleepHours, setSleepHours] = useState<number>()
  const [backCondition, setBackCondition] = useState<number>()
  const [kneeCondition, setKneeCondition] = useState<number>()
  const [note, setNote] = useState('')
  const [skipped, setSkipped] = useState<Set<string>>(new Set())

  const progress = useLiveQuery(() => getSessionProgress(workoutId), [workoutId])
  const diffs = useLiveQuery(() => getTemplateDiff(workoutId), [workoutId])

  async function finish() {
    // 템플릿 갱신을 먼저 — 종료 후에는 이 화면으로 돌아올 수 없다
    const selected = (diffs ?? []).filter(
      (diff) => !skipped.has(diff.templateExerciseId),
    )
    await applyTemplateDiff(selected)

    await finishWorkout(workoutId, {
      sleepHours,
      backCondition,
      kneeCondition,
      note,
    })
    onFinished()
  }

  function toggleDiff(id: string) {
    setSkipped((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Sheet
      title="세션 종료"
      onClose={onClose}
      footer={
        <Button variant="primary" className="w-full" onClick={finish}>
          기록 저장하고 종료
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {incompleteSets > 0 && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
            완료 체크가 없는 세트 {incompleteSets}개는 집계에서 빠집니다.
          </p>
        )}

        {progress !== undefined && progress.length > 0 && (
          <div>
            <Label hint="직전 세션 대비">이번 세션</Label>
            <ul className="flex flex-col gap-1">
              {progress.map((row) => (
                <li
                  key={row.workoutExerciseId}
                  className="flex items-baseline gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-zinc-200"
                >
                  <span className="min-w-0 flex-1 truncate text-[14px] text-zinc-900">
                    {row.exerciseName}
                  </span>
                  <span className="shrink-0 text-[14px] font-semibold tabular-nums text-zinc-900">
                    {row.topWeight !== undefined ? `${row.topWeight}kg` : '—'}
                  </span>
                  <Delta
                    current={row.topWeight}
                    previous={row.previousTopWeight}
                    unit="kg"
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        {diffs !== undefined && diffs.length > 0 && (
          <div>
            <Label hint="체크한 항목만 반영">템플릿 업데이트</Label>
            <ul className="flex flex-col gap-1">
              {diffs.map((diff) => (
                <li
                  key={diff.templateExerciseId}
                  className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-zinc-200"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-zinc-900">
                      {diff.exerciseName}
                    </p>
                    <p className="text-[12px] tabular-nums text-zinc-500">
                      {describeTarget(diff.before)} → {describeTarget(diff.after)}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    aria-label={`${diff.exerciseName} 템플릿 반영`}
                    className="size-5 shrink-0 accent-zinc-900"
                    checked={!skipped.has(diff.templateExerciseId)}
                    onChange={() => toggleDiff(diff.templateExerciseId)}
                  />
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[11px] text-zinc-400">
              템플릿 목표치를 이번에 한 값으로 바꿉니다. 과거 기록은 그대로입니다.
            </p>
          </div>
        )}

        <NumberField
          label="수면"
          suffix="h"
          decimal
          value={sleepHours}
          onChange={setSleepHours}
          placeholder="7"
        />

        <ScaleField
          label="허리"
          value={backCondition}
          onChange={setBackCondition}
        />
        <ScaleField
          label="무릎"
          value={kneeCondition}
          onChange={setKneeCondition}
        />

        <TextArea
          label="메모"
          value={note}
          onChange={setNote}
          placeholder="컨디션, 이탈, 특이사항"
          rows={3}
        />
      </div>
    </Sheet>
  )
}

/** 직전 대비 증감. 늘면 초록, 줄면 빨강 — 중량은 느는 게 목표다. */
function Delta({
  current,
  previous,
  unit,
}: {
  current: number | undefined
  previous: number | undefined
  unit: string
}) {
  if (current === undefined || previous === undefined) {
    return <span className="w-14 shrink-0 text-right text-[12px] text-zinc-300">—</span>
  }
  const diff = Math.round((current - previous) * 10) / 10
  return (
    <span
      className={`w-14 shrink-0 text-right text-[12px] font-medium tabular-nums ${
        diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-500' : 'text-zinc-400'
      }`}
    >
      {diff > 0 ? '+' : ''}
      {diff}
      {unit}
    </span>
  )
}

function describeTarget(target: {
  sets?: number
  reps?: number
  weight?: number
}): string {
  const parts: string[] = []
  if (target.weight !== undefined) parts.push(`${target.weight}kg`)
  if (target.reps !== undefined) parts.push(`${target.reps}회`)
  const detail = parts.join(' × ')
  const sets = target.sets !== undefined ? `${target.sets}세트` : '—'
  return detail ? `${sets} ${detail}` : sets
}

function ScaleField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | undefined
  onChange: (value: number) => void
}) {
  return (
    <div>
      <Label hint={SCALE_HINT}>{label}</Label>
      <div className="flex gap-1.5">
        {SCALE.map((score) => (
          <button
            key={score}
            type="button"
            onClick={() => onChange(score)}
            className={`min-h-11 flex-1 rounded-xl text-[15px] font-medium tabular-nums transition-colors ${
              value === score
                ? 'bg-zinc-900 text-white'
                : 'bg-white text-zinc-600 ring-1 ring-zinc-300 active:bg-zinc-100'
            }`}
          >
            {score}
          </button>
        ))}
      </div>
    </div>
  )
}
