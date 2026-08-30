import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowIcon } from '../components/ArrowIcon'
import { Button, IconButton } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { ExerciseTypeBadge } from '../components/ExerciseTypeBadge'
import { NumberField, TextField } from '../components/fields'
import { Sheet } from '../components/Sheet'
import type { Exercise } from '../db/types'
import {
  addExerciseToTemplate,
  deleteTemplateCascade,
  getTemplate,
  listTemplateItems,
  moveTemplateExercise,
  removeTemplateExercise,
  renameTemplate,
  setTemplateArchived,
  updateTemplateExercise,
  type TemplateExercisePatch,
  type TemplateItem,
} from '../db/templates'
import { ExercisePickerSheet } from './ExercisePickerSheet'

export function TemplateEditScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [picking, setPicking] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const template = useLiveQuery(
    () => (id ? getTemplate(id) : undefined),
    [id],
    undefined,
  )
  const items = useLiveQuery(() => (id ? listTemplateItems(id) : []), [id])

  if (!id) return null

  if (template === undefined && items !== undefined) {
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

  async function removeTemplate() {
    await deleteTemplateCascade(id!)
    navigate('/templates', { replace: true })
  }

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-1 bg-zinc-100/90 px-2 pt-2 pb-2 backdrop-blur">
        <Link
          to="/templates"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-zinc-500 active:bg-zinc-200"
          aria-label="뒤로"
        >
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
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-[20px] font-bold text-zinc-900">
          {template?.name ?? ''}
        </h1>
        <Button onClick={() => setRenaming(true)}>이름 변경</Button>
      </header>

      {items === undefined ? null : items.length === 0 ? (
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
        <ul className="flex flex-col gap-2 px-4 pt-1">
          {items.map((item, index) => (
            <TemplateItemRow
              key={item.id}
              item={item}
              isFirst={index === 0}
              isLast={index === items.length - 1}
              templateId={id}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 px-4 py-4">
        {items !== undefined && items.length > 0 && (
          <Button variant="primary" onClick={() => setPicking(true)}>
            + 종목 추가
          </Button>
        )}
        {template && (
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
        )}
      </div>

      {picking && (
        <ExercisePickerSheet
          onPick={async (exercise: Exercise) => {
            await addExerciseToTemplate(id, exercise)
          }}
          onClose={() => setPicking(false)}
        />
      )}

      {renaming && template && (
        <RenameTemplateSheet
          initialName={template.name}
          onSave={(name) => renameTemplate(id, name)}
          onClose={() => setRenaming(false)}
        />
      )}

      {confirmingDelete && template && (
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

function TemplateItemRow({
  item,
  isFirst,
  isLast,
  templateId,
}: {
  item: TemplateItem
  isFirst: boolean
  isLast: boolean
  templateId: string
}) {
  const type = item.exercise?.type
  const patch = (values: TemplateExercisePatch) =>
    updateTemplateExercise(item.id, values)

  return (
    <li className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
      <div className="flex items-center gap-1">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="truncate text-[15px] font-medium text-zinc-900">
            {item.exercise?.name ?? '(삭제된 종목)'}
          </span>
          {type && <ExerciseTypeBadge type={type} />}
        </div>
        <IconButton
          aria-label="위로"
          disabled={isFirst}
          onClick={() => moveTemplateExercise(templateId, item.id, 'up')}
        >
          <ArrowIcon direction="up" />
        </IconButton>
        <IconButton
          aria-label="아래로"
          disabled={isLast}
          onClick={() => moveTemplateExercise(templateId, item.id, 'down')}
        >
          <ArrowIcon direction="down" />
        </IconButton>
        <IconButton
          aria-label="제거"
          className="text-red-400"
          onClick={() => removeTemplateExercise(item.id)}
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

      {/* 목표치 입력 칸은 종목 타입에 따라 달라진다 — §4.1 */}
      {type === 'WEIGHT_REPS' && (
        <div className="mt-2 grid grid-cols-4 gap-2">
          <NumberField
            label="세트"
            value={item.targetSets}
            onChange={(targetSets) => patch({ targetSets })}
          />
          <NumberField
            label="렙"
            value={item.targetReps}
            onChange={(targetReps) => patch({ targetReps })}
          />
          <NumberField
            label="중량"
            suffix="kg"
            decimal
            value={item.targetWeight}
            onChange={(targetWeight) => patch({ targetWeight })}
          />
          <NumberField
            label="휴식"
            suffix="초"
            value={item.restSeconds}
            onChange={(restSeconds) => patch({ restSeconds })}
          />
        </div>
      )}

      {type === 'TIME' && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <NumberField
            label="세트"
            value={item.targetSets}
            onChange={(targetSets) => patch({ targetSets })}
          />
          <NumberField
            label="시간"
            suffix="초"
            value={item.targetSeconds}
            onChange={(targetSeconds) => patch({ targetSeconds })}
          />
          <NumberField
            label="휴식"
            suffix="초"
            value={item.restSeconds}
            onChange={(restSeconds) => patch({ restSeconds })}
          />
        </div>
      )}

      {type === 'CHECKLIST' && (
        <p className="mt-2 text-[12px] text-zinc-400">
          체크만 하는 종목입니다. 목표치가 없습니다.
        </p>
      )}

      <div className="mt-2">
        <MemoField
          initialValue={item.note ?? ''}
          onChange={(note) => patch({ note: note.trim() || undefined })}
        />
      </div>
    </li>
  )
}

/** 입력 버퍼를 로컬에 두는 이유는 NumberField와 같다 */
function MemoField({
  initialValue,
  onChange,
}: {
  initialValue: string
  onChange: (value: string) => void
}) {
  const [value, setValue] = useState(initialValue)
  return (
    <TextField
      value={value}
      placeholder="메모"
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

function RenameTemplateSheet({
  initialName,
  onSave,
  onClose,
}: {
  initialName: string
  onSave: (name: string) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(initialName)
  const [error, setError] = useState<string>()

  async function save() {
    if (!name.trim()) {
      setError('이름을 입력하세요')
      return
    }
    await onSave(name)
    onClose()
  }

  return (
    <Sheet
      title="템플릿 이름 변경"
      onClose={onClose}
      footer={
        <Button variant="primary" className="w-full" onClick={save}>
          저장
        </Button>
      }
    >
      <TextField
        label="이름"
        value={name}
        onChange={(value) => {
          setName(value)
          setError(undefined)
        }}
        autoFocus
        error={error}
      />
    </Sheet>
  )
}
