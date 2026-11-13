import type { CycleReportExport } from '../db/report'
import { formatPercent, formatWonUnit } from './money'

/**
 * 사이클 리포트 마크다운 생성 — spec-finance §5.3.1
 *
 * 순수 함수다. DB에서 모은 데이터를 받아 문자열만 만든다.
 * 운동 주간 리포트(`lib/weeklyReport.ts`)와 같은 이유로 이미지가 아니라
 * 텍스트로 내보낸다 — 메모 앱이나 Claude에 그대로 붙여 넣을 수 있다.
 *
 * 숫자는 화면과 같은 `getCycleReport` 결과만 쓴다. 여기서 다시 합산하면
 * 추출본과 화면이 어긋날 수 있다.
 */
export function renderCycleReport(
  data: CycleReportExport,
  range: { start: string; end: string },
): string {
  const { report, expensesByCategory } = data
  const lines: string[] = [
    `## 사이클 리포트 ${report.cycleKey} (${range.start} ~ ${range.end})`,
    '',
  ]

  if (report.rows.length === 0) {
    lines.push('이 사이클에는 지출이 없습니다.')
    return lines.join('\n')
  }

  lines.push(...renderSummary(data), '', ...renderTable(data))

  const spentRows = report.rows.filter((row) => row.spent > 0)
  if (spentRows.length > 0) {
    lines.push('', '### 카테고리별 세부 내역')
    for (const row of spentRows) {
      const budget = row.budget > 0 ? ` / 예산 ${formatWonUnit(row.budget)}` : ''
      lines.push(
        '',
        `#### ${escapeInline(row.name)} (${escapeInline(row.group)}) — ${formatWonUnit(row.spent)}${budget}`,
        '',
      )
      for (const tx of expensesByCategory.get(row.categoryId) ?? []) {
        const memo = tx.memo?.trim() ? ` · ${escapeInline(tx.memo.trim())}` : ''
        const fixed = tx.isFixed ? ' · 고정' : ''
        lines.push(`- ${tx.date.slice(5)} · ${formatWonUnit(tx.amount)}${memo}${fixed}`)
      }
    }
  }

  return lines.join('\n')
}

function renderSummary({ report }: CycleReportExport): string[] {
  const lines: string[] = []

  const budgetPart =
    report.totalBudget > 0
      ? ` / 예산 ${formatWonUnit(report.totalBudget)} (${signed(report.totalBudget - report.totalSpent, '남음', '초과')})`
      : ''
  lines.push(`- **총 지출**: ${formatWonUnit(report.totalSpent)}${budgetPart}`)

  if (report.previousSpent > 0) {
    const delta = report.totalSpent - report.previousSpent
    lines.push(
      `- **전 사이클 대비**: ${delta >= 0 ? '+' : '-'}${formatWonUnit(Math.abs(delta))} (전 사이클 ${formatWonUnit(report.previousSpent)})`,
    )
  }

  const share = (part: number) =>
    formatPercent(report.totalSpent > 0 ? part / report.totalSpent : 0, 0)
  lines.push(
    `- **고정비 / 변동비**: 고정 ${formatWonUnit(report.fixedSpent)} (${share(report.fixedSpent)}) / 변동 ${formatWonUnit(report.variableSpent)} (${share(report.variableSpent)})`,
  )

  return lines
}

function renderTable({ report }: CycleReportExport): string[] {
  const lines = [
    '### 카테고리별 예산 대비',
    '',
    '차이 = 예산 − 실제 (음수면 초과)',
    '',
    '| 카테고리 | 그룹 | 예산 | 실제 | 차이 | 전 사이클 대비 |',
    '|---|---|---:|---:|---:|---:|',
  ]
  for (const row of report.rows) {
    const budget = row.budget > 0 ? formatWonUnit(row.budget) : '—'
    const diff =
      row.budget > 0
        ? `${row.diff >= 0 ? '+' : '-'}${formatWonUnit(Math.abs(row.diff))}`
        : '—'
    const delta =
      row.delta === 0
        ? '0원'
        : `${row.delta > 0 ? '+' : '-'}${formatWonUnit(Math.abs(row.delta))}`
    lines.push(
      `| ${escapeCell(row.name)} | ${escapeCell(row.group)} | ${budget} | ${formatWonUnit(row.spent)} | ${diff} | ${delta} |`,
    )
  }
  return lines
}

function signed(amount: number, positive: string, negative: string): string {
  return amount >= 0
    ? `${formatWonUnit(amount)} ${positive}`
    : `${formatWonUnit(-amount)} ${negative}`
}

/** 표 칸 안의 `|`는 열 구분자로 읽힌다 */
function escapeCell(text: string): string {
  return escapeInline(text).replace(/\|/g, '\\|')
}

/** 메모의 줄바꿈이 목록 항목을 끊지 않게 한 줄로 */
function escapeInline(text: string): string {
  return text.replace(/\s*\n\s*/g, ' ')
}
