import type { ReactNode } from 'react'
import { Button } from './Button'

/**
 * 되돌릴 수 없는 동작 확인. window.confirm은 PWA에서 어색하고
 * 삭제 영향 범위 같은 여러 줄 설명을 담지 못한다.
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel = '삭제',
  onConfirm,
  onCancel,
}: {
  title: string
  description: ReactNode
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="취소"
        className="absolute inset-0 bg-zinc-900/40"
        onClick={onCancel}
      />
      <div
        role="alertdialog"
        aria-label={title}
        className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
      >
        <h2 className="text-[17px] font-semibold text-zinc-900">{title}</h2>
        <div className="mt-2 text-[14px] leading-relaxed text-zinc-600">
          {description}
        </div>
        <div className="mt-5 flex gap-2">
          <Button className="flex-1" onClick={onCancel}>
            취소
          </Button>
          <Button variant="danger" className="flex-1" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
