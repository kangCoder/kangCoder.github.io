import type { Asset, Debt } from '../db/types'
import { INCIDENTAL_RATE, type LoanPolicy } from './loanPolicy'

/**
 * 목표 시뮬레이터 계산 — spec-finance §5.5
 *
 * 순수 함수다. 정책 상수는 loanPolicy.ts에 모여 있고 여기서는 계산만 한다.
 */

/** 월 적립 + 연 복리. 수익률 0이면 단순 적립이 된다. */
export function futureValue(params: {
  present: number
  monthly: number
  annualRate: number
  months: number
}): number {
  const r = params.annualRate / 12
  if (params.months <= 0) return params.present
  if (r === 0) return params.present + params.monthly * params.months

  const growth = (1 + r) ** params.months
  return params.present * growth + params.monthly * ((growth - 1) / r)
}

export interface LoanResult {
  policy: LoanPolicy
  /** 자기자금으로 살 수 있는 최대 주택가격 */
  maxHousePrice: number
  /** 그때 실제 대출액 */
  loan: number
  /** 부대비용 (취득세·중개수수료 등) */
  incidental: number
  /** 정책 상한에 걸렸는가 */
  cappedByPolicy: boolean
}

/**
 * 자기자금 E로 살 수 있는 최대 주택가격.
 *
 * 필요 자기자금 = 주택가격 − 대출액 + 부대비용
 * 대출액 = min(한도, 주택가격 × LTV)
 *
 * LTV 구간과 한도 구간의 식이 다르므로 둘 다 풀고 유효한 쪽을 고른다.
 */
export function maxAffordable(
  capital: number,
  policy: LoanPolicy,
): LoanResult {
  const { ltvCapital: ltv, maxLoan } = policy

  // 1) 대출이 한도에 닿지 않는 구간: E = P(1 − ltv + 부대비율)
  const byLtv = capital / (1 - ltv + INCIDENTAL_RATE)
  // 2) 대출이 한도에 걸린 구간: E = P − maxLoan + P × 부대비율
  const byCap = (capital + maxLoan) / (1 + INCIDENTAL_RATE)

  // 1번 결과가 한도 안이면 그게 답이고, 넘으면 2번이 답이다
  let price = byLtv * ltv <= maxLoan ? byLtv : byCap
  let cappedByPolicy = byLtv * ltv > maxLoan

  if (policy.maxHousePrice !== undefined && price > policy.maxHousePrice) {
    price = policy.maxHousePrice
    cappedByPolicy = true
  }

  const loan = Math.min(maxLoan, price * ltv)
  return {
    policy,
    maxHousePrice: Math.floor(price),
    loan: Math.floor(loan),
    incidental: Math.floor(price * INCIDENTAL_RATE),
    cappedByPolicy,
  }
}

/** 예상 연소득이 요건에 가까운지 — 넘으면 정책 자체를 못 쓴다 */
export function incomeWarning(
  annualIncome: number,
  policy: LoanPolicy,
): 'over' | 'near' | 'ok' {
  if (annualIncome > policy.incomeLimit) return 'over'
  if (annualIncome > policy.incomeLimit * 0.9) return 'near'
  return 'ok'
}

/**
 * 목표 시점에 실제로 동원할 수 있는 돈 — 자기자금
 *
 * 월별로 한 달씩 굴린다. 한 번에 공식으로 푸는 것보다 느리지만, 부채가
 * **각자의 속도로** 사라지는 것을 정확히 반영할 수 있고 시계열이 그대로
 * 그래프가 된다.
 *
 * 지켜야 하는 것 세 가지:
 *
 * 1. **부채는 부채별로 상환한다.** 월 원금 상환이 0인 부채(이자만 내는 대출 등)는
 *    영원히 줄지 않는다. 총부채를 총상환액으로 나누면 갚지도 않을 원금이
 *    사라지는 것으로 계산된다.
 * 2. **수익률은 투자 자산과 저축에만 붙인다.** 보증금·예적금·현금에는
 *    투자 수익률이 붙지 않는다.
 * 3. **완납된 부채의 상환액은 저축으로 전환된다고 본다.** 대출이 끝나면
 *    그 돈이 사라지는 게 아니라 여유가 된다. 실제로 저축으로 돌려야
 *    이 계산이 맞으므로 화면에 전제를 밝힌다.
 */
