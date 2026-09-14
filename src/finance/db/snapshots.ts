import { shiftCycle } from '../lib/cycle'
import { financeDb } from './db'
import type { NetWorthSnapshot } from './types'

/**
 * 순자산 스냅샷 — spec-finance §5.4
 *
 * 사이클이 끝나는 순간 앱이 켜져 있으리라는 보장이 없으므로 진입 시 소급한다.
 * 기본키가 cycleKey라 중복 실행돼도 덮어쓸 뿐이다.
 */

export function listSnapshots(): Promise<NetWorthSnapshot[]> {
  return financeDb.netWorthSnapshots.orderBy('cycleKey').toArray()
}

/**
 * 직전 사이클 스냅샷을 남긴다.
 *
 * **하나만 소급한다.** 자산에는 현재 잔액만 있고 과거 잔액은 어디에도 없다.
 * 빠진 사이클을 전부 채우면 전부 같은 값이 되어, 그래프에 없던 이력을
 * 지어내는 꼴이 된다. 하나만 찍고 다음 사이클부터 정확해지게 둔다.
 */
export async function ensurePreviousSnapshot(
  currentCycleKey: string,
): Promise<boolean> {
  const previous = shiftCycle(currentCycleKey, -1)
  if (await financeDb.netWorthSnapshots.get(previous)) return false

  const [assets, debts] = await Promise.all([
    financeDb.assets.toArray(),
    financeDb.debts.toArray(),
  ])
  // 자산도 부채도 없으면 찍을 의미가 없다
  if (assets.length === 0 && debts.length === 0) return false

  const totalAssets = assets.reduce((sum, asset) => sum + asset.balance, 0)
  const totalDebts = debts.reduce((sum, debt) => sum + debt.balance, 0)

  await financeDb.netWorthSnapshots.put({
    cycleKey: previous,
    totalAssets,
    totalDebts,
    netWorth: totalAssets - totalDebts,
    capturedAt: Date.now(),
  })
  return true
}

/**
 * 순자산을 특정 사이클에 기록한다.
 *
 * 사이클이 끝나는 날에 맞춰 자산을 갱신하기 어렵다. 며칠 지나 입력하더라도
 * 어느 시점 기준인지(asOf) 남겨 두면 추이 그래프를 읽을 때 근거가 된다.
 */
export async function captureSnapshot(
  cycleKey: string,
  asOf?: string,
): Promise<void> {
  const [assets, debts] = await Promise.all([
    financeDb.assets.toArray(),
    financeDb.debts.toArray(),
  ])
  const totalAssets = assets.reduce((sum, asset) => sum + asset.balance, 0)
  const totalDebts = debts.reduce((sum, debt) => sum + debt.balance, 0)
  await financeDb.netWorthSnapshots.put({
    cycleKey,
    totalAssets,
    totalDebts,
    netWorth: totalAssets - totalDebts,
    capturedAt: Date.now(),
    asOf,
  })
}

export async function deleteSnapshot(cycleKey: string): Promise<void> {
  await financeDb.netWorthSnapshots.delete(cycleKey)
}
