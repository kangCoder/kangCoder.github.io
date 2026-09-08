import { endOfMonth, format, isSameDay, startOfMonth } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, IconButton } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { MonthCalendar } from '../components/MonthCalendar'
import { listTemplateSummaries } from '../db/templates'
import {
  discardWorkout,
  getActiveWorkout,
  listRecentWorkouts,
  listWorkoutsBetween,
  startWorkoutFromTemplate,
  type WorkoutSummary,
} from '../db/workouts'
import { formatDuration, formatMinutes } from '../lib/duration'
import { useElapsed } from '../lib/useElapsed'

type HistoryView = 'list' | 'calendar'

/** 홈 — §5의 1번 화면. 세션 시작과 기록 조회. */
export function HomeScreen() {
  const navigate = useNavigate()
  const [view, setView] = useState<HistoryView>('list')
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [pendingDelete, setPendingDelete] = useState<WorkoutSummary>()

  const active = useLiveQuery(() => getActiveWorkout(), [], undefined)
  const templates = useLiveQuery(() => listTemplateSummaries(false), [])
  const recent = useLiveQuery(() => listRecentWorkouts(20), [])
  const monthly = useLiveQuery(
    () =>
      listWorkoutsBetween(
        startOfMonth(month).getTime(),
        endOfMonth(month).getTime(),
      ),
    [month],
  )
  const elapsed = useElapsed(active?.startedAt)

  async function start(templateId: string) {
    const workoutId = await startWorkoutFromTemplate(templateId)
    navigate(`/workouts/${workoutId}`)
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    await discardWorkout(pendingDelete.id)
    setPendingDelete(undefined)
  }

  return (
    <div className="flex flex-col">
      <header className="px-4 pt-2 pb-2">
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
            </div>
            <span className="shrink-0 text-[20px] font-semibold tabular-nums">
              {formatDuration(elapsed)}
            </span>
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
                  {/* 시작 전에 무슨 종목이 들어있는지 바로 보이게 */}
                  <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-zinc-500">
                    {template.itemCount === 0
                      ? '종목이 비어 있습니다'
                      : template.exerciseNames.join(' · ')}
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
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[13px] font-medium text-zinc-500">기록</h2>
            <button
              type="button"
              onClick={() => navigate('/report')}
              className="text-[13px] font-medium text-zinc-900 underline underline-offset-2"
            >
              주간 리포트
            </button>
          </div>
          <div className="flex rounded-lg bg-zinc-200 p-0.5">
            {(['list', 'calendar'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setView(option)}
                className={`min-h-8 rounded-md px-3 text-[12px] font-medium transition-colors ${
                  view === option
                    ? 'bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-500'
                }`}
              >
                {option === 'list' ? '목록' : '캘린더'}
              </button>
            ))}
          </div>
        </div>

        {view === 'calendar' ? (
          <MonthCalendar
            month={month}
            onMonthChange={setMonth}
            marks={toMarks(monthly ?? [])}
            onSelectDay={(day) => {
              const match = (monthly ?? []).find((workout) =>
                isSameDay(workout.startedAt, day),
              )
              if (match) navigate(`/workouts/${match.id}`)
            }}
          />
        ) : recent === undefined ? null : recent.length === 0 ? (
          <p className="rounded-xl bg-white px-3 py-6 text-center text-[13px] text-zinc-400 ring-1 ring-zinc-200">
            아직 완료한 세션이 없습니다
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {recent.map((workout) => (
              <li
                key={workout.id}
                className="flex items-center gap-1 rounded-xl bg-white pr-1 ring-1 ring-zinc-200"
              >
                <button
                  type="button"
                  onClick={() => navigate(`/workouts/${workout.id}`)}
                  className="min-w-0 flex-1 p-3 text-left"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] tabular-nums text-zinc-500">
                      {format(workout.startedAt, 'M/d (EEE)', { locale: ko })}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-zinc-900">
                      {workout.templateName ?? '세션'}
                    </span>
                    <span className="text-[12px] tabular-nums text-zinc-400">
                      {workout.endedAt !== undefined &&
                        formatMinutes(workout.endedAt - workout.startedAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] tabular-nums text-zinc-500">
                    {workout.setCount}세트
                    {workout.volume > 0 &&
                      ` · ${Math.round(workout.volume).toLocaleString('ko-KR')}kg`}
                    {workout.sleepHours !== undefined &&
                      ` · 수면 ${workout.sleepHours}h`}
                  </p>
                </button>
                <IconButton
                  aria-label="기록 삭제"
                  className="text-zinc-300"
                  onClick={() => setPendingDelete(workout)}
                >
                  <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
                    <path
                      d="M5 5l10 10M15 5L5 15"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      fill="none"
                    />
                  </svg>
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pendingDelete && (
        <ConfirmDialog
          title={`${format(pendingDelete.startedAt, 'M월 d일', { locale: ko })} 기록을 삭제할까요?`}
          description="세트와 컨디션까지 함께 사라지며 되돌릴 수 없습니다."
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(undefined)}
        />
      )}
    </div>
  )
}

/** 같은 날 여러 세션을 한 칸으로 묶는다 */
function toMarks(workouts: WorkoutSummary[]) {
  const byDay = new Map<string, { date: Date; count: number }>()
  for (const workout of workouts) {
    const date = new Date(workout.startedAt)
    const key = format(date, 'yyyy-MM-dd')
    const existing = byDay.get(key)
    if (existing) existing.count++
    else byDay.set(key, { date, count: 1 })
  }
  return [...byDay.values()]
}
