import type { AssetKind } from '../db/types'

export const ASSET_KINDS: AssetKind[] = [
  'SAVINGS',
  'INVESTMENT',
  'PENSION',
  'CASH',
  'DEPOSIT',
]

export const ASSET_KIND_LABEL: Record<AssetKind, string> = {
  SAVINGS: '예적금',
  INVESTMENT: '투자',
  PENSION: '연금',
  CASH: '현금',
  DEPOSIT: '보증금',
}

/**
 * 도넛 차트 색. 채도를 낮춰 인접한 조각이 서로 튀지 않게 하고,
 * 명도 차를 벌려 흑백으로 봐도 구분되게 골랐다.
 */
export const ASSET_KIND_COLOR: Record<AssetKind, string> = {
  SAVINGS: '#18181b',
  INVESTMENT: '#0284c7',
  PENSION: '#7c3aed',
  CASH: '#059669',
  DEPOSIT: '#a1a1aa',
}
