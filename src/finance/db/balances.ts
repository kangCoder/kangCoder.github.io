import { financeDb } from './db'
import type { Asset, Debt } from './types'

/**
 * 거래를 반영한 실효 잔액 — spec-finance-v0.13 §5.7
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
 * `balance`는 **`reflectFrom` 날짜 0시 기준**의 값이고, 그 날짜부터의 거래를
 * 더한다(이상 비교). 잔액을 직접 입력하면 기준일이 그날로 갱신되므로 이미
 * 반영된 금액을 두 번 세지 않는다. 투자처럼 시세로 직접 갱신하는 자산은
 * 입력할 때마다 기준이 리셋되고, 예적금은 거래가 쌓이는 대로 저절로 올라간다.
 *
 * **처음엔 초과 비교(`>`)였다. 틀렸다.** 마이그레이션이 기준일을 오늘로
 * 박으므로, 카테고리를 연결하고 그날 거래를 넣으면 아무것도 반영되지 않았다.
 * 기능이 고장 난 것처럼 보이고, 도입 첫날 모든 사용자가 겪는다.
 *
 * 이상 비교의 대가는 좁다 — 은행 앱에서 본 잔액(오늘 거래가 이미 포함된
 * 금액)을 그대로 적으면 그날 거래가 두 번 센다. 그때는 기준일을 다음 날로
 * 두거나 오늘 거래 전 금액을 적으면 된다. 폼에 반영액이 보이므로 확인할 수 있다.
 *
 * 흔한 경우가 조용히 안 되는 것보다 드문 경우를 설명으로 다루는 쪽이 낫다.
 *
 * ### 연결 경로
 *
 * | 경로 | 대상 |
 * |---|---|
 * | `Category.assetId` / `debtId` | 직접 입력한 거래 |
 * | `FixedCost.linkedAssetId` / `linkedDebtId` | 고정비에서 생성된 거래 |
 * | **현금 자산 자동 연결** | 모든 거래의 반대편 (§5.9) |
 * | `appliedDeductions` | 급여에서 원천 공제된 부채 상환 (§5.9) |
 *
 * 고정비 경로가 카테고리보다 우선한다. 고정비에 연결을 지정했다면 그쪽이
 * 더 구체적인 의사표시다.
 *
 * ### 현금 자동 연결 (§5.9)
 *
 * 돈은 어딘가에서 나와 어딘가로 간다. 저축을 입력하면 적금이 오르는데
 * 현금이 그대로면 순자산이 저축액만큼 부풀어 오른다. 그래서 현금을
 * **모든 거래의 반대편**으로 자동 연결한다 — 수입은 더하고, 지출·저축·이체는 뺀다.
 *
 * 대상은 `kind === 'CASH'` 자산이 **정확히 하나**일 때 그 자산이다.
 * 설정 없이 동작해야 하므로 종류로 판단하고, 0개나 2개 이상이면 작동하지
 * 않는다 — 어느 쪽에 넣을지 추측하면 틀렸을 때 알아차릴 수 없다.
 *
 * 현금 자산은 카테고리 명시 연결 대상에서 **제외한다**. 자동과 명시가 겹치면
 * 같은 거래를 두 번 세고, 명시 연결은 부호가 항상 +라서 지출에서 반대로 움직인다.
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

/**
 * 자동 연결 대상 현금 자산. 정확히 하나일 때만 — §5.9
 *
 * 둘 이상이면 어느 쪽에서 돈이 나갔는지 알 수 없다. 추측해서 한쪽에
 * 넣으면 틀렸을 때 숫자만 어긋나고 원인을 짚을 수 없다.
 */
export function pickCashAsset<T extends { kind: string }>(
  assets: T[],
): T | undefined {
  const candidates = assets.filter((asset) => asset.kind === 'CASH')
  return candidates.length === 1 ? candidates[0] : undefined
}

