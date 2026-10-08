import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getFirebaseAuth, getFirestoreDb } from './firebase'

/**
 * 이름 + PIN 로그인 — docs/spec-sync-v0.1.md §2
 *
 * Firebase Auth의 이메일/비밀번호를 쓰되 **이메일과 비밀번호를 앱이 합성한다.**
 * 사용자는 이름과 숫자 4자리만 입력하고, 이메일이 있다는 사실조차 모른다.
 *
 * 인증을 끼우는 이유는 Firestore 보안 규칙이 사람을 구분할 근거를 갖기
 * 위함이다. 인증이 없으면 규칙이 `if true`가 되고, 공개 번들의 설정값을 본
 * 외부인이 전원의 기록을 지울 수 있다(§2.2).
 */

const EMAIL_DOMAIN = 'kangcoder.local'

/**
 * **이 문자열은 영구적이다.** 바꾸면 기존 계정 전원이 로그인 불가가 된다.
 * Firebase Auth 비밀번호 최소 길이가 6자라서 4자리 PIN을 그대로 쓸 수 없어
 * 붙이는 패딩이다. 바꿀 일이 생기면 버전을 올리고 마이그레이션을 따로 설계한다(§2.2).
 */
const PASSWORD_SUFFIX = '#kangcoder-sync-v1'

const NAME_PATTERN = /^[a-z0-9_-]{2,20}$/
const PIN_PATTERN = /^\d{4}$/

/**
 * 소문자로 모은다 — `Hyunsu`와 `hyunsu`가 다른 계정이 되면 사용자 눈에는
 * "기록이 사라졌다"로 보인다(§2.2).
 */
export function normalizeName(raw: string): string {
  return raw.trim().toLowerCase()
}

/** 입력 단계에서 걸러낸다. 네트워크를 타기 전에 알려주는 쪽이 빠르다. */
export function validateCredentials(
  rawName: string,
  pin: string,
): string | undefined {
  const name = normalizeName(rawName)
  if (name === '') return '이름을 입력하세요'
  if (!NAME_PATTERN.test(name)) {
    return '이름은 영문 소문자·숫자·_·- 2~20자입니다'
  }
  if (!PIN_PATTERN.test(pin)) return 'PIN은 숫자 4자리입니다'
  return undefined
}

/**
 * 이름·PIN → Firebase Auth 자격 증명.
 *
 * **export하는 이유는 검증 하네스가 이 형식을 고정하기 위함이다.** 여기가
 * 조용히 바뀌면 기존 계정 전원이 로그인 불가가 되고, 그 사실은 실제
 * 로그인을 시도해 보기 전까지 드러나지 않는다(§2.2).
 */
export function toCredential(
  rawName: string,
  pin: string,
): { email: string; password: string } {
  return {
    email: `${normalizeName(rawName)}@${EMAIL_DOMAIN}`,
    password: `${pin}${PASSWORD_SUFFIX}`,
  }
}

/**
 * 로그인 실패 메시지 — §2.5
 *
 * 신규 Firebase 프로젝트는 이메일 열거 방지가 켜져 있어 "계정 없음"과
 * "비밀번호 틀림"을 `auth/invalid-credential` 하나로 합쳐 돌려준다.
 * 구분해 보여주려 해도 할 수 없으므로 한 문장으로 통일하고, 새 계정은
 * 화면에서 별도 버튼으로 분리한다.
 */
export function authErrorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return '이름 또는 PIN이 맞지 않습니다'
    case 'auth/email-already-in-use':
      return '이미 쓰는 이름입니다'
    case 'auth/too-many-requests':
      return '시도가 너무 많습니다. 잠시 후 다시 해주세요'
    case 'auth/network-request-failed':
      return '네트워크에 연결할 수 없습니다'
    case 'auth/invalid-email':
      return '이름에 쓸 수 없는 문자가 있습니다'
    default:
      return code === ''
        ? '로그인하지 못했습니다'
        : `로그인하지 못했습니다 (${code})`
  }
}

export async function signIn(rawName: string, pin: string): Promise<void> {
  const { email, password } = toCredential(rawName, pin)
  await signInWithEmailAndPassword(getFirebaseAuth(), email, password)
}

/**
 * 새 이름으로 시작한다.
 *
 * displayName에 이름을 심는 이유 — 화면에 "hyunsu"를 띄울 때 Firestore를
 * 읽지 않아도 되고, 오프라인에서도 보인다.
 */
export async function register(rawName: string, pin: string): Promise<void> {
  const name = normalizeName(rawName)
  const { email, password } = toCredential(rawName, pin)
  const credential = await createUserWithEmailAndPassword(
    getFirebaseAuth(),
    email,
    password,
  )

  await updateProfile(credential.user, { displayName: name })

  // 프로필 문서는 콘솔에서 사람이 읽기 위한 것이다. 실패해도 로그인은
  // 성립하므로 전체를 되돌리지 않는다 — 이름의 실제 출처는 계정 자체다.
  try {
    await setDoc(
      doc(getFirestoreDb(), 'users', credential.user.uid),
      { name, createdAt: serverTimestamp() },
      { merge: true },
    )
  } catch {
    // 무시 — §3의 프로필 문서는 표시용이다
  }
}

export async function signOutAccount(): Promise<void> {
  await signOut(getFirebaseAuth())
}

/** 표시용 이름. displayName이 없으면 합성 이메일에서 되돌린다 */
export function accountName(user: User): string {
  return user.displayName ?? user.email?.replace(`@${EMAIL_DOMAIN}`, '') ?? '?'
}

export { onAuthStateChanged }
export type { User }
