import { useState, type ReactNode } from 'react'

const INPUT_CLASS =
  'min-h-11 w-full rounded-xl bg-white px-3 text-[16px] text-zinc-900 ring-1 ring-zinc-300 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-900'

export function Label({
  children,
  hint,
}: {
  children: ReactNode
  hint?: string
}) {
  return (
    <div className="mb-1.5 flex items-baseline gap-2">
      <span className="text-[13px] font-medium text-zinc-600">{children}</span>
      {hint && <span className="text-[12px] text-zinc-400">{hint}</span>}
    </div>
  )
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  error,
}: {
  label?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
  error?: string
}) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <input
        type="text"
        className={`${INPUT_CLASS} ${error ? 'ring-red-400' : ''}`}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <p className="mt-1 text-[13px] text-red-600">{error}</p>}
    </div>
  )
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 2,
}: {
  label?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <textarea
        className={`${INPUT_CLASS} py-2.5 leading-relaxed`}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function format(value: number | undefined): string {
  return value === undefined ? '' : String(value)
}

function parse(text: string): number | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return undefined
  const parsed = Number(trimmed.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * 숫자 입력 — §5.1의 `inputmode` 규칙에 맞춰 숫자 키패드를 띄운다.
 * type="number" 대신 text + inputMode를 쓰는 이유는 iOS에서 "82."처럼
 * 입력 중간 상태가 통째로 버려지는 것을 피하기 위해서다.
 *
 * 입력 버퍼(text)는 로컬 상태로만 두고 prop으로 되돌리지 않는다.
 * 값의 출처가 항상 이 입력 자신이므로 되돌릴 이유가 없고,
 * useLiveQuery 재렌더마다 커서가 튀는 문제를 막아준다.
 * 다른 레코드를 보여줄 때는 호출부에서 key로 리마운트한다.
 */
export function NumberField({
  label,
  value,
  onChange,
  suffix,
  decimal = false,
  placeholder,
}: {
  label?: string
  value: number | undefined
  onChange: (value: number | undefined) => void
  suffix?: string
  decimal?: boolean
  placeholder?: string
}) {
  const [text, setText] = useState(() => format(value))

  return (
    <div className="min-w-0">
      {label && <Label>{label}</Label>}
      <div className="relative">
        <input
          type="text"
          inputMode={decimal ? 'decimal' : 'numeric'}
          className={`${INPUT_CLASS} tabular-nums ${suffix ? 'pr-9' : ''}`}
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value)
            onChange(parse(e.target.value))
          }}
          onBlur={() => setText(format(parse(text)))}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-zinc-400">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}
