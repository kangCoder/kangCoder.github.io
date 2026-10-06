import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, IconButton } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { AmountField } from '../components/AmountField'
import { TYPE_LABEL } from '../components/categoryTypeMeta'
import { getBudgetPlan, saveBudgetPlan } from '../db/budgetPlan'
import { DEFAULT_PAYDAY, getIncomeSetting } from '../db/income'
import {
  getCurrentCycleKey,
  getCycleRange,
  shiftCycle,
} from '../lib/cycle'
import { formatWon } from '../lib/money'

/**
 * 사이클 예산 설정 — §5.1.3
 *
 * 사이클을 시작하기 전에 카테고리마다 얼마를 쓸지 정한다.
 * 직전 사이클 실적을 나란히 보여주어 숫자를 맨땅에서 짜지 않게 한다.
 *
 * 확정하면 그 사이클 스냅샷과 Category.budget이 함께 갱신된다 —
 * 과거 리포트는 그대로 남고, 다음 달은 이 값에서 출발한다.
 */
export function BudgetPlanScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const payday = useLiveQuery(
    async () => (await getIncomeSetting())?.payday ?? DEFAULT_PAYDAY,
    [],
    DEFAULT_PAYDAY,
  )
  const income = useLiveQuery(() => getIncomeSetting(), [])

  // 기본은 다음 사이클 — 이 화면은 "시작하기 전에" 쓰는 것이다
  const [cycleKey, setCycleKey] = useState(
    () => params.get('cycle') ?? shiftCycle(getCurrentCycleKey(payday), 1),
  )
  const plan = useLiveQuery(
    () => getBudgetPlan(cycleKey, shiftCycle(cycleKey, -1)),
    [cycleKey],
  )
  const [draft, setDraft] = useState<Map<string, number>>(new Map())
  const [touched, setTouched] = useState(false)
  const [saved, setSaved] = useState(false)

  // plan이 흐를 때만 바뀌는 값이라 메모해 둔다 — 아래 useMemo가 매 렌더
  // 다시 돌지 않게 한다
  const rows = useMemo(() => plan?.rows ?? [], [plan])
  const amountOf = useCallback(
    (categoryId: string, fallback: number) => draft.get(categoryId) ?? fallback,
    [draft],
  )

  const totals = useMemo(() => {
    let expense = 0
    let saving = 0
    for (const row of rows) {
      const amount = amountOf(row.categoryId, row.amount)
      if (row.type === 'EXPENSE') expense += amount
      else saving += amount
    }
    return { expense, saving, all: expense + saving }
  }, [rows, amountOf])

  const netPay = income?.netPay ?? 0
  const leftover = netPay - totals.all
  const range = getCycleRange(cycleKey, payday)

  // 그룹 순서는 쿼리가 이미 맞춰 두었으므로 이름이 바뀌는 지점에서만 끊는다
  const sections = useMemo(() => {
    const result: { group: string; rows: typeof rows }[] = []
    for (const row of rows) {
      const last = result.at(-1)
      if (last?.group === row.groupName) last.rows.push(row)
      else result.push({ group: row.groupName, rows: [row] })
    }
    return result
  }, [rows])

  function shift(offset: number) {
    setCycleKey((current) => shiftCycle(current, offset))
    setDraft(new Map())
    setTouched(false)
    setSaved(false)
  }

  async function confirm() {
    await saveBudgetPlan(
      cycleKey,
      rows.map((row) => ({
        categoryId: row.categoryId,
        amount: amountOf(row.categoryId, row.amount),
        type: row.type,
      })),
    )
    setSaved(true)
    setTouched(false)
  }

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
            예산 설정
          </h1>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <IconButton aria-label="이전 사이클" onClick={() => shift(-1)}>
            <Chevron direction="left" />
          </IconButton>
          <div className="text-center">
            <p className="text-[15px] font-medium tabular-nums text-zinc-900">
              {cycleKey}
            </p>
            <p className="text-[11px] tabular-nums text-zinc-500">
              {range.start} ~ {range.end.slice(5)}
            </p>
          </div>
          <IconButton aria-label="다음 사이클" onClick={() => shift(1)}>
            <Chevron direction="right" />
          </IconButton>
        </div>
      </header>

      {plan === undefined ? null : rows.length === 0 ? (
        <EmptyState
          title="카테고리가 없습니다"
          hint="설정 → 카테고리에서 먼저 만들어 주세요."
        />
      ) : (
        <>
          <section className="px-4 pt-1 pb-3">
            <div className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] text-zinc-500">배분 합계</span>
                <span className="text-[20px] font-semibold tabular-nums text-zinc-900">
                  {formatWon(totals.all)}
                </span>
              </div>
              <div className="mt-1 flex justify-between text-[12px] tabular-nums text-zinc-500">
                <span>지출 {formatWon(totals.expense)}</span>
                <span>저축·상환 {formatWon(totals.saving)}</span>
              </div>
              {netPay > 0 && (
                <p
                  className={`mt-2 border-t border-zinc-100 pt-2 text-[12px] tabular-nums ${
                    leftover < 0 ? 'text-red-600' : 'text-emerald-700'
                  }`}
                >
                  실수령 {formatWon(netPay)} −{' '}
                  {formatWon(totals.all)} ={' '}
                  <strong>
                    {leftover < 0
                      ? `${formatWon(-leftover)} 초과`
                      : `${formatWon(leftover)} 남음`}
                  </strong>
                </p>
              )}
              {plan.isPlanned && !touched && (
                <p className="mt-1 text-[11px] text-zinc-400">
                  이 사이클 예산은 이미 정해져 있습니다. 고치면 덮어씁니다.
                </p>
              )}
            </div>
          </section>

          <div className="flex flex-col gap-3 px-4 pb-4">
            {sections.map((section) => (
              <section key={section.group}>
                <h2 className="mb-1 flex items-baseline justify-between text-[12px] font-semibold text-zinc-500">
                  <span>{section.group}</span>
                  <span className="tabular-nums font-normal text-zinc-400">
                    {formatWon(
                      section.rows.reduce(
                        (sum, row) =>
                          sum + amountOf(row.categoryId, row.amount),
                        0,
                      ),
                    )}
                  </span>
                </h2>
                <ul className="flex flex-col gap-1.5">
                  {section.rows.map((row) => (
                    <li
                      key={row.categoryId}
                      className="rounded-xl bg-white p-3 ring-1 ring-zinc-200"
                    >
                      <div className="mb-1.5 flex items-baseline justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-zinc-900">
                          {row.name}
                          {row.type !== 'EXPENSE' && (
                            <span className="ml-1.5 text-[11px] font-normal text-zinc-400">
                              {TYPE_LABEL[row.type]}
                            </span>
                          )}
                        </span>
                        {/* 지난 사이클 실적 — 숫자를 맨땅에서 짜지 않게 */}
                        {row.previousSpent > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setDraft((current) =>
                                new Map(current).set(
                                  row.categoryId,
                                  row.previousSpent,
                                ),
                              )
                              setTouched(true)
                              setSaved(false)
                            }}
                            className="shrink-0 text-[11px] tabular-nums text-zinc-400 underline underline-offset-2"
                          >
                            지난달 {formatWon(row.previousSpent)}
                          </button>
                        )}
                      </div>
                      <AmountField
                        value={amountOf(row.categoryId, row.amount)}
                        onChange={(value) => {
                          setDraft((current) =>
                            new Map(current).set(row.categoryId, value ?? 0),
                          )
                          setTouched(true)
                          setSaved(false)
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <section className="px-4 pb-6">
            <Button variant="primary" className="w-full" onClick={confirm}>
              {cycleKey} 예산 확정
            </Button>
            {saved && (
              <p className="mt-2 text-center text-[13px] text-emerald-700">
                확정했습니다. 카테고리 예산에도 반영됐습니다.
              </p>
            )}
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
              확정하면 이 사이클의 예산으로 저장되고, 카테고리 예산도 같은 값으로
              갱신됩니다. 지난 사이클 리포트는 그때 정한 예산으로 평가되므로
              바뀌지 않습니다.
            </p>
          </section>
        </>
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