export async function loadBalances(): Promise<Balances> {
  const [assets, debts, categories, fixedCosts, deductions] = await Promise.all(
    [
      financeDb.assets.orderBy('kind').toArray(),
      financeDb.debts.toArray(),
      financeDb.categories.toArray(),
      financeDb.fixedCosts.toArray(),
      financeDb.appliedDeductions.toArray(),
    ],
  )

  const assetFrom = new Map(assets.map((a) => [a.id, a.reflectFrom]))
  const debtFrom = new Map(debts.map((d) => [d.id, d.reflectFrom]))
  const cash = pickCashAsset(assets)

  const assetByCategory = new Map<string, string>()
  const debtByCategory = new Map<string, string>()
  for (const category of categories) {
    // 현금 자산은 자동 연결이 담당한다 — 명시 연결과 겹치면 두 번 센다
    if (category.assetId && category.assetId !== cash?.id) {
      assetByCategory.set(category.id, category.assetId)
    }
    if (category.debtId) debtByCategory.set(category.id, category.debtId)
  }
  const assetByFixedCost = new Map<string, string>()
  const debtByFixedCost = new Map<string, string>()
  for (const cost of fixedCosts) {
    if (cost.linkedAssetId && cost.linkedAssetId !== cash?.id) {
      assetByFixedCost.set(cost.id, cost.linkedAssetId)
    }
    if (cost.linkedDebtId) debtByFixedCost.set(cost.id, cost.linkedDebtId)
  }

  const linked =
    assetByCategory.size +
    debtByCategory.size +
    assetByFixedCost.size +
    debtByFixedCost.size

  // 연결도 없고 현금 자산도 없고 공제 기록도 없으면 거래를 읽을 이유가 없다
  if (linked === 0 && cash === undefined && deductions.length === 0) {
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
  // aboveOrEqual — above()는 초과라 가장 이른 기준일 당일 거래가 빠진다
  const earliest = known.sort()[0]
  const transactions = await financeDb.transactions
    .where('date')
    .aboveOrEqual(earliest)
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
      if (from !== undefined && tx.date >= from) {
        assetReflected.set(assetId, (assetReflected.get(assetId) ?? 0) + tx.amount)
      }
    }

    const debtId =
      (tx.fixedCostId ? debtByFixedCost.get(tx.fixedCostId) : undefined) ??
      debtByCategory.get(tx.categoryId)
    if (debtId !== undefined) {
      const from = debtFrom.get(debtId)
      if (from !== undefined && tx.date >= from) {
        debtReflected.set(debtId, (debtReflected.get(debtId) ?? 0) + tx.amount)
      }
    }

    /**
     * 현금 자동 반대편 — §5.9
     *
     * 수입은 들어오고 그 밖은 나간다. 저축·투자도 나가는 쪽이다 —
     * 현금에서 빠져 그 자산으로 옮겨가는 것이므로, 양쪽을 다 움직여야
     * 순자산이 저축액만큼 부풀지 않는다.
     */
    if (cash !== undefined) {
      const from = assetFrom.get(cash.id)
      if (from !== undefined && tx.date >= from) {
        const delta = tx.type === 'INCOME' ? tx.amount : -tx.amount
        assetReflected.set(
          cash.id,
          (assetReflected.get(cash.id) ?? 0) + delta,
        )
      }
    }
  }

  /**
   * 원천 공제로 갚은 부채 — §5.9
   *
   * 급여에서 바로 빠지므로 Transaction이 없다(§2.3.1 이중 계산 방지).
   * 그래서 `appliedDeductions`를 거래와 같은 방식으로 합산한다.
   *
   * 현금은 건드리지 않는다 — 그 돈은 애초에 현금에 들어오지 않았고,
   * 급여 거래 금액이 실수령액이므로 이미 빠진 상태다.
   */
  for (const row of deductions) {
    // 날짜가 없는 행은 v0.12 이전에 잔액을 직접 줄여 적용된 것이다
    if (row.date === undefined) continue
    const from = debtFrom.get(row.debtId)
    if (from !== undefined && row.date >= from) {
      debtReflected.set(
        row.debtId,
        (debtReflected.get(row.debtId) ?? 0) + row.amount,
      )
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
