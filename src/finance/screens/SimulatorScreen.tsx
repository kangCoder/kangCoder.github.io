import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconButton } from '../../components/Button'

import { AmountField } from '../components/AmountField'
import { RateField } from '../components/RateField'
import { DEFAULT_RATE_PERCENT, clampRatePercent } from '../lib/rate'
import { listAssets, listDebts } from '../db/assets'
import { getCycleSummary } from '../db/dashboard'
import { getGoal } from '../db/goals'
import { DEFAULT_PAYDAY, getIncomeSetting } from '../db/income'
import { getCurrentCycleKey } from '../lib/cycle'
import { POLICIES, POLICY_AS_OF } from '../lib/loanPolicy'
import { formatWon } from '../lib/money'
import { ProjectionChart } from '../components/ProjectionChart'
import { incomeWarning, maxAffordable, simulateProjection } from '../lib/simulator'
import { differenceInMonths, endOfMonth, parseISO } from 'date-fns'

/** 목표 시뮬레이터 — §5.5 */
export function SimulatorScreen() {
  const navigate = useNavigate()
  const goal = useLiveQuery(() => getGoal(), [])
  const assets = useLiveQuery(() => listAssets(), [])
  const debts = useLiveQuery(() => listDebts(), [])
  const income = useLiveQuery(() => getIncomeSetting(), [])
  const payday = income?.payday ?? DEFAULT_PAYDAY
  const summary = useLiveQuery(
    () => getCycleSummary(getCurrentCycleKey(payday)),
    [payday],
  )

  const [extra, setExtra] = useState<number | undefined>(0)
  const [ratePercent, setRatePercent] = useState<number | undefined>(
    DEFAULT_RATE_PERCENT,
  )

  if (
    goal === undefined ||
    assets === undefined ||
    debts === undefined ||
    summary === undefined
  ) {
    return null
  }

  const targetDate = goal?.targetDate ?? '2029-03'
  const months = Math.max(
    0,
    differenceInMonths(endOfMonth(parseISO(`${targetDate}-01`)), new Date()),
  )
  const rate = clampRatePercent(ratePercent)
  // 추가 저축은 투자로 들어간다고 본다 — 수익률이 붙는 쪽이다
  const monthlySaving = summary.monthlySaving + (extra ?? 0)
  // 그래프가 목표선을 지나는 지점을 보여주려면 목표 시점 이후까지 그려야 한다
  const projection = simulateProjection({
    assets,
    debts,
    monthlySaving,
    annualRate: rate / 100,
    months: Math.max(months, 12),
  })
  const chart = simulateProjection({
    assets,
    debts,
    monthlySaving,
    annualRate: rate / 100,
    months: Math.max(months * 2, 60),
  })
  const capital =
    projection.points.find((point) => point.month === months)?.capital ??
    projection.capital
  const annualIncome = (income?.grossPay ?? 0) * 12

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-1 bg-zinc-100/90 px-2 pt-2 pb-2 backdrop-blur">
        <IconButton onClick={() => navigate('/finance/goal')} aria-label="뒤로">
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
          <h1 className="text-[17px] font-semibold text-zinc-900">
            목표 시뮬레이터
          </h1>
          <p className="text-[12px] text-zinc-500">
            {targetDate}까지 · {months}개월
          </p>
        </div>
      </header>

      <section className="flex flex-col gap-4 px-4 pt-1 pb-4">
        <AmountField
          label="월 추가 저축"
          value={extra}
          onChange={setExtra}
          placeholder="0"
        />
        <RateField value={ratePercent} onChange={setRatePercent} />
      </section>

      <section className="px-4 pb-4">
        <div className="rounded-xl bg-zinc-900 p-4 text-white">
          <p className="text-[12px] text-zinc-400">
            {targetDate} 예상 자기자금
          </p>
          <p className="mt-0.5 text-[26px] font-bold tabular-nums">
            {formatWon(Math.floor(capital))}
          </p>
          <p className="mt-1 text-[12px] text-zinc-400">
            자산에서 남은 부채를 뺀 값입니다
          </p>
        </div>

        {goal && (
          <div className="mt-2 rounded-xl bg-white p-3 ring-1 ring-zinc-200">
            <ProjectionChart
              points={chart.points}
              targetAmount={goal.targetAmount}
              targetMonth={months}
            />
          </div>
        )}

        {/* 왜 이 숫자인지 보이지 않으면 신뢰할 수 없다 */}
        <ul className="mt-2 flex flex-col gap-0.5 rounded-xl bg-white p-3 text-[12px] tabular-nums ring-1 ring-zinc-200">
          <Breakdown
            label={`투자 자산 (연 ${rate}% 복리)`}
            value={projection.investedFuture}
          />
          <Breakdown
            label={`월 저축 ${formatWon(monthlySaving)} 누적 + 완납분 전환`}
            value={projection.savingsFuture}
          />
          <Breakdown
            label="그 외 자산 (수익률 없음)"
            value={projection.otherLiquid}
          />
          <Breakdown
            label={`남은 부채 (${formatWon(projection.debtRepaid)} 상환 후)`}
            value={-projection.debtRemaining}
          />
          <li className="mt-1 flex justify-between border-t border-zinc-100 pt-1 font-semibold text-zinc-900">
            <span>자기자금</span>
            <span>{formatWon(Math.floor(capital))}</span>
          </li>
          {projection.illiquid > 0 && (
            <li className="mt-1 text-[11px] text-zinc-400">
              현금화 불가로 표시한 자산 {formatWon(projection.illiquid)}원은
              제외했습니다.
            </li>
          )}
        </ul>
      </section>

      <section className="px-4 pb-4">
        <h2 className="mb-2 text-[13px] font-medium text-zinc-500">
          대출 시나리오
        </h2>
        <ul className="flex flex-col gap-2">
          {POLICIES.map((policy) => {
            const result = maxAffordable(capital, policy)
            const warning = incomeWarning(annualIncome, policy)
            return (
              <li
                key={policy.key}
                className="rounded-xl bg-white p-3 ring-1 ring-zinc-200"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[14px] font-medium text-zinc-900">
                    {policy.name}
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    LTV {Math.round(policy.ltvCapital * 100)}% · 한도{' '}
                    {formatWon(policy.maxLoan)}
                  </span>
                </div>

                <p className="mt-2 text-[20px] font-semibold tabular-nums text-zinc-900">
                  {formatWon(result.maxHousePrice)}
                  <span className="ml-1 text-[12px] font-normal text-zinc-400">
                    까지 매수 가능
                  </span>
                </p>
                <p className="text-[12px] tabular-nums text-zinc-500">
                  대출 {formatWon(result.loan)} · 부대비용{' '}
                  {formatWon(result.incidental)}
                </p>
                {result.cappedByPolicy && (
                  <p className="mt-1 text-[11px] text-zinc-400">
                    정책 상한에 걸렸습니다. 자기자금을 더 모아도 이 상품으로는
                    더 못 올립니다.
                  </p>
                )}

                {warning !== 'ok' && (
                  <p
                    className={`mt-2 rounded-lg px-2 py-1.5 text-[12px] ${
                      warning === 'over'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-amber-50 text-amber-800'
                    }`}
                  >
                    {warning === 'over'
                      ? `연소득 ${formatWon(annualIncome)}원이 요건 ${formatWon(policy.incomeLimit)}원을 넘어 이용할 수 없습니다.`
                      : `연소득이 요건 ${formatWon(policy.incomeLimit)}원에 근접했습니다. 연봉이 오르면 자격을 잃을 수 있습니다.`}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <section className="px-4 pb-6">
        <div className="rounded-xl bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-900 ring-1 ring-amber-200">
          <p className="font-semibold">
            정책 기준일: {POLICY_AS_OF} · 검증되지 않은 값
          </p>
          <p className="mt-1">
            LTV·DSR·생애최초 요건은 정부 대책에 따라 수시로 바뀝니다. 실행이
            가까워지면 주택도시기금 또는 은행 창구에서 반드시 재확인하세요.
          </p>
          <p className="mt-1 font-medium">
            실제 대출 가능 여부는 금융기관 확인이 필요합니다. 이 화면은 방향
            감각용이며 확정 계산기가 아닙니다.
          </p>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
          자기자금은 '목표 시점 현금화 가능'으로 표시한 자산에서 남은 부채를 뺀
          값입니다. 수익률은 투자 자산과 월 저축에만 적용합니다. DSR과 기존 부채의
          상환 부담은 계산에 넣지 않았습니다.
        </p>
      </section>
    </div>
  )
}

function Breakdown({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex justify-between gap-2">
      <span className="min-w-0 flex-1 text-zinc-500">{label}</span>
      <span className={value < 0 ? 'text-red-600' : 'text-zinc-900'}>
        {value < 0 ? '−' : ''}
        {formatWon(Math.abs(Math.floor(value)))}
      </span>
    </li>
  )
}
