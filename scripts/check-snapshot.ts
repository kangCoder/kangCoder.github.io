/**
 * 스냅샷 인코딩 검증 — spec-sync-v0.1.md §3.2
 *
 * 실행: npm run check:snapshot
 *
 * Firestore를 띄우지 않고 인코딩만 본다. CAS와 보안 규칙은 에뮬레이터가
 * 필요해 여기서 다루지 않는다.
 *
 * 확인하는 불변식:
 *   1. gzip 왕복이 값을 보존한다 (한글·undefined·중첩 포함)
 *   2. 압축이 실제로 줄인다 — 1 MiB 한도 대응의 전제다
 *   3. 비압축 폴백도 왕복한다
 *   4. 깨진 입력은 SnapshotFormatError로 거부한다
 *   5. workoutSets 10년치 추정이 문서 한도 안에 들어간다
 */
import {
  decodeTable,
  encodeTable,
  encodedSize,
  SnapshotFormatError,
  supportsCompression,
} from '../src/sync/snapshot'

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
  console.log('\n[0] 환경')
  check('CompressionStream 사용 가능', supportsCompression(), true)

  console.log('\n[1] gzip 왕복')
  const rows = [
    { id: 'a', name: '벤치프레스', weight: 82.5, reps: 8, isCompleted: true },
    { id: 'b', name: '점심 · 김치찌개', amount: 9000, memo: undefined },
    { id: 'c', nested: { deep: [1, 2, { x: null }] } },
  ]
  const encoded = await encodeTable(rows)
  check('gz 필드로 인코딩됨', encoded.gz !== undefined, true)
  const decoded = await decodeTable(encoded)
  // JSON은 undefined를 버린다. 백업·복원이 원래 그렇게 동작하므로
  // 여기서도 같은 기준으로 비교한다.
  check('왕복 보존', decoded, JSON.parse(JSON.stringify(rows)))

  console.log('\n[2] 압축이 실제로 줄이는가')
  // 실제 workoutSets 모양을 흉내낸 반복 데이터
  const many = Array.from({ length: 5000 }, (_, i) => ({
    id: `set-${i}`,
    workoutExerciseId: `we-${i % 300}`,
    exerciseId: `ex-${i % 40}`,
    setNumber: (i % 5) + 1,
    setType: 'NORMAL',
    weight: 60 + (i % 40),
    reps: 8,
    isCompleted: true,
    completedAt: 1_700_000_000_000 + i * 60_000,
  }))
  const raw = new Blob([JSON.stringify(many)]).size
  const packed = await encodeTable(many)
  const packedSize = encodedSize(packed)
  const ratio = raw / packedSize
  console.log(
    `       원본 ${(raw / 1024).toFixed(0)} KB → gzip ${(packedSize / 1024).toFixed(0)} KB (${ratio.toFixed(1)}배)`,
  )
  check('3배 이상 줄어든다', ratio >= 3, true)
  check('5000건 왕복 건수 일치', (await decodeTable(packed)).length, 5000)

  console.log('\n[3] 비압축 폴백')
  const plain = { json: JSON.stringify(rows) } as const
  check('json 필드도 읽는다', await decodeTable(plain), JSON.parse(JSON.stringify(rows)))
  check('크기 계산', encodedSize(plain) > 0, true)

  console.log('\n[4] 깨진 입력 거부')
  let kind = ''
  try {
    await decodeTable({ json: '{not json' })
  } catch (e) {
    kind = e instanceof SnapshotFormatError ? 'SnapshotFormatError' : 'other'
  }
  check('JSON 아님 → SnapshotFormatError', kind, 'SnapshotFormatError')

  kind = ''
  try {
    await decodeTable({ json: '{"a":1}' })
  } catch (e) {
    kind = e instanceof SnapshotFormatError ? 'SnapshotFormatError' : 'other'
  }
  check('배열 아님 → SnapshotFormatError', kind, 'SnapshotFormatError')

  console.log('\n[5] 10년치 추정이 문서 한도(1 MiB) 안에 들어가는가')
  // 주 4회 × 30세트 × 52주 × 10년 ≈ 62,400건
  const tenYears = Array.from({ length: 62_400 }, (_, i) => ({
    id: `set-${i}`,
    workoutExerciseId: `we-${Math.floor(i / 5)}`,
    exerciseId: `ex-${i % 40}`,
    setNumber: (i % 5) + 1,
    setType: 'NORMAL',
    weight: 60 + (i % 40),
    reps: 8 + (i % 4),
    isCompleted: true,
    completedAt: 1_500_000_000_000 + i * 90_000,
  }))
  const tenYearsRaw = new Blob([JSON.stringify(tenYears)]).size
  const tenYearsPacked = encodedSize(await encodeTable(tenYears))
  console.log(
    `       원본 ${(tenYearsRaw / 1024 / 1024).toFixed(1)} MB → gzip ${(tenYearsPacked / 1024).toFixed(0)} KB`,
  )
  check('1 MiB 미만', tenYearsPacked < 1024 * 1024, true)

  console.log(failures === 0 ? '\n전부 통과\n' : `\n${failures}건 실패\n`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
