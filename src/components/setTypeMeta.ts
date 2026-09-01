import type { SetType } from '../db/types'

/**
 * 세트 타입 표시 — §7
 * 워밍업을 본세트와 구분하지 않으면 볼륨 그래프가 오염되므로
 * 세션 화면에서 바로 바꿀 수 있어야 한다.
 */

/** 세트 번호를 탭할 때마다 이 순서로 순환한다 */
export const SET_TYPE_CYCLE: SetType[] = [
  'NORMAL',
  'WARMUP',
  'FAILURE',
  'DROP',
]

export const SET_TYPE_LABEL: Record<SetType, string> = {
  NORMAL: '본세트',
  WARMUP: '워밍업',
  FAILURE: '실패',
  DROP: '드롭',
}

/** 번호 자리에 겹쳐 쓰는 한 글자 */
export const SET_TYPE_MARK: Record<SetType, string> = {
  NORMAL: '',
  WARMUP: 'W',
  FAILURE: 'F',
  DROP: 'D',
}

export const SET_TYPE_CLASS: Record<SetType, string> = {
  NORMAL: 'bg-zinc-100 text-zinc-500',
  WARMUP: 'bg-amber-100 text-amber-700',
  FAILURE: 'bg-red-100 text-red-700',
  DROP: 'bg-violet-100 text-violet-700',
}

export function nextSetType(current: SetType): SetType {
  const index = SET_TYPE_CYCLE.indexOf(current)
  return SET_TYPE_CYCLE[(index + 1) % SET_TYPE_CYCLE.length]
}
