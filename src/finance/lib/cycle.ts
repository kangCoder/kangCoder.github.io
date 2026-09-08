import { addMonths, format, getDaysInMonth, parseISO } from 'date-fns'

/**
 * 급여 사이클 — spec-finance-v0.2.md §2.1
 *
 * 월 단위 집계는 캘린더 월이 아니라 급여일 기준이다.
 * "2026-10 사이클" = 2026-10-25 ~ 2026-11-24 (급여일 25일 기준).
 *
 * 급여일은 상수가 아니라 설정값이므로 모든 함수가 payday를 인자로 받는다.
 * 하드코딩하면 급여일이 바뀔 때 저장된 모든 cycleKey가 틀어진다.
 *
 * 날짜는 전부 'YYYY-MM-DD' 문자열로 주고받는다. Transaction.date와 같은 형식이라
 * 호출부에서 Date 변환이 끼어들지 않는다.
 *
 * `new Date("2026-10-25")`는 UTC로 파싱되어 로컬 타임존에서 하루 밀릴 수 있다.
 * parseISO/format은 로컬 기준이므로 사이클 경계가 틀어지지 않는다.
 */

const DATE = 'yyyy-MM-dd'
const CYCLE = 'yyyy-MM'

/** 급여일이 31일인데 2월이면 존재하지 않는 날짜가 된다. 그 달의 마지막 날로 자른다. */
function clampPayday(year: number, monthIndex: number, payday: number): number {
  const days = getDaysInMonth(new Date(year, monthIndex, 1))
  return Math.min(Math.max(1, payday), days)
}

/** 이 날짜가 속한 사이클 — 급여일 이전이면 전 달 사이클이다 */
export function getCycleKey(date: string, payday: number): string {
  const parsed = parseISO(date)
  const start = clampPayday(parsed.getFullYear(), parsed.getMonth(), payday)
  const anchor =
    parsed.getDate() >= start ? parsed : addMonths(parsed, -1)
  return format(anchor, CYCLE)
}

/** "2026-10" → 2026-10-25 ~ 2026-11-24 */
export function getCycleRange(
  cycleKey: string,
  payday: number,
): { start: string; end: string } {
  const base = parseISO(`${cycleKey}-01`)
  const year = base.getFullYear()
  const month = base.getMonth()

  const startDay = clampPayday(year, month, payday)
  const start = new Date(year, month, startDay)

  const next = addMonths(start, 1)
  const nextDay = clampPayday(next.getFullYear(), next.getMonth(), payday)
  // 다음 사이클 시작 하루 전이 이 사이클의 끝이다
  const end = new Date(next.getFullYear(), next.getMonth(), nextDay - 1)

  return { start: format(start, DATE), end: format(end, DATE) }
}

export function getCurrentCycleKey(payday: number, today = new Date()): string {
  return getCycleKey(format(today, DATE), payday)
}

export function shiftCycle(cycleKey: string, months: number): string {
  return format(addMonths(parseISO(`${cycleKey}-01`), months), CYCLE)
}

/** 사이클 안에서 아직 남은 일수. 오늘이 포함되므로 최소 1이다. */
export function remainingDaysInCycle(
  cycleKey: string,
  payday: number,
  today = new Date(),
): number {
  const { start, end } = getCycleRange(cycleKey, payday)
  const endDate = parseISO(end)
  const from = parseISO(format(today, DATE))
  const startDate = parseISO(start)

  if (from < startDate) return dayDiff(startDate, endDate) + 1
  if (from > endDate) return 0
  return dayDiff(from, endDate) + 1
}

export function totalDaysInCycle(cycleKey: string, payday: number): number {
  const { start, end } = getCycleRange(cycleKey, payday)
  return dayDiff(parseISO(start), parseISO(end)) + 1
}

function dayDiff(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

export function todayKey(today = new Date()): string {
  return format(today, DATE)
}
