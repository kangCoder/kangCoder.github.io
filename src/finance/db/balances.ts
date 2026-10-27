import { financeDb } from './db'
import type { Asset, Debt } from './types'

/**
 * 거래를 반영한 실효 잔액 — spec-finance-v0.12 §5.7
 *
 * **잔액을 읽는 곳은 전부 이 함수를 지난다.** 저장된 `balance`를 직접 읽으면
 * 거래 반영분이 빠진 숫자가 나온다.
 *
 * ### 왜 증분이 아니라 매번 다시 계산하는가
 *
 * 거래를 저장할 때 잔액에 더하는 방식(고정비가 쓰던 방식)은 짧지만,
 * 거래를 고치거나 지우면 잔액이 실제와 틀어진다. 날짜가 지나면 어디서
 * 틀어졌는지 찾을 방법도 없다. 다시 계산하면 수정·삭제가 자동으로 맞는다.
 *
 * ### 기준일(reflectFrom)
 *
 * `balance`는 `reflectFrom` 날짜 기준의 값이고, **그 날짜보다 뒤의** 거래만
 * 더한다. 잔액을 직접 입력하면 기준일이 그날로 갱신되므로 이미 반영된
 * 금액을 두 번 세지 않는다. 투자처럼 시세로 직접 갱신하는 자산은 입력할
 * 때마다 기준이 리셋되고, 예적금은 거래가 쌓이는 대로 저절로 올라간다.
 *
 * 같은 날짜의 거래는 더하지 않는다(초과 비교). 잔액을 맞춘 그 날의 거래는
 * 이미 그 숫자에 들어 있다고 보는 것이 자연스럽다.
 *
 * ### 연결 경로 두 가지
 *
 * - `Category.assetId` / `debtId` — 직접 입력한 거래
 * - `FixedCost.linkedAssetId` / `linkedDebtId` — 고정비에서 생성된 거래
 *
 * 고정비 경로가 카테고리보다 우선한다. 고정비에 연결을 지정했다면 그쪽이
 * 더 구체적인 의사표시다.
 *
 * 원천 차감(`appliedDeductions`)은 Transaction을 만들지 않으므로 여기서
 * 다루지 않는다. 그쪽은 적용 시점에 잔액을 직접 줄인다(§2.3.1).
 */

export interface EffectiveAsset extends Asset {
  /** 기준일 이후 거래로 더해진 금액 */
  reflected: number
}

export interface EffectiveDebt extends Debt {
  /** 기준일 이후 거래로 갚은 금액 */
  reflected: number
}

export interface Balances {
  assets: EffectiveAsset[]
  debts: EffectiveDebt[]
}

export async function loadBalances(): Promise<Balances> {
  const [assets, debts, categories, fixedCosts] = await Promise.all([
    financeDb.assets.orderBy('kind').toArray(),
    financeDb.debts.toArray(),
    financeDb.categories.toArray(),
    financeDb.fixedCosts.toArray(),
  ])

  const assetFrom = new Map(assets.map((a) => [a.id, a.reflectFrom]))
  const debtFrom = new Map(debts.map((d) => [d.id, d.reflectFrom]))

  // 연결이 하나도 없으면 거래를 읽을 이유가 없다
  const assetByCategory = new Map<string, string>()
  const debtByCategory = new Map<string, string>()
  for (const category of categories) {
    if (category.assetId) assetByCategory.set(category.id, category.assetId)
    if (category.debtId) debtByCategory.set(category.id, category.debtId)
  }
  const assetByFixedCost = new Map<string, string>()
  const debtByFixedCost = new Map<string, string>()
  for (const cost of fixedCosts) {
    if (cost.linkedAssetId) assetByFixedCost.set(cost.id, cost.linkedAssetId)
    if (cost.linkedDebtId) debtByFixedCost.set(cost.id, cost.linkedDebtId)
  }

  const linked =
    assetByCategory.size + debtByCategory.size + assetByFixedCost.size + debtByFixedCost.size
  if (linked === 0) {
    return {
      assets: assets.map((asset) => ({ ...asset, reflected: 0 })),
      debts: debts.map((debt) => ({ ...debt, reflected: 0 })),
    }
  }

  /**
   * 가장 이른 기준일 이후만 읽는다 — `date` 인덱스를 쓰므로 전체를 훑지 않는다.
   *
   * **기준일이 없는 항목은 아예 반영하지 않는다.** 전에는 undefined를
   * "전부 더하기"로 읽었는데, 그러면 옛 백업을 복원하거나 구버전 기기가
   * 올린 스냅샷을 받았을 때 몇 년치 저축이 잔액에 한꺼번에 더해진다.
   * 오류 없이 숫자만 부풀어 알아차리기 어렵다. 기준이 없으면 반영하지
   * 않는 쪽이 안전하고, v0.11까지의 동작과 같다.
   */
  const known = [...assetFrom.values(), ...debtFrom.values()].filter(
    (value): value is string => value !== undefined,
  )
  if (known.length === 0) {
    return {
      assets: assets.map((asset) => ({ ...asset, reflected: 0 })),
      debts: debts.map((debt) => ({ ...debt, reflected: 0 })),
    }
  }
  const earliest = known.sort()[0]
  const transactions = await financeDb.transactions
    .where('date')
    .above(earliest)
    .toArray()

  const assetReflected = new Map<string, number>()
  const debtReflected = new Map<string, number>()

  for (const tx of transactions) {
    const assetId =
      (tx.fixedCostId ? assetByFixedCost.get(tx.fixedCostId) : undefined) ??
      assetByCategory.get(tx.categoryId)
    if (assetId !== undefined) {
      const from = assetFrom.get(assetId)
      // 기준일이 없으면 반영하지 않는다 (위 주석 참조)
      if (from !== undefined && tx.date > from) {
        assetReflected.set(assetId, (assetReflected.get(assetId) ?? 0) + tx.amount)
      }
    }

    const debtId =
      (tx.fixedCostId ? debtByFixedCost.get(tx.fixedCostId) : undefined) ??
      debtByCategory.get(tx.categoryId)
    if (debtId !== undefined) {
      const from = debtFrom.get(debtId)
      if (from !== undefined && tx.date > from) {
        debtReflected.set(debtId, (debtReflected.get(debtId) ?? 0) + tx.amount)
      }
    }
  }

  return {
    assets: assets.map((asset) => {
      const reflected = assetReflected.get(asset.id) ?? 0
      return { ...asset, reflected, balance: asset.balance + reflected }
    }),
    debts: debts.map((debt) => {
      const reflected = debtReflected.get(debt.id) ?? 0
      // 0 아래로는 내려가지 않는다 — 다 갚은 뒤의 추가 거래가 음수 잔액을
      // 만들면 순자산이 부풀어 보인다
      return { ...debt, reflected, balance: Math.max(0, debt.balance - reflected) }
    }),
  }
}
