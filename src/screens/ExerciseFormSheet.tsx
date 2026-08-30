import { useState } from 'react'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  EXERCISE_TYPES,
  EXERCISE_TYPE_DESCRIPTION,
  EXERCISE_TYPE_LABEL,
} from '../components/exerciseTypeMeta'
import { Label, TextArea, TextField } from '../components/fields'
import { Sheet } from '../components/Sheet'
import {
  countTemplateUsages,
  createExercise,
  deleteExerciseCascade,
  findExerciseByName,
  setExerciseArchived,
  updateExercise,
} from '../db/exercises'
import type { Exercise, ExerciseType } from '../db/types'

/** 추가와 편집을 겸한다. exercise가 없으면 추가 모드. */
export function ExerciseFormSheet({
  exercise,
  onClose,
}: {
  exercise?: Exercise
  onClose: () => void
}) {
  const [name, setName] = useState(exercise?.name ?? '')
  // 신규 종목 기본값은 WEIGHT_REPS — §4.1
  const [type, setType] = useState<ExerciseType>(exercise?.type ?? 'WEIGHT_REPS')
  const [note, setNote] = useState(exercise?.note ?? '')
  const [error, setError] = useState<string>()
  const [pendingDelete, setPendingDelete] = useState<number>()

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('이름을 입력하세요')
      return
    }
    if (await findExerciseByName(trimmed, exercise?.id)) {
      setError('같은 이름의 종목이 이미 있습니다')
      return
    }

    const input = { name: trimmed, type, note }
    if (exercise) {
      await updateExercise(exercise.id, input)
    } else {
      await createExercise(input)
    }
    onClose()
  }

  async function askDelete() {
    if (!exercise) return
    setPendingDelete(await countTemplateUsages(exercise.id))
  }

  async function confirmDelete() {
    if (!exercise) return
    await deleteExerciseCascade(exercise.id)
    onClose()
  }

  async function toggleArchive() {
    if (!exercise) return
    await setExerciseArchived(exercise.id, !exercise.isArchived)
    onClose()
  }

  return (
    <>
      <Sheet
        title={exercise ? '종목 편집' : '종목 추가'}
        onClose={onClose}
        footer={
          <Button variant="primary" className="w-full" onClick={save}>
            저장
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <TextField
            label="이름"
            value={name}
            onChange={(value) => {
              setName(value)
              setError(undefined)
            }}
            placeholder="예: 벤치프레스"
            autoFocus={!exercise}
            error={error}
          />

          <div>
            <Label>타입</Label>
            <div className="flex flex-col gap-1.5">
              {EXERCISE_TYPES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setType(option)}
                  className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                    type === option
                      ? 'bg-zinc-900 text-white'
                      : 'bg-white ring-1 ring-zinc-300 active:bg-zinc-100'
                  }`}
                >
                  <span className="w-16 shrink-0 text-[15px] font-medium">
                    {EXERCISE_TYPE_LABEL[option]}
                  </span>
                  <span
                    className={`text-[12px] ${type === option ? 'text-zinc-300' : 'text-zinc-500'}`}
                  >
                    {EXERCISE_TYPE_DESCRIPTION[option]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <TextArea
            label="메모"
            value={note}
            onChange={setNote}
            placeholder="폼 큐, 장비 세팅 등"
          />

          {exercise && (
            <div className="mt-2 flex gap-2 border-t border-zinc-200 pt-4">
              <Button className="flex-1" onClick={toggleArchive}>
                {exercise.isArchived ? '보관 해제' : '아카이브'}
              </Button>
              <Button variant="danger" className="flex-1" onClick={askDelete}>
                삭제
              </Button>
            </div>
          )}
        </div>
      </Sheet>

      {pendingDelete !== undefined && exercise && (
        <ConfirmDialog
          title={`'${exercise.name}'를 완전히 삭제할까요?`}
          description={
            <>
              {pendingDelete > 0 && (
                <p>템플릿 {pendingDelete}개에서 함께 제거됩니다.</p>
              )}
              <p>과거 운동 기록은 그대로 유지됩니다.</p>
            </>
          }
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(undefined)}
        />
      )}
    </>
  )
}
