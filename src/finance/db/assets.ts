import { computeNetWorth, countsInNetWorth } from '../lib/netWorth'
import { loadBalances, type EffectiveAsset, type EffectiveDebt } from './balances'
import { financeDb, newId } from './db'
import type { AssetKind } from './types'

/** 자산·부채 쿼리 — spec-finance §5.4 */

/** 거래 반영분이 들어간 잔액이다 — §5.7 */
export async function listAssets(): Promise<EffectiveAsset[]> {
  return (await loadBalances()).assets
}

export async function listDebts(): Promise<EffectiveDebt[]> {
  return (await loadBalances()).debts
}

export interface AssetInput {
  name: string
  kind: AssetKind
  balance: number
  principal?: number
  isLiquidByTarget: boolean
  note?: string
  /**
   * 이 잔액이 어느 시점 기준인가 (epoch ms).
   * 사이클이 끝나는 날에 맞춰 갱신하기 어려우므로 직접 지정할 수 있다.
   * 비우면 지금 시각으로 둔다.
   */
  updatedAt?: number
  /** 순자산에 포함하는가 — §5.8 */
  countsInNetWorth?: boolean
}

export async function saveAsset(
  input: AssetInput,
  id?: string,
): Promise<void> {
  const updatedAt = input.updatedAt ?? Date.now()
  const value = {
    ...input,
    name: input.name.trim(),
    balance: Math.trunc(input.balance),
    note: input.note?.trim() || undefined,
    // 잔액이 언제 기준인지가 이 숫자의 신뢰도를 좌우한다
    updatedAt,
    /**
     * 잔액을 직접 입력했으므로 거래 반영 기준을 그 날짜로 되돌린다 — §5.7
     * 이걸 하지 않으면 이미 반영된 거래가 새 잔액 위에 또 더해진다.
     */
    reflectFrom: toDateString(updatedAt),
  }
  if (id) await financeDb.assets.update(id, value)
  else await financeDb.assets.add({ id: newId(), ...value })
}

export async function deleteAsset(id: string): Promise<void> {
  await financeDb.assets.delete(id)
}

/** epoch ms → 'YYYY-MM-DD' (로컬 시간대) */
function toDateString(at: number): string {
  const date = new Date(at)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export interface DebtInput {
  name: string
  balance: number
  /** 갚은 원금을 순자산에 더하는가 — §5.10 */
  repaidCountsInNetWorth?: boolean
  originalAmount?: number
  interestRate?: number
  monthlyPrincipal: number
  monthlyInterest: number
  expectedPayoff?: string
  countsInDTI: boolean
}

export async function saveDebt(input: DebtInput, id?: string): Promise<void> {
  const value = {
    ...input,
    name: input.name.trim(),
    balance: Math.trunc(input.balance),
    monthlyPrincipal: Math.trunc(input.monthlyPrincipal),
    monthlyInterest: Math.trunc(input.monthlyInterest),
    // 원금 + 이자가 곧 월 상환액이다. 따로 입력받으면 어긋난다.
    monthlyPayment:
      Math.trunc(input.monthlyPrincipal) + Math.trunc(input.monthlyInterest),
    expectedPayoff: input.expectedPayoff?.trim() || undefined,
  }
  // 자산과 같은 이유로 기준일을 되돌린다 — §5.7
  const withBaseline = { ...value, reflectFrom: toDateString(Date.now()) }
  if (id) await financeDb.debts.update(id, withBaseline)
  else await financeDb.debts.add({ id: newId(), ...withBaseline })
}

export async function deleteDebt(id: string): Promise<void> {
  await financeDb.debts.delete(id)
}

export interface NetWorthBreakdown {
  assets: EffectiveAsset[]
  debts: EffectiveDebt[]
  totalAssets: number
  totalDebts: number
  netWorth: number
  /** 순자산에서 제외된 자산 합계 (보증금 등) — §5.8 */
  excludedAssets: number
  /** 종류별 합계 — 도넛 차트용. 제외 자산은 들어가지 않는다 */
  byKind: { kind: AssetKind; total: number }[]
}

export async function getNetWorthBreakdown(): Promise<NetWorthBreakdown> {
  const { assets, debts } = await loadBalances()
  const totals = computeNetWorth(assets, debts)

  // 차트는 순자산을 구성하는 자산만 보여 준다. 보증금이 섞이면
  // "내가 모으고 있는 자산 구성"을 읽을 수 없다.
  const kinds = new Map<AssetKind, number>()
  for (const asset of assets) {
    if (!countsInNetWorth(asset)) continue
    kinds.set(asset.kind, (kinds.get(asset.kind) ?? 0) + asset.balance)
  }

  return {
    assets,
    debts,
    ...totals,
    byKind: [...kinds.entries()]
      .map(([kind, total]) => ({ kind, total }))
      .sort((a, b) => b.total - a.total),
  }
}
