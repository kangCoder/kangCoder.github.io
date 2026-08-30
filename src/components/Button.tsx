import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'bg-zinc-900 text-white active:bg-zinc-700 disabled:bg-zinc-300',
  secondary:
    'bg-white text-zinc-900 ring-1 ring-zinc-300 active:bg-zinc-100 disabled:text-zinc-400',
  ghost: 'text-zinc-600 active:bg-zinc-200 disabled:text-zinc-300',
  danger: 'bg-white text-red-600 ring-1 ring-red-200 active:bg-red-50',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  children: ReactNode
}

/** 터치 타겟 최소 44px — spec §5.1 */
export function Button({
  variant = 'secondary',
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-[15px] font-medium transition-colors select-none ${VARIANT_CLASS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

/** 아이콘 하나짜리 정사각 버튼. 44px 타겟은 유지한다. */
export function IconButton({
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      type={type}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-zinc-500 transition-colors select-none active:bg-zinc-200 disabled:text-zinc-300 disabled:active:bg-transparent ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
