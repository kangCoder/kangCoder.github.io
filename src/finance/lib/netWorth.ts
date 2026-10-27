import type { Asset, Debt } from '../db/types'

/**
 * 순자산 공식 — spec-finance-v0.15 §5.8
 *
 * **공식을 여기 한 곳에만 둔다.** 전에는 대시보드·목표·스냅샷·자산 화면·
 * 시뮬레이터가 각자 `assets.reduce(...)`를 돌렸다. 다섯 벌이라 보증금을
 * 빼려면 다섯 곳을 고쳐야 하고, 한 곳을 놓치면 화면마다 다른 순자산이
 * 보인다. 그 상태로는 어느 숫자가 맞는지 알 수 없다.
 */

/**
 * 순자산에 넣는 자산인가. **기본은 포함이다.**
 *
 * v0.14까지 보증금을 기본 제외했는데 틀렸다. 보증금 1.5억이 전세대출
 * 1.2억 + 사내대출 3천으로 이뤄져 있다면:
 *
 * ```
 * 포함:  1.5억 − 1.2억 − 0.3억 = 0        ← 내 지분 0, 맞다
 * 제외:  0     − 1.2억 − 0.3억 = −1.5억   ← 수준이 1.5억 틀어진다
 * ```
 *
 * 돌려받는 돈이면 순자산에 있는 것이 맞고, 짝이 되는 부채와 상쇄되어
 * 지분만 남는다. 원금을 갚으면 부채가 줄어 그만큼 지분이 올라간다 —
 * **일반 공식이 이미 "내 돈이 되는 과정"을 정확히 반영한다.**
 *
 * 끄는 쓰임은 좁다 — 돌려받지 않는 금액일 때다.
 */
export function countsInNetWorth(asset: Asset): boolean {
  return asset.countsInNetWorth ?? true
}

/**
 * 자산 구성 그래프에서 숨기는가 — §5.8
 *
 * 순자산 포함 여부와 **별개 결정**이다. 보증금은 순자산에 있어야 맞지만
 * 그래프에 1.5억으로 깔리면 적금·투자 비중을 읽을 수 없다.
 */
export function hiddenFromChart(asset: Asset): boolean {
  return asset.hideFromChart ?? asset.kind === 'DEPOSIT'
}

/**
 * 갚은 원금 — spec-finance-v0.15 §5.10
 *
 * 보증금처럼 순자산에서 뺀 자산을 사기 위해 빌린 돈이면, 갚은 만큼이 그
 * 자산에 대한 내 지분이다. 그런데 자산이 순자산에서 빠져 있으니 갚아도
 * 현금만 줄어 순자산이 내려간다 — 돈을 모으는 중인데 숫자가 나빠진다.
 *
 * `repaidCountsInNetWorth`를 켠 부채는 갚은 원금을 순자산에 더해 그 지분을
 * 되돌린다. `originalAmount`를 모르면 갚은 금액을 계산할 수 없어 0이다.
 *
 * **짝이 되는 자산이 순자산에 있으면 켜지 말 것 — 두 번 센다.** 부채 잔액이
 * 줄어드는 것이 이미 지분 증가다. 이 옵션은 그 자산을 **아예 추적하지 않을
 * 때**(순자산에 없을 때)만 쓴다. 예: 차량 할부를 갚는데 차를 자산으로
 * 등록하지 않은 경우.
 */
export function repaidPrincipal(debt: Debt): number {
  if (!debt.repaidCountsInNetWorth) return 0
  if (debt.originalAmount === undefined) return 0
  return Math.max(0, debt.originalAmount - debt.balance)
}

export interface NetWorth {
  /** 순자산에 포함되는 자산 합계 */
  totalAssets: number
  totalDebts: number
  netWorth: number
  /** 제외된 자산 합계 (보증금 등) */
  excludedAssets: number
  /** 순자산에 더해진 갚은 원금 합계 — §5.10 */
  repaidPrincipal: number
}

export function computeNetWorth(assets: Asset[], debts: Debt[]): NetWorth {
  let totalAssets = 0
  let excludedAssets = 0
  for (const asset of assets) {
    if (countsInNetWorth(asset)) totalAssets += asset.balance
    else excludedAssets += asset.balance
  }
  const totalDebts = debts.reduce((sum, debt) => sum + debt.balance, 0)
  const repaid = debts.reduce((sum, debt) => sum + repaidPrincipal(debt), 0)
  return {
    totalAssets,
    totalDebts,
    netWorth: totalAssets - totalDebts + repaid,
    excludedAssets,
    repaidPrincipal: repaid,
  }
}
