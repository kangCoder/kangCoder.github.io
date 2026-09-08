import { NumberField } from '../../components/fields'
import { DEFAULT_RATE_PERCENT, MAX_RATE_PERCENT } from '../lib/rate'

/** 예상 연 수익률 입력 — 슬라이더 대신 직접 넣는다 */
export function RateField({
  value,
  onChange,
}: {
  value: number | undefined
  onChange: (value: number | undefined) => void
}) {
  const over = value !== undefined && value > MAX_RATE_PERCENT
  return (
    <div>
      <NumberField
        label="예상 연 수익률"
        suffix="%"
        decimal
        value={value}
        onChange={onChange}
        placeholder={String(DEFAULT_RATE_PERCENT)}
      />
      {over && (
        <p className="mt-1 text-[12px] text-amber-700">
          최대 {MAX_RATE_PERCENT}%까지 반영됩니다.
        </p>
      )}
    </div>
  )
}
