import { addWeeks, endOfWeek, format, startOfWeek } from 'date-fns'
import { listBodyweightsBetween } from './bodyweights'
import { listRunsBetween } from './runs'
import { listTemplates } from './templates'
import type { Bodyweight, Run } from './types'
import {
  listWorkoutReportsBetween,
  previousBestOneRepMax,
  type WorkoutReport,
} from './workouts'

/**
 * 주간 리포트 데이터 수집 — §8
 *
 * 렌더링(마크다운 생성)은 lib/weeklyReport.ts의 순수 함수가 맡는다.
 * 여기서는 DB에서 필요한 것만 모아 넘긴다.
 */

/** 세션 안 한 종목의 직전 e1RM. key는 `${workoutId}:${exerciseId}` */
export type PreviousBests = Map<string, number>

export interface WeeklyReportData {
  from: Date
  to: Date
  sessions: WorkoutReport[]
  runs: Run[]
  bodyweights: Bodyweight[]
  /** 세션 표의 증감 괄호용 */
  previousBests: PreviousBests
  /** 주간 요약의 종목별 e1RM 비교용 */
  lastWeekSessions: WorkoutReport[]
  lastWeekBodyweights: Bodyweight[]
  /**
   * 웨이트 주간 목표. 앱에 목표 저장소가 없어서 활성 템플릿 개수를 쓴다
   * (템플릿 하나를 주 1회씩 도는 프로그램 전제).
   */
  weightTarget: number
}

/** 월요일 시작 — §8.2의 "2026-08-17 ~ 08-23"이 월~일이다 */
export function weekRangeOf(date: Date): { from: Date; to: Date } {
  return {
    from: startOfWeek(date, { weekStartsOn: 1 }),
    to: endOfWeek(date, { weekStartsOn: 1 }),
  }
}

export async function collectWeeklyReport(
  anchor: Date,
): Promise<WeeklyReportData> {
  const { from, to } = weekRangeOf(anchor)
  const previousWeek = weekRangeOf(addWeeks(anchor, -1))

  const [sessions, lastWeekSessions, runs, bodyweights, lastWeekBodyweights, templates] =
    await Promise.all([
      listWorkoutReportsBetween(from.getTime(), to.getTime()),
      listWorkoutReportsBetween(
        previousWeek.from.getTime(),
        previousWeek.to.getTime(),
      ),
      listRunsBetween(from.getTime(), to.getTime()),
      listBodyweightsBetween(dateKey(from), dateKey(to)),
      listBodyweightsBetween(dateKey(previousWeek.from), dateKey(previousWeek.to)),
      listTemplates(false),
    ])

  // 증감은 "같은 종목의 직전 세션" 기준이라 주 경계를 넘어갈 수 있다
  const previousBests: PreviousBests = new Map()
  for (const session of sessions) {
    for (const item of session.items) {
      if (item.exerciseType !== 'WEIGHT_REPS') continue
      const best = await previousBestOneRepMax(
        item.exerciseId,
        session.workout.startedAt,
      )
      if (best !== undefined) {
        previousBests.set(`${session.workout.id}:${item.exerciseId}`, best)
      }
    }
  }

  return {
    from,
    to,
    sessions,
    runs,
    bodyweights,
    previousBests,
    lastWeekSessions,
    lastWeekBodyweights,
    weightTarget: templates.length,
  }
}

function dateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}
