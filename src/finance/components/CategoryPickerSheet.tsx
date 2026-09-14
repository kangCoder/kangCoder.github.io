import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { Sheet } from '../../components/Sheet'
import { listGrouped } from '../db/categories'
import type { Category } from '../db/types'
import { TYPE_CLASS, TYPE_LABEL } from './categoryTypeMeta'

/**
 * 카테고리 선택 — 그룹별로 묶어 보여준다.
 *
 * 예전에는 사용 빈도순 상위 12개를 칩으로 늘어놓았다. 카테고리가 30개를 넘자
 * **새로 만든 카테고리가 아예 보이지 않는** 문제가 생겼다. 사용 빈도가 0이라
 * 뒤로 밀려 잘려 나갔기 때문이다.
 *
 * 그룹 섹션 + 검색이면 개수가 늘어도 찾는 경로가 일정하다.
 */
export function CategoryPickerSheet({
  selectedId,
  onSelect,
  onClose,
}: {
  selectedId: string | undefined
  onSelect: (category: Category) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const grouped = useLiveQuery(() => listGrouped(false), [])

  const sections = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (grouped ?? [])
      .map((entry) => ({
        ...entry,
        categories: needle
          ? entry.categories.filter((category) =>
              category.name.toLowerCase().includes(needle),
            )
          : entry.categories,
      }))
      .filter((entry) => entry.categories.length > 0)
  }, [grouped, query])

  return (
    <Sheet title="카테고리 선택" onClose={onClose}>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="카테고리 검색"
        className="mb-3 min-h-11 w-full rounded-xl bg-white px-3 text-[16px] ring-1 ring-zinc-300 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-900"
      />

      {grouped === undefined ? null : sections.length === 0 ? (
        <EmptyState
          title={query ? '검색 결과가 없습니다' : '카테고리가 없습니다'}
          hint={query ? undefined : '설정 → 카테고리에서 먼저 만들어 주세요.'}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {sections.map((entry) => (
            <section key={entry.group.id}>
              <h3 className="mb-1 text-[12px] font-semibold text-zinc-500">
                {entry.group.name}
              </h3>
              <ul className="flex flex-col gap-1">
                {entry.categories.map((category) => (
                  <li key={category.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(category)
                        onClose()
                      }}
                      className={`flex min-h-12 w-full items-center gap-2 rounded-xl px-3 py-2 text-left ring-1 transition-colors ${
                        category.id === selectedId
                          ? 'bg-zinc-900 text-white ring-zinc-900'
                          : 'bg-white ring-zinc-200 active:bg-zinc-100'
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate text-[15px]">
                        {category.name}
                      </span>
                      <span
                        className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                          category.id === selectedId
                            ? 'bg-white/20 text-white'
                            : TYPE_CLASS[category.type]
                        }`}
                      >
                        {TYPE_LABEL[category.type]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Sheet>
  )
}
