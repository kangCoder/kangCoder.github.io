import { endOfMonth, format as formatDate, startOfMonth } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Button, IconButton } from '../../components/Button'
import { MonthCalendar } from '../../components/MonthCalendar'
import { Sheet } from '../../components/Sheet'
import { Label, TextField } from '../../components/fields'
import { AmountField } from '../components/AmountField'
import { listCategories } from '../db/categories'
import { CategoryPickerSheet } from '../components/CategoryPickerSheet'
import { TYPE_CLASS, TYPE_LABEL } from '../components/categoryTypeMeta'
import { DEFAULT_PAYDAY, getIncomeSetting } from '../db/income'
import {
  applySalaryDeductions,
  listWithheldLinks,
  type WithheldLink,
} from '../db/salary'
import {
  countUsageByCategory,
  createTransaction,
  deleteTransaction,
  listTransactionsBetween,
} from '../db/transactions'
import { formatWon } from '../lib/money'
import { getCycleKey } from '../lib/cycle'
import type { TxType } from '../db/types'
import {
  currentWeek,
  defaultDateInWeek,
  shiftWeek,
  type WeekInfo,
} from '../lib/week'

/**
 * 거래 입력 — §5.2
 *
 * 모바일에서 3탭 이내 완료가 최우선이다. 실제 입력은 대부분 휴대폰에서
 * 일어난다: 퀵버튼으로 카테고리 → 금액 → 저장.
 */
