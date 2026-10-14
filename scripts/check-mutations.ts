/**
 * 변경 감지와 억제 검증 — spec-sync-v0.1.md §5.1
 *
 * 실행: npm run check:mutations
 *
 * 이 하네스가 지키는 것은 "DB 레이어 3,300줄을 고치지 않고도 모든 쓰기가
 * 감지되는가"다. 한 테이블이라도 빠지면 그 테이블의 변경은 영원히 올라가지
 * 않는다 — 조용한 유실이라 눈에 띄지 않는다.
 *
 * 확인하는 불변식:
 *   1. create·update·delete 모두 감지된다
 *   2. 모든 스냅샷 테이블에 훅이 걸린다 (빠진 테이블이 없다)
 *   3. syncState 쓰기는 감지되지 않는다 (무한 루프 방지)
 *   4. 억제 중에는 감지되지 않는다 (pull의 전체 교체)
 *   5. 억제가 중첩돼도 안쪽이 끝날 때 풀리지 않는다
 *   6. 구독 해제가 실제로 떼어 낸다
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
  const { WORKOUT_TABLE_NAMES } = await import('../src/db/backup')
  const { watchMutations, suppressMutations } = await import(
    '../src/sync/mutations'
  )
  const { patchSyncState } = await import('../src/sync/syncState')

  await db.open()

  let hits = 0
  const stop = watchMutations(db, WORKOUT_TABLE_NAMES, () => {
    hits += 1
  })

  console.log('\n[1] create · update · delete 감지')
  hits = 0
  await db.exercises.add({
    id: 'ex-1',
    name: '벤치프레스',
    type: 'WEIGHT_REPS',
    isArchived: false,
    createdAt: 1,
  })
  check('create 감지', hits > 0, true)

  hits = 0
  await db.exercises.update('ex-1', { name: '벤치프레스 변경' })
  check('update 감지', hits > 0, true)

  hits = 0
  await db.exercises.delete('ex-1')
  check('delete 감지', hits > 0, true)

  console.log('\n[2] 모든 스냅샷 테이블에 훅이 걸렸는가')
  // 테이블마다 한 건 넣어 감지되는지 본다. 하나라도 빠지면 그 테이블의
  // 변경은 영원히 올라가지 않는다.
  const sample: Record<string, unknown> = {
    exercises: { id: 's', name: 'x', type: 'TIME', isArchived: false, createdAt: 1 },
    templates: { id: 's', name: 'x', sortOrder: 0, isArchived: false },
    templateExercises: { id: 's', templateId: 't', exerciseId: 'e', sortOrder: 0 },
    workouts: { id: 's', startedAt: 1 },
    workoutExercises: {
      id: 's',
      workoutId: 'w',
      exerciseId: 'e',
      exerciseName: 'x',
      exerciseType: 'TIME',
      sortOrder: 0,
    },
    workoutSets: {
      id: 's',
      workoutExerciseId: 'we',
      exerciseId: 'e',
      setNumber: 1,
      setType: 'NORMAL',
      isCompleted: false,
    },
    runs: { id: 's', startedAt: 1, durationSec: 1, distanceKm: 1 },
    bodyweights: { date: '2026-01-01', weightKg: 70 },
    appSettings: { id: 'default', showWorkout: true, showFinance: true },
  }
  const missed: string[] = []
  for (const name of WORKOUT_TABLE_NAMES) {
    hits = 0
    await db.table(name).put(sample[name])
    if (hits === 0) missed.push(name)
  }
  check('훅이 빠진 테이블', missed, [])
  check('검사한 테이블 수', WORKOUT_TABLE_NAMES.length, 9)

  console.log('\n[3] syncState 쓰기는 감지되지 않는가')
  hits = 0
  await patchSyncState(db, { dirty: true })
  check('syncState는 무시', hits, 0)

  console.log('\n[4] 억제 중에는 감지되지 않는가')
  hits = 0
  await suppressMutations(async () => {
    await db.exercises.put({
      id: 'ex-2',
      name: '억제 중',
      type: 'TIME',
      isArchived: false,
      createdAt: 1,
    })
  })
  check('억제 중 감지 0', hits, 0)

  // 억제가 끝나면 다시 감지돼야 한다
  hits = 0
  await db.exercises.put({
    id: 'ex-3',
    name: '억제 후',
    type: 'TIME',
    isArchived: false,
    createdAt: 1,
  })
  check('억제 해제 후 감지', hits > 0, true)

  console.log('\n[5] 억제 중첩')
  hits = 0
  await suppressMutations(async () => {
    await suppressMutations(async () => {
      await db.exercises.put({
        id: 'n1',
        name: 'inner',
        type: 'TIME',
        isArchived: false,
        createdAt: 1,
      })
    })
    // 안쪽이 끝났지만 바깥 억제가 살아 있어야 한다
    await db.exercises.put({
      id: 'n2',
      name: 'outer',
      type: 'TIME',
      isArchived: false,
      createdAt: 1,
    })
  })
  check('중첩 전체 억제', hits, 0)

  console.log('\n[6] 구독 해제')
  stop()
  hits = 0
  await db.exercises.put({
    id: 'ex-4',
    name: '해제 후',
    type: 'TIME',
    isArchived: false,
    createdAt: 1,
  })
  check('해제 후 감지 0', hits, 0)

  console.log(failures === 0 ? '\n전부 통과\n' : `\n${failures}건 실패\n`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
