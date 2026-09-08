import { financeDb, newId } from './db'
import type { Asset, AssetKind, Debt } from './types'

/** 자산·부채 쿼리 — spec-finance §5.4 */

export function listAssets(): Promise<Asset[]> {
  return financeDb.assets.orderBy('kind').toArray()
}

export function listDebts(): Promise<Debt[]> {
  return financeDb.debts.toArray()
}

export interface AssetInput {
  name: string
  kind: AssetKind
  balance: number
  principal?: number
  isLiquidByTarget: boolean
  note?: string
}

export async function saveAsset(
  input: AssetInput,
  id?: string,
): Promise<void> {
  const value = {
    ...input,
    name: input.name.trim(),
    balance: Math.trunc(input.balance),
    note: input.note?.trim() || undefined,
    // 잔액을 언제 갱신했는지가 신뢰도를 좌우한다
    updatedAt: Date.now(),
  }
  if (id) await financeDb.assets.update(id, value)
  else await financeDb.assets.add({ id: newId(), ...value })
}

export async function deleteAsset(id: string): Promise<void> {
  await financeDb.assets.delete(id)
}

export interface DebtInput {
  name: string
  balance: number
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
  if (id) await financeDb.debts.update(id, value)
  else await financeDb.debts.add({ id: newId(), ...value })
}

export async function deleteDebt(id: string): Promise<void> {
  await financeDb.debts.delete(id)
}

export interface NetWorthBreakdown {
  assets: Asset[]
  debts: Debt[]
  totalAssets: number
  totalDebts: number
  netWorth: number
  /** 종류별 합계 — 도넛 차트용 */
  byKind: { kind: AssetKind; total: number }[]
}

export async function getNetWorthBreakdown(): Promise<NetWorthBreakdown> {
  const [assets, debts] = await Promise.all([listAssets(), listDebts()])
  const totalAssets = assets.reduce((sum, asset) => sum + asset.balance, 0)
  const totalDebts = debts.reduce((sum, debt) => sum + debt.balance, 0)

  const kinds = new Map<AssetKind, number>()
  for (const asset of assets) {
    kinds.set(asset.kind, (kinds.get(asset.kind) ?? 0) + asset.balance)
  }

  return {
    assets,
    debts,
    totalAssets,
    totalDebts,
    netWorth: totalAssets - totalDebts,
    byKind: [...kinds.entries()]
      .map(([kind, total]) => ({ kind, total }))
      .sort((a, b) => b.total - a.total),
  }
}
