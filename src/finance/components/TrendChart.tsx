import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TrendPoint } from '../db/report'
import { formatWon } from '../lib/money'

/**
 * 최근 사이클의 지출·저축 추이.
 * 이번 사이클 숫자만 보면 늘었는지 줄었는지를 알 수 없다.
 */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={points}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid stroke="#f4f4f5" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#a1a1aa' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#a1a1aa' }}
            axisLine={false}
            tickLine={false}
            width={40}
            tickFormatter={(value: number) =>
              `${Math.round(value / 10000).toLocaleString('ko-KR')}만`
            }
          />
          <Tooltip
            formatter={(value) => `${formatWon(Number(value) || 0)}원`}
          />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            formatter={(value) => (value === 'expense' ? '지출' : '저축·투자')}
          />
          <Line
            type="monotone"
            dataKey="expense"
            stroke="#dc2626"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="saving"
            stroke="#059669"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