export interface ProjectionPoint {
  month: number
  /** 그달의 자기자금 */
  capital: number
  debtRemaining: number
}

export interface Projection {
  points: ProjectionPoint[]
  /** 초기 투자 자산이 불어난 값 */
  investedFuture: number
  /** 저축·전환분이 쌓인 값 */
  savingsFuture: number
  /** 수익률이 붙지 않는 유동 자산 */
  otherLiquid: number
  debtRemaining: number
  debtRepaid: number
  /** 목표 시점에 현금화할 수 없다고 표시한 자산 */
  illiquid: number
  capital: number
}

export function simulateProjection(params: {
  assets: Asset[]
  debts: Debt[]
  /** 월 저축·투자 */
  monthlySaving: number
  annualRate: number
  months: number
}): Projection {
  const liquid = params.assets.filter((asset) => asset.isLiquidByTarget)
  const illiquid = params.assets
    .filter((asset) => !asset.isLiquidByTarget)
    .reduce((sum, asset) => sum + asset.balance, 0)

  const otherLiquid = liquid
    .filter((asset) => asset.kind !== 'INVESTMENT')
    .reduce((sum, asset) => sum + asset.balance, 0)

  // 초기 투자 자산과 이후 저축을 따로 추적해야 내역을 보여줄 수 있다
  let fromAssets = liquid
    .filter((asset) => asset.kind === 'INVESTMENT')
    .reduce((sum, asset) => sum + asset.balance, 0)
  let fromSavings = 0

  const balances = params.debts.map((debt) => debt.balance)
  const principals = params.debts.map((debt) => debt.monthlyPrincipal)
  const totalPrincipal = principals.reduce((sum, value) => sum + value, 0)
  const totalDebt = balances.reduce((sum, value) => sum + value, 0)

  const r = params.annualRate / 12
  const points: ProjectionPoint[] = []

  const snapshot = (month: number): ProjectionPoint => {
    const debtRemaining = balances.reduce((sum, value) => sum + value, 0)
    return {
      month,
      capital: fromAssets + fromSavings + otherLiquid - debtRemaining,
      debtRemaining,
    }
  }
  points.push(snapshot(0))

  for (let month = 1; month <= params.months; month++) {
    let paid = 0
    for (let i = 0; i < balances.length; i++) {
      const pay = Math.min(balances[i], principals[i])
      balances[i] -= pay
      paid += pay
    }
    // 완납된 부채의 상환액은 여유가 되어 저축으로 간다
    const freed = totalPrincipal - paid

    fromAssets *= 1 + r
    fromSavings = fromSavings * (1 + r) + params.monthlySaving + freed
    points.push(snapshot(month))
  }

  const last = points[points.length - 1]
  return {
    points,
    investedFuture: fromAssets,
    savingsFuture: fromSavings,
    otherLiquid,
    debtRemaining: last.debtRemaining,
    debtRepaid: totalDebt - last.debtRemaining,
    illiquid,
    capital: last.capital,
  }
}

/**
 * 지금 페이스로 목표에 닿는 달. 못 닿으면 undefined.
 * 자기자금은 단조증가하므로 처음 넘는 지점을 찾으면 된다.
 */
export function monthsToReachTarget(params: {
  assets: Asset[]
  debts: Debt[]
  monthlySaving: number
  annualRate: number
  targetAmount: number
  maxMonths?: number
}): number | undefined {
  const maxMonths = params.maxMonths ?? 600
  const { points } = simulateProjection({
    assets: params.assets,
    debts: params.debts,
    monthlySaving: params.monthlySaving,
    annualRate: params.annualRate,
    months: maxMonths,
  })
  return points.find((point) => point.capital >= params.targetAmount)?.month
}
