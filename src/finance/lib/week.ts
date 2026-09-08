import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'

/**
 * 주차 — 거래 입력·조회의 단위다.
 *
 * 예산과 저축률은 급여 사이클(§2.1)로 집계하고, 주차는 "이번 주에 뭘 썼나"를
 * 보는 입력 단위로만 쓴다. 둘을 합치면 예산 대비 집계가 깨진다.
 *
 * 월요일 시작. 두 달에 걸친 주는 **그 주의 목요일이 속한 달**로 센다(ISO 8601).
 * 8/31~9/6은 목요일이 9/3이므로 9월 1주차이고, 9/7~9/13이 9월 2주차가 된다.
 */

const DATE = 'yyyy-MM-dd'

export interface WeekInfo {
  /** 그 주 월요일 날짜. 키로도 쓴다 */
  key: string
  start: string
  end: string
  /** "9월 2주차" */
  label: string
  /** "9/7 ~ 9/13" */
  rangeLabel: string
  year: number
  month: number
  index: number
}

function weekStartOf(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 })
}

/** 그 주를 대표하는 날 — 목요일 */
function representative(weekStart: Date): Date {
  return addDays(weekStart, 3)
}

function indexInMonth(weekStart: Date): number {
  const thursday = representative(weekStart)
  const firstWeek = weekStartOf(startOfMonth(thursday))
  // 그 달 1일이 속한 주의 목요일이 전 달이면, 다음 주가 1주차다
  const base =
    representative(firstWeek).getMonth() === thursday.getMonth()
      ? firstWeek
      : addDays(firstWeek, 7)
  return Math.round(differenceInCalendarDays(weekStart, base) / 7) + 1
}

export function getWeekInfo(date: string): WeekInfo {
  const start = weekStartOf(parseISO(date))
  const end = addDays(start, 6)
  const thursday = representative(start)
  const index = indexInMonth(start)

  return {
    key: format(start, DATE),
    start: format(start, DATE),
    end: format(end, DATE),
    label: `${thursday.getMonth() + 1}월 ${index}주차`,
    rangeLabel: `${format(start, 'M/d')} ~ ${format(end, 'M/d')}`,
    year: thursday.getFullYear(),
    month: thursday.getMonth() + 1,
    index,
  }
}

export function shiftWeek(weekKey: string, weeks: number): WeekInfo {
  return getWeekInfo(format(addDays(parseISO(weekKey), weeks * 7), DATE))
}

export function currentWeek(today = new Date()): WeekInfo {
  return getWeekInfo(format(today, DATE))
}

/** 오늘이 그 주에 속하면 오늘, 아니면 그 주 시작일 — 입력 기본값용 */
export function defaultDateInWeek(week: WeekInfo, today = new Date()): string {
  const key = format(today, DATE)
  return key >= week.start && key <= week.end ? key : week.start
}
