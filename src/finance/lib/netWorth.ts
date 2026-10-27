import type { Asset, Debt } from '../db/types'

/**
 * 순자산 공식 — spec-finance-v0.14 §5.8
 *
 * **공식을 여기 한 곳에만 둔다.** 전에는 대시보드·목표·스냅샷·자산 화면·
 * 시뮬레이터가 각자 `assets.reduce(...)`를 돌렸다. 다섯 벌이라 보증금을
 * 빼려면 다섯 곳을 고쳐야 하고, 한 곳을 놓치면 화면마다 다른 순자산이
 * 보인다. 그 상태로는 어느 숫자가 맞는지 알 수 없다.
 */

/**
 * 순자산에 넣는 자산인가.
 *
 * 보증금은 돌려받긴 하지만 "모으고 있는 돈"이 아니라 기본적으로 뺀다.
 * 필드가 없는 기존 데이터는 종류로 판단한다 — 마이그레이션 없이 넘어가기
 * 위한 지연 기본값이다.
 */
export function countsInNetWorth(asset: Asset): boolean {
  return asset.countsInNetWorth ?? asset.kind !== 'DEPOSIT'
}

/**
 * 갚은 원금 — spec-finance-v0.14 §5.10
 *
 * 보증금처럼 순자산에서 뺀 자산을 사기 위해 빌린 돈이면, 갚은 만큼이 그
 * 자산에 대한 내 지분이다. 그런데 자산이 순자산에서 빠져 있으니 갚아도
 * 현금만 줄어 순자산이 내려간다 — 돈을 모으는 중인데 숫자가 나빠진다.
 *
 * `repaidCountsInNetWorth`를 켠 부채는 갚은 원금을 순자산에 더해 그 지분을
 * 되돌린다. `originalAmount`를 모르면 갚은 금액을 계산할 수 없어 0이다.
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
