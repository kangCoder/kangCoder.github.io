import { financeDb } from './db'

/**
 * JSON 백업 — spec-finance-v0.2.md §1.4
 *
 * 시드 40여 건을 넣은 직후가 유실 시 손실이 가장 큰 시점이라 구현 순서를
 * 2단계로 당겼다.
 *
 * tables 안의 객체는 IndexedDB에 저장된 그대로다. 복원은 bulkPut 한 번으로
 * 끝나고, 나중에 필드를 추가해도 이 코드를 고칠 필요가 없다.
 */

const FORMAT = 'finance-backup'
const VERSION = 1

const TABLE_NAMES = [
  'transactions',
  'categories',
  'groups',
  'fixedCosts',
  'assets',
  'debts',
  'goals',
  'netWorthSnapshots',
  'incomeSettings',
  'cycleBudgets',
  'cycleCategoryBudgets',
  'appliedDeductions',
] as const

type TableName = (typeof TABLE_NAMES)[number]

export interface FinanceBackup {
  format: typeof FORMAT
  version: number
  exportedAt: number
  dbVersion: number
  tables: Record<string, unknown[]>
}

export async function exportBackup(): Promise<FinanceBackup> {
  const tables: Record<string, unknown[]> = {}
  for (const name of TABLE_NAMES) {
    tables[name] = await financeDb.table(name).toArray()
  }
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: Date.now(),
    dbVersion: financeDb.verno,
    tables,
  }
}

export function backupFileName(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 10)
  return `finance-backup-${stamp}.json`
}

export class BackupFormatError extends Error {}

/**
 * 운동 백업 파일을 가계부에 잘못 넣는 사고를 막는다.
 * format이 다르면 거부한다 — 잘못 복원하면 되돌릴 방법이 없다.
 */
export function parseBackup(text: string): FinanceBackup {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new BackupFormatError('JSON 파일이 아닙니다')
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new BackupFormatError('형식이 올바르지 않습니다')
  }
  const candidate = parsed as Partial<FinanceBackup>

  if (candidate.format !== FORMAT) {
    throw new BackupFormatError(
      `가계부 백업 파일이 아닙니다 (format: ${String(candidate.format ?? '없음')})`,
    )
  }
  if (typeof candidate.tables !== 'object' || candidate.tables === null) {
    throw new BackupFormatError('tables가 없습니다')
  }
  return candidate as FinanceBackup
}

export interface RestoreResult {
  restored: Partial<Record<TableName, number>>
  skipped: string[]
}

/**
 * 전부 지우고 다시 넣는다. 병합하면 같은 id의 옛 레코드가 남아
 * "복원했는데 지운 항목이 살아 있는" 상태가 된다.
 */
export async function restoreBackup(
  backup: FinanceBackup,
): Promise<RestoreResult> {
  const restored: Partial<Record<TableName, number>> = {}
  const skipped: string[] = []

  await financeDb.transaction(
    'rw',
    TABLE_NAMES.map((name) => financeDb.table(name)),
    async () => {
      for (const name of TABLE_NAMES) {
        const rows = backup.tables[name]
        if (!Array.isArray(rows)) {
          skipped.push(name)
          continue
        }
        await financeDb.table(name).clear()
        await financeDb.table(name).bulkPut(rows)
        restored[name] = rows.length
      }
    },
  )

  return { restored, skipped }
}
