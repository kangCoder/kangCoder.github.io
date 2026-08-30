import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { ExerciseTypeBadge } from '../components/ExerciseTypeBadge'
import { Sheet } from '../components/Sheet'
import { listExercises } from '../db/exercises'
import type { Exercise } from '../db/types'

/**
 * 템플릿에 넣을 종목 고르기.
 * 한 번 열어 여러 개를 연속으로 담을 수 있게 시트를 닫지 않는다 —
 * 템플릿 하나에 보통 5~7종목이 들어가므로 매번 다시 여는 건 낭비다.
 * 아카이브된 종목은 목록에 넣지 않는다.
 */
export function ExercisePickerSheet({
  onPick,
  onClose,
}: {
  onPick: (exercise: Exercise) => Promise<void>
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [addedCount, setAddedCount] = useState(0)
  const exercises = useLiveQuery(() => listExercises(false), [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return exercises ?? []
    return (exercises ?? []).filter((e) =>
      e.name.toLowerCase().includes(needle),
    )
  }, [exercises, query])

  async function pick(exercise: Exercise) {
    await onPick(exercise)
    setAddedCount((count) => count + 1)
  }

  return (
    <Sheet
      title="종목 추가"
      onClose={onClose}
      footer={
        <Button variant="primary" className="w-full" onClick={onClose}>
          {addedCount > 0 ? `완료 (${addedCount}개 추가됨)` : '완료'}
        </Button>
      }
    >
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="종목 검색"
        className="mb-3 min-h-11 w-full rounded-xl bg-white px-3 text-[16px] ring-1 ring-zinc-300 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-900"
      />

      {filtered.length === 0 ? (
        <EmptyState
          title={
            query ? '검색 결과가 없습니다' : '추가할 수 있는 종목이 없습니다'
          }
          hint={query ? undefined : '종목 탭에서 먼저 종목을 만들어 주세요.'}
        />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {filtered.map((exercise) => (
            <li key={exercise.id}>
              <button
                type="button"
                onClick={() => pick(exercise)}
                className="flex min-h-12 w-full items-center gap-2 rounded-xl bg-white px-3 py-2 text-left ring-1 ring-zinc-200 active:bg-zinc-100"
              >
                <span className="min-w-0 flex-1 truncate text-[15px] text-zinc-900">
                  {exercise.name}
                </span>
                <ExerciseTypeBadge type={exercise.type} />
                <span className="shrink-0 text-[18px] leading-none text-zinc-400">
                  +
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}
