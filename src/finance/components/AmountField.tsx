import { useState } from 'react'
import { Label } from '../../components/fields'
import { formatAmountInput, parseAmount } from '../lib/money'

/**
 * 금액 입력 — 천단위 콤마를 입력 중에도 유지한다(§5.2).
 *
 * 공용 NumberField를 고치지 않고 따로 만든 이유는 §1.6 — 공용 컴포넌트를
 * 건드리면 운동 쪽 세트 입력에 영향이 가고, 회귀를 검증할 방법이 없다.
 *
 * type="number" 대신 text + inputMode를 쓰는 것은 운동 쪽과 같은 이유다.
 * iOS에서 입력 중간 상태가 통째로 버려진다.
 */
export function AmountField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  error,
}: {
  label?: string
  value: number | undefined
  onChange: (value: number | undefined) => void
  placeholder?: string
  autoFocus?: boolean
  error?: string
}) {
  // 입력 버퍼는 로컬에만 둔다. 값의 출처가 이 입력 자신이라 되돌릴 이유가 없고,
  // useLiveQuery 재렌더마다 커서가 튀는 것도 막아준다.
  const [text, setText] = useState(() =>
    value === undefined ? '' : value.toLocaleString('ko-KR'),
  )

  return (
    <div>
      {label && <Label>{label}</Label>}
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          autoFocus={autoFocus}
          className={`min-h-12 w-full rounded-xl bg-white pr-9 pl-3 text-right text-[20px] font-semibold tabular-nums text-zinc-900 ring-1 outline-none placeholder:font-normal placeholder:text-zinc-300 focus:ring-2 focus:ring-zinc-900 ${
            error ? 'ring-red-400' : 'ring-zinc-300'
          }`}
          value={text}
          placeholder={placeholder ?? '0'}
          onChange={(e) => {
            setText(formatAmountInput(e.target.value))
            onChange(parseAmount(e.target.value))
          }}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[14px] text-zinc-400">
          원
        </span>
      </div>
      {error && <p className="mt-1 text-[13px] text-red-600">{error}</p>}
    </div>
  )
}
