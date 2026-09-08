import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { ExerciseTypeBadge } from '../components/ExerciseTypeBadge'
import { listExercises } from '../db/exercises'
import type { Exercise } from '../db/types'
import { ExerciseFormSheet } from './ExerciseFormSheet'

type FormState = { mode: 'create' } | { mode: 'edit'; exercise: Exercise }

export function ExerciseListScreen() {
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [form, setForm] = useState<FormState>()

  const exercises = useLiveQuery(
    () => listExercises(showArchived),
    [showArchived],
  )

  // 종목 15~20개 규모라 필터는 메모리에서 한다 — 부분 일치가 인덱스 검색보다 쓸모 있다
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return exercises ?? []
    return (exercises ?? []).filter((e) =>
      e.name.toLowerCase().includes(needle),
    )
  }, [exercises, query])

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 bg-zinc-100/90 px-4 pt-2 pb-2 backdrop-blur">
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-bold text-zinc-900">종목</h1>
          <Button variant="primary" onClick={() => setForm({ mode: 'create' })}>
            + 추가
          </Button>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="종목 검색"
          className="mt-2 min-h-11 w-full rounded-xl bg-white px-3 text-[16px] ring-1 ring-zinc-300 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-900"
        />
        <label className="mt-2 flex min-h-9 items-center gap-2 text-[13px] text-zinc-500">
          <input
            type="checkbox"
            className="size-4 accent-zinc-900"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          아카이브 포함
        </label>
      </header>

      {exercises === undefined ? null : filtered.length === 0 ? (
        <EmptyState
          title={query ? '검색 결과가 없습니다' : '아직 종목이 없습니다'}
          hint={
            query ? undefined : '실제로 하는 종목부터 하나씩 추가해 보세요.'
          }
          action={
            query ? undefined : (
              <Button
                variant="primary"
                onClick={() => setForm({ mode: 'create' })}
              >
                첫 종목 추가
              </Button>
            )
          }
        />
      ) : (
        <ul className="flex flex-col gap-1.5 px-4 pt-1 pb-4">
          {filtered.map((exercise) => (
            <li key={exercise.id}>
              <button
                type="button"
                onClick={() => setForm({ mode: 'edit', exercise })}
                className={`flex min-h-14 w-full items-center gap-2 rounded-xl bg-white px-3 py-2 text-left ring-1 ring-zinc-200 transition-colors active:bg-zinc-50 ${
                  exercise.isArchived ? 'opacity-50' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[15px] font-medium text-zinc-900">
                      {exercise.name}
                    </span>
                    <ExerciseTypeBadge type={exercise.type} />
                    {exercise.isArchived && (
                      <span className="shrink-0 text-[11px] text-zinc-400">
                        보관됨
                      </span>
                    )}
                  </div>
                  {exercise.note && (
                    <p className="mt-0.5 truncate text-[12px] text-zinc-500">
                      {exercise.note}
                    </p>
                  )}
                </div>
                <svg
                  viewBox="0 0 20 20"
                  className="size-4 shrink-0 text-zinc-300"
                  aria-hidden="true"
                >
                  <path
                    d="M7 4l6 6-6 6"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {form && (
        <ExerciseFormSheet
          exercise={form.mode === 'edit' ? form.exercise : undefined}
          onClose={() => setForm(undefined)}
        />
      )}
    </div>
  )
}
