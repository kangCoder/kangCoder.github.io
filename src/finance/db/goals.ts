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

export async function getNetWorth(): Promise<number> {
  const [assets, debts] = await Promise.all([
    financeDb.assets.toArray(),
    financeDb.debts.toArray(),
  ])
  return (
    assets.reduce((sum, asset) => sum + asset.balance, 0) -
    debts.reduce((sum, debt) => sum + debt.balance, 0)
  )
}

/** 목표 시점에 현금화할 수 있는 자산만 — 시뮬레이터가 자기자금으로 본다(§5.5) */
export async function getLiquidAssets(): Promise<number> {
  const assets = await financeDb.assets.toArray()
  return assets
    .filter((asset) => asset.isLiquidByTarget)
    .reduce((sum, asset) => sum + asset.balance, 0)
}
