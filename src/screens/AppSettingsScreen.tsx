import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { IconButton } from '../components/Button'
import { getAppSettings, setAreaVisible } from '../db/appSettings'

/**
 * 앱 설정 — 어느 영역을 쓸지.
 *
 * 이 화면은 양쪽 영역 어디서든 들어올 수 있어야 한다. 가계부 설정 안에만
 * 두면 가계부를 숨긴 뒤 다시 켤 방법이 없어진다.
 */
const AREAS = [
  {
    key: 'workout' as const,
    label: '운동 기록',
    hint: '종목·템플릿·세션·주간 리포트',
  },
  {
    key: 'finance' as const,
    label: '가계부',
    hint: '거래·예산·자산·목표',
  },
]

export function AppSettingsScreen() {
  const navigate = useNavigate()
  const settings = useLiveQuery(() => getAppSettings(), [])

  if (settings === undefined) return null

  const visible = {
    workout: settings.showWorkout,
    finance: settings.showFinance,
  }
  const onlyOneLeft = Number(visible.workout) + Number(visible.finance) === 1

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-1 bg-zinc-100/90 px-2 pt-2 pb-2 backdrop-blur">
        <IconButton onClick={() => navigate(-1)} aria-label="뒤로">
          <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
            <path
              d="M12 4l-6 6 6 6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </IconButton>
        <h1 className="flex-1 text-[17px] font-semibold text-zinc-900">
          앱 설정
        </h1>
      </header>

      <section className="px-4 pt-1 pb-4">
        <h2 className="mb-2 text-[13px] font-medium text-zinc-500">
          사용할 기능
        </h2>
        <ul className="flex flex-col gap-1.5">
          {AREAS.map((area) => {
            const on = visible[area.key]
            // 마지막 하나는 끌 수 없다 — 끄면 남는 화면이 없다
            const locked = on && onlyOneLeft
            return (
              <li
                key={area.key}
                className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-zinc-200"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium text-zinc-900">
                    {area.label}
                  </p>
                  <p className="text-[12px] text-zinc-500">{area.hint}</p>
                </div>
                <input
                  type="checkbox"
                  aria-label={area.label}
                  className="size-5 shrink-0 accent-zinc-900 disabled:opacity-40"
                  checked={on}
                  disabled={locked}
                  onChange={(e) => setAreaVisible(area.key, e.target.checked)}
                />
              </li>
            )
          })}
        </ul>
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
          끈 기능은 화면과 전환 토글에서 사라집니다. 데이터는 지워지지 않고
          그대로 남아 있다가 다시 켜면 돌아옵니다. 하나는 반드시 켜 두어야 합니다.
        </p>
      </section>
    </div>
  )
}
