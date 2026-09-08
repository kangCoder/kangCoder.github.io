import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Label, NumberField, TextArea, TextField } from '../../components/fields'
import { IconButton } from '../../components/Button'
import { getGoal, saveGoal } from '../db/goals'
import { Link } from 'react-router-dom'
import { AmountField } from '../components/AmountField'
import {
  BackupFormatError,
  backupFileName,
  exportBackup,
  parseBackup,
  restoreBackup,
  type FinanceBackup,
} from '../db/backup'
import { DEFAULT_PAYDAY, getIncomeSetting, saveIncomeSetting } from '../db/income'
import { recalculateAllCycleKeys } from '../db/transactions'
import type { Deduction } from '../db/types'
import { sumWithheldTransfer } from '../lib/savingsRate'
import { formatWon } from '../lib/money'

/** 설정 — §5.7. 소득 설정과 JSON 백업·복원. */
export function FinanceSettingsScreen() {
  const income = useLiveQuery(() => getIncomeSetting(), [])

  if (income === undefined) return null

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 bg-zinc-100/90 px-4 pt-2 pb-2 backdrop-blur">
        <h1 className="text-[22px] font-bold text-zinc-900">설정</h1>
      </header>

      <IncomeSection
        key={income?.payday}
        grossPay={income?.grossPay ?? 0}
        netPay={income?.netPay ?? 0}
        payday={income?.payday ?? DEFAULT_PAYDAY}
        initialDeductions={income?.deductions ?? []}
      />
      <GoalSection />
      <LinkSection />
      <BackupSection />
    </div>
  )
}

