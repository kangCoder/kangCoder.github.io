import { computeNetWorth, countsInNetWorth } from '../lib/netWorth'
import { loadBalances } from './balances'
import { financeDb, newId } from './db'
import type { Goal } from './types'

/** 목표 쿼리 — 대시보드와 목표 상세가 쓴다 */

export async function getGoal(): Promise<Goal | undefined> {
  return (await financeDb.goals.toArray())[0]
}

export interface GoalInput {
  name: string
  /** "2029-03" */
  targetDate: string
  targetAmount: number
  note?: string
}

/** 목표는 하나만 쓴다. 없으면 만들고 있으면 고친다. */
export async function saveGoal(input: GoalInput): Promise<void> {
  const existing = await getGoal()
  const value = {
    name: input.name.trim(),
    targetDate: input.targetDate,
    targetAmount: Math.trunc(input.targetAmount),
    note: input.note?.trim() || undefined,
  }
  if (existing) await financeDb.goals.update(existing.id, value)
  else await financeDb.goals.add({ id: newId(), ...value })
}

/** 공식은 lib/netWorth.ts에만 있다 — §5.8 */
export async function getNetWorth(): Promise<number> {
  const { assets, debts } = await loadBalances()
  return computeNetWorth(assets, debts).netWorth
}

/**
 * 목표 시점에 현금화할 수 있는 자산만 — 시뮬레이터가 자기자금으로 본다(§5.5)
 *
 * 순자산 제외 자산(보증금)은 여기서도 뺀다. 집을 살 때 쓸 자기자금에
 * 지금 살고 있는 집의 보증금을 넣으면 두 번 쓰는 셈이 된다.
 */
export async function getLiquidAssets(): Promise<number> {
  const { assets } = await loadBalances()
  return assets
    .filter((asset) => asset.isLiquidByTarget && countsInNetWorth(asset))
    .reduce((sum, asset) => sum + asset.balance, 0)
}
