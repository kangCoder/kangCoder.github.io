import { NavLink } from 'react-router-dom'

/**
 * 가계부 탭바 — §1.5
 * 가계부에도 화면이 여러 개라 운동 탭바에 끼워 넣을 수 없다.
 * /finance/* 영역에서만 이 탭바가 뜬다.
 *
 * 탭은 4개로 묶는다. 5개는 좁아 오조작이 늘고, 화면은 그보다 많다.
 * 리포트는 대시보드에서, 고정비·카테고리·목표·시뮬레이터는 설정에서 들어간다.
 */
const TABS = [
  { to: '/finance', label: '대시보드', end: true },
  { to: '/finance/new', label: '입력', end: false },
  { to: '/finance/assets', label: '자산', end: false },
  { to: '/finance/settings', label: '설정', end: false },
]

export function FinanceTabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-md border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
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
