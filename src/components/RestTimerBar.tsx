import { formatDuration } from '../lib/duration'
import { Button, IconButton } from './Button'

/**
 * 휴식 타이머 — §6.2
 * 세트 사이에 폰을 보며 쉬는 자세 그대로 한 손으로 닿는 위치에 둔다.
 */
export function RestTimerBar({
  label,
  remainingMs,
  totalMs,
  onExtend,
  onDismiss,
}: {
  label: string
  remainingMs: number
  totalMs: number
  onExtend: (seconds: number) => void
  onDismiss: () => void
}) {
  const done = remainingMs <= 0
  const progress = totalMs > 0 ? Math.min(1, remainingMs / totalMs) : 0

  return (
    <div className="fixed inset-x-0 bottom-[calc(var(--spacing-tabbar)+env(safe-area-inset-bottom))] z-30 mx-auto w-full max-w-md px-3 pb-2">
      <div
        className={`overflow-hidden rounded-2xl shadow-lg ring-1 ${
          done ? 'bg-zinc-900 ring-zinc-900' : 'bg-white ring-zinc-200'
        }`}
      >
        {/* 남은 비율을 막대로 — 숫자를 읽지 않아도 대충 감이 온다 */}
        <div className="h-1 bg-zinc-200">
          <div
            className={`h-full transition-[width] duration-200 ease-linear ${
              done ? 'bg-zinc-900' : 'bg-zinc-900'
            }`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        <div className="flex items-center gap-2 p-2 pl-3">
          <div className="min-w-0 flex-1">
            <p
              className={`truncate text-[12px] ${done ? 'text-zinc-400' : 'text-zinc-500'}`}
            >
              {done ? '휴식 완료' : `휴식 · ${label}`}
            </p>
            <p
              className={`text-[26px] leading-tight font-semibold tabular-nums ${
                done ? 'text-white' : 'text-zinc-900'
              }`}
            >
              {formatDuration(remainingMs)}
            </p>
          </div>

          {!done && (
            <Button onClick={() => onExtend(30)} className="shrink-0">
              +30초
            </Button>
          )}
          <IconButton
            aria-label={done ? '닫기' : '휴식 건너뛰기'}
            className={done ? 'text-zinc-400' : undefined}
            onClick={onDismiss}
          >
            <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
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
      </div>
    </div>
  )
}
