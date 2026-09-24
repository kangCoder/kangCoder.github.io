import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowIcon } from '../components/ArrowIcon'
import { Button, IconButton } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { ExerciseTypeBadge } from '../components/ExerciseTypeBadge'
import { NumberField, TextField } from '../components/fields'
import type {
  Exercise,
  ExerciseType,
  Template,
  TemplateExercise,
} from '../db/types'
import {
  deleteTemplateCascade,
  getTemplate,
  listTemplateItems,
  saveTemplate,
  type TemplateItem,
  setTemplateArchived,
  type TemplateDraftItem,
} from '../db/templates'
import { minutesToSeconds, secondsToMinutes } from '../lib/cardio'
import { ExercisePickerSheet } from './ExercisePickerSheet'

/**
 * 편집 중인 한 행. DB의 templateExercise가 아니라 화면 안에서만 사는 값이다.
 * key는 리스트 렌더링과 입력 버퍼 유지용으로만 쓰는 임시 id다.
 */
interface DraftRow extends TemplateDraftItem {
  key: string
  exerciseName: string
  exerciseType: ExerciseType | undefined
}

/**
 * 템플릿 편집 — §5의 4번 화면.
 *
 * 모든 변경은 로컬 드래프트에만 쌓이고 [저장]을 눌러야 DB에 커밋된다.
 * 종목을 추가하자마자 저장되면 "아직 편집 중"과 "반영됨"을 구분할 수 없어
 * 되돌리기가 불가능하다.
 */
export function TemplateEditScreen() {
  const { id } = useParams<{ id: string }>()

  const template = useLiveQuery(
    () => (id ? getTemplate(id) : undefined),
    [id],
    undefined,
  )
  const saved = useLiveQuery(() => (id ? listTemplateItems(id) : []), [id])

  if (!id || saved === undefined) return null

  if (template === undefined) {
    return (
      <EmptyState
        title="템플릿을 찾을 수 없습니다"
        action={
          <Link to="/templates">
            <Button>템플릿 목록으로</Button>
          </Link>
        }
      />
    )
  }

  // key로 감싸 다른 템플릿으로 넘어갈 때 드래프트가 새로 시작되게 한다.
  // 편집 상태 초기화를 effect가 아니라 마운트 시점에 맡기는 방식이다.
  return <TemplateEditor key={id} id={id} template={template} saved={saved} />
}

