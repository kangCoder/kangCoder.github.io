/**
 * 이름 + PIN 자격 증명 검증 — spec-sync-v0.1.md §2
 *
 * 실행: npm run check:auth
 *
 * 네트워크 없이 순수 함수만 본다. Firebase를 건드리지 않으므로
 * firebase.ts의 지연 초기화가 돌지 않는다(설정값 없이도 통과한다).
 *
 * 확인하는 불변식:
 *   1. 이름 정규화 — Hyunsu와 hyunsu가 같은 계정이 된다
 *   2. 합성 형식 고정 — 바뀌면 기존 계정 전원이 로그인 불가가 된다
 *   3. 비밀번호가 Firebase 최소 길이(6자)를 넘는다
 *   4. 입력 검증이 네트워크 전에 걸러낸다
 *   5. 오류 코드 → 한국어 메시지, 열거 방지 코드들이 한 문장으로 모인다
 */
import {
  authErrorMessage,
  normalizeName,
  toCredential,
  validateCredentials,
} from '../src/sync/auth'

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

console.log('\n[1] 이름 정규화')
check('대문자 → 소문자', normalizeName('Hyunsu'), 'hyunsu')
check('공백 제거', normalizeName('  hyunsu  '), 'hyunsu')
check('전부 대문자', normalizeName('HYUNSU'), 'hyunsu')

console.log('\n[2] 합성 형식 — 이 값이 바뀌면 기존 계정이 로그인 불가가 된다')
check('email', toCredential('hyunsu', '1234').email, 'hyunsu@kangcoder.local')
check(
  'password',
  toCredential('hyunsu', '1234').password,
  '1234#kangcoder-sync-v1',
)
check(
  '대소문자 달라도 같은 계정',
  toCredential('Hyunsu', '1234').email,
  toCredential('hyunsu', '1234').email,
)

console.log('\n[3] 비밀번호가 Firebase 최소 6자를 넘는가')
check(
  'PIN 0000 길이 ≥ 6',
  toCredential('a', '0000').password.length >= 6,
  true,
)

console.log('\n[4] 입력 검증')
check('정상', validateCredentials('hyunsu', '1234'), undefined)
check('빈 이름', validateCredentials('', '1234'), '이름을 입력하세요')
check(
  '한글 이름 거부',
  validateCredentials('현수', '1234'),
  '이름은 영문 소문자·숫자·_·- 2~20자입니다',
)
check(
  '1자 이름 거부',
  validateCredentials('h', '1234'),
  '이름은 영문 소문자·숫자·_·- 2~20자입니다',
)
check(
  '21자 이름 거부',
  validateCredentials('a'.repeat(21), '1234'),
  '이름은 영문 소문자·숫자·_·- 2~20자입니다',
)
check('대문자 입력은 정규화로 통과', validateCredentials('Hyunsu', '1234'), undefined)
check('밑줄·하이픈 허용', validateCredentials('hyun_su-2', '1234'), undefined)
check('PIN 3자리 거부', validateCredentials('hyunsu', '123'), 'PIN은 숫자 4자리입니다')
check('PIN 5자리 거부', validateCredentials('hyunsu', '12345'), 'PIN은 숫자 4자리입니다')
check('PIN 문자 거부', validateCredentials('hyunsu', '12a4'), 'PIN은 숫자 4자리입니다')
check('PIN 0000 허용', validateCredentials('hyunsu', '0000'), undefined)

console.log('\n[5] 오류 메시지 — 열거 방지 코드들이 한 문장으로 모이는가')
const SAME = '이름 또는 PIN이 맞지 않습니다'
check('invalid-credential', authErrorMessage({ code: 'auth/invalid-credential' }), SAME)
check('user-not-found', authErrorMessage({ code: 'auth/user-not-found' }), SAME)
check('wrong-password', authErrorMessage({ code: 'auth/wrong-password' }), SAME)
check(
  'email-already-in-use',
  authErrorMessage({ code: 'auth/email-already-in-use' }),
  '이미 쓰는 이름입니다',
)
check(
  'too-many-requests',
  authErrorMessage({ code: 'auth/too-many-requests' }),
  '시도가 너무 많습니다. 잠시 후 다시 해주세요',
)
check(
  'network-request-failed',
  authErrorMessage({ code: 'auth/network-request-failed' }),
  '네트워크에 연결할 수 없습니다',
)
check(
  '모르는 코드는 코드를 노출',
  authErrorMessage({ code: 'auth/weird' }),
  '로그인하지 못했습니다 (auth/weird)',
)
check('코드 없는 오류', authErrorMessage(new Error('boom')), '로그인하지 못했습니다')

console.log(failures === 0 ? '\n전부 통과\n' : `\n${failures}건 실패\n`)
process.exit(failures === 0 ? 0 : 1)
