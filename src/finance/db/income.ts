import { financeDb } from './db'
import type { Deduction, IncomeSetting } from './types'

/** 소득 설정은 id가 'default'인 단일 레코드다(§3.2) */
const ID = 'default' as const

export function getIncomeSetting(): Promise<IncomeSetting | undefined> {
  return financeDb.incomeSettings.get(ID)
}

export async function saveIncomeSetting(input: {
  grossPay: number
  netPay: number
  payday: number
  deductions: Deduction[]
}): Promise<void> {
  await financeDb.incomeSettings.put({ id: ID, ...input })
}

export const DEFAULT_PAYDAY = 25