function IncomeSection({
  grossPay: initialGross,
  netPay: initialNet,
  payday: initialPayday,
  initialDeductions,
}: {
  grossPay: number
  netPay: number
  payday: number
  initialDeductions: Deduction[]
}) {
  const [grossPay, setGrossPay] = useState<number | undefined>(initialGross)
  const [netPay, setNetPay] = useState<number | undefined>(initialNet)
  const [payday, setPayday] = useState<number | undefined>(initialPayday)
  const [deductions, setDeductions] = useState<Deduction[]>(initialDeductions)
  const [pendingPayday, setPendingPayday] = useState<number>()
  const [message, setMessage] = useState<string>()

  function patchDeduction(index: number, patch: Partial<Deduction>) {
    setDeductions((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    )
  }

  const withheld = sumWithheldTransfer(deductions)
  const deductionTotal = deductions.reduce((sum, d) => sum + d.amount, 0)
  const mismatch = (grossPay ?? 0) - deductionTotal !== (netPay ?? 0)

  async function persist(nextPayday: number) {
    await saveIncomeSetting({
      grossPay: grossPay ?? 0,
      netPay: netPay ?? 0,
      payday: nextPayday,
      deductions,
    })
  }

  async function save() {
    const next = Math.min(31, Math.max(1, payday ?? DEFAULT_PAYDAY))
    // 급여일이 바뀌면 저장된 모든 cycleKey가 틀어진다 — §2.1
    if (next !== initialPayday) {
      setPendingPayday(next)
      return
    }
    await persist(next)
    setMessage('저장했습니다')
  }

  async function confirmPayday() {
    if (pendingPayday === undefined) return
    await persist(pendingPayday)
    const changed = await recalculateAllCycleKeys(pendingPayday)
    setPendingPayday(undefined)
    setMessage(`저장했습니다. 거래 ${changed}건의 사이클을 다시 계산했습니다`)
  }

  return (
    <section className="px-4 pb-5">
      <h2 className="mb-2 text-[13px] font-medium text-zinc-500">소득</h2>
      <div className="flex flex-col gap-3 rounded-xl bg-white p-3 ring-1 ring-zinc-200">
        <AmountField label="세전 급여" value={grossPay} onChange={setGrossPay} />
        <AmountField label="실수령액" value={netPay} onChange={setNetPay} />
        <NumberField label="급여일" suffix="일" value={payday} onChange={setPayday} />

        {mismatch && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            세전 − 공제({formatWon(deductionTotal)}) ≠ 실수령. 공제 내역과 맞지
            않습니다.
          </p>
        )}

        <div>
          <Label hint="'원금'을 켜면 저축률 분자에 들어간다">공제 내역</Label>
          <ul className="flex flex-col gap-1.5">
            {deductions.map((deduction, index) => (
              <li key={index} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={deduction.label}
                  onChange={(e) =>
                    patchDeduction(index, { label: e.target.value })
                  }
                  placeholder="항목"
                  className="min-h-11 min-w-0 flex-1 rounded-xl bg-white px-3 text-[15px] ring-1 ring-zinc-300 outline-none focus:ring-2 focus:ring-zinc-900"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  value={
                    deduction.amount === 0
                      ? ''
                      : deduction.amount.toLocaleString('ko-KR')
                  }
                  onChange={(e) =>
                    patchDeduction(index, {
                      amount: Number(e.target.value.replace(/[^\d]/g, '')) || 0,
                    })
                  }
                  placeholder="0"
                  className="min-h-11 w-24 rounded-xl bg-white px-2 text-right text-[15px] tabular-nums ring-1 ring-zinc-300 outline-none focus:ring-2 focus:ring-zinc-900"
                />
                <button
                  type="button"
                  aria-label="원금 여부"
                  onClick={() =>
                    patchDeduction(index, { isTransfer: !deduction.isTransfer })
                  }
                  className={`min-h-11 shrink-0 rounded-xl px-2 text-[12px] font-medium ring-1 ${
                    deduction.isTransfer
                      ? 'bg-sky-600 text-white ring-sky-600'
                      : 'bg-white text-zinc-400 ring-zinc-300'
                  }`}
                >
                  원금
                </button>
                <IconButton
                  aria-label="삭제"
                  className="text-zinc-300"
                  onClick={() =>
                    setDeductions((current) =>
                      current.filter((_, i) => i !== index),
                    )
                  }
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
          <Button
            className="mt-2 w-full"
            onClick={() =>
              setDeductions((current) => [
                ...current,
                { label: '', amount: 0, isTransfer: false },
              ])
            }
          >
            + 공제 항목
          </Button>
          <p className="mt-2 text-[12px] text-zinc-400">
            원천 차감 원금 {formatWon(withheld)}원은 저축률 분자에 자동으로
            들어갑니다. 거래로 따로 입력하면 이중 계산됩니다.
          </p>
        </div>

        <Button variant="primary" onClick={save}>
          저장
        </Button>
        {message && (
          <p className="text-[13px] text-emerald-700">{message}</p>
        )}
      </div>

      {pendingPayday !== undefined && (
        <ConfirmDialog
          title={`급여일을 ${pendingPayday}일로 바꿀까요?`}
          description="저장된 모든 거래의 사이클을 다시 계산합니다. 과거 사이클의 집계가 달라질 수 있습니다."
          confirmLabel="변경"
          onConfirm={confirmPayday}
          onCancel={() => setPendingPayday(undefined)}
        />
      )}
    </section>
  )
}

function GoalSection() {
  const goal = useLiveQuery(() => getGoal(), [])
  if (goal === undefined) return null
  return <GoalForm key={goal?.id ?? 'new'} initial={goal} />
}

function GoalForm({
  initial,
}: {
  initial:
    | { name: string; targetDate: string; targetAmount: number; note?: string }
    | undefined
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [targetDate, setTargetDate] = useState(initial?.targetDate ?? '')
  const [targetAmount, setTargetAmount] = useState<number | undefined>(
    initial?.targetAmount,
  )
  const [note, setNote] = useState(initial?.note ?? '')
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()

  async function save() {
    if (!name.trim()) {
      setError('목표 이름을 입력하세요')
      return
    }
    if (!/^\d{4}-\d{2}$/.test(targetDate)) {
      setError('목표 시점을 YYYY-MM 형식으로 입력하세요')
      return
    }
    await saveGoal({
      name,
      targetDate,
      targetAmount: targetAmount ?? 0,
      note,
    })
    setError(undefined)
    setMessage('저장했습니다')
  }

  return (
    <section className="px-4 pb-5">
      <h2 className="mb-2 text-[13px] font-medium text-zinc-500">목표</h2>
      <div className="flex flex-col gap-3 rounded-xl bg-white p-3 ring-1 ring-zinc-200">
        <TextField
          label="이름"
          value={name}
          onChange={(value) => {
            setName(value)
            setError(undefined)
          }}
          placeholder="예: 주택 구입 (생애최초)"
        />
        <TextField
          label="목표 시점"
          value={targetDate}
          onChange={(value) => {
            setTargetDate(value)
            setError(undefined)
          }}
          placeholder="2029-03"
        />
        <AmountField
          label="목표 금액"
          value={targetAmount}
          onChange={setTargetAmount}
        />
        <TextArea label="메모" value={note} onChange={setNote} rows={3} />
        {error && <p className="text-[13px] text-red-600">{error}</p>}
        <Button variant="primary" onClick={save}>
          저장
        </Button>
        {message && <p className="text-[13px] text-emerald-700">{message}</p>}
      </div>
    </section>
  )
}

function LinkSection() {
  return (
    <section className="px-4 pb-5">
      <h2 className="mb-2 text-[13px] font-medium text-zinc-500">관리</h2>
      <div className="flex flex-col gap-2 rounded-xl bg-white p-3 ring-1 ring-zinc-200">
        <Link to="/finance/categories">
          <Button className="w-full">카테고리 · 그룹 관리</Button>
        </Link>
        <Link to="/finance/fixed">
          <Button className="w-full">고정비 관리</Button>
        </Link>
        <Link to="/finance/goal">
          <Button className="w-full">목표 달성 페이스</Button>
        </Link>
        <Link to="/finance/simulator">
          <Button className="w-full">목표 시뮬레이터</Button>
        </Link>
      </div>
    </section>
  )
}

function BackupSection() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<FinanceBackup>()
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()

  async function download() {
    const backup = await exportBackup()
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = backupFileName()
    anchor.click()
    URL.revokeObjectURL(url)
    const count = Object.values(backup.tables).reduce(
      (sum, rows) => sum + rows.length,
      0,
    )
    setMessage(`${count}건을 내보냈습니다`)
    setError(undefined)
  }

  async function pick(file: File) {
    setError(undefined)
    setMessage(undefined)
    try {
      setPending(parseBackup(await file.text()))
    } catch (e) {
      setError(
        e instanceof BackupFormatError ? e.message : '파일을 읽지 못했습니다',
      )
    }
  }

  async function confirmRestore() {
    if (!pending) return
    const result = await restoreBackup(pending)
    const count = Object.values(result.restored).reduce(
      (sum, n) => sum + (n ?? 0),
      0,
    )
    setPending(undefined)
    setMessage(`${count}건을 복원했습니다`)
  }

  return (
    <section className="px-4 pb-6">
      <h2 className="mb-2 text-[13px] font-medium text-zinc-500">백업</h2>
      <div className="flex flex-col gap-2 rounded-xl bg-white p-3 ring-1 ring-zinc-200">
        <Button onClick={download}>JSON 내보내기</Button>
        <Button onClick={() => inputRef.current?.click()}>
          JSON 가져오기
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void pick(file)
            e.target.value = ''
          }}
        />
        <p className="text-[12px] text-zinc-400">
          가계부(<code>finance-log</code>) 데이터만 담깁니다. 운동 기록은 별도
          데이터베이스라 포함되지 않습니다.
        </p>
        {message && <p className="text-[13px] text-emerald-700">{message}</p>}
        {error && <p className="text-[13px] text-red-600">{error}</p>}
      </div>

      {pending && (
        <ConfirmDialog
          title="백업을 복원할까요?"
          description={
            <>
              <p>
                현재 가계부 데이터를 전부 지우고 파일의 내용으로 바꿉니다.
                되돌릴 수 없습니다.
              </p>
              <p className="mt-1 tabular-nums">
                내보낸 시각:{' '}
                {new Date(pending.exportedAt).toLocaleString('ko-KR')}
              </p>
            </>
          }
          confirmLabel="복원"
          onConfirm={confirmRestore}
          onCancel={() => setPending(undefined)}
        />
      )}
    </section>
  )
}
