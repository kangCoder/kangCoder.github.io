import { execSync } from 'node:child_process'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * 빌드 식별자 — docs/spec-sync-v0.1.md §8
 *
 * GitHub Pages가 index.html에 `cache-control: max-age=600`을 붙인다.
 * 배포 전에 열어둔 브라우저는 최대 10분간 옛 index.html을 쓰고, 그건 옛
 * 해시 번들을 가리킨다. 서비스워커가 없어 갱신 알림도 없다.
 *
 * 그래서 "어느 버전을 실행 중인가"를 앱 안에서 볼 수 있어야 한다. 이게
 * 없으면 버그 원인이 코드인지 캐시인지 가릴 수 없다 — 실제로 한 번 겪었다.
 */
function buildId(): string {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
  try {
    const sha = execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return `${sha} · ${stamp}`
  } catch {
    // git이 없는 환경(얕은 체크아웃 등)에서도 빌드는 되어야 한다
    return stamp
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
  },
})
