import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ProjectionPoint } from '../lib/simulator'
import { formatWon } from '../lib/money'

/**
 * 자기자금이 목표선을 언제 넘는지 보여준다.
 *
 * "76개월 필요, 목표보다 46개월 늦음" 같은 숫자만으로는 얼마나 모자란지가
 * 감이 안 온다. 목표 금액(가로선)과 목표 시점(세로선)을 함께 그리면
 * 곡선이 두 선의 교차점을 어디서 지나는지가 한눈에 보인다.
 */
export function ProjectionChart({
  points,
  targetAmount,
  targetMonth,
  height = 180,
}: {
  points: ProjectionPoint[]
  targetAmount: number
  /** 목표 시점까지 남은 개월 */
  targetMonth: number
  height?: number
}) {
  // 월 단위로 다 그리면 점이 너무 많다. 6개월 간격으로 솎는다.
  const step = Math.max(1, Math.round(points.length / 24))
  const data = points
    .filter((_, i) => i % step === 0 || i === points.length - 1)
    .map((point) => ({
      month: point.month,
      capital: Math.round(point.capital),
    }))

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#f4f4f5" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: '#a1a1aa' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value: number) => `${value}개월`}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#a1a1aa' }}
            axisLine={false}
            tickLine={false}
            width={40}
            tickFormatter={(value: number) =>
              `${Math.round(value / 10000000)}천만`
            }
          />
          <Tooltip
            formatter={(value) => [`${formatWon(Number(value) || 0)}원`, '자기자금']}
            labelFormatter={(label) => `${label}개월 후`}
          />
          <ReferenceLine
            y={targetAmount}
            stroke="#dc2626"
            strokeDasharray="4 3"
            label={{
              value: '목표',
              position: 'insideTopLeft',
              fontSize: 11,
              fill: '#dc2626',
            }}
          />
          {targetMonth > 0 && targetMonth <= (data.at(-1)?.month ?? 0) && (
            <ReferenceLine
              x={targetMonth}
              stroke="#a1a1aa"
              strokeDasharray="4 3"
              label={{
                value: '목표 시점',
                position: 'top',
                fontSize: 11,
                fill: '#71717a',
              }}
            />
          )}
          <Line
            type="monotone"
            dataKey="capital"
            stroke="#18181b"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
