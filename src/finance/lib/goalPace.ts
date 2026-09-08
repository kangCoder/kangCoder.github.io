import { differenceInMonths, endOfMonth, parseISO } from 'date-fns'

/**
 * 목표 달성 페이스 — 지금 속도로 목표에 닿는가
 *
 * 투자 수익률을 가정하지 않은 단순 적립 계산이다. 수익률·LTV까지 넣은
 * 시뮬레이터는 구현 7단계(§5.5)이고, 여기서는 "지금 페이스가 충분한가"만 본다.
 * 수익률을 0으로 두므로 결과는 보수적이다.
 */
export interface GoalPace {
  /** 목표까지 남은 개월. 이미 지났으면 0 */
  monthsLeft: number
  /** 목표 − 현재 순자산 */
  gap: number
  /** 목표를 맞추려면 매달 필요한 금액 */
  requiredMonthly: number
  /** 지금 매달 순자산이 늘어나는 속도 */
  currentMonthly: number
  /** 현재 − 필요. 음수면 부족분 */
  surplus: number
  /** 지금 페이스로 목표 시점에 도달할 순자산 */
  projected: number
  onTrack: boolean
  /** 지금 페이스로 목표를 채우는 데 걸리는 개월. 페이스가 0이면 undefined */
  monthsNeeded: number | undefined
}

export function calculateGoalPace(params: {
  netWorth: number
  targetAmount: number
  /** "2029-03" */
  targetDate: string
  /**
   * 월 순자산 증가액.
   * 저축·투자 + 부채 원금 상환(원천 차감분 포함)이다.
   * 원금 상환도 순자산을 늘리므로 함께 센다(§2.2).
   */
  monthlyContribution: number
  today?: Date
}): GoalPace {
  const today = params.today ?? new Date()
  // "2029-03"은 그 달 안에만 닿으면 되므로 말일이 기준이다.
  // 1일로 두면 남은 기간이 한 달 짧게 잡혀 필요 적립액이 부풀려진다.
  const target = endOfMonth(parseISO(`${params.targetDate}-01`))
  const monthsLeft = Math.max(0, differenceInMonths(target, today))

  const gap = params.targetAmount - params.netWorth
  const requiredMonthly = monthsLeft > 0 ? Math.ceil(gap / monthsLeft) : gap
  const projected = params.netWorth + params.monthlyContribution * monthsLeft

  return {
    monthsLeft,
    gap,
    requiredMonthly,
    currentMonthly: params.monthlyContribution,
    surplus: params.monthlyContribution - requiredMonthly,
    projected,
    onTrack: projected >= params.targetAmount,
    monthsNeeded:
      gap <= 0
        ? 0
        : params.monthlyContribution > 0
          ? Math.ceil(gap / params.monthlyContribution)
          : undefined,
  }
}
