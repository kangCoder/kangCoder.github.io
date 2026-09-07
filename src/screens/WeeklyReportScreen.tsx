import { addWeeks, format, isSameWeek } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, IconButton } from '../components/Button'
import { collectWeeklyReport, weekRangeOf } from '../db/weeklyReport'
import { renderWeeklyReport } from '../lib/weeklyReport'

type CopyState = 'idle' | 'copied' | 'failed'

/**
 * 주간 리포트 — §8. 부가 기능이 아니라 이 앱의 존재 이유다.
 *
 * 마크다운을 그대로 미리보기로 보여주고 클립보드에 복사한다.
 * 렌더링해서 예쁘게 보여주면 실제로 붙여 넣을 텍스트와 달라져,
 * 형식이 뭉개졌는지 확인할 방법이 없어진다.
 */
export function WeeklyReportScreen() {
  const navigate = useNavigate()
  const [anchor, setAnchor] = useState(() => new Date())
  const [copyState, setCopyState] = useState<CopyState>('idle')

  const data = useLiveQuery(() => collectWeeklyReport(anchor), [anchor])
  const markdown = data ? renderWeeklyReport(data) : ''
  const range = weekRangeOf(anchor)
  const isThisWeek = isSameWeek(anchor, new Date(), { weekStartsOn: 1 })

  function goWeek(offset: number) {
    setAnchor((current) => addWeeks(current, offset))
    setCopyState('idle')
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown)
      setCopyState('copied')
    } catch {
      // 보안 컨텍스트가 아니거나 권한이 없으면 실패한다
      setCopyState('failed')
    }
  }

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 bg-zinc-100/90 px-2 pt-2 pb-2 backdrop-blur">
        <div className="flex items-center gap-1">
          <IconButton onClick={() => navigate('/')} aria-label="뒤로">
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
            주간 리포트
          </h1>
          {!isThisWeek && (
            <Button onClick={() => setAnchor(new Date())}>이번 주</Button>
          )}
        </div>

        <div className="mt-1 flex items-center justify-between px-1">
          <IconButton aria-label="이전 주" onClick={() => goWeek(-1)}>
            <Chevron direction="left" />
          </IconButton>
          <span className="text-[15px] font-medium tabular-nums text-zinc-900">
            {format(range.from, 'M/d', { locale: ko })} ~{' '}
            {format(range.to, 'M/d', { locale: ko })}
          </span>
          <IconButton aria-label="다음 주" onClick={() => goWeek(1)}>
            <Chevron direction="right" />
          </IconButton>
        </div>
      </header>

      <section className="px-4 pt-1 pb-4">
        <Button
          variant="primary"
          className="w-full"
          disabled={!data}
          onClick={copy}
        >
          {copyState === 'copied'
            ? '복사됨 ✓'
            : copyState === 'failed'
              ? '복사 실패 — 길게 눌러 직접 선택하세요'
              : '마크다운 복사'}
        </Button>

        {data && data.sessions.length === 0 && (
          <p className="mt-3 rounded-xl bg-white px-3 py-6 text-center text-[13px] text-zinc-400 ring-1 ring-zinc-200">
            이 주에 완료한 세션이 없습니다
          </p>
        )}

        {/* 붙여 넣을 텍스트 그대로 보여준다 */}
        <pre className="mt-3 overflow-x-auto rounded-xl bg-white p-3 text-[12px] leading-relaxed whitespace-pre text-zinc-800 ring-1 ring-zinc-200">
          {markdown}
        </pre>
      </section>
    </div>
  )
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M12 4l-6 6 6 6' : 'M8 4l6 6-6 6'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
