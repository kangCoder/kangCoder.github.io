import type { TxType } from '../db/types'

/** 거래 유형 표시 — 컴포넌트와 파일을 나눠야 fast refresh가 동작한다 */
export const TYPE_LABEL: Record<TxType, string> = {
  EXPENSE: '지출',
  SAVING: '저축/투자',
  TRANSFER: '원금상환',
  INCOME: '수입',
}

export const TYPE_CLASS: Record<TxType, string> = {
  EXPENSE: 'bg-zinc-100 text-zinc-600',
  SAVING: 'bg-emerald-100 text-emerald-700',
  TRANSFER: 'bg-sky-100 text-sky-700',
  INCOME: 'bg-amber-100 text-amber-700',
}
