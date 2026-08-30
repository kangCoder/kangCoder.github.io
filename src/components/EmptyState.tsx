import type { ReactNode } from 'react'

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="text-[15px] font-medium text-zinc-500">{title}</p>
      {hint && <p className="text-[13px] text-zinc-400">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
