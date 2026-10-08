import { useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { getFirebaseAuth, missingFirebaseEnv } from './firebase'

/**
 * 로그인 상태 — docs/spec-sync-v0.1.md §7
 *
 * 세 상태를 구분하는 이유: 'loading'을 'signedOut'과 합치면 앱을 열 때마다
 * 로그인 화면이 한 번 깜빡인다. Auth가 IndexedDB에서 세션을 복원하는 데
 * 한 틱이 걸린다(§2.6).
 */
export type AuthState =
  | { state: 'misconfigured'; missing: string[] }
  | { state: 'loading' }
  | { state: 'signedOut' }
  | { state: 'signedIn'; user: User }

export function useAuthUser(): AuthState {
  const missing = missingFirebaseEnv()
  const [auth, setAuth] = useState<AuthState>({ state: 'loading' })

  useEffect(() => {
    if (missing.length > 0) return

    return onAuthStateChanged(getFirebaseAuth(), (user) => {
      setAuth(user ? { state: 'signedIn', user } : { state: 'signedOut' })
    })
    // missing은 env에서 오므로 런타임 중 바뀌지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (missing.length > 0) return { state: 'misconfigured', missing }
  return auth
}
