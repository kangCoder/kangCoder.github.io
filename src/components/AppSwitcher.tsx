import { NavLink } from 'react-router-dom'

/**
 * 운동 기록 ↔ 가계부 전환.
 *
 * 두 영역은 데이터베이스부터 분리된 별개의 앱이라, 화면 안 링크로 오가면
 * "어느 쪽에 있는지"가 흐려진다. 좌측 상단에 늘 같은 자리로 두어 지금 어디인지와
 * 어디로 갈 수 있는지를 한눈에 보이게 한다.
 *
 * 상세 화면에서는 좌측 상단이 뒤로가기 자리이므로 띄우지 않는다(App.tsx).
 */
const AREAS = [
  { to: '/', label: '운동', end: true },
  { to: '/finance', label: '가계부', end: false },
]

export function AppSwitcher() {
  return (
    <div className="px-4 pt-3">
      <nav className="inline-flex rounded-lg bg-zinc-200 p-0.5">
        {AREAS.map((area) => (
          <NavLink
            key={area.to}
            to={area.to}
            end={area.end}
            className={({ isActive }) =>
              `min-h-8 rounded-md px-3 text-[13px] font-medium transition-colors ${
                isActive
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 active:text-zinc-700'
              }`
            }
          >
            {area.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
