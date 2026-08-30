import {
  HashRouter,
  NavLink,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom'
import { ExerciseListScreen } from './screens/ExerciseListScreen'
import { TemplateEditScreen } from './screens/TemplateEditScreen'
import { TemplateListScreen } from './screens/TemplateListScreen'

/**
 * 해시 라우팅을 쓰는 이유 — GitHub Pages는 SPA 폴백이 없어서 새로고침 시 404가 난다.
 * 404.html 트릭 대신 해시를 쓰면 서비스워커 등록(§3.1)과도 부딪히지 않는다.
 */
export function App() {
  return (
    <HashRouter>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col pb-[calc(var(--spacing-tabbar)+env(safe-area-inset-bottom))]">
        <main className="flex-1">
          <Routes>
            {/* 홈(§5의 1번 화면)은 2주차 범위다 */}
            <Route path="/" element={<Navigate to="/exercises" replace />} />
            <Route path="/exercises" element={<ExerciseListScreen />} />
            <Route path="/templates" element={<TemplateListScreen />} />
            <Route path="/templates/:id" element={<TemplateEditScreen />} />
            <Route path="*" element={<Navigate to="/exercises" replace />} />
          </Routes>
        </main>
        <TabBar />
      </div>
    </HashRouter>
  )
}

const TABS = [
  { to: '/exercises', label: '종목' },
  { to: '/templates', label: '템플릿' },
]

function TabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-md border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `flex h-tabbar flex-1 items-center justify-center text-[13px] font-medium transition-colors ${
              isActive ? 'text-zinc-900' : 'text-zinc-400'
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
