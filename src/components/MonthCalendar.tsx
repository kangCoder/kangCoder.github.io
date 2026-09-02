import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  endOfWeek,
} from 'date-fns'
import { ko } from 'date-fns/locale'
import { IconButton } from './Button'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export interface CalendarDay {
  date: Date
  count: number
}

/**
 * 월 캘린더. 운동한 날에 점을 찍고, 누르면 그날 기록으로 보낸다.
 * 주 4회 루틴에서 "이번 주 몇 번 했나"는 목록보다 캘린더가 즉시 읽힌다.
 */
export function MonthCalendar({
  month,
  onMonthChange,
  marks,
  onSelectDay,
}: {
  month: Date
  onMonthChange: (month: Date) => void
  marks: CalendarDay[]
  onSelectDay: (date: Date) => void
}) {
  // 달의 첫 주 일요일부터 마지막 주 토요일까지 채워 격자를 고르게 만든다
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month)),
    end: endOfWeek(endOfMonth(month)),
  })

  return (
    <div className="rounded-xl bg-white p-2 ring-1 ring-zinc-200">
      <div className="flex items-center justify-between px-1">
        <IconButton
          aria-label="이전 달"
          onClick={() => onMonthChange(addMonths(month, -1))}
        >
          <Chevron direction="left" />
        </IconButton>
        <span className="text-[15px] font-semibold text-zinc-900">
          {format(month, 'yyyy년 M월', { locale: ko })}
        </span>
        <IconButton
          aria-label="다음 달"
          onClick={() => onMonthChange(addMonths(month, 1))}
        >
          <Chevron direction="right" />
        </IconButton>
      </div>

      <div className="mt-1 grid grid-cols-7">
        {WEEKDAYS.map((label) => (
          <div
            key={label}
            className="py-1 text-center text-[11px] text-zinc-400"
          >
            {label}
          </div>
        ))}

        {days.map((day) => {
          const mark = marks.find((m) => isSameDay(m.date, day))
          const outside = !isSameMonth(day, month)
          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={!mark}
              onClick={() => onSelectDay(day)}
              className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-[13px] tabular-nums transition-colors ${
                outside ? 'text-zinc-300' : 'text-zinc-700'
              } ${mark ? 'font-semibold active:bg-zinc-100' : ''} ${
                isToday(day) ? 'ring-1 ring-zinc-900 ring-inset' : ''
              }`}
            >
              <span>{format(day, 'd')}</span>
              <span className="flex h-1.5 items-center gap-0.5">
                {mark &&
                  Array.from({ length: Math.min(mark.count, 3) }).map((_, i) => (
                    <span
                      key={i}
                      className="size-1.5 rounded-full bg-zinc-900"
                    />
                  ))}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M12 4l-6 6 6 6' : 'M8 4l6 6-6 6'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
