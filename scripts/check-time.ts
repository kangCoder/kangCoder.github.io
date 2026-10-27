/**
 * 분·초 변환 검증 — spec-v0.5.md §4.1.1
 *
 * 실행: npm run check:time
 *
 * 미입력(undefined)과 0초를 구분하지 못하면, 시간을 지웠을 때 0초로
 * 저장돼 "0초 완료"로 집계된다. 왕복이 깨지면 조용히 기록이 변형된다.
 */
import {
  formatMinutesSeconds,
  joinSeconds,
  splitSeconds,
} from '../src/lib/cardio'

let failures = 0

function check(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) console.log(`  ok   ${label}`)
  else {
    failures += 1
    console.log(`  FAIL ${label}\n         기대: ${e}\n         실제: ${a}`)
  }
}

console.log('\n[1] 분해')
check('1950초 → 32분 30초', splitSeconds(1950), { minutes: 32, seconds: 30 })
check('45초 → 0분 45초', splitSeconds(45), { minutes: 0, seconds: 45 })
check('3600초 → 60분 0초', splitSeconds(3600), { minutes: 60, seconds: 0 })
check('미입력 유지', splitSeconds(undefined), {
  minutes: undefined,
  seconds: undefined,
})

console.log('\n[2] 결합')
check('32분 30초 → 1950', joinSeconds(32, 30), 1950)
check('분만', joinSeconds(5, undefined), 300)
check('초만', joinSeconds(undefined, 45), 45)
// 둘 다 비면 undefined여야 한다. 0을 돌려주면 "0초 완료"로 집계된다
check('둘 다 비면 미입력', joinSeconds(undefined, undefined), undefined)
check('0분 0초는 0초', joinSeconds(0, 0), 0)

console.log('\n[3] 왕복')
for (const total of [0, 1, 45, 60, 90, 1950, 3600, 7325]) {
  const { minutes, seconds } = splitSeconds(total)
  if (joinSeconds(minutes, seconds) !== total) {
    failures += 1
    console.log(`  FAIL ${total}초 왕복 실패`)
  }
}
check('왕복 전부 보존', true, true)

console.log('\n[4] 표기')
check('32분 30초', formatMinutesSeconds(1950), '32분 30초')
check('초만', formatMinutesSeconds(45), '45초')
check('분만', formatMinutesSeconds(300), '5분')
check('0초', formatMinutesSeconds(0), '0초')
check('미입력', formatMinutesSeconds(undefined), '-')

console.log(failures === 0 ? '\n전부 통과\n' : `\n${failures}건 실패\n`)
process.exit(failures === 0 ? 0 : 1)