export function TransactionFormScreen() {
  const income = useLiveQuery(() => getIncomeSetting(), [])
  const payday = income?.payday ?? DEFAULT_PAYDAY
  const categories = useLiveQuery(() => listCategories(false), [])
  const usage = useLiveQuery(() => countUsageByCategory(), [])

  // 입력은 주 단위로 본다. 예산·저축률 집계는 급여 사이클 그대로다(§2.1)
  /**
   * 내역 보기 — spec-finance-v0.13 §5.1.2
   *
   * 주간 목록만 있으면 "지난달 15일에 뭐 썼지"를 찾으려면 주를 여러 번
   * 넘겨야 한다. 캘린더는 한 달을 한눈에 보여 주고, 점의 크기로 그날
   * 입력이 있었는지가 즉시 읽힌다. **기본이 캘린더다** — 입력 직후 확인도
   * 오늘 날짜를 누르면 되고, 지난 날 찾기가 압도적으로 편하다.
   */
  const [view, setView] = useState<'week' | 'calendar'>('calendar')
  const [month, setMonth] = useState(() => new Date())
  const [pickedDay, setPickedDay] = useState<string>()
  const [week, setWeek] = useState<WeekInfo>(() => currentWeek())
  const inWeek = useLiveQuery(
    () => listTransactionsBetween(week.start, week.end),
    [week.start, week.end],
  )

  // 캘린더를 보지 않을 때는 쿼리하지 않는다
  const monthRange = {
    start: formatDate(startOfMonth(month), 'yyyy-MM-dd'),
    end: formatDate(endOfMonth(month), 'yyyy-MM-dd'),
  }
  const inMonth = useLiveQuery(
    () =>
      view === 'calendar'
        ? listTransactionsBetween(monthRange.start, monthRange.end)
        : Promise.resolve(undefined),
    [view, monthRange.start, monthRange.end],
  )

  const [categoryId, setCategoryId] = useState<string>()
  const [amount, setAmount] = useState<number>()
  const [date, setDate] = useState(() => defaultDateInWeek(currentWeek()))
  const [memo, setMemo] = useState('')
  const [error, setError] = useState<string>()
  const [savedAt, setSavedAt] = useState(0)
  const [picking, setPicking] = useState(false)
  /** 급여 저장 중 원천 공제를 확인하는 단계 — §5.9 */
  const [deductionStep, setDeductionStep] = useState<{
    links: WithheldLink[]
    /** 설정 실수령액과 다른 금액을 넣었는가 */
    differs: boolean
  }>()
  const [overrides, setOverrides] = useState<Record<string, number>>({})

  // 퀵버튼에는 실제로 써 본 것만 올린다. 한 번도 안 쓴 카테고리로 채우면
  // 정작 자주 쓰는 것이 밀려난다 — 전체 목록은 시트에서 본다.
  const frequent = useMemo(() => {
    const counts = usage ?? new Map<string, number>()
    return (categories ?? [])
      .filter((category) => (counts.get(category.id) ?? 0) > 0)
      .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))
      .slice(0, 8)
  }, [categories, usage])

  const selected = (categories ?? []).find(
    (category) => category.id === categoryId,
  )
  // 이 주에 실제로 쓴 돈 — 지출만 센다
  /** 캘린더 점 — 날짜별 입력 건수 */
  const dayMarks = useMemo(() => {
    const counts = new Map<string, number>()
    for (const tx of inMonth ?? []) {
      counts.set(tx.date, (counts.get(tx.date) ?? 0) + 1)
    }
    return [...counts.entries()].map(([date, count]) => ({
      date: new Date(`${date}T00:00:00`),
      count,
    }))
  }, [inMonth])

  /** 지금 목록에 보여 줄 거래 — 보기 모드와 선택한 날짜에 따라 달라진다 */
  const listed = useMemo(() => {
    if (view === 'week') return inWeek
    if (inMonth === undefined) return undefined
    return pickedDay === undefined
      ? inMonth
      : inMonth.filter((tx) => tx.date === pickedDay)
  }, [view, inWeek, inMonth, pickedDay])

  const listedTotal = (listed ?? [])
    .filter((tx) => tx.type === 'EXPENSE')
    .reduce((sum, tx) => sum + tx.amount, 0)

  const weekTotal = (inWeek ?? [])
    .filter((tx) => tx.type === 'EXPENSE')
    .reduce((sum, tx) => sum + tx.amount, 0)
  const nameById = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c.name])),
    [categories],
  )

  function goWeek(offset: number) {
    const next = shiftWeek(week.key, offset)
    setWeek(next)
    // 다른 주로 옮기면 입력 날짜도 그 주 안으로 맞춘다
    setDate(defaultDateInWeek(next))
  }

  /**
   * 급여 카테고리를 고르면 설정한 실수령액을 채운다 — §5.9
   *
   * 매달 같은 숫자를 다시 치는 것이 가장 잦은 입력인데, 그 값은 이미
   * 소득 설정에 있다. 수정 가능하게 두어 상여나 변동을 다룬다.
   */
  function pickCategory(id: string) {
    setCategoryId(id)
    setError(undefined)
    const next = categories?.find((category) => category.id === id)
    if (next?.isSalary && income?.netPay) setAmount(income.netPay)
  }

  async function save() {
    if (!selected) {
      setError('카테고리를 고르세요')
      return
    }
    if (amount === undefined || amount === 0) {
      setError('금액을 입력하세요')
      return
    }
    // 급여는 원천 공제를 함께 처리한다 — 확인 단계를 거친다(§5.9)
    if (selected.isSalary) {
      const links = await listWithheldLinks()
      if (links.length > 0) {
        const differs =
          income?.netPay !== undefined && Math.abs(amount) !== income.netPay
        setOverrides(
          Object.fromEntries(links.map((l) => [l.label, l.configured])),
        )
        setDeductionStep({ links, differs })
        return
      }
    }

    await commit(Math.abs(amount), selected, undefined)
  }

  /**
   * 거래를 쓰고, 급여면 원천 공제도 기록한다.
   *
   * 공제를 거래보다 먼저 쓰지 않는다 — 거래 저장이 실패하면 공제만 남아
   * 부채가 줄어든 채 급여 기록이 없는 상태가 된다.
   */
  async function commit(
    value: number,
    category: { id: string; type: TxType; isFixed: boolean },
    deductionAmounts: Record<string, number> | undefined,
  ) {
    await createTransaction(
      {
        date,
        type: category.type,
        categoryId: category.id,
        amount: value,
        memo,
        isFixed: category.isFixed,
      },
      payday,
    )
    if (deductionAmounts !== undefined) {
      await applySalaryDeductions(getCycleKey(date, payday), date, deductionAmounts)
    }
    // 카테고리는 남긴다 — 같은 항목을 연속으로 넣는 경우가 많다
    setAmount(undefined)
    setMemo('')
    setError(undefined)
    setDeductionStep(undefined)
    setSavedAt(Date.now())
  }

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 bg-zinc-100/90 px-2 pt-2 pb-2 backdrop-blur">
        <h1 className="px-2 text-[22px] font-bold text-zinc-900">거래 입력</h1>
        <div className="mt-1 flex items-center justify-between">
          <IconButton aria-label="이전 주" onClick={() => goWeek(-1)}>
            <Chevron direction="left" />
          </IconButton>
          <div className="text-center">
            <p className="text-[15px] font-semibold text-zinc-900">
              {week.label}
            </p>
            <p className="text-[12px] tabular-nums text-zinc-500">
              {week.rangeLabel}
            </p>
          </div>
          <IconButton aria-label="다음 주" onClick={() => goWeek(1)}>
            <Chevron direction="right" />
          </IconButton>
        </div>
      </header>

      <section className="px-4 pb-3">
        <Label>카테고리</Label>
        <button
          type="button"
          onClick={() => setPicking(true)}
          className={`flex min-h-12 w-full items-center gap-2 rounded-xl px-3 text-left ring-1 transition-colors ${
            selected
              ? 'bg-white ring-zinc-300 active:bg-zinc-50'
              : 'bg-white ring-zinc-300'
          } ${error && !selected ? 'ring-red-400' : ''}`}
        >
          <span
            className={`min-w-0 flex-1 truncate text-[16px] ${selected ? 'font-medium text-zinc-900' : 'text-zinc-400'}`}
          >
            {selected?.name ?? '카테고리를 고르세요'}
          </span>
          {selected && (
            <span
              className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${TYPE_CLASS[selected.type]}`}
            >
              {TYPE_LABEL[selected.type]}
            </span>
          )}
          <span className="shrink-0 text-[12px] text-zinc-400">▾</span>
        </button>

        {frequent.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {frequent.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => pickCategory(category.id)}
                className={`min-h-9 rounded-lg px-2.5 text-[13px] font-medium ring-1 transition-colors ${
                  category.id === categoryId
                    ? 'bg-zinc-900 text-white ring-zinc-900'
                    : 'bg-white text-zinc-600 ring-zinc-300 active:bg-zinc-100'
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 px-4 pb-4">
        {/* key로 리마운트해 저장 후 입력 버퍼를 비운다 */}
        <AmountField
          key={`amount-${savedAt}`}
          label="금액"
          value={amount}
          onChange={(next) => {
            setAmount(next)
            setError(undefined)
          }}
        />

        <div>
          <Label>날짜</Label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="min-h-11 w-full rounded-xl bg-white px-3 text-[16px] text-zinc-900 ring-1 ring-zinc-300 outline-none focus:ring-2 focus:ring-zinc-900"
          />
        </div>

        <TextField
          key={`memo-${savedAt}`}
          label="메모"
          value={memo}
          onChange={setMemo}
          placeholder="선택"
        />

        {error && <p className="text-[13px] text-red-600">{error}</p>}

        <Button variant="primary" className="w-full" onClick={save}>
          {selected ? `${selected.name} 저장` : '저장'}
        </Button>
      </section>

      {picking && (
        <CategoryPickerSheet
          selectedId={categoryId}
          onSelect={(category) => pickCategory(category.id)}
          onClose={() => setPicking(false)}
        />
      )}

      {deductionStep && selected && (
        <SalaryDeductionSheet
          links={deductionStep.links}
          differs={deductionStep.differs}
          netPay={income?.netPay}
          entered={Math.abs(amount ?? 0)}
          amounts={overrides}
          onChange={(label, value) =>
            setOverrides((current) => ({ ...current, [label]: value }))
          }
          onConfirm={() =>
            void commit(Math.abs(amount ?? 0), selected, overrides)
          }
          onClose={() => setDeductionStep(undefined)}
        />
      )}

      <section className="px-4 pb-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="min-w-0 flex-1 truncate text-[13px] font-medium text-zinc-500">
            {view === 'week'
              ? `${week.label} 내역`
              : pickedDay
                ? `${pickedDay} 내역`
                : `${formatDate(month, 'M월')} 캘린더`}
          </h2>
          <span className="shrink-0 text-[13px] tabular-nums text-zinc-500">
            {formatWon(view === 'week' ? weekTotal : listedTotal)}원
          </span>
          {/* 보기 전환 — 주간은 입력 직후 확인용, 캘린더는 지난 날 찾기용 */}
          <button
            type="button"
            className="shrink-0 rounded-lg px-2 py-1 text-[12px] font-medium text-zinc-600 ring-1 ring-zinc-300"
            onClick={() => {
              setView((current) => (current === 'week' ? 'calendar' : 'week'))
              setPickedDay(undefined)
            }}
          >
            {view === 'week' ? '캘린더' : '주간'}
          </button>
        </div>

        {view === 'calendar' && (
          <div className="mb-2">
            <MonthCalendar
              month={month}
              onMonthChange={(next) => {
                setMonth(next)
                setPickedDay(undefined)
              }}
              marks={dayMarks}
              selected={
                pickedDay ? new Date(`${pickedDay}T00:00:00`) : undefined
              }
              // 빈 날을 눌러 "입력이 없습니다"를 확인하는 것이 자연스럽다
              selectAnyDay
              onSelectDay={(date) => {
                const key = formatDate(date, 'yyyy-MM-dd')
                // 같은 날을 다시 누르면 해제해 그 달 전체로 돌아간다
                setPickedDay((current) => (current === key ? undefined : key))
              }}
            />
          </div>
        )}

        {listed === undefined ? null : listed.length === 0 ? (
          <p className="rounded-xl bg-white px-3 py-6 text-center text-[13px] text-zinc-400 ring-1 ring-zinc-200">
            {view === 'week'
              ? '이 주에는 입력이 없습니다'
              : pickedDay
                ? '이 날에는 입력이 없습니다'
                : '이 달에는 입력이 없습니다'}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {listed.map((tx) => (
              <li
                key={tx.id}
                className="flex items-center gap-2 rounded-xl bg-white p-3 ring-1 ring-zinc-200"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-zinc-900">
                    {nameById.get(tx.categoryId) ?? '(삭제된 카테고리)'}
                    {tx.isAutoGenerated && (
                      <span className="ml-1.5 text-[11px] font-normal text-zinc-400">
                        고정비
                      </span>
                    )}
                  </p>
                  <p className="text-[12px] tabular-nums text-zinc-500">
                    {tx.date}
                    {tx.memo && ` · ${tx.memo}`}
                  </p>
                </div>
                <span className="shrink-0 text-[15px] font-semibold tabular-nums text-zinc-900">
                  {formatWon(tx.amount)}
                </span>
                <IconButton
                  aria-label="삭제"
                  className="text-zinc-300"
                  onClick={() => deleteTransaction(tx.id)}
                >
                  <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
                    <path
                      d="M5 5l10 10M15 5L5 15"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      fill="none"
                    />
                  </svg>
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/**
 * 급여 저장 시 원천 공제 확인 — spec-finance-v0.13 §5.9
 *
 * 금액이 설정 실수령액과 같으면 설정값을 그대로 쓸지만 확인한다.
 * 다르면 **공제액도 달라졌을 가능성이 높다** — 상여가 들어왔거나 상환액이
 * 바뀐 달이다. 그때 설정값을 그대로 적용하면 부채 잔액이 조용히 틀어진다.
 */
function SalaryDeductionSheet({
  links,
  differs,
  netPay,
  entered,
  amounts,
  onChange,
  onConfirm,
  onClose,
}: {
  links: WithheldLink[]
  differs: boolean
  netPay: number | undefined
  entered: number
  amounts: Record<string, number>
  onChange: (label: string, value: number) => void
  onConfirm: () => void
  onClose: () => void
}) {
  const [editing, setEditing] = useState(differs)

  return (
    <Sheet
      title="급여 공제 확인"
      onClose={onClose}
      footer={
        <Button variant="primary" className="w-full" onClick={onConfirm}>
          저장
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {differs && netPay !== undefined && (
          <p className="rounded-xl bg-amber-50 p-3 text-[13px] leading-relaxed text-amber-800 ring-1 ring-amber-200">
            입력한 금액 <b className="tabular-nums">{formatWon(entered)}원</b>이
            설정한 실수령액{' '}
            <b className="tabular-nums">{formatWon(netPay)}원</b>과 다릅니다.
            <br />
            <b>부채로 연결된 공제액도 설정값과 같나요?</b>
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {links.map((link) => (
            <li
              key={link.label}
              className="rounded-xl bg-white p-3 ring-1 ring-zinc-200"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-zinc-900">
                  {link.label}
                </span>
                <span className="shrink-0 text-[11px] text-zinc-400">
                  → {link.debtName}
                </span>
              </div>
              {editing ? (
                <div className="mt-2">
                  <AmountField
                    value={amounts[link.label]}
                    onChange={(value) => onChange(link.label, value ?? 0)}
                  />
                </div>
              ) : (
                <p className="mt-1 text-[15px] font-semibold tabular-nums text-zinc-900">
                  {formatWon(amounts[link.label] ?? link.configured)}원
                </p>
              )}
            </li>
          ))}
        </ul>

        {!editing && (
          <Button onClick={() => setEditing(true)}>
            이번 달 공제액이 다릅니다
          </Button>
        )}

        <p className="text-[11px] leading-relaxed text-zinc-400">
          이 금액만큼 연결된 부채 잔액이 줄어듭니다. 급여에서 이미 공제되어
          들어온 돈이라 거래로는 잡지 않습니다 — 거래로 잡으면 저축률이 두 번
          계산됩니다. 같은 사이클에 다시 저장하면 이 기록을 덮어씁니다.
        </p>
      </div>
    </Sheet>
  )
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M12 4l-6 6 6 6' : 'M8 4l6 6-6 6'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
