import { useState } from 'react'
import { Button } from '../components/Button'
import { Label, NumberField, TextArea } from '../components/fields'
import { Sheet } from '../components/Sheet'
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

  async function finish() {
    await finishWorkout(workoutId, {
      sleepHours,
      backCondition,
      kneeCondition,
      note,
    })
    onFinished()
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
