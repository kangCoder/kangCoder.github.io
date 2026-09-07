import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { WeeklyReportData } from '../db/weeklyReport'
import type { WorkoutReport } from '../db/workouts'
import type { WorkoutItem } from '../db/workouts'
import { bestOneRepMax, totalVolume } from './metrics'

/**
 * 주간 리포트 마크다운 생성 — §8
 *
 * 순수 함수다. DB에서 모은 데이터를 받아 문자열만 만든다.
 * 이미지가 아니라 텍스트로 내보내는 이유는 §8.2 — 파싱 정확도와 용량 모두
 * 유리하고, Claude에게 그대로 붙여 넣을 수 있다.
 *
 * 전주 대비 증감을 앱이 미리 계산해 넣는다. 두 주치를 통째로 넘겨 비교하게
 * 하는 것보다 정확하다(§8.2).
 */
export function renderWeeklyReport(data: WeeklyReportData): string {
  const lines: string[] = []

  lines.push(
    `## ${format(data.from, 'yyyy-MM-dd')} ~ ${format(data.to, 'MM-dd')}`,
    '',
  )

  lines.push(renderPerformance(data))

  const weight = renderBodyweight(data)
  if (weight) lines.push(weight)

  for (const session of data.sessions) {
    lines.push('', ...renderSession(session, data))
  }

  if (data.runs.length > 0) {
    lines.push('', '### 러닝', '')
    for (const run of data.runs) {
      const feel = run.feelScore !== undefined ? ` / 체감 ${run.feelScore}` : ''
      lines.push(
        `- ${format(run.startedAt, 'M/d (EEE)', { locale: ko })} ${trim(run.distanceKm)}km / ${Math.round(run.durationSec / 60)}분${feel}`,
      )
    }
  }

  const summary = renderSummary(data)
  if (summary.length > 0) lines.push('', '### 주간 요약', '', ...summary)

  return lines.join('\n')
}

function renderPerformance(data: WeeklyReportData): string {
  const parts = [`웨이트 ${data.sessions.length}/${data.weightTarget}`]
  // 러닝은 목표를 저장할 곳이 없어 분모 없이 횟수만 적는다
  if (data.runs.length > 0) parts.push(`러닝 ${data.runs.length}회`)
  return `**수행**: ${parts.join(', ')}`
}

function renderBodyweight(data: WeeklyReportData): string | undefined {
  if (data.bodyweights.length === 0) return undefined

  const values = data.bodyweights.map((entry) => entry.weightKg)
  const first = values[0]
  const last = values[values.length - 1]
  const average = mean(values)

  const previous =
    data.lastWeekBodyweights.length > 0
      ? mean(data.lastWeekBodyweights.map((entry) => entry.weightKg))
      : undefined

  const detail =
    previous !== undefined
      ? `주 평균 ${trim(average)}, 전주 ${trim(previous)}`
      : `주 평균 ${trim(average)}`

  return `**체중**: ${trim(first)} → ${trim(last)}kg (${detail})`
}

function renderSession(
  session: WorkoutReport,
  data: WeeklyReportData,
): string[] {
  const { workout, items } = session
  const lines: string[] = []

  const minutes =
    workout.endedAt !== undefined
      ? ` — ${Math.max(1, Math.round((workout.endedAt - workout.startedAt) / 60000))}분`
      : ''
  lines.push(
    `### ${format(workout.startedAt, 'M/d (EEE)', { locale: ko })} ${workout.templateName ?? '세션'}${minutes}`,
    '',
  )

  const measured = items.filter((item) => item.exerciseType !== 'CHECKLIST')
  if (measured.length > 0) {
    lines.push('| 종목 | 세트별 수행 | 볼륨 | e1RM |', '|---|---|---|---|')
    for (const item of measured) {
      lines.push(renderItemRow(item, workout.id, data))
    }
    lines.push('')
  }

  // 체크리스트는 볼륨·세트 집계에서 빠지므로 표가 아니라 목록으로 — §4.1
  const checklist = items.filter((item) => item.exerciseType === 'CHECKLIST')
  for (const item of checklist) {
    lines.push(`- ${item.exerciseName} ${item.isChecked ? '✓' : '✗'}`)
  }

  const condition = renderCondition(session)
  if (condition) lines.push(condition)

  return lines
}

