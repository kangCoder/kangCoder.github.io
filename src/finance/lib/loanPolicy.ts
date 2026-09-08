/**
 * ⚠️ 2026-08 시점의 입력값 기준. 검증되지 않은 값이다.
 * LTV·DSR·생애최초 요건은 정부 대책에 따라 수시로 바뀐다.
 * 실행이 가까워지면 주택도시기금 또는 은행 창구에서 반드시 재확인할 것.
 * 이 시뮬레이터는 방향 감각용이며 확정 계산기가 아니다.
 */
export const POLICY_AS_OF = '2026-08'

export interface LoanPolicy {
  key: string
  name: string
  maxLoan: number
  ltvCapital: number
  maxHousePrice?: number
  incomeLimit: number
}

export const BOGEUMJARI: LoanPolicy = {
  key: 'BOGEUMJARI',
  name: '보금자리론 (생애최초)',
  maxLoan: 420_000_000,
  ltvCapital: 0.7,
  maxHousePrice: 600_000_000,
  incomeLimit: 70_000_000,
}

export const DIDIMDOL: LoanPolicy = {
  key: 'DIDIMDOL',
  name: '디딤돌 대출',
  maxLoan: 240_000_000,
  ltvCapital: 0.7,
  incomeLimit: 85_000_000,
}

export const POLICIES: LoanPolicy[] = [BOGEUMJARI, DIDIMDOL]

/** 취득세·중개수수료·이사비 — 주택가격의 약 2% */
export const INCIDENTAL_RATE = 0.02
