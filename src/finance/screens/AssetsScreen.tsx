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
import { listSnapshots } from '../db/snapshots'
import type { Asset, AssetKind, Debt } from '../db/types'
import { formatWon } from '../lib/money'

/** 자산 현황 — §5.4 */
export function AssetsScreen() {
  const data = useLiveQuery(() => getNetWorthBreakdown(), [])
  const snapshots = useLiveQuery(() => listSnapshots(), [])
  const [editingAsset, setEditingAsset] = useState<Asset | null>()
  const [editingDebt, setEditingDebt] = useState<Debt | null>()

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
      </section>

      {data.byKind.length > 0 && (
        <section className="px-4 pb-4">
          <h2 className="mb-2 text-[13px] font-medium text-zinc-500">
            자산 구성
          </h2>
          <div className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.byKind}
                    dataKey="total"
                    nameKey="kind"
                    innerRadius="55%"
                    outerRadius="85%"
                    strokeWidth={0}
                  >
                    {data.byKind.map((entry) => (
                      <Cell
                        key={entry.kind}
                        fill={ASSET_KIND_COLOR[entry.kind]}
                      />
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
              {data.byKind.map((entry) => (
                <li
                  key={entry.kind}
                  className="flex items-center gap-2 text-[13px]"
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: ASSET_KIND_COLOR[entry.kind] }}
                  />
                  <span className="min-w-0 flex-1 text-zinc-600">
                    {ASSET_KIND_LABEL[entry.kind]}
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
        <section className="px-4 pb-4">
          <p className="rounded-xl bg-white px-3 py-4 text-center text-[12px] text-zinc-400 ring-1 ring-zinc-200">
            순자산 추이는 사이클이 끝날 때마다 한 점씩 쌓입니다.
            {trend.length === 1 && ' (현재 1개)'}
          </p>
        </section>
      )}

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
                  </div>
                  {asset.note && (
                    <p className="mt-0.5 truncate text-[11px] text-zinc-400">
                      {asset.note}
                    </p>
                  )}
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
                  </div>
                  <p className="text-[11px] tabular-nums text-zinc-500">
                    월 원금 {formatWon(debt.monthlyPrincipal)} · 이자{' '}
                    {formatWon(debt.monthlyInterest)}
                    {debt.expectedPayoff && ` · ${debt.expectedPayoff} 완납`}
                  </p>
                </div>
                <span className="shrink-0 text-[15px] font-semibold tabular-nums text-red-600">
                  {formatWon(debt.balance)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

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
  asset?: Asset
  onClose: () => void
}) {
  const [name, setName] = useState(asset?.name ?? '')
  const [kind, setKind] = useState<AssetKind>(asset?.kind ?? 'SAVINGS')
  const [balance, setBalance] = useState<number | undefined>(asset?.balance)
  const [liquid, setLiquid] = useState(asset?.isLiquidByTarget ?? true)
  const [note, setNote] = useState(asset?.note ?? '')
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
        note,
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
          <label className="flex min-h-11 items-center gap-2 text-[14px] text-zinc-700">
            <input
              type="checkbox"
              className="size-4 accent-zinc-900"
              checked={liquid}
              onChange={(e) => setLiquid(e.target.checked)}
            />
            목표 시점에 현금화 가능
          </label>
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

function DebtSheet({ debt, onClose }: { debt?: Debt; onClose: () => void }) {
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