function renderItemRow(
  item: WorkoutItem,
  workoutId: string,
  data: WeeklyReportData,
): string {
  // 워밍업 상세는 리포트에서 제외한다
  const shown = item.sets.filter((set) => set.setType !== 'WARMUP')
  const performed = shown
    .map((set) => {
      // 미완료는 "—" — 몇 세트를 못 채웠는지가 보여야 한다
      if (!set.isCompleted) return '—'
      if (item.exerciseType === 'TIME') return `${set.seconds ?? 0}초`
      return `${trim(set.weight ?? 0)}×${set.reps ?? 0}`
    })
    .join(', ')

  const volume = totalVolume(item.sets)
  const volumeCell =
    volume > 0 ? `${Math.round(volume).toLocaleString('ko-KR')}kg` : '—'

  const current = bestOneRepMax(item.sets)
  let e1rmCell = '—'
  if (current !== undefined) {
    const previous = data.previousBests.get(`${workoutId}:${item.exerciseId}`)
    e1rmCell = `${current.toFixed(1)}${formatDelta(current, previous)}`
  }

  return `| ${item.exerciseName} | ${performed || '—'} | ${volumeCell} | ${e1rmCell} |`
}

function renderCondition(session: WorkoutReport): string | undefined {
  const { workout } = session
  const parts: string[] = []
  if (workout.sleepHours !== undefined) parts.push(`수면 ${workout.sleepHours}h`)
  if (workout.backCondition !== undefined)
    parts.push(`허리 ${workout.backCondition}`)
  if (workout.kneeCondition !== undefined)
    parts.push(`무릎 ${workout.kneeCondition}`)
  return parts.length > 0 ? `- 컨디션: ${parts.join(' / ')}` : undefined
}

function renderSummary(data: WeeklyReportData): string[] {
  const lines: string[] = []

  const volume = weekVolume(data.sessions)
  const lastVolume = weekVolume(data.lastWeekSessions)
  if (volume > 0) {
    const change =
      lastVolume > 0
        ? ` (전주 ${signed(((volume - lastVolume) / lastVolume) * 100, 1)}%)`
        : ''
    lines.push(
      `- 총 볼륨 ${Math.round(volume).toLocaleString('ko-KR')}kg${change}`,
    )
  }

  // 종목별 e1RM은 이번 주 최고와 전주 최고를 견준다
  const current = bestByExercise(data.sessions)
  const previous = bestByExercise(data.lastWeekSessions)
  const changes: string[] = []
  for (const [name, value] of current) {
    const before = previous.get(name)
    if (before === undefined) continue
    changes.push(`${name} ${signed(value - before, 1)}`)
  }
  if (changes.length > 0) lines.push(`- e1RM: ${changes.join(' / ')}`)

  const missed = data.weightTarget - data.sessions.length
  if (missed > 0) lines.push(`- 미달성: 웨이트 ${missed}회`)

  return lines
}

function weekVolume(sessions: WorkoutReport[]): number {
  return sessions.reduce(
    (sum, session) =>
      sum + totalVolume(session.items.flatMap((item) => item.sets)),
    0,
  )
}

function bestByExercise(sessions: WorkoutReport[]): Map<string, number> {
  const best = new Map<string, number>()
  for (const session of sessions) {
    for (const item of session.items) {
      const value = bestOneRepMax(item.sets)
      if (value === undefined) continue
      const previous = best.get(item.exerciseName)
      if (previous === undefined || value > previous) {
        best.set(item.exerciseName, value)
      }
    }
  }
  return best
}

/** 전주 데이터가 없으면 괄호를 통째로 뺀다 */
function formatDelta(current: number, previous: number | undefined): string {
  if (previous === undefined) return ''
  return ` (${signed(current - previous, 1)})`
}

/** +1.2 / -0.8 / +0 */
function signed(value: number, digits: number): string {
  const rounded = Math.round(value * 10 ** digits) / 10 ** digits
  if (rounded === 0) return '+0'
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(digits)}`
}

/** 82.5 → "82.5", 80 → "80" */
function trim(value: number): string {
  return String(Math.round(value * 100) / 100)
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}
