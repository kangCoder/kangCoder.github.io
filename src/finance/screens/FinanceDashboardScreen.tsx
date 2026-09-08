import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { IconButton } from '../../components/Button'
import { getCycleSummary, type GroupSpending } from '../db/dashboard'
import { DEFAULT_PAYDAY, getIncomeSetting } from '../db/income'
import {
  getCurrentCycleKey,
  getCycleRange,
  remainingDaysInCycle,
  shiftCycle,
  totalDaysInCycle,
} from '../lib/cycle'
import { formatPercent, formatWon } from '../lib/money'

/** 대시보드 — §5.1. 현재 급여 사이클 기준. */
export function FinanceDashboardScreen() {
  const payday = useLiveQuery(
    async () => (await getIncomeSetting())?.payday ?? DEFAULT_PAYDAY,
    [],
    DEFAULT_PAYDAY,
  )
  const [offset, setOffset] = useState(0)
  const [expanded, setExpanded] = useState<string>()
  const cycleKey = shiftCycle(getCurrentCycleKey(payday), offset)

  const summary = useLiveQuery(() => getCycleSummary(cycleKey), [cycleKey])

  const range = getCycleRange(cycleKey, payday)
  const remaining =
    offset === 0
      ? remainingDaysInCycle(cycleKey, payday)
      : totalDaysInCycle(cycleKey, payday)
  const remainingBudget = summary
    ? summary.expenseBudget - summary.spent
    : 0
  const perDay = remaining > 0 ? Math.floor(remainingBudget / remaining) : 0

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 bg-zinc-100/90 px-4 pt-2 pb-2 backdrop-blur">
        <h1 className="text-[22px] font-bold text-zinc-900">가계부</h1>
        <div className="mt-1 flex items-center justify-between">
          <IconButton aria-label="이전 사이클" onClick={() => setOffset(offset - 1)}>
            <Chevron direction="left" />
          </IconButton>
          <div className="text-center">
            <p className="text-[15px] font-medium tabular-nums text-zinc-900">
              {range.start} ~ {range.end.slice(5)}
            </p>
            <p className="text-[12px] text-zinc-500">
              {offset === 0 ? `${remaining}일 남음` : `${cycleKey} 사이클`}
            </p>
          </div>
          <IconButton aria-label="다음 사이클" onClick={() => setOffset(offset + 1)}>
            <Chevron direction="right" />
          </IconButton>
        </div>
      </header>

      {summary === undefined ? null : (
        <>
          <section className="grid grid-cols-2 gap-2 px-4 pt-1 pb-3">
            <Card
              label="이번 사이클 지출"
              value={formatWon(summary.spent)}
              sub={
                summary.previousSpent > 0
                  ? `전 사이클 대비 ${deltaLabel(summary.spent - summary.previousSpent)}`
                  : `예산 ${formatWon(summary.expenseBudget)}`
              }
              progress={
                summary.expenseBudget > 0
                  ? summary.spent / summary.expenseBudget
                  : 0
              }
            />
            <Card
              label="남은 예산"
              value={formatWon(remainingBudget)}
              sub={remaining > 0 ? `하루 ${formatWon(perDay)}` : '사이클 종료'}
              danger={remainingBudget < 0}
            />
            <Card
              label="이번 사이클 저축"
              value={formatWon(summary.savingsRate.saving)}
              sub={`원천 ${formatWon(summary.savingsRate.withheldTransfer)} 별도`}
            />
            {/* 두 값을 병기한다 — 하나만 쓰면 분자·분모가 어긋난다(§2.3) */}
            <Card
              label="저축률 (실수령)"
              value={formatPercent(summary.savingsRate.rateNet)}
              sub={`총소득 ${formatPercent(summary.savingsRate.rateGross)}`}
            />
          </section>

          <section className="px-4 pb-4">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-[13px] font-medium text-zinc-500">
                그룹별 예산
              </h2>
              <Link
                to="/finance/report"
                className="text-[13px] font-medium text-zinc-900 underline underline-offset-2"
              >
                사이클 리포트
              </Link>
            </div>
            {summary.byGroup.length === 0 ? (
              <p className="rounded-xl bg-white px-3 py-6 text-center text-[13px] text-zinc-400 ring-1 ring-zinc-200">
                아직 지출이 없습니다
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {summary.byGroup.map((entry) => (
                  <GroupRow
                    key={entry.groupId}
                    entry={entry}
                    expanded={expanded === entry.groupId}
                    onToggle={() =>
                      setExpanded(
                        expanded === entry.groupId ? undefined : entry.groupId,
                      )
                    }
                  />
                ))}
              </ul>
            )}
          </section>

          {summary.goalTarget !== undefined && (
            <section className="px-4 pb-4">
              <h2 className="mb-2 text-[13px] font-medium text-zinc-500">
                목표
              </h2>
              <Link
                to="/finance/goal"
                className="block rounded-xl bg-white p-3 ring-1 ring-zinc-200 active:bg-zinc-50"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-[14px] font-medium text-zinc-900">
                    {summary.goalName}
                  </span>
                  <span className="text-[13px] tabular-nums text-zinc-500">
                    {formatPercent(
                      Math.max(0, summary.netWorth) / summary.goalTarget,
                      0,
                    )}{' '}
                    →
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] tabular-nums text-zinc-500">
                  순자산 {formatWon(summary.netWorth)} / 목표{' '}
                  {formatWon(summary.goalTarget)}
                </p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full bg-zinc-900"
                    style={{
                      width: `${Math.min(100, Math.max(0, (summary.netWorth / summary.goalTarget) * 100))}%`,
                    }}
                  />
                </div>
              </Link>
            </section>
          )}
        </>
      )}
    </div>
  )
}

