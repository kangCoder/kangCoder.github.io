import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { EmptyState } from '../../components/EmptyState'
import { Sheet } from '../../components/Sheet'
import { Label, NumberField, TextField } from '../../components/fields'
import { AmountField } from '../components/AmountField'
import { listCategories } from '../db/categories'
import {
  createFixedCost,
  deleteFixedCost,
  ensureFixedCostTransactions,
  listFixedCosts,
  updateFixedCost,
  type FixedCostItem,
} from '../db/fixedCosts'
import { DEFAULT_PAYDAY, getIncomeSetting } from '../db/income'
import { getCurrentCycleKey, shiftCycle } from '../lib/cycle'
import { formatWon } from '../lib/money'

/** 고정비 관리 — §5.6 */
export function FixedCostScreen() {
  const payday = useLiveQuery(
    async () => (await getIncomeSetting())?.payday ?? DEFAULT_PAYDAY,
    [],
    DEFAULT_PAYDAY,
  )
  const items = useLiveQuery(() => listFixedCosts(), [])
  const [editing, setEditing] = useState<FixedCostItem>()
  const [adding, setAdding] = useState(false)
  const [applied, setApplied] = useState<number>()

  async function applyToCycle() {
    setApplied(await ensureFixedCostTransactions(currentCycle, payday))
  }

  const currentCycle = getCurrentCycleKey(payday)
  // 12개월 안에 끝나는 고정비는 미리 알려준다 — 이후 여력이 그만큼 생긴다
  const horizon = shiftCycle(currentCycle, 12)
  const active = (items ?? []).filter((item) => item.isActive)
  const total = active.reduce((sum, item) => sum + item.amount, 0)
  const ending = active.filter(
    (item) => item.endCycle !== undefined && item.endCycle <= horizon,
  )

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 bg-zinc-100/90 px-4 pt-3 pb-2 backdrop-blur">
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-bold text-zinc-900">고정비</h1>
          <Button variant="primary" onClick={() => setAdding(true)}>
            + 추가
          </Button>
        </div>
        <p className="text-[13px] tabular-nums text-zinc-500">
          활성 {active.length}건 · 월 {formatWon(total)}원
        </p>
      </header>

      {/* 자동 생성하지 않는다 — 실제로 나간 달에만 직접 반영한다 */}
      {active.length > 0 && (
        <section className="px-4 pb-3">
          <Button variant="primary" className="w-full" onClick={applyToCycle}>
            이번 사이클에 반영
          </Button>
          <p className="mt-1 text-[11px] text-zinc-400">
            {applied === undefined
              ? '활성 고정비를 이번 사이클 거래로 만듭니다. 이미 만든 항목은 건너뜁니다.'
              : applied === 0
                ? '이미 전부 반영되어 있습니다.'
                : `${applied}건을 거래로 만들었습니다.`}
          </p>
        </section>
      )}

      {ending.length > 0 && (
        <section className="px-4 pb-3">
          {ending.map((item) => (
            <p
              key={item.id}
              className="rounded-xl bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800"
            >
              {item.category?.name} {item.endCycle} 종료 예정 — 이후 월{' '}
              {formatWon(item.amount)}원 여력 증가
            </p>
          ))}
        </section>
      )}

      {items === undefined ? null : items.length === 0 ? (
        <EmptyState
          title="고정비가 없습니다"
          hint="매달 같은 날 빠져나가는 항목을 등록하세요."
          action={
            <Button variant="primary" onClick={() => setAdding(true)}>
              고정비 추가
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-1.5 px-4 pb-4">
          {items.map((item) => (
            <li
              key={item.id}
              className={`flex items-center gap-2 rounded-xl bg-white p-3 ring-1 ring-zinc-200 ${
                item.isActive ? '' : 'opacity-50'
              }`}
            >
              <button
                type="button"
                onClick={() => setEditing(item)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-[15px] font-medium text-zinc-900">
                  {item.category?.name ?? '(삭제된 카테고리)'}
                </p>
                <p className="text-[12px] tabular-nums text-zinc-500">
                  매월 {item.dayOfMonth}일
                  {item.endCycle && ` · ${item.endCycle} 종료`}
                </p>
              </button>
              <span className="shrink-0 text-[15px] font-semibold tabular-nums text-zinc-900">
                {formatWon(item.amount)}
              </span>
              <input
                type="checkbox"
                aria-label="활성"
                className="size-5 shrink-0 accent-zinc-900"
                checked={item.isActive}
                onChange={(e) =>
                  updateFixedCost(item.id, { isActive: e.target.checked })
                }
              />
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <FixedCostSheet item={editing} onClose={() => setEditing(undefined)} />
      )}

      {adding && (
        <NewFixedCostSheet
          startCycle={currentCycle}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  )
}

function FixedCostSheet({
  item,
  onClose,
}: {
  item: FixedCostItem
  onClose: () => void
}) {
  const [amount, setAmount] = useState<number | undefined>(item.amount)
  const [day, setDay] = useState<number | undefined>(item.dayOfMonth)
  const [endCycle, setEndCycle] = useState(item.endCycle ?? '')
  const [confirming, setConfirming] = useState(false)

  async function save() {
    await updateFixedCost(item.id, {
      amount: amount ?? item.amount,
      dayOfMonth: Math.min(31, Math.max(1, day ?? item.dayOfMonth)),
      endCycle: endCycle.trim() || undefined,
    })
    onClose()
  }

  async function remove() {
    await deleteFixedCost(item.id)
    onClose()
  }

  return (
    <>
      <Sheet
      title={item.category?.name ?? '고정비'}
      onClose={onClose}
      footer={
        <Button variant="primary" className="w-full" onClick={save}>
          저장
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <AmountField label="금액" value={amount} onChange={setAmount} />
        <NumberField
          label="결제일"
          suffix="일"
          value={day}
          onChange={setDay}
        />
        {item.note && (
          <p className="text-[13px] text-zinc-500">{item.note}</p>
        )}
        <TextField
          label="종료 사이클"
          value={endCycle}
          onChange={setEndCycle}
          placeholder="예: 2027-10 (비우면 계속)"
        />
        <p className="text-[12px] text-zinc-400">
          이번 사이클에 이미 생성된 거래는 바뀌지 않습니다. 다음 사이클부터
          반영됩니다.
        </p>
        <div className="mt-2 border-t border-zinc-200 pt-4">
          <Button
            variant="danger"
            className="w-full"
            onClick={() => setConfirming(true)}
          >
            고정비 삭제
          </Button>
        </div>
      </div>
      </Sheet>

      {confirming && (
        <ConfirmDialog
          title={`'${item.category?.name}' 고정비를 삭제할까요?`}
          description="이미 만들어진 거래는 남고, 다음 사이클부터 자동 생성되지 않습니다."
          onConfirm={remove}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  )
}

function NewFixedCostSheet({
  startCycle,
  onClose,
}: {
  startCycle: string
  onClose: () => void
}) {
  const categories = useLiveQuery(() => listCategories(false), [])
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState<number>()
  const [day, setDay] = useState<number | undefined>(1)
  const [endCycle, setEndCycle] = useState('')
  const [error, setError] = useState<string>()

  const options = (categories ?? []).filter((c) => c.type !== 'INCOME')

  async function save() {
    if (!categoryId) {
      setError('카테고리를 고르세요')
      return
    }
    if (amount === undefined || amount <= 0) {
      setError('금액을 입력하세요')
      return
    }
    await createFixedCost({
      categoryId,
      amount,
      dayOfMonth: Math.min(31, Math.max(1, day ?? 1)),
      startCycle,
      endCycle: endCycle.trim() || undefined,
    })
    onClose()
  }

  return (
    <Sheet
      title="고정비 추가"
      onClose={onClose}
      footer={
        <Button variant="primary" className="w-full" onClick={save}>
          추가
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <Label>카테고리</Label>
          <select
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value)
              setError(undefined)
            }}
            className="min-h-11 w-full rounded-xl bg-white px-3 text-[16px] text-zinc-900 ring-1 ring-zinc-300 outline-none focus:ring-2 focus:ring-zinc-900"
          >
            <option value="">고르세요</option>
            {options.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <AmountField label="금액" value={amount} onChange={setAmount} />
        <NumberField label="결제일" suffix="일" value={day} onChange={setDay} />
        <TextField
          label="종료 사이클"
          value={endCycle}
          onChange={setEndCycle}
          placeholder="예: 2027-10 (비우면 계속)"
        />
        <p className="text-[12px] text-zinc-400">
          {startCycle} 사이클부터 매달 자동으로 거래가 만들어집니다.
        </p>
        {error && <p className="text-[13px] text-red-600">{error}</p>}
      </div>
    </Sheet>
  )
}
