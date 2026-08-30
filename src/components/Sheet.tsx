import { useEffect, type ReactNode } from 'react'
import { IconButton } from './Button'

/**
 * 바텀 시트. 화면 아래에서 올라오므로 한 손 엄지 조작 범위 안에 내용이 들어온다.
 * window.confirm/prompt 계열은 PWA에서 어색하고 스타일을 못 잡으므로 쓰지 않는다.
 */
export function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  // 시트가 열려 있는 동안 뒤 배경이 스크롤되지 않도록
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="닫기"
        className="absolute inset-0 bg-zinc-900/40"
        onClick={onClose}
      />
      <div className="relative mx-auto flex max-h-[90vh] w-full max-w-md flex-col rounded-t-2xl bg-zinc-100 pb-[env(safe-area-inset-bottom)] shadow-2xl">
        <header className="flex items-center gap-1 border-b border-zinc-200 px-2 py-2">
          <h2 className="flex-1 pl-2 text-[17px] font-semibold text-zinc-900">
            {title}
          </h2>
          <IconButton onClick={onClose} aria-label="닫기">
            <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </IconButton>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain p-4">
          {children}
        </div>
        {footer && (
          <footer className="border-t border-zinc-200 bg-zinc-50 p-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
