import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { ArrowIcon } from '../../components/ArrowIcon'
import { Button, IconButton } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { EmptyState } from '../../components/EmptyState'
import { Sheet } from '../../components/Sheet'
import { Label, TextField } from '../../components/fields'
import { AmountField } from '../components/AmountField'
import {
  countCategoryUsages,
  createCategory,
  deleteCategoryCascade,
  listGrouped,
  moveCategory,
  updateCategory,
} from '../db/categories'
import {
  countGroupCategories,
  createGroup,
  deleteGroup,
  listGroups,
  moveGroup,
  renameGroup,
} from '../db/groups'
import type { Category, Group, TxType } from '../db/types'
import { formatWon } from '../lib/money'

const TYPE_LABEL: Record<TxType, string> = {
  EXPENSE: '지출',
  SAVING: '저축/투자',
  TRANSFER: '원금상환',
  INCOME: '수입',
}

const TYPE_HINT: Record<TxType, string> = {
  EXPENSE: '돈이 사라진다',
  SAVING: '자산으로 남는다',
  TRANSFER: '부채 원금 — 순자산이 는다',
  INCOME: '수입',
}

const TYPES: TxType[] = ['EXPENSE', 'SAVING', 'TRANSFER', 'INCOME']

/** 카테고리·그룹 관리 — 그룹 아래에 카테고리가 붙는다 */
export function CategoryManageScreen() {
  const grouped = useLiveQuery(() => listGrouped(false), [])
  const groups = useLiveQuery(() => listGroups(), [])
  const [editing, setEditing] = useState<Category>()
  const [adding, setAdding] = useState<string>()
  const [editingGroup, setEditingGroup] = useState<Group>()
  const [addingGroup, setAddingGroup] = useState(false)

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 bg-zinc-100/90 px-4 pt-3 pb-2 backdrop-blur">
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-bold text-zinc-900">카테고리</h1>
          <Button onClick={() => setAddingGroup(true)}>+ 그룹</Button>
        </div>
      </header>

      {grouped === undefined ? null : grouped.length === 0 ? (
        <EmptyState
          title="그룹이 없습니다"
          hint="'주거', '식비'처럼 묶음을 먼저 만드세요."
          action={
            <Button variant="primary" onClick={() => setAddingGroup(true)}>
              그룹 만들기
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3 px-4 pb-4">
          {grouped.map((entry, groupIndex) => (
            <section key={entry.group.id}>
              <div className="mb-1 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditingGroup(entry.group)}
                  className="min-w-0 flex-1 text-left text-[13px] font-semibold text-zinc-500"
                >
                  {entry.group.name}
                  <span className="ml-1.5 font-normal text-zinc-400">
                    {entry.categories.length}
                  </span>
                </button>
                <IconButton
                  aria-label="그룹 위로"
                  disabled={groupIndex === 0}
                  onClick={() => moveGroup(entry.group.id, 'up')}
                >
                  <ArrowIcon direction="up" />
                </IconButton>
                <IconButton
                  aria-label="그룹 아래로"
                  disabled={groupIndex === grouped.length - 1}
                  onClick={() => moveGroup(entry.group.id, 'down')}
                >
                  <ArrowIcon direction="down" />
                </IconButton>
                <IconButton
                  aria-label="카테고리 추가"
                  onClick={() => setAdding(entry.group.id)}
                >
                  <span className="text-[20px] leading-none">+</span>
                </IconButton>
              </div>

              {entry.categories.length === 0 ? (
                <p className="rounded-xl bg-white px-3 py-3 text-[13px] text-zinc-400 ring-1 ring-zinc-200">
                  비어 있음
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {entry.categories.map((category, index) => (
                    <li
                      key={category.id}
                      className="flex items-center gap-1 rounded-xl bg-white pr-1 ring-1 ring-zinc-200"
                    >
                      <button
                        type="button"
                        onClick={() => setEditing(category)}
                        className="min-w-0 flex-1 py-2.5 pl-3 text-left"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[15px] font-medium text-zinc-900">
                            {category.name}
                          </span>
                          <TypeBadge type={category.type} />
                          {category.isFixed && (
                            <span className="shrink-0 text-[11px] text-zinc-400">
                              고정
                            </span>
                          )}
                        </div>
                        <span className="text-[12px] tabular-nums text-zinc-500">
                          예산 {formatWon(category.budget)}
                        </span>
                      </button>
                      <IconButton
                        aria-label="위로"
                        disabled={index === 0}
                        onClick={() => moveCategory(category.id, 'up')}
                      >
                        <ArrowIcon direction="up" />
                      </IconButton>
                      <IconButton
                        aria-label="아래로"
                        disabled={index === entry.categories.length - 1}
                        onClick={() => moveCategory(category.id, 'down')}
                      >
                        <ArrowIcon direction="down" />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {(editing || adding) && groups && (
        <CategorySheet
          category={editing}
          groupId={adding ?? editing?.groupId ?? groups[0]?.id ?? ''}
          groups={groups}
          onClose={() => {
            setEditing(undefined)
            setAdding(undefined)
          }}
        />
      )}

      {(editingGroup || addingGroup) && (
        <GroupSheet
          group={editingGroup}
          onClose={() => {
            setEditingGroup(undefined)
            setAddingGroup(false)
          }}
        />
      )}
    </div>
  )
}

function CategorySheet({
  category,
  groupId,
  groups,
  onClose,
}: {
  category?: Category
  groupId: string
  groups: Group[]
  onClose: () => void
}) {
  const [name, setName] = useState(category?.name ?? '')
  const [type, setType] = useState<TxType>(category?.type ?? 'EXPENSE')
  const [budget, setBudget] = useState<number | undefined>(category?.budget ?? 0)
  const [selectedGroup, setSelectedGroup] = useState(category?.groupId ?? groupId)
  const [isFixed, setIsFixed] = useState(category?.isFixed ?? false)
  const [error, setError] = useState<string>()
  const [pendingDelete, setPendingDelete] = useState<number>()

  async function save() {
    if (!name.trim()) {
      setError('이름을 입력하세요')
      return
    }
    const input = {
      name: name.trim(),
      groupId: selectedGroup,
      type,
      budget: budget ?? 0,
      isFixed,
    }
    if (category) await updateCategory(category.id, input)
    else await createCategory(input)
    onClose()
  }

  async function askDelete() {
    if (!category) return
    setPendingDelete(await countCategoryUsages(category.id))
  }

  async function confirmDelete() {
    if (!category) return
    await deleteCategoryCascade(category.id)
    onClose()
  }

  return (
    <>
      <Sheet
        title={category ? '카테고리 편집' : '카테고리 추가'}
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
            placeholder="예: 유류비"
            autoFocus={!category}
            error={error}
          />

          <div>
            <Label>그룹</Label>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="min-h-11 w-full rounded-xl bg-white px-3 text-[16px] text-zinc-900 ring-1 ring-zinc-300 outline-none focus:ring-2 focus:ring-zinc-900"
            >
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label hint="집계 방식이 달라진다">유형</Label>
            <div className="flex flex-col gap-1.5">
              {TYPES.map((option) => (
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
                  <span className="w-20 shrink-0 text-[15px] font-medium">
                    {TYPE_LABEL[option]}
                  </span>
                  <span
                    className={`text-[12px] ${type === option ? 'text-zinc-300' : 'text-zinc-500'}`}
                  >
                    {TYPE_HINT[option]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <AmountField label="월 예산" value={budget} onChange={setBudget} />

          <label className="flex min-h-11 items-center gap-2 text-[14px] text-zinc-700">
            <input
              type="checkbox"
              className="size-4 accent-zinc-900"
              checked={isFixed}
              onChange={(e) => setIsFixed(e.target.checked)}
            />
            고정비
          </label>

          {category && (
            <div className="mt-2 border-t border-zinc-200 pt-4">
              <Button variant="danger" className="w-full" onClick={askDelete}>
                삭제
              </Button>
            </div>
          )}
        </div>
      </Sheet>

      {pendingDelete !== undefined && category && (
        <ConfirmDialog
          title={`'${category.name}'을 삭제할까요?`}
          description={
            <>
              {pendingDelete > 0 && (
                <p>
                  이 카테고리를 쓰는 거래 {pendingDelete}건은 '미분류'로
                  옮겨집니다.
                </p>
              )}
              <p>연결된 고정비도 함께 사라집니다.</p>
            </>
          }
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(undefined)}
        />
      )}
    </>
  )
}

function GroupSheet({
  group,
  onClose,
}: {
  group?: Group
  onClose: () => void
}) {
  const [name, setName] = useState(group?.name ?? '')
  const [error, setError] = useState<string>()
  const [blocked, setBlocked] = useState<number>()

  async function save() {
    if (!name.trim()) {
      setError('이름을 입력하세요')
      return
    }
    if (group) await renameGroup(group.id, name)
    else await createGroup(name)
    onClose()
  }

  async function remove() {
    if (!group) return
    const count = await countGroupCategories(group.id)
    // 그룹만 지우면 안의 카테고리가 갈 곳을 잃는다
    if (count > 0) {
      setBlocked(count)
      return
    }
    await deleteGroup(group.id)
    onClose()
  }

  return (
    <Sheet
      title={group ? '그룹 편집' : '그룹 추가'}
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
            setBlocked(undefined)
          }}
          placeholder="예: 주거"
          autoFocus
          error={error}
        />
        {group && (
          <div className="border-t border-zinc-200 pt-4">
            <Button variant="danger" className="w-full" onClick={remove}>
              그룹 삭제
            </Button>
            {blocked !== undefined && (
              <p className="mt-2 text-[13px] text-red-600">
                카테고리 {blocked}개가 남아 있습니다. 먼저 옮기거나 지우세요.
              </p>
            )}
          </div>
        )}
      </div>
    </Sheet>
  )
}

const TYPE_CLASS: Record<TxType, string> = {
  EXPENSE: 'bg-zinc-100 text-zinc-600',
  SAVING: 'bg-emerald-100 text-emerald-700',
  TRANSFER: 'bg-sky-100 text-sky-700',
  INCOME: 'bg-amber-100 text-amber-700',
}

function TypeBadge({ type }: { type: TxType }) {
  return (
    <span
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${TYPE_CLASS[type]}`}
    >
      {TYPE_LABEL[type]}
    </span>
  )
}
