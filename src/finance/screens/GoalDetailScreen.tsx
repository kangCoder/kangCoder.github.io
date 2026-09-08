import { differenceInMonths, endOfMonth, parseISO } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, IconButton } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { ProjectionChart } from '../components/ProjectionChart'
import { RateField } from '../components/RateField'
import { DEFAULT_RATE_PERCENT, clampRatePercent } from '../lib/rate'
import { listAssets, listDebts } from '../db/assets'
import { getCycleSummary } from '../db/dashboard'
import { getGoal, getNetWorth } from '../db/goals'
import { DEFAULT_PAYDAY, getIncomeSetting } from '../db/income'
import { getCurrentCycleKey } from '../lib/cycle'
import { formatWon } from '../lib/money'
import { monthsToReachTarget, simulateProjection } from '../lib/simulator'

/**
 * 목표 상세 — 지금 페이스가 목표에 닿는가.
 *
 * 시뮬레이터와 같은 월별 시뮬레이션을 쓴다. 두 화면이 다른 방식으로 계산하면
 * 같은 데이터로 다른 개월 수를 말하게 된다.
 *
 * 수익률 가정에 따라 결론이 크게 달라지므로 직접 입력받는다.
 */
export function GoalDetailScreen() {
  const navigate = useNavigate()
  const [ratePercent, setRatePercent] = useState<number | undefined>(
    DEFAULT_RATE_PERCENT,
  )

  const goal = useLiveQuery(() => getGoal(), [])
  const netWorth = useLiveQuery(() => getNetWorth(), [])
  const assets = useLiveQuery(() => listAssets(), [])
  const debts = useLiveQuery(() => listDebts(), [])
  const payday = useLiveQuery(
    async () => (await getIncomeSetting())?.payday ?? DEFAULT_PAYDAY,
    [],
    DEFAULT_PAYDAY,
  )
  const summary = useLiveQuery(
    () => getCycleSummary(getCurrentCycleKey(payday)),
    [payday],
  )

  if (
    goal === undefined ||
    netWorth === undefined ||
    assets === undefined ||
    debts === undefined ||
    summary === undefined
  ) {
    return null
  }

  if (!goal) {
    return (
      <EmptyState
        title="목표가 없습니다"
        hint="설정에서 목표를 먼저 만드세요."
        action={
          <Link to="/finance/settings">
            <Button variant="primary">설정으로</Button>
          </Link>
        }
      />
    )
  }

  const rate = clampRatePercent(ratePercent)
  const monthsLeft = Math.max(
    0,
    differenceInMonths(endOfMonth(parseISO(`${goal.targetDate}-01`)), new Date()),
  )

  const common = {
    assets,
    debts,
    monthlySaving: summary.monthlySaving,
    annualRate: rate / 100,
  }
  const needed = monthsToReachTarget({
    ...common,
    targetAmount: goal.targetAmount,
  })
  const chart = simulateProjection({
    ...common,
    months: Math.max(monthsLeft, needed ?? 0, 24) + 12,
  })
  const atTarget =
    chart.points.find((point) => point.month === monthsLeft)?.capital ?? 0

  const gap = goal.targetAmount - netWorth
  const onTrack = needed !== undefined && needed <= monthsLeft
  const late = needed !== undefined ? needed - monthsLeft : undefined
  const requiredMonthly =
    monthsLeft > 0 ? Math.ceil((goal.targetAmount - atTarget) / monthsLeft) : 0

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-1 bg-zinc-100/90 px-2 pt-2 pb-2 backdrop-blur">
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
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-semibold text-zinc-900">
            {goal.name}
          </h1>
          <p className="text-[12px] tabular-nums text-zinc-500">
            {goal.targetDate}까지 · {formatWon(goal.targetAmount)}원
          </p>
        </div>
      </header>

      {/* 수익률 가정에 따라 결론이 갈리므로 직접 넣게 한다 */}
      <section className="px-4 pt-1 pb-3">
        <RateField value={ratePercent} onChange={setRatePercent} />
      </section>

      <section className="px-4 pb-3">
        <div
          className={`rounded-xl p-4 ring-1 ${
            onTrack
              ? 'bg-emerald-50 ring-emerald-200'
              : 'bg-amber-50 ring-amber-200'
          }`}
        >
          <p
            className={`text-[18px] font-bold ${onTrack ? 'text-emerald-800' : 'text-amber-900'}`}
          >
            {gap <= 0
              ? '이미 목표를 넘었습니다'
              : onTrack
                ? '지금 페이스면 도달합니다'
                : '지금 페이스로는 부족합니다'}
          </p>
          <p
            className={`mt-1 text-[13px] leading-relaxed ${onTrack ? 'text-emerald-700' : 'text-amber-800'}`}
          >
            {gap <= 0 ? (
              <>순자산이 목표를 {formatWon(-gap)}원 넘었습니다.</>
            ) : needed === undefined ? (
              <>지금 페이스로는 50년 안에 목표에 닿지 못합니다.</>
            ) : onTrack ? (
              <>
                {needed}개월이면 목표에 닿습니다. 목표 시점({monthsLeft}개월)보다{' '}
                {monthsLeft - needed}개월 빠릅니다.
              </>
            ) : (
              <>
                {needed}개월이 필요해 <strong>목표보다 {late}개월 늦습니다.</strong>{' '}
                목표 시점에는 {formatWon(Math.floor(atTarget))}원으로,{' '}
                {formatWon(goal.targetAmount - Math.floor(atTarget))}원 모자랍니다.
              </>
            )}
          </p>
        </div>
      </section>

      <section className="px-4 pb-4">
        <div className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
          <ProjectionChart
            points={chart.points}
            targetAmount={goal.targetAmount}
            targetMonth={monthsLeft}
          />
        </div>
      </section>

      <section className="px-4 pb-4">
        <ul className="flex flex-col gap-1.5">
          <Row label="현재 순자산" value={`${formatWon(netWorth)}원`} />
          <Row
            label="목표 시점 예상"
            value={`${formatWon(Math.floor(atTarget))}원`}
            hint={`${monthsLeft}개월 후, 연 ${rate}% 기준`}
          />
          <Row
            label="목표 달성 시점"
            value={needed === undefined ? '50년 내 불가' : `${needed}개월 후`}
            hint={
              late !== undefined && late > 0
                ? `목표보다 ${late}개월 늦다`
                : undefined
            }
          />
          <Row
            label="목표를 맞추려면"
            value={
              requiredMonthly > 0
                ? `월 ${formatWon(summary.monthlySaving + requiredMonthly)}원 저축`
                : '현재 페이스로 충분'
            }
            hint={
              requiredMonthly > 0
                ? `지금보다 월 ${formatWon(requiredMonthly)}원 더`
                : undefined
            }
          />
          <Row
            label="현재 월 페이스"
            value={`${formatWon(summary.monthlyContribution)}원`}
            hint={`저축 ${formatWon(summary.monthlySaving)} + 부채 원금 ${formatWon(summary.monthlyPrincipal)}`}
          />
        </ul>
      </section>

      <section className="px-4 pb-6">
        <p className="text-[11px] leading-relaxed text-zinc-400">
          부채는 각자의 월 원금 상환액만큼 줄고, 다 갚으면 그 상환액을 저축으로
          돌린다고 가정합니다. 수익률은 투자 자산과 저축에만 적용합니다.
          {chart.illiquid > 0 &&
            ` 현금화 불가로 표시한 자산 ${formatWon(chart.illiquid)}원은 제외했습니다.`}
        </p>
        <Link to="/finance/simulator" className="mt-3 block">
          <Button variant="primary" className="w-full">
            대출까지 넣어 시뮬레이션 →
          </Button>
        </Link>
      </section>
    </div>
  )
}

function Row({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <li className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[14px] text-zinc-500">{label}</span>
        <span className="text-[15px] font-semibold tabular-nums text-zinc-900">
          {value}
        </span>
      </div>
      {hint && <p className="mt-0.5 text-[11px] text-zinc-400">{hint}</p>}
    </li>
  )
}
