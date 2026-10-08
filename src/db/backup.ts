import { db } from './db'

/**
 * 운동 기록 JSON 백업 — spec-sync-v0.1.md §10
 *
 * 가계부의 `src/finance/db/backup.ts`를 미러링한다. 구조를 일부러 같게
 * 두었다 — 3단계에서 동기화 엔진이 두 영역을 같은 코드로 다루게 된다.
 *
 * tables 안의 객체는 IndexedDB에 저장된 그대로다. 복원은 bulkPut 한 번으로
 * 끝나고, 나중에 필드를 추가해도 이 코드를 고칠 필요가 없다.
 */

const FORMAT = 'workout-backup'
const VERSION = 1

/**
 * **syncState는 일부러 빠져 있다** — §4. 동기화 장부는 기기에 속한 것이라
 * 담으면 복원이 baseRev·dirty를 남의 기기 값으로 덮어쓴다.
 *
 * appSettings는 담는다. 어느 영역을 쓸지는 사람마다 다른 설정이고,
 * 저장 위치가 운동 DB다(`appSettings.ts` 주석 참조).
 */
const TABLE_NAMES = [
  'exercises',
  'templates',
  'templateExercises',
  'workouts',
  'workoutExercises',
  'workoutSets',
  'runs',
  'bodyweights',
  'appSettings',
] as const

type TableName = (typeof TABLE_NAMES)[number]

export { TABLE_NAMES as WORKOUT_TABLE_NAMES }

/**
 * "이 기기에 실제 기록이 있는가"를 판단할 테이블 — spec-sync-v0.1.md §7.3
 *
 * appSettings는 제외한다. 영역 토글만 건드린 기기는 기록이 없는 것으로 봐야
 * 한다. 운동 쪽에는 시드가 없으므로 나머지는 전부 사용자가 만든 것이다.
 */
export const WORKOUT_USER_DATA_TABLES = [
  'exercises',
  'templates',
  'templateExercises',
  'workouts',
  'workoutExercises',
  'workoutSets',
  'runs',
  'bodyweights',
] as const

export interface WorkoutBackup {
  format: typeof FORMAT
  version: number
  exportedAt: number
  dbVersion: number
  tables: Record<string, unknown[]>
}

export async function exportBackup(): Promise<WorkoutBackup> {
  const tables: Record<string, unknown[]> = {}
  for (const name of TABLE_NAMES) {
    tables[name] = await db.table(name).toArray()
  }
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: Date.now(),
    dbVersion: db.verno,
    tables,
  }
}

export function backupFileName(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 10)
  return `workout-backup-${stamp}.json`
}

export class BackupFormatError extends Error {}

/**
 * 가계부 백업 파일을 운동에 잘못 넣는 사고를 막는다.
 * format이 다르면 거부한다 — 잘못 복원하면 되돌릴 방법이 없다.
 */
export function parseBackup(text: string): WorkoutBackup {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new BackupFormatError('JSON 파일이 아닙니다')
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new BackupFormatError('형식이 올바르지 않습니다')
  }
  const candidate = parsed as Partial<WorkoutBackup>

  if (candidate.format !== FORMAT) {
    throw new BackupFormatError(
      `운동 기록 백업 파일이 아닙니다 (format: ${String(candidate.format ?? '없음')})`,
    )
  }
  if (typeof candidate.tables !== 'object' || candidate.tables === null) {
    throw new BackupFormatError('tables가 없습니다')
  }
  return candidate as WorkoutBackup
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
  backup: WorkoutBackup,
): Promise<RestoreResult> {
  const restored: Partial<Record<TableName, number>> = {}
  const skipped: string[] = []

  await db.transaction(
    'rw',
    TABLE_NAMES.map((name) => db.table(name)),
    async () => {
      for (const name of TABLE_NAMES) {
        const rows = backup.tables[name]
        if (!Array.isArray(rows)) {
          skipped.push(name)
          continue
        }
        await db.table(name).clear()
        await db.table(name).bulkPut(rows)
        restored[name] = rows.length
      }
    },
  )

  return { restored, skipped }
}
