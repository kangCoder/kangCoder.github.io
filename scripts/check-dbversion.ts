/**
 * dbVersion 가드 방향 검증 — spec-sync-v0.1.md §8
 *
 * 실행: npm run check:dbversion
 *
 * "정확히 같을 때만"으로 만들었다가 교착을 겪었다. 스키마를 올리면 원격
 * 기록은 옛 번호로 남고, 같을 것을 요구하면 아무도 올릴 수 없어 원격이
 * 영원히 옛 번호에 멈춘다. 방향이 뒤집히면 다시 같은 일이 벌어지므로
 * 순수 함수로 떼어내 못 박는다.
 */
import { pullBlockedByVersion, pushBlockedByVersion } from '../src/sync/version'

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

console.log('\n[1] push — 원격이 더 새로울 때만 막는다')
// 스키마를 올린 직후: 원격은 옛 번호, 내 앱은 새 번호. 올려서 끌어올려야 한다
check('원격 5, 로컬 6 → 올린다', pushBlockedByVersion(5, 6), false)
check('같으면 올린다', pushBlockedByVersion(6, 6), false)
// 내 앱이 낡았다: 모르는 필드를 떨어뜨린 채 덮어쓴다
check('원격 6, 로컬 5 → 막는다', pushBlockedByVersion(6, 5), true)

console.log('\n[2] pull — 원격이 더 새로울 때만 막는다')
check('원격 6, 로컬 5 → 막는다', pullBlockedByVersion(6, 5), true)
check('같으면 받는다', pullBlockedByVersion(6, 6), false)
// 올릴 것이 없는 새 기기가 옛 원격을 못 받으면 아무것도 못 한다
check('원격 5, 로컬 6 → 받는다', pullBlockedByVersion(5, 6), false)

console.log('\n[3] 교착이 풀리는가 — 실제로 겪은 경로')
// 배포 전 PC가 v5로 올림(원격 5) → 양쪽 v6으로 갱신
const remote = 5
const pc = 6
const phone = 6
check('PC가 올릴 수 있다', pushBlockedByVersion(remote, pc), false)
// PC가 올리면 원격이 6이 된다
check('그 뒤 폰이 받을 수 있다', pullBlockedByVersion(6, phone), false)

console.log(failures === 0 ? '\n전부 통과\n' : `\n${failures}건 실패\n`)
process.exit(failures === 0 ? 0 : 1)
