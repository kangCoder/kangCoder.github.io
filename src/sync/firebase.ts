import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import {
  initializeFirestore,
  memoryLocalCache,
  type Firestore,
} from 'firebase/firestore'

/**
 * Firebase 초기화 — docs/spec-sync-v0.1.md §1, §3.5
 *
 * **Firestore 로컬 캐시를 쓰지 않는다.** 로컬 저장은 Dexie가 담당한다.
 * 두 군데에 같은 데이터를 두면 어느 쪽이 맞는지 알 수 없게 되고, 오프라인에서
 * Firestore 캐시가 성공을 돌려주면 "올라갔다"고 착각한다(§1).
 * 캐시가 없으므로 오프라인 읽기·쓰기는 실패하고, 그 실패를 그대로 다룬다.
 *
 * Auth는 반대로 기본 persistence(IndexedDB)를 유지한다 — 한 번 로그인하면
 * 홈화면 앱에서 계속 유지돼야 한다(§2.6).
 */

const CONFIG_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const

/**
 * 비어 있는 설정 키 목록. 빌드 시 GitHub Secrets를 빠뜨리면 전부 빈 문자열이
 * 되는데, 그대로 두면 Firebase가 내부에서 알아보기 어려운 오류를 던진다.
 * 화면에 키 이름을 띄울 수 있게 미리 걸러낸다.
 */
export function missingFirebaseEnv(): string[] {
  return CONFIG_KEYS.filter((key) => !import.meta.env[key])
}

let app: FirebaseApp | undefined
let firestore: Firestore | undefined

/** 지연 초기화 — 설정이 비었을 때 모듈 로드만으로 앱이 죽지 않게 한다 */
function getApp(): FirebaseApp {
  if (app) return app

  const missing = missingFirebaseEnv()
  if (missing.length > 0) {
    throw new Error(`Firebase 설정이 비어 있습니다: ${missing.join(', ')}`)
  }

  app = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  })
  return app
}

export function getFirebaseAuth(): Auth {
  return getAuth(getApp())
}

export function getFirestoreDb(): Firestore {
  if (!firestore) {
    // getFirestore()보다 먼저 불러야 캐시 설정이 적용된다
    firestore = initializeFirestore(getApp(), {
      localCache: memoryLocalCache(),
    })
  }
  return firestore
}