/** +12,000 / -3,400 — 지출은 늘면 나쁘므로 색을 뒤집는다 */
function deltaLabel(delta: number): string {
  if (delta === 0) return '변화 없음'
  return `${delta > 0 ? '+' : '-'}${formatWon(Math.abs(delta))}`
}

function GroupRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: GroupSpending
  expanded: boolean
  onToggle: () => void
}) {
  const over = entry.budget > 0 && entry.spent > entry.budget
  const ratio = entry.budget > 0 ? Math.min(1, entry.spent / entry.budget) : 0

  return (
    <li className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
      <button type="button" onClick={onToggle} className="w-full text-left">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[14px] font-medium text-zinc-900">
            {entry.group}
            <span className="ml-1 text-[11px] text-zinc-400">
              {expanded ? '▲' : '▼'}
            </span>
          </span>
          <span
            className={`text-[13px] tabular-nums ${over ? 'font-semibold text-red-600' : 'text-zinc-500'}`}
          >
            {formatWon(entry.spent)}
            {entry.budget > 0 && ` / ${formatWon(entry.budget)}`}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
          <div
            className={`h-full ${over ? 'bg-red-500' : 'bg-zinc-900'}`}
            style={{ width: `${(over ? 1 : ratio) * 100}%` }}
          />
        </div>
        {entry.delta !== 0 && (
          <p
            className={`mt-1 text-[11px] tabular-nums ${entry.delta > 0 ? 'text-red-500' : 'text-emerald-600'}`}
          >
            지난 사이클보다 {formatWon(Math.abs(entry.delta))}원{' '}
            {entry.delta > 0 ? '더 씀' : '덜 씀'}
          </p>
        )}
      </button>

      {expanded && (
        <ul className="mt-2 flex flex-col gap-1 border-t border-zinc-100 pt-2">
          {entry.categories.map((row) => (
            <li key={row.categoryId} className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-600">
                {row.name}
              </span>
              {row.delta !== 0 && (
                <span
                  className={`shrink-0 text-[11px] tabular-nums ${row.delta > 0 ? 'text-red-500' : 'text-emerald-600'}`}
                >
                  {deltaLabel(row.delta)}
                </span>
              )}
              <span className="shrink-0 text-[13px] tabular-nums text-zinc-900">
                {formatWon(row.spent)}
                {row.budget > 0 && (
                  <span className="text-zinc-400">
                    {' '}
                    / {formatWon(row.budget)}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function Card({
  label,
  value,
  sub,
  progress,
  danger,
}: {
  label: string
  value: string
  sub?: string
  progress?: number
  danger?: boolean
}) {
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
      <p className="text-[12px] text-zinc-500">{label}</p>
      <p
        className={`mt-0.5 text-[19px] leading-tight font-semibold tabular-nums ${danger ? 'text-red-600' : 'text-zinc-900'}`}
      >
        {value}
      </p>
      {sub && <p className="text-[11px] tabular-nums text-zinc-400">{sub}</p>}
      {progress !== undefined && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-zinc-100">
          <div
            className={`h-full ${progress > 1 ? 'bg-red-500' : 'bg-zinc-900'}`}
            style={{ width: `${Math.min(100, progress * 100)}%` }}
          />
        </div>
      )}
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
