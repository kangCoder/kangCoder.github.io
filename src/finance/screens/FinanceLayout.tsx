import { Outlet } from 'react-router-dom'
import { FinanceTabBar } from '../components/FinanceTabBar'
import { useFinanceBootstrap } from '../lib/useFinanceBootstrap'

/**
 * 가계부 영역 셸 — §1.5
 *
 * 시드와 고정비 자동 생성을 여기서 한 번만 돌린다(§4, §5.6).
 * 화면마다 걸면 중복 호출이 되고, App 최상위에 걸면 운동만 쓸 때도 가계부 DB가
 * 열린다.
 */
export function FinanceLayout() {
  const ready = useFinanceBootstrap()
  if (!ready) return null

  return (
    <>
      <Outlet />
      <FinanceTabBar />
    </>
  )
}
