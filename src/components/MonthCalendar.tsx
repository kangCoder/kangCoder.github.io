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
  selected,
  selectAnyDay = false,
  onSelectDay,
}: {
  month: Date
  onMonthChange: (month: Date) => void
  marks: CalendarDay[]
  /**
   * 지금 고른 날. 회색 배경으로 표시한다.
   *
   * 오늘 테두리만으로는 "내가 어디를 눌렀는지"가 보이지 않는다.
   * 특히 오늘이 아닌 날을 고르면 아무 변화가 없어 눌렀는지 알 수 없다.
   */
  selected?: Date
  /**
   * 기록이 없는 날도 누를 수 있게 한다.
   *
   * 운동 쪽은 기록이 있는 날만 누른다 — 빈 날로 가도 보여 줄 것이 없다.
   * 가계부는 빈 날을 눌러 "이 날에는 입력이 없습니다"를 확인하는 것이
   * 자연스럽고, 누를 수 없으면 날짜 선택이 들쭉날쭉해 보인다.
   */
  selectAnyDay?: boolean
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
          const isPicked = selected !== undefined && isSameDay(selected, day)
          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={!selectAnyDay && !mark}
              aria-pressed={isPicked}
              onClick={() => onSelectDay(day)}
              className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-[13px] tabular-nums transition-colors ${
                outside ? 'text-zinc-300' : 'text-zinc-700'
              } ${mark ? 'font-semibold' : ''} ${
                // 고른 날은 배경으로 — 오늘 테두리와 겹쳐도 둘 다 읽힌다
                isPicked ? 'bg-zinc-200 font-semibold' : 'active:bg-zinc-100'
              } ${isToday(day) ? 'ring-1 ring-zinc-900 ring-inset' : ''}`}
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
