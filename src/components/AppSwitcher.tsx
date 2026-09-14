import { NavLink, useNavigate } from 'react-router-dom'

/**
 * 운동 기록 ↔ 가계부 전환.
 *
 * 두 영역은 데이터베이스부터 분리된 별개의 앱이라, 화면 안 링크로 오가면
 * "어느 쪽에 있는지"가 흐려진다. 좌측 상단에 늘 같은 자리로 둔다.
 *
 * 한쪽만 쓰기로 했으면 전환할 곳이 없으므로 토글을 띄우지 않는다.
 * 대신 설정으로 가는 길은 남겨야 한다 — 없으면 다시 켤 수 없다.
 */
const AREAS = [
  { key: 'workout' as const, to: '/', label: '운동', end: true },
  { key: 'finance' as const, to: '/finance', label: '가계부', end: false },
]

export function AppSwitcher({
  showWorkout,
  showFinance,
}: {
  showWorkout: boolean
  showFinance: boolean
}) {
  const navigate = useNavigate()
  const visible = AREAS.filter((area) =>
    area.key === 'workout' ? showWorkout : showFinance,
  )

  return (
    <div className="flex items-center justify-between px-4 pt-3">
      {visible.length > 1 ? (
        <nav className="inline-flex rounded-lg bg-zinc-200 p-0.5">
          {visible.map((area) => (
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
      ) : (
        <span />
      )}

      <button
        type="button"
        onClick={() => navigate('/settings')}
        aria-label="앱 설정"
        className="inline-flex size-8 items-center justify-center rounded-lg text-zinc-400 active:bg-zinc-200"
      >
        <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
          <path
            d="M10 13a3 3 0 100-6 3 3 0 000 6z"
            stroke="currentColor"
            strokeWidth="1.6"
            fill="none"
          />
          <path
            d="M16.3 12.2a1.3 1.3 0 00.26 1.43l.05.05a1.6 1.6 0 11-2.26 2.26l-.05-.05a1.3 1.3 0 00-1.43-.26 1.3 1.3 0 00-.79 1.19v.13a1.6 1.6 0 11-3.2 0v-.07a1.3 1.3 0 00-.85-1.19 1.3 1.3 0 00-1.43.26l-.05.05a1.6 1.6 0 11-2.26-2.26l.05-.05a1.3 1.3 0 00.26-1.43 1.3 1.3 0 00-1.19-.79h-.13a1.6 1.6 0 110-3.2h.07a1.3 1.3 0 001.19-.85 1.3 1.3 0 00-.26-1.43l-.05-.05a1.6 1.6 0 112.26-2.26l.05.05a1.3 1.3 0 001.43.26h.06a1.3 1.3 0 00.79-1.19v-.13a1.6 1.6 0 113.2 0v.07a1.3 1.3 0 00.79 1.19 1.3 1.3 0 001.43-.26l.05-.05a1.6 1.6 0 112.26 2.26l-.05.05a1.3 1.3 0 00-.26 1.43v.06a1.3 1.3 0 001.19.79h.13a1.6 1.6 0 110 3.2h-.07a1.3 1.3 0 00-1.19.79z"
            stroke="currentColor"
            strokeWidth="1.3"
            fill="none"
          />
        </svg>
      </button>
    </div>
  )
}
