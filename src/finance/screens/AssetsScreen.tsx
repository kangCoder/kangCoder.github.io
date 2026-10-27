import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Sheet } from '../../components/Sheet'
import { Label, TextArea, TextField } from '../../components/fields'
import { AmountField } from '../components/AmountField'
import {
  ASSET_KINDS,
  ASSET_KIND_COLOR,
  ASSET_KIND_LABEL,
} from '../components/assetMeta'
import {
  deleteAsset,
  deleteDebt,
  getNetWorthBreakdown,
  saveAsset,
  saveDebt,
} from '../db/assets'
import type { EffectiveAsset, EffectiveDebt } from '../db/balances'
import { DEFAULT_PAYDAY, getIncomeSetting } from '../db/income'
import { captureSnapshot, listSnapshots } from '../db/snapshots'
import type { AssetKind } from '../db/types'
import { getCycleKey, todayKey } from '../lib/cycle'
import { formatWon } from '../lib/money'
import {
  countsInNetWorth,
  hiddenFromChart,
  repaidPrincipal,
} from '../lib/netWorth'

/** 자산 현황 — §5.4 */
export function AssetsScreen() {
  const data = useLiveQuery(() => getNetWorthBreakdown(), [])
  const snapshots = useLiveQuery(() => listSnapshots(), [])
  const [editingAsset, setEditingAsset] = useState<EffectiveAsset | null>()
  const [editingDebt, setEditingDebt] = useState<EffectiveDebt | null>()
  const [recording, setRecording] = useState(false)
  const payday = useLiveQuery(
    async () => (await getIncomeSetting())?.payday ?? DEFAULT_PAYDAY,
    [],
    DEFAULT_PAYDAY,
  )

  if (data === undefined) return null

  const trend = (snapshots ?? []).map((snapshot) => ({
    cycle: snapshot.cycleKey.slice(2),
    netWorth: snapshot.netWorth,
  }))

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 bg-zinc-100/90 px-4 pt-2 pb-2 backdrop-blur">
        <h1 className="text-[22px] font-bold text-zinc-900">자산</h1>
        <p className="text-[13px] tabular-nums text-zinc-500">
          순자산 {formatWon(data.netWorth)}원
        </p>
      </header>

      <section className="px-4 pb-3">
        <div className="flex gap-2">
          <Stat label="자산" value={formatWon(data.totalAssets)} />
          <Stat label="부채" value={formatWon(data.totalDebts)} danger />
        </div>
        {data.repaidPrincipal > 0 && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">
            자산에 <b className="tabular-nums">{formatWon(data.repaidPrincipal)}원</b>의
            상환 지분이 포함돼 있습니다 — 자산으로 등록하지 않은 대상에 갚아
            만든 내 몫입니다(부채 설정의 '상환금액 순자산에 포함').
          </p>
        )}
      </section>

      {/*
        현금 자동 연결 상태 — spec-finance-v0.15 §5.9
        작동하지 않을 때 **왜**를 알려 주지 않으면 "왜 현금이 안 변하지"로
        끝난다. 조건이 종류와 개수라 화면에서 바로 고칠 수 있다.
      */}
      <CashNotice assets={data.assets} />

      {data.slices.length > 0 && (
        <section className="px-4 pb-4">
          <h2 className="mb-2 text-[13px] font-medium text-zinc-500">
            자산 구성
          </h2>
          <div className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.slices}
                    dataKey="total"
                    nameKey="label"
                    innerRadius="55%"
                    outerRadius="85%"
                    strokeWidth={0}
                  >
                    {data.slices.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => `${formatWon(Number(value) || 0)}원`}
                    labelFormatter={() => ''}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-1 flex flex-col gap-1">
              {data.slices.map((entry) => (
                <li
                  key={entry.key}
                  className="flex items-center gap-2 text-[13px]"
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: entry.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-zinc-600">
                    {entry.label}
                  </span>
                  <span className="tabular-nums text-zinc-900">
                    {formatWon(entry.total)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {trend.length >= 2 && (
        <section className="px-4 pb-4">
          <h2 className="mb-2 text-[13px] font-medium text-zinc-500">
            순자산 추이
          </h2>
          <div className="h-40 rounded-xl bg-white p-3 pr-4 ring-1 ring-zinc-200">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid stroke="#f4f4f5" vertical={false} />
                <XAxis
                  dataKey="cycle"
                  tick={{ fontSize: 11, fill: '#a1a1aa' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#a1a1aa' }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  tickFormatter={(value: number) =>
                    `${Math.round(value / 10000).toLocaleString('ko-KR')}만`
                  }
                />
                <Tooltip
                  formatter={(value) => `${formatWon(Number(value) || 0)}원`}
                />
                <Line
                  type="monotone"
                  dataKey="netWorth"
                  stroke="#18181b"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {trend.length < 2 && (
        <section className="px-4 pb-2">
          <p className="rounded-xl bg-white px-3 py-4 text-center text-[12px] text-zinc-400 ring-1 ring-zinc-200">
            순자산 추이는 기록이 쌓일수록 이어집니다.
            {trend.length === 1 && ' (현재 1개)'}
          </p>
        </section>
      )}

      {/* 사이클이 끝나는 날에 맞춰 갱신하기 어려우므로 기준일을 직접 고른다 */}
      <section className="px-4 pb-4">
        <Button className="w-full" onClick={() => setRecording(true)}>
          현재 순자산 기록하기
        </Button>
      </section>

      <section className="px-4 pb-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-medium text-zinc-500">자산</h2>
          <Button onClick={() => setEditingAsset(null)}>+ 추가</Button>
        </div>
        <ul className="flex flex-col gap-1.5">
          {data.assets.map((asset) => (
            <li key={asset.id}>
              <button
                type="button"
                onClick={() => setEditingAsset(asset)}
                className="flex w-full items-center gap-2 rounded-xl bg-white p-3 text-left ring-1 ring-zinc-200 active:bg-zinc-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[15px] font-medium text-zinc-900">
                      {asset.name}
                    </span>
                    <span
                      className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-white"
                      style={{ background: ASSET_KIND_COLOR[asset.kind] }}
                    >
                      {ASSET_KIND_LABEL[asset.kind]}
                    </span>
                    {!asset.isLiquidByTarget && (
                      <span className="shrink-0 text-[11px] text-zinc-400">
                        묶임
                      </span>
                    )}
                    {!countsInNetWorth(asset) && (
                      <span className="shrink-0 text-[11px] text-amber-600">
                        순자산 제외
                      </span>
                    )}
                    {hiddenFromChart(asset) && (
                      <span className="shrink-0 text-[11px] text-zinc-400">
                        그래프 숨김
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] tabular-nums text-zinc-400">
                    {asset.reflectFrom ?? toDateInput(asset.updatedAt)} 기준
                    {asset.reflected !== 0 &&
                      ` · 거래 +${formatWon(asset.reflected)}`}
                    {asset.note && ` · ${asset.note}`}
                  </p>
                </div>
                <span className="shrink-0 text-[15px] font-semibold tabular-nums text-zinc-900">
                  {formatWon(asset.balance)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="px-4 pb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-medium text-zinc-500">부채</h2>
          <Button onClick={() => setEditingDebt(null)}>+ 추가</Button>
        </div>
        <ul className="flex flex-col gap-1.5">
          {data.debts.map((debt) => (
            <li key={debt.id}>
              <button
                type="button"
                onClick={() => setEditingDebt(debt)}
                className="flex w-full items-center gap-2 rounded-xl bg-white p-3 text-left ring-1 ring-zinc-200 active:bg-zinc-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[15px] font-medium text-zinc-900">
                      {debt.name}
                    </span>
                    {!debt.countsInDTI && (
                      <span className="shrink-0 text-[11px] text-zinc-400">
                        DTI 제외
                      </span>
                    )}
                    {debt.repaidCountsInNetWorth && (
                      <span className="shrink-0 text-[11px] text-emerald-600">
                        상환 순자산 포함
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] tabular-nums text-zinc-500">
                    월 원금 {formatWon(debt.monthlyPrincipal)} · 이자{' '}
                    {formatWon(debt.monthlyInterest)}
                    {debt.expectedPayoff && ` · ${debt.expectedPayoff} 완납`}
                  </p>
                  {repaidPrincipal(debt) > 0 && (
                    <p className="text-[11px] tabular-nums text-emerald-600">
                      갚은 원금 {formatWon(repaidPrincipal(debt))} 순자산 반영
                    </p>
                  )}
                  {debt.reflected !== 0 && (
                    <p className="text-[11px] tabular-nums text-zinc-400">
                      기준일부터 상환 {formatWon(debt.reflected)}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-[15px] font-semibold tabular-nums text-red-600">
                  {formatWon(debt.balance)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {recording && (
        <RecordSnapshotSheet
          netWorth={data.netWorth}
          payday={payday}
          onClose={() => setRecording(false)}
        />
      )}

      {editingAsset !== undefined && (
        <AssetSheet
          asset={editingAsset ?? undefined}
          onClose={() => setEditingAsset(undefined)}
        />
      )}
      {editingDebt !== undefined && (
        <DebtSheet
          debt={editingDebt ?? undefined}
          onClose={() => setEditingDebt(undefined)}
        />
      )}
    </div>
  )
}

function AssetSheet({
  asset,
  onClose,
}: {
  asset?: EffectiveAsset
  onClose: () => void
}) {
  const [name, setName] = useState(asset?.name ?? '')
  const [kind, setKind] = useState<AssetKind>(asset?.kind ?? 'SAVINGS')
  const [balance, setBalance] = useState<number | undefined>(asset?.balance)
  const [liquid, setLiquid] = useState(asset?.isLiquidByTarget ?? true)
  const [counts, setCounts] = useState(
    asset ? countsInNetWorth(asset) : true,
  )
  const [hideChart, setHideChart] = useState(
    asset ? hiddenFromChart(asset) : false,
  )
  const [note, setNote] = useState(asset?.note ?? '')
  /**
   * 편집할 때도 **오늘**이 기본이다 — spec-finance-v0.15 §5.7
   *
   * 폼에 채워진 잔액은 거래 반영분이 이미 더해진 현재 값이다. 기준일을 옛
   * 날짜로 남기고 저장하면 그 날짜 이후의 거래가 같은 금액 위에 또 더해진다.
   * 과거 시점의 잔액을 적는 경우에만 날짜를 되돌린다.
   */
  const [asOf, setAsOf] = useState(() => todayKey())
  const [error, setError] = useState<string>()
  const [confirming, setConfirming] = useState(false)

  async function save() {
    if (!name.trim()) {
      setError('이름을 입력하세요')
      return
    }
    await saveAsset(
      {
        name,
        kind,
        balance: balance ?? 0,
        isLiquidByTarget: liquid,
        countsInNetWorth: counts,
        hideFromChart: hideChart,
        note,
        updatedAt: fromDateInput(asOf),
      },
      asset?.id,
    )
    onClose()
  }

  return (
    <>
      <Sheet
        title={asset ? '자산 편집' : '자산 추가'}
        onClose={onClose}
        footer={
          <Button variant="primary" className="w-full" onClick={save}>
            저장
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <TextField
            label="이름"
            value={name}
            onChange={(value) => {
              setName(value)
              setError(undefined)
            }}
            placeholder="예: 적금"
            autoFocus={!asset}
            error={error}
          />
          <div>
            <Label>종류</Label>
            <div className="flex flex-wrap gap-1.5">
              {ASSET_KINDS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setKind(option)}
                  className={`min-h-11 rounded-xl px-3 text-[14px] font-medium ring-1 ${
                    kind === option
                      ? 'bg-zinc-900 text-white ring-zinc-900'
                      : 'bg-white text-zinc-600 ring-zinc-300'
                  }`}
                >
                  {ASSET_KIND_LABEL[option]}
                </button>
              ))}
            </div>
          </div>
          <AmountField label="잔액" value={balance} onChange={setBalance} />
          {asset && asset.reflected !== 0 && (
            <p className="rounded-xl bg-zinc-50 p-3 text-[12px] leading-relaxed text-zinc-500 ring-1 ring-zinc-200">
              위 잔액에는 기준일부터의 거래{' '}
              <b className="tabular-nums">{formatWon(asset.reflected)}원</b>이
              이미 더해져 있습니다. 그대로 저장하면 오늘이 새 기준일이 됩니다.
            </p>
          )}
          <div>
            <Label hint="이 날 0시 기준 금액. 이 날짜부터의 연결된 거래가 더해진다">
              기준일
            </Label>
            <input
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
              className="min-h-11 w-full rounded-xl bg-white px-3 text-[16px] text-zinc-900 ring-1 ring-zinc-300 outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>
          <label className="flex min-h-11 items-center gap-2 text-[14px] text-zinc-700">
            <input
              type="checkbox"
              className="size-4 accent-zinc-900"
              checked={liquid}
              onChange={(e) => setLiquid(e.target.checked)}
            />
            목표 시점에 현금화 가능
          </label>
          <label className="flex min-h-11 items-center gap-2 text-[14px] text-zinc-700">
            <input
              type="checkbox"
              className="size-4 accent-zinc-900"
              checked={counts}
              onChange={(e) => setCounts(e.target.checked)}
            />
            순자산에 포함
          </label>
          <p className="-mt-2 text-[11px] leading-relaxed text-zinc-400">
            <b>돌려받는 돈이면 켜 두세요.</b> 보증금도 켜는 것이 맞습니다 —
            끄면 그걸 사려고 빌린 대출만 남아 순자산이 대출액만큼 음수가
            됩니다. 부채와 짝을 이뤄 지분만 남고, 원금을 갚으면 그만큼
            올라갑니다. 끄는 쓰임은 <b>돌려받지 않는</b> 금액뿐입니다.
          </p>
          <label className="flex min-h-11 items-center gap-2 text-[14px] text-zinc-700">
            <input
              type="checkbox"
              className="size-4 accent-zinc-900"
              checked={hideChart}
              onChange={(e) => setHideChart(e.target.checked)}
            />
            자산 구성 그래프에서 숨기기
          </label>
          <p className="-mt-2 text-[11px] leading-relaxed text-zinc-400">
            순자산 포함과 <b>별개</b>입니다. 보증금이 그래프에 크게 깔리면
            적금·투자 비중이 보이지 않으니 숨기되, 순자산에는 남겨 두는 것이
            맞습니다.
          </p>
          <TextArea label="메모" value={note} onChange={setNote} rows={2} />
          {asset && (
            <div className="mt-2 border-t border-zinc-200 pt-4">
              <Button
                variant="danger"
                className="w-full"
                onClick={() => setConfirming(true)}
              >
                삭제
              </Button>
            </div>
          )}
        </div>
      </Sheet>

      {confirming && asset && (
        <ConfirmDialog
          title={`'${asset.name}'을 삭제할까요?`}
          description="순자산에서 즉시 빠집니다."
          onConfirm={async () => {
            await deleteAsset(asset.id)
            onClose()
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  )
}

/**
 * 현금 자동 연결 안내 — §5.9
 *
 * 종류가 '현금'인 자산이 정확히 하나일 때만 자동 연결이 작동한다.
 * 0개면 켤 방법을, 2개 이상이면 왜 꺼졌는지 알려 준다.
 */
function CashNotice({ assets }: { assets: EffectiveAsset[] }) {
  const cashAssets = assets.filter((asset) => asset.kind === 'CASH')
  if (cashAssets.length === 1) {
    const cash = cashAssets[0]
    return (
      <section className="px-4 pb-3">
        <p className="rounded-xl bg-zinc-50 p-3 text-[12px] leading-relaxed text-zinc-500 ring-1 ring-zinc-200">
          <b className="text-zinc-700">{cash.name}</b>이 모든 거래의 반대편으로
          자동 반영됩니다 — 수입은 더하고 지출·저축·이체는 뺍니다.
          {cash.reflected !== 0 && (
            <>
              {' '}
              기준일({cash.reflectFrom ?? '?'})부터{' '}
              <b className="tabular-nums text-zinc-700">
                {formatWon(cash.reflected)}원
              </b>{' '}
              반영됨.
            </>
          )}
        </p>
      </section>
    )
  }

  return (
    <section className="px-4 pb-3">
      <p className="rounded-xl bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-800 ring-1 ring-amber-200">
        {cashAssets.length === 0 ? (
          <>
            종류가 <b>현금</b>인 자산이 없어 거래가 현금에 반영되지 않습니다.
            현금(통장 잔액) 자산을 하나 추가하면 수입·지출이 자동으로
            반영됩니다.
          </>
        ) : (
          <>
            종류가 <b>현금</b>인 자산이 {cashAssets.length}개라 자동 반영이
            꺼져 있습니다. 어느 쪽에서 돈이 나갔는지 알 수 없어 추측하지
            않습니다. 하나만 '현금'으로 두고 나머지는 다른 종류로 바꾸세요.
          </>
        )}
      </p>
    </section>
  )
}

function DebtSheet({
  debt,
  onClose,
}: {
  debt?: EffectiveDebt
  onClose: () => void
}) {
  const [name, setName] = useState(debt?.name ?? '')
  const [balance, setBalance] = useState<number | undefined>(debt?.balance)
  const [principal, setPrincipal] = useState<number | undefined>(
    debt?.monthlyPrincipal,
  )
  const [interest, setInterest] = useState<number | undefined>(
    debt?.monthlyInterest,
  )
  const [rate, setRate] = useState(
    debt?.interestRate !== undefined ? String(debt.interestRate) : '',
  )
  const [payoff, setPayoff] = useState(debt?.expectedPayoff ?? '')
  const [dti, setDti] = useState(debt?.countsInDTI ?? true)
  /**
   * 처음 빌린 금액 — §5.10
   *
   * 타입에는 있었지만 폼에 칸이 없어 아무도 넣을 수 없었다. 갚은 원금은
   * `원금 − 잔액`이라 이 값이 없으면 계산이 되지 않는다.
   */
  const [original, setOriginal] = useState<number | undefined>(
    debt?.originalAmount,
  )
  const [repaidCounts, setRepaidCounts] = useState(
    debt?.repaidCountsInNetWorth ?? false,
  )
  const [error, setError] = useState<string>()
  const [confirming, setConfirming] = useState(false)

  async function save() {
    if (!name.trim()) {
      setError('이름을 입력하세요')
      return
    }
    const parsedRate = rate.trim() === '' ? undefined : Number(rate)
    await saveDebt(
      {
        name,
        balance: balance ?? 0,
        interestRate: Number.isFinite(parsedRate) ? parsedRate : undefined,
        monthlyPrincipal: principal ?? 0,
        monthlyInterest: interest ?? 0,
        expectedPayoff: payoff,
        countsInDTI: dti,
        originalAmount: original,
        repaidCountsInNetWorth: repaidCounts,
      },
      debt?.id,
    )
    onClose()
  }

  return (
    <>
      <Sheet
        title={debt ? '부채 편집' : '부채 추가'}
        onClose={onClose}
        footer={
          <Button variant="primary" className="w-full" onClick={save}>
            저장
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <TextField
            label="이름"
            value={name}
            onChange={(value) => {
              setName(value)
              setError(undefined)
            }}
            placeholder="예: 주택담보대출"
            autoFocus={!debt}
            error={error}
          />
          <AmountField label="잔액" value={balance} onChange={setBalance} />
          {debt && debt.reflected !== 0 && (
            <p className="rounded-xl bg-zinc-50 p-3 text-[12px] leading-relaxed text-zinc-500 ring-1 ring-zinc-200">
              위 잔액은 기준일부터의 상환 거래{' '}
              <b className="tabular-nums">{formatWon(debt.reflected)}원</b>이
              이미 빠진 금액입니다. 그대로 저장하면 오늘이 새 기준일이 됩니다.
            </p>
          )}
          <div>
            <AmountField
              label="처음 빌린 금액"
              value={original}
              onChange={setOriginal}
            />
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
              학자금처럼 모르면 비워도 됩니다. 아래 '상환금액 순자산에 포함'을
              쓰려면 필요합니다 — 갚은 금액을 '이 값 − 잔액'으로 계산합니다.
            </p>
          </div>

          {/* 원금과 이자를 나눠 받는다 — 섞으면 저축률이 왜곡된다(§2.2) */}
          <AmountField
            label="월 상환 원금"
            value={principal}
            onChange={setPrincipal}
          />
          <AmountField
            label="월 이자"
            value={interest}
            onChange={setInterest}
          />
          <TextField
            label="연 금리 (%)"
            value={rate}
            onChange={setRate}
            placeholder="예: 2.75 (모르면 비움)"
          />
          <TextField
            label="완납 예정"
            value={payoff}
            onChange={setPayoff}
            placeholder="예: 2030-10 (비우면 미정)"
          />
          <label className="flex min-h-11 items-center gap-2 text-[14px] text-zinc-700">
            <input
              type="checkbox"
              className="size-4 accent-zinc-900"
              checked={dti}
              onChange={(e) => setDti(e.target.checked)}
            />
            DTI에 포함
          </label>

          {/* 갚은 원금을 순자산에 더한다 — §5.10 */}
          <div>
            <label className="flex min-h-11 items-center gap-2 text-[14px] text-zinc-700">
              <input
                type="checkbox"
                className="size-4 accent-zinc-900"
                checked={repaidCounts}
                onChange={(e) => setRepaidCounts(e.target.checked)}
              />
              상환금액 순자산에 포함
            </label>
            <p className="text-[11px] leading-relaxed text-zinc-400">
              <b>대부분 끄는 것이 맞습니다.</b> 부채 잔액이 줄어드는 것이 이미
              "내 돈이 되는 과정"이고, 일반 순자산 공식이 그만큼 올려줍니다.
              여기서 또 더하면 <b>두 번 셉니다</b>.
              <br />
              켜는 경우는 하나뿐입니다 — 그 돈으로 산 자산을{' '}
              <b>자산 목록에 등록하지 않을 때</b>. 예: 차량 할부를 갚는데
              차를 자산으로 두지 않은 경우. 보증금처럼 자산으로 등록해 두었다면
              끄세요.
            </p>
            {repaidCounts && original === undefined && (
              <p className="mt-1 text-[12px] text-red-600">
                원금을 입력해야 갚은 금액을 계산할 수 있습니다. 비어 있으면
                0으로 계산됩니다.
              </p>
            )}
          </div>

          {debt && (
            <div className="mt-2 border-t border-zinc-200 pt-4">
              <Button
                variant="danger"
                className="w-full"
                onClick={() => setConfirming(true)}
              >
                삭제
              </Button>
            </div>
          )}
        </div>
      </Sheet>

      {confirming && debt && (
        <ConfirmDialog
          title={`'${debt.name}'을 삭제할까요?`}
          description="순자산이 그만큼 늘어난 것으로 계산됩니다."
          onConfirm={async () => {
            await deleteDebt(debt.id)
            onClose()
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  )
}

/** epoch ms ↔ date input. 로컬 기준이라 타임존으로 하루가 밀리지 않는다 */
function toDateInput(ms: number): string {
  const date = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function fromDateInput(value: string): number {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1).getTime()
}

function RecordSnapshotSheet({
  netWorth,
  payday,
  onClose,
}: {
  netWorth: number
  payday: number
  onClose: () => void
}) {
  const [date, setDate] = useState(() => todayKey())
  const cycleKey = getCycleKey(date, payday)

  return (
    <Sheet
      title="순자산 기록"
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          className="w-full"
          onClick={async () => {
            await captureSnapshot(cycleKey, date)
            onClose()
          }}
        >
          {cycleKey} 사이클에 기록
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
          <p className="text-[12px] text-zinc-500">현재 순자산</p>
          <p className="text-[22px] font-semibold tabular-nums text-zinc-900">
            {formatWon(netWorth)}
          </p>
        </div>
        <div>
          <Label hint="이 금액이 언제 기준인가">기준일</Label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="min-h-11 w-full rounded-xl bg-white px-3 text-[16px] text-zinc-900 ring-1 ring-zinc-300 outline-none focus:ring-2 focus:ring-zinc-900"
          />
        </div>
        <p className="text-[12px] leading-relaxed text-zinc-500">
          기준일이 속한 사이클({cycleKey})에 기록됩니다. 같은 사이클에 이미
          기록이 있으면 덮어씁니다.
        </p>
      </div>
    </Sheet>
  )
}

function Stat({
  label,
  value,
  danger,
}: {
  label: string
  value: string
  danger?: boolean
}) {
  return (
    <div className="flex-1 rounded-xl bg-white p-3 ring-1 ring-zinc-200">
      <p className="text-[12px] text-zinc-500">{label}</p>
      <p
        className={`mt-0.5 text-[18px] font-semibold tabular-nums ${danger ? 'text-red-600' : 'text-zinc-900'}`}
      >
        {value}
      </p>
    </div>
  )
}
