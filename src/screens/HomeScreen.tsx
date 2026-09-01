import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { listTemplateSummaries } from '../db/templates'
import {
  getActiveWorkout,
  listRecentWorkouts,
  startWorkoutFromTemplate,
} from '../db/workouts'

/** 홈 — §5의 1번 화면. 세션 시작과 최근 기록. */
export function HomeScreen() {
  const navigate = useNavigate()
  const active = useLiveQuery(() => getActiveWorkout(), [], undefined)
  const templates = useLiveQuery(() => listTemplateSummaries(false), [])
  const recent = useLiveQuery(() => listRecentWorkouts(10), [])

  async function start(templateId: string) {
    const workoutId = await startWorkoutFromTemplate(templateId)
    navigate(`/workouts/${workoutId}`)
  }

  return (
    <div className="flex flex-col">
      <header className="px-4 pt-3 pb-2">
        <h1 className="text-[22px] font-bold text-zinc-900">운동 기록</h1>
        <p className="text-[13px] text-zinc-500">
          {format(new Date(), 'M월 d일 (EEE)', { locale: ko })}
        </p>
      </header>

      {active && (
        <section className="px-4 pb-3">
          <button
            type="button"
            onClick={() => navigate(`/workouts/${active.id}`)}
            className="flex w-full items-center gap-3 rounded-xl bg-zinc-900 px-4 py-3 text-left text-white active:bg-zinc-700"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-zinc-400">진행 중</p>
              <p className="truncate text-[16px] font-semibold">
                {active.templateName ?? '세션'}
              </p>
              <p className="text-[12px] text-zinc-400">
                {format(active.startedAt, 'HH:mm')} 시작
              </p>
            </div>
            <span className="shrink-0 text-[14px] font-medium">이어서 →</span>
          </button>
        </section>
      )}

      <section className="px-4 pb-4">
        <h2 className="mb-2 text-[13px] font-medium text-zinc-500">
          {active ? '다른 템플릿으로 시작' : '세션 시작'}
        </h2>
        {templates === undefined ? null : templates.length === 0 ? (
          <EmptyState
            title="템플릿이 없습니다"
            hint="템플릿 탭에서 먼저 하나 만들어 주세요."
          />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {templates.map((template) => (
              <li
                key={template.id}
                className="flex items-center gap-2 rounded-xl bg-white p-3 ring-1 ring-zinc-200"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-zinc-900">
                    {template.name}
                  </p>
                  <p className="text-[12px] text-zinc-500">
                    종목 {template.itemCount}개
                  </p>
                </div>
                <Button
                  variant="primary"
                  disabled={template.itemCount === 0}
                  onClick={() => start(template.id)}
                >
                  시작
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="px-4 pb-4">
        <h2 className="mb-2 text-[13px] font-medium text-zinc-500">최근 기록</h2>
        {recent === undefined ? null : recent.length === 0 ? (
          <p className="rounded-xl bg-white px-3 py-6 text-center text-[13px] text-zinc-400 ring-1 ring-zinc-200">
            아직 완료한 세션이 없습니다
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {recent.map((workout) => (
              <li
                key={workout.id}
                className="rounded-xl bg-white p-3 ring-1 ring-zinc-200"
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] tabular-nums text-zinc-500">
                    {format(workout.startedAt, 'M/d (EEE)', { locale: ko })}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-zinc-900">
                    {workout.templateName ?? '세션'}
                  </span>
                  <span className="text-[12px] tabular-nums text-zinc-400">
                    {durationLabel(workout.startedAt, workout.endedAt)}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] tabular-nums text-zinc-500">
                  {workout.setCount}세트
                  {workout.volume > 0 &&
                    ` · ${Math.round(workout.volume).toLocaleString('ko-KR')}kg`}
                  {workout.sleepHours !== undefined &&
                    ` · 수면 ${workout.sleepHours}h`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/** §6.1 — 타임스탬프 차이로 계산한다. 카운트업 루프를 돌리지 않는다. */
function durationLabel(startedAt: number, endedAt: number | undefined): string {
  if (endedAt === undefined) return ''
  return `${Math.max(1, Math.round((endedAt - startedAt) / 60000))}분`
}
