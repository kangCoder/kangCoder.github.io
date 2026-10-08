/// <reference types="vite/client" />

/**
 * Firebase 설정값 — docs/spec-sync-v0.1.md §3.5
 *
 * Vite의 기본 ImportMetaEnv는 인덱스 시그니처라 오타가 any로 통과한다.
 * 명시해 두면 `import.meta.env.VITE_FIREBASE_APPID` 같은 실수가 컴파일에서 걸린다.
 */
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_STORAGE_BUCKET: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
  readonly VITE_FIREBASE_APP_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