function TemplateEditor({
  id,
  template,
  saved,
}: {
  id: string
  template: Template
  saved: TemplateItem[]
}) {
  const navigate = useNavigate()

  // 저장된 값은 드래프트의 출발점일 뿐이다. 이후 useLiveQuery가 다시 흘러도
  // 편집 중인 내용을 덮어쓰지 않는다.
  const [name, setName] = useState(template.name)
  const [rows, setRows] = useState<DraftRow[]>(() =>
    saved.map((item) => ({
      key: item.id,
      exerciseId: item.exerciseId,
      exerciseName: item.exercise?.name ?? '(삭제된 종목)',
      exerciseType: item.exercise?.type,
      targetSets: item.targetSets,
      targetReps: item.targetReps,
      targetWeight: item.targetWeight,
      targetSeconds: item.targetSeconds,
      restSeconds: item.restSeconds,
      note: item.note,
    })),
  )
  const [picking, setPicking] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmingLeave, setConfirmingLeave] = useState(false)
  const [nameError, setNameError] = useState<string>()

  const isDirty =
    name.trim() !== template.name || !sameAsSaved(rows, saved)

  function patchRow(key: string, patch: Partial<DraftRow>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    )
  }

  function moveRow(key: string, direction: 'up' | 'down') {
    setRows((current) => {
      const index = current.findIndex((row) => row.key === key)
      const target = direction === 'up' ? index - 1 : index + 1
      if (index === -1 || target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function addRow(exercise: Exercise) {
    setRows((current) => [
      ...current,
      {
        key: `new-${crypto.randomUUID()}`,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        exerciseType: exercise.type,
        // CHECKLIST는 목표치가 없고, CARDIO는 세트·휴식 개념이 없다(§4.1)
        ...(exercise.type === 'CHECKLIST'
          ? {}
          : exercise.type === 'CARDIO'
            ? { targetSeconds: 30 * 60 }
            : { targetSets: 3, restSeconds: 120 }),
      },
    ])
  }

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('이름을 입력하세요')
      return
    }
    // key·exerciseName·exerciseType은 화면 전용이라 저장하지 않는다
    await saveTemplate(
      id,
      trimmed,
      rows.map((row) => ({
        exerciseId: row.exerciseId,
        targetSets: row.targetSets,
        targetReps: row.targetReps,
        targetWeight: row.targetWeight,
        targetSeconds: row.targetSeconds,
        restSeconds: row.restSeconds,
        note: row.note,
      })),
    )
    navigate('/templates')
  }

  function leave() {
    if (isDirty) setConfirmingLeave(true)
    else navigate('/templates')
  }

  async function removeTemplate() {
    await deleteTemplateCascade(id)
    navigate('/templates', { replace: true })
  }

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-1 bg-zinc-100/90 px-2 pt-2 pb-2 backdrop-blur">
        <IconButton onClick={leave} aria-label="뒤로">
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
        <h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold text-zinc-900">
          템플릿 편집
        </h1>
        <Button variant="primary" disabled={!isDirty} onClick={save}>
          저장
        </Button>
      </header>

      <div className="px-4 pt-1 pb-3">
        <TextField
          label="이름"
          value={name}
          onChange={(value) => {
            setName(value)
            setNameError(undefined)
          }}
          error={nameError}
        />
      </div>

          {rows.length === 0 ? (
            <EmptyState
              title="종목이 비어 있습니다"
              hint="세션에서 수행할 순서대로 담아 주세요."
              action={
                <Button variant="primary" onClick={() => setPicking(true)}>
                  종목 추가
                </Button>
              }
            />
          ) : (
            <ul className="flex flex-col gap-2 px-4">
              {rows.map((row, index) => (
                <DraftRowCard
                  key={row.key}
                  row={row}
                  isFirst={index === 0}
                  isLast={index === rows.length - 1}
                  onPatch={(patch) => patchRow(row.key, patch)}
                  onMove={(direction) => moveRow(row.key, direction)}
                  onRemove={() =>
                    setRows((current) =>
                      current.filter((r) => r.key !== row.key),
                    )
                  }
                />
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-2 px-4 py-4">
            {rows.length > 0 && (
              <Button onClick={() => setPicking(true)}>+ 종목 추가</Button>
            )}
            {isDirty && (
              <p className="pt-1 text-center text-[12px] text-amber-700">
                저장하지 않은 변경이 있습니다
              </p>
            )}
            <div className="mt-6 flex gap-2 border-t border-zinc-200 pt-4">
                <Button
                  className="flex-1"
                  onClick={() => setTemplateArchived(id, !template.isArchived)}
                >
                  {template.isArchived ? '보관 해제' : '아카이브'}
                </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => setConfirmingDelete(true)}
              >
                템플릿 삭제
              </Button>
            </div>
          </div>

      {picking && (
        <ExercisePickerSheet
          onPick={async (exercise: Exercise) => {
            addRow(exercise)
          }}
          onClose={() => setPicking(false)}
        />
      )}

      {confirmingLeave && (
        <ConfirmDialog
          title="저장하지 않고 나갈까요?"
          description="이 화면에서 바꾼 내용이 사라집니다."
          confirmLabel="나가기"
          onConfirm={() => navigate('/templates')}
          onCancel={() => setConfirmingLeave(false)}
        />
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title={`'${template.name}'을 삭제할까요?`}
          description={
            <>
              <p>템플릿과 그 안의 종목 구성이 사라집니다.</p>
              <p>이 템플릿으로 수행한 과거 기록은 그대로 유지됩니다.</p>
            </>
          }
          onConfirm={removeTemplate}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  )
}

function DraftRowCard({
  row,
  isFirst,
  isLast,
  onPatch,
  onMove,
  onRemove,
}: {
  row: DraftRow
  isFirst: boolean
  isLast: boolean
  onPatch: (patch: Partial<DraftRow>) => void
  onMove: (direction: 'up' | 'down') => void
  onRemove: () => void
}) {
  const type = row.exerciseType

  return (
    <li className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
      <div className="flex items-center gap-1">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="truncate text-[15px] font-medium text-zinc-900">
            {row.exerciseName}
          </span>
          {type && <ExerciseTypeBadge type={type} />}
        </div>
        <IconButton aria-label="위로" disabled={isFirst} onClick={() => onMove('up')}>
          <ArrowIcon direction="up" />
        </IconButton>
        <IconButton aria-label="아래로" disabled={isLast} onClick={() => onMove('down')}>
          <ArrowIcon direction="down" />
        </IconButton>
        <IconButton aria-label="제거" className="text-red-400" onClick={onRemove}>
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

      {/* 목표치 입력 칸은 종목 타입에 따라 달라진다 — §4.1 */}
      {type === 'WEIGHT_REPS' && (
        <div className="mt-2 grid grid-cols-4 gap-2">
          <NumberField
            label="세트"
            value={row.targetSets}
            onChange={(targetSets) => onPatch({ targetSets })}
          />
          <NumberField
            label="렙"
            value={row.targetReps}
            onChange={(targetReps) => onPatch({ targetReps })}
          />
          <NumberField
            label="중량"
            suffix="kg"
            decimal
            value={row.targetWeight}
            onChange={(targetWeight) => onPatch({ targetWeight })}
          />
          <NumberField
            label="휴식"
            suffix="초"
            value={row.restSeconds}
            onChange={(restSeconds) => onPatch({ restSeconds })}
          />
        </div>
      )}

      {type === 'TIME' && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <NumberField
            label="세트"
            value={row.targetSets}
            onChange={(targetSets) => onPatch({ targetSets })}
          />
          <NumberField
            label="시간"
            suffix="초"
            value={row.targetSeconds}
            onChange={(targetSeconds) => onPatch({ targetSeconds })}
          />
          <NumberField
            label="휴식"
            suffix="초"
            value={row.restSeconds}
            onChange={(restSeconds) => onPatch({ restSeconds })}
          />
        </div>
      )}

      {type === 'CARDIO' && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <NumberField
            label="시간"
            suffix="분"
            value={secondsToMinutes(row.targetSeconds)}
            onChange={(minutes) =>
              onPatch({ targetSeconds: minutesToSeconds(minutes) })
            }
          />
        </div>
      )}

      {type === 'CHECKLIST' && (
        <p className="mt-2 text-[12px] text-zinc-400">
          체크만 하는 종목입니다. 목표치가 없습니다.
        </p>
      )}

      <div className="mt-2">
        <TextField
          value={row.note ?? ''}
          placeholder="메모"
          onChange={(note) => onPatch({ note: note || undefined })}
        />
      </div>
    </li>
  )
}

/** 드래프트가 저장된 내용과 같은지 — [저장] 버튼 활성화 판정용 */
function sameAsSaved(rows: DraftRow[], saved: TemplateExercise[]): boolean {
  if (rows.length !== saved.length) return false
  return rows.every((row, i) => {
    const other = saved[i]
    return (
      row.exerciseId === other.exerciseId &&
      row.targetSets === other.targetSets &&
      row.targetReps === other.targetReps &&
      row.targetWeight === other.targetWeight &&
      row.targetSeconds === other.targetSeconds &&
      row.restSeconds === other.restSeconds &&
      (row.note ?? undefined) === (other.note ?? undefined)
    )
  })
}
