import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // node_modules.nosync — iCloud 동기화를 피하려 node_modules를 심볼릭 링크로
  // 두었다. ESLint의 기본 무시 패턴은 'node_modules/**'라 실제 경로에
  // 걸리지 않아 의존성 안까지 들어간다.
  globalIgnores(['dist', 'node_modules.nosync']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
])
