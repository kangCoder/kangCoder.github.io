import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconButton } from '../../components/Button'
import { TrendChart } from '../components/TrendChart'
import { getCycleReport, getSpendingTrend } from '../db/report'
import { DEFAULT_PAYDAY, getIncomeSetting } from '../db/income'
import { getCurrentCycleKey, getCycleRange, shiftCycle } from '../lib/cycle'
import { formatPercent, formatWon } from '../lib/money'

/** 사이클 리포트 — §5.3 */
export function CycleReportScreen() {
  const navigate = useNavigate()
  const payday = useLiveQuery(
    async () => (await getIncomeSetting())?.payday ?? DEFAULT_PAYDAY,
    [],
    DEFAULT_PAYDAY,
  )
  const [offset, setOffset] = useState(0)
  const cycleKey = shiftCycle(getCurrentCycleKey(payday), offset)
  const report = useLiveQuery(() => getCycleReport(cycleKey), [cycleKey])
  const trend = useLiveQuery(() => getSpendingTrend(cycleKey, 6), [cycleKey])
  const range = getCycleRange(cycleKey, payday)

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 bg-zinc-100/90 px-2 pt-2 pb-2 backdrop-blur">
        <div className="flex items-center gap-1">
          <IconButton onClick={() => navigate('/finance')} aria-label="뒤로">
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
          <h1 className="flex-1 text-[17px] font-semibold text-zinc-900">
            사이클 리포트
          </h1>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <IconButton aria-label="이전" onClick={() => setOffset(offset - 1)}>
            <Chevron direction="left" />
          </IconButton>
          <p className="text-[15px] font-medium tabular-nums text-zinc-900">
            {range.start} ~ {range.end.slice(5)}
          </p>
          <IconButton aria-label="다음" onClick={() => setOffset(offset + 1)}>
            <Chevron direction="right" />
          </IconButton>
        </div>
      </header>

      {trend !== undefined && trend.some((p) => p.expense > 0 || p.saving > 0) && (
        <section className="px-4 pt-1 pb-3">
          <h2 className="mb-2 text-[13px] font-medium text-zinc-500">
            최근 6사이클 추이
          </h2>
          <div className="rounded-xl bg-white p-3 pr-4 ring-1 ring-zinc-200">
            <TrendChart points={trend} />
          </div>
        </section>
      )}

      {report === undefined ? null : report.rows.length === 0 ? (
        <p className="mx-4 rounded-xl bg-white px-3 py-8 text-center text-[13px] text-zinc-400 ring-1 ring-zinc-200">
          이 사이클에는 지출이 없습니다
        </p>
      ) : (
        <>
          <section className="px-4 pt-1 pb-3">
            <div className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] text-zinc-500">총 지출</span>
                <span className="text-[20px] font-semibold tabular-nums text-zinc-900">
                  {formatWon(report.totalSpent)}
                </span>
              </div>
              <div className="mt-1 flex items-baseline justify-between text-[12px] tabular-nums">
                <span className="text-zinc-400">
                  예산 {formatWon(report.totalBudget)}
                </span>
                {report.previousSpent > 0 && (
                  <span
                    className={
                      report.totalSpent > report.previousSpent
                        ? 'text-red-500'
                        : 'text-emerald-600'
                    }
                  >
                    전 사이클 {formatWon(report.previousSpent)} (
                    {report.totalSpent >= report.previousSpent ? '+' : '-'}
                    {formatWon(
                      Math.abs(report.totalSpent - report.previousSpent),
                    )}
                    )
                  </span>
                )}
              </div>
            </div>
          </section>

          <section className="px-4 pb-4">
            <h2 className="mb-2 text-[13px] font-medium text-zinc-500">
              고정비 vs 변동비
            </h2>
            <div className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
              <div className="flex h-3 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="bg-zinc-900"
                  style={{ width: `${ratio(report.fixedSpent, report.totalSpent)}%` }}
                />
                <div
                  className="bg-zinc-400"
                  style={{
                    width: `${ratio(report.variableSpent, report.totalSpent)}%`,
                  }}
                />
              </div>
              <div className="mt-2 flex justify-between text-[12px] tabular-nums">
                <span className="text-zinc-700">
                  고정 {formatWon(report.fixedSpent)} (
                  {formatPercent(
                    report.totalSpent > 0
                      ? report.fixedSpent / report.totalSpent
                      : 0,
                    0,
                  )}
                  )
                </span>
                <span className="text-zinc-500">
                  변동 {formatWon(report.variableSpent)}
                </span>
              </div>
            </div>
          </section>

          {report.top.length > 0 && (
            <section className="px-4 pb-4">
              <h2 className="mb-2 text-[13px] font-medium text-zinc-500">
                지출 상위 5
              </h2>
              <ol className="flex flex-col gap-1">
                {report.top.map((row, index) => (
                  <li
                    key={row.categoryId}
                    className="flex items-baseline gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-zinc-200"
                  >
                    <span className="w-4 shrink-0 text-[13px] tabular-nums text-zinc-400">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[14px] text-zinc-900">
                      {row.name}
                    </span>
                    <span className="text-[14px] font-semibold tabular-nums text-zinc-900">
                      {formatWon(row.spent)}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="px-4 pb-6">
            <h2 className="mb-2 text-[13px] font-medium text-zinc-500">
              카테고리별 예산 대비
            </h2>
            <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-zinc-200">
              <table className="w-full text-[13px] tabular-nums">
                <thead>
                  <tr className="border-b border-zinc-100 text-[11px] text-zinc-400">
                    <th className="px-3 py-2 text-left font-medium">항목</th>
                    <th className="px-2 py-2 text-right font-medium">예산</th>
                    <th className="px-2 py-2 text-right font-medium">실제</th>
                    <th className="px-3 py-2 text-right font-medium">차이</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr
                      key={row.categoryId}
                      className="border-b border-zinc-50 last:border-0"
                    >
                      <td className="px-3 py-2">
                        <span className="text-zinc-900">{row.name}</span>
                        <span className="ml-1 text-[11px] text-zinc-400">
                          {row.group}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right text-zinc-500">
                        {row.budget > 0 ? formatWon(row.budget) : '—'}
                      </td>
                      <td className="px-2 py-2 text-right text-zinc-900">
                        {formatWon(row.spent)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-medium ${
                          row.budget === 0
                            ? 'text-zinc-300'
                            : row.diff < 0
                              ? 'text-red-600'
                              : 'text-emerald-600'
                        }`}
                      >
                        {row.budget === 0
                          ? '—'
                          : `${row.diff >= 0 ? '+' : '-'}${formatWon(Math.abs(row.diff))}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-zinc-400">
              차이는 예산 − 실제입니다. 음수(빨강)면 예산을 넘긴 것입니다.
            </p>
          </section>
        </>
      )}
    </div>
  )
}

function ratio(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0
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
