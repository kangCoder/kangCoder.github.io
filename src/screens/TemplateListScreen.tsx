import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowIcon } from '../components/ArrowIcon'
import { Button, IconButton } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { TextField } from '../components/fields'
import { Sheet } from '../components/Sheet'
import {
  createTemplate,
  listTemplateSummaries,
  moveTemplate,
} from '../db/templates'

export function TemplateListScreen() {
  const [showArchived, setShowArchived] = useState(false)
  const [adding, setAdding] = useState(false)

  const templates = useLiveQuery(
    () => listTemplateSummaries(showArchived),
    [showArchived],
  )

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 bg-zinc-100/90 px-4 pt-2 pb-2 backdrop-blur">
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-bold text-zinc-900">템플릿</h1>
          <Button variant="primary" onClick={() => setAdding(true)}>
            + 추가
          </Button>
        </div>
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

      {templates === undefined ? null : templates.length === 0 ? (
        <EmptyState
          title="아직 템플릿이 없습니다"
          hint="'Bench Main' 처럼 세션 단위로 만들어 두세요."
          action={
            <Button variant="primary" onClick={() => setAdding(true)}>
              첫 템플릿 만들기
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-1.5 px-4 pt-1 pb-4">
          {templates.map((template, index) => (
            <li
              key={template.id}
              className={`flex items-center gap-1 rounded-xl bg-white pr-1 ring-1 ring-zinc-200 ${
                template.isArchived ? 'opacity-50' : ''
              }`}
            >
              <Link
                to={`/templates/${template.id}`}
                className="flex min-h-14 min-w-0 flex-1 flex-col justify-center px-3 py-2"
              >
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-medium text-zinc-900">
                    {template.name}
                  </span>
                  {template.isArchived && (
                    <span className="shrink-0 text-[11px] text-zinc-400">
                      보관됨
                    </span>
                  )}
                </div>
                <span className="text-[12px] text-zinc-500">
                  종목 {template.itemCount}개
                </span>
              </Link>
              <IconButton
                aria-label="위로"
                disabled={index === 0}
                onClick={() => moveTemplate(template.id, 'up')}
              >
                <ArrowIcon direction="up" />
              </IconButton>
              <IconButton
                aria-label="아래로"
                disabled={index === templates.length - 1}
                onClick={() => moveTemplate(template.id, 'down')}
              >
                <ArrowIcon direction="down" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      {adding && <NewTemplateSheet onClose={() => setAdding(false)} />}
    </div>
  )
}

function NewTemplateSheet({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()

  async function save() {
    if (!name.trim()) {
      setError('이름을 입력하세요')
      return
    }
    await createTemplate(name)
    onClose()
  }

  return (
    <Sheet
      title="템플릿 추가"
      onClose={onClose}
      footer={
        <Button variant="primary" className="w-full" onClick={save}>
          만들기
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
        placeholder="예: Bench Main"
        autoFocus
        error={error}
      />
    </Sheet>
  )
}

