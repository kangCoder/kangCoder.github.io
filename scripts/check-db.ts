/**
 * DB·백업·동기화 장부 검증 — spec-sync-v0.1.md §10
 *
 * 브라우저 없이 Node에서 Dexie를 돌린다. 실행:
 *   npm run check:db
 *
 * 확인하는 불변식:
 *   1. 스키마 버전이 올라갔고 syncState 스토어가 생긴다
 *   2. 기존 데이터가 마이그레이션에서 살아남는다
 *   3. 백업에 syncState가 담기지 않는다       ← §4의 핵심 결정
 *   4. 복원이 전체 교체다(지운 항목이 되살아나지 않는다)
 *   5. 복원이 syncState를 건드리지 않는다      ← 동기화가 깨지지 않는 조건
 *   6. patchSyncState가 필드를 부분 갱신한다
 *   7. format 가드
 *   8. 기존 기록이 있는 기기는 dirty=true로 시작한다  ← §7.3, 유실 방지의 핵심
 */
import 'fake-indexeddb/auto'

let failures = 0

function check(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    console.log(`  ok   ${label}`)
  } else {
    failures += 1
    console.log(`  FAIL ${label}\n         기대: ${e}\n         실제: ${a}`)
  }
}

async function main(): Promise<void> {
  const { db } = await import('../src/db/db')
  const { financeDb } = await import('../src/finance/db/db')
  const workoutBackup = await import('../src/db/backup')
  const financeBackup = await import('../src/finance/db/backup')
  const { getSyncState, patchSyncState } = await import('../src/sync/syncState')

  console.log('\n[1] 스키마 버전과 syncState 스토어')
  await db.open()
  await financeDb.open()
  check('workout-log verno', db.verno, 3)
  check('finance-log verno', financeDb.verno, 5)
  check('workout syncState 존재', db.tables.some((t) => t.name === 'syncState'), true)
  check('finance syncState 존재', financeDb.tables.some((t) => t.name === 'syncState'), true)

  console.log('\n[2] 기존 데이터가 살아남는가 (v2 → v3 경로)')
  await db.exercises.add({
    id: 'ex-1',
    name: '벤치프레스',
    type: 'WEIGHT_REPS',
    isArchived: false,
    createdAt: 1_700_000_000_000,
  })
  await db.workouts.add({ id: 'w-1', startedAt: 1_700_000_100_000 })
  await db.appSettings.put({ id: 'default', showWorkout: true, showFinance: false })
  check('exercises 1건', await db.exercises.count(), 1)
  check('appSettings 유지', (await db.appSettings.get('default'))?.showFinance, false)

  console.log('\n[3] 백업에 syncState가 담기지 않는가')
  await patchSyncState(db, { baseRev: 7, dirty: true, lastSyncedAt: 123, everPulled: true })
  const backup = await workoutBackup.exportBackup()
  check('tables에 syncState 없음', 'syncState' in backup.tables, false)
  check('dbVersion 기록', backup.dbVersion, 3)
  check('exercises 내보냄', backup.tables.exercises?.length, 1)

  const fBackup = await financeBackup.exportBackup()
  check('finance tables에 syncState 없음', 'syncState' in fBackup.tables, false)
  check('finance dbVersion 기록', fBackup.dbVersion, 5)

  console.log('\n[4] 복원이 전체 교체인가')
  // 백업을 뜬 뒤에 추가한 종목은 복원 후 사라져야 한다.
  // 병합이면 남아서 "다른 기기에서 지운 항목이 되살아나는" 버그가 된다.
  await db.exercises.add({
    id: 'ex-2',
    name: '복원 후 사라져야 함',
    type: 'TIME',
    isArchived: false,
    createdAt: 1_700_000_200_000,
  })
  check('복원 전 2건', await db.exercises.count(), 2)
  await workoutBackup.restoreBackup(backup)
  check('복원 후 1건', await db.exercises.count(), 1)
  check('ex-2 사라짐', await db.exercises.get('ex-2'), undefined)
  check('ex-1 남음', (await db.exercises.get('ex-1'))?.name, '벤치프레스')

  console.log('\n[5] 복원이 syncState를 건드리지 않는가')
  const after = await getSyncState(db)
  check('baseRev 보존', after.baseRev, 7)
  check('dirty 보존', after.dirty, true)
  check('everPulled 보존', after.everPulled, true)

  console.log('\n[6] patchSyncState 부분 갱신')
  await patchSyncState(db, { dirty: false })
  const patched = await getSyncState(db)
  check('dirty만 바뀜', patched.dirty, false)
  check('baseRev 그대로', patched.baseRev, 7)
  check('lastSyncedAt 그대로', patched.lastSyncedAt, 123)

  console.log('\n[7] format 가드 — 가계부 파일을 운동에 넣으면 거부')
  let rejected = ''
  try {
    workoutBackup.parseBackup(JSON.stringify(fBackup))
  } catch (e) {
    rejected = e instanceof Error ? e.constructor.name : 'unknown'
  }
  check('BackupFormatError 발생', rejected, 'BackupFormatError')

  console.log('\n[8] 기존 기록이 있는 기기가 보호되는가 — §7.3')
  // 폰처럼 이미 기록이 있는 기기. 동기화 코드가 처음 도는 순간을 재현한다.
  const { ensureSyncState } = await import('../src/sync/syncState')
  const { WORKOUT_USER_DATA_TABLES } = workoutBackup
  const { FINANCE_USER_DATA_TABLES } = financeBackup

  // 장부를 지워 "이 코드가 처음 도는 기기" 상태로 되돌린다
  await db.syncState.clear()
  check('장부 없음 + exercises 1건', await db.exercises.count(), 1)
  const adopted = await ensureSyncState(db, WORKOUT_USER_DATA_TABLES)
  check('기존 기록 → dirty=true', adopted.dirty, true)
  check('baseRev는 0', adopted.baseRev, 0)
  check('everPulled는 false', adopted.everPulled, false)

  // 두 번째 호출은 기존 장부를 그대로 돌려준다(덮어쓰지 않는다)
  await patchSyncState(db, { dirty: false, baseRev: 3 })
  const again = await ensureSyncState(db, WORKOUT_USER_DATA_TABLES)
  check('재호출은 기존 값 유지 (dirty)', again.dirty, false)
  check('재호출은 기존 값 유지 (baseRev)', again.baseRev, 3)

  // 빈 기기는 dirty=false — 정상적으로 원격을 받아야 한다
  await db.exercises.clear()
  await db.workouts.clear()
  await db.appSettings.put({ id: 'default', showWorkout: true, showFinance: true })
  await db.syncState.clear()
  const fresh = await ensureSyncState(db, WORKOUT_USER_DATA_TABLES)
  check('빈 기기 → dirty=false', fresh.dirty, false)
  check('appSettings만 있어도 dirty=false', await db.appSettings.count(), 1)

  // 가계부: 시드만 들어간 기기는 "기존 데이터 없음"이어야 한다
  const { seedIfEmpty } = await import('../src/finance/db/seed')
  await seedIfEmpty()
  await financeDb.syncState.clear()
  const seeded = await ensureSyncState(financeDb, FINANCE_USER_DATA_TABLES)
  check('시드만 → dirty=false', seeded.dirty, false)
  check('시드는 들어가 있다', (await financeDb.categories.count()) > 0, true)

  // 거래 1건이 생기면 "기존 데이터 있음"
  await financeDb.transactions.add({
    id: 'tx-1',
    date: '2026-10-07',
    cycleKey: '2026-10',
    type: 'EXPENSE',
    categoryId: 'c-1',
    amount: 10000,
    isFixed: false,
    isAutoGenerated: false,
  })
  await financeDb.syncState.clear()
  const withTx = await ensureSyncState(financeDb, FINANCE_USER_DATA_TABLES)
  check('거래 1건 → dirty=true', withTx.dirty, true)

  console.log(
    failures === 0
      ? '\n전부 통과\n'
      : `\n${failures}건 실패\n`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

void main()
