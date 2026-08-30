/** 순서 이동 버튼용 화살표 */
export function ArrowIcon({ direction }: { direction: 'up' | 'down' }) {
  return (
    <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
      <path
        d={direction === 'up' ? 'M4 12l6-6 6 6' : 'M4 8l6 6 6-6'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
