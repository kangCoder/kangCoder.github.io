import {
  HashRouter,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import { FinanceDashboardScreen } from './finance/screens/FinanceDashboardScreen'
import { FinanceLayout } from './finance/screens/FinanceLayout'
import { useLiveQuery } from 'dexie-react-hooks'
import { AppSwitcher } from './components/AppSwitcher'
import { getAppSettings } from './db/appSettings'
import { AppSettingsScreen } from './screens/AppSettingsScreen'
import { ConfigErrorScreen } from './screens/ConfigErrorScreen'
import { LoginScreen } from './screens/LoginScreen'
import { useAuthUser } from './sync/useAuthUser'
import { AssetsScreen } from './finance/screens/AssetsScreen'
import { BudgetPlanScreen } from './finance/screens/BudgetPlanScreen'
import { CategoryManageScreen } from './finance/screens/CategoryManageScreen'
import { CycleReportScreen } from './finance/screens/CycleReportScreen'
import { SimulatorScreen } from './finance/screens/SimulatorScreen'
import { FinanceSettingsScreen } from './finance/screens/FinanceSettingsScreen'
import { GoalDetailScreen } from './finance/screens/GoalDetailScreen'
import { FixedCostScreen } from './finance/screens/FixedCostScreen'
import { TransactionFormScreen } from './finance/screens/TransactionFormScreen'
import { ExerciseListScreen } from './screens/ExerciseListScreen'
import { HomeScreen } from './screens/HomeScreen'
import { TemplateEditScreen } from './screens/TemplateEditScreen'
import { TemplateListScreen } from './screens/TemplateListScreen'
import { WeeklyReportScreen } from './screens/WeeklyReportScreen'
import { WorkoutScreen } from './screens/WorkoutScreen'

/**
 * 해시 라우팅을 쓰는 이유 — GitHub Pages는 SPA 폴백이 없어서 새로고침 시 404가 난다.
 * 404.html 트릭 대신 해시를 쓰면 서비스워커 등록(§3.1)과도 부딪히지 않는다.
 */
export function App() {
  return (
    <HashRouter>
      <AppShell />
    </HashRouter>
  )
}

/**
 * 로그인 게이트 — spec-sync-v0.1.md §7.1
 *
 * 본체를 별도 컴포넌트로 분리한 이유: appSettings도 사용자별 데이터라
 * 로그인 전에 읽어선 안 된다. 훅은 조건부로 부를 수 없으므로 컴포넌트를
 * 나눠야 Dexie 읽기가 로그인 뒤로 미뤄진다.
 */
function AppShell() {
  const auth = useAuthUser()

  if (auth.state === 'misconfigured') {
    return <ConfigErrorScreen missing={auth.missing} />
  }
  // 세션 복원에 한 틱이 걸린다. 여기서 로그인 화면을 띄우면 매번 깜빡인다
  if (auth.state === 'loading') return null
  if (auth.state === 'signedOut') return <LoginScreen />

  return <SignedInShell />
}

/**
 * 탭바가 영역에 따라 바뀌므로 useLocation을 쓸 수 있도록 Router 안으로 내렸다.
 * 가계부에도 화면이 여러 개라 운동 탭바에 끼워 넣을 수 없다 —
 * spec-finance-v0.2.md §1.5
 */
function SignedInShell() {
  const { pathname } = useLocation()
  const settings = useLiveQuery(() => getAppSettings(), [])
  const isFinance = pathname.startsWith('/finance')
  // 탭이 가리키는 최상위 화면에서만 띄운다. 상세 화면은 좌측 상단이 뒤로가기 자리다.
  const showSwitcher = ROOT_PATHS.includes(pathname)

  if (settings === undefined) return null

  // 끈 영역으로 들어오면 켜져 있는 쪽으로 보낸다
  const fallback = settings.showWorkout ? '/' : '/finance'
  if (isFinance && !settings.showFinance) return <Navigate to="/" replace />
  if (!isFinance && !settings.showWorkout && pathname !== '/settings') {
    return <Navigate to="/finance" replace />
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col pb-[calc(var(--spacing-tabbar)+env(safe-area-inset-bottom))]">
      {showSwitcher && (
        <AppSwitcher
          showWorkout={settings.showWorkout}
          showFinance={settings.showFinance}
        />
      )}
      <main className="flex-1">
        <Routes>
          <Route path="/settings" element={<AppSettingsScreen />} />
          <Route path="/" element={<HomeScreen />} />
          <Route path="/workouts/:id" element={<WorkoutScreen />} />
          <Route path="/exercises" element={<ExerciseListScreen />} />
          <Route path="/templates" element={<TemplateListScreen />} />
          <Route path="/templates/:id" element={<TemplateEditScreen />} />
          <Route path="/report" element={<WeeklyReportScreen />} />

          {/* 가계부는 캐치올보다 앞에 와야 한다. 뒤에 두면 전부 홈으로 튕긴다 */}
          <Route path="/finance" element={<FinanceLayout />}>
            <Route index element={<FinanceDashboardScreen />} />
            <Route path="new" element={<TransactionFormScreen />} />
            <Route path="fixed" element={<FixedCostScreen />} />
            <Route path="categories" element={<CategoryManageScreen />} />
            <Route path="budget" element={<BudgetPlanScreen />} />
            <Route path="report" element={<CycleReportScreen />} />
            <Route path="assets" element={<AssetsScreen />} />
            <Route path="goal" element={<GoalDetailScreen />} />
            <Route path="simulator" element={<SimulatorScreen />} />
            <Route path="settings" element={<FinanceSettingsScreen />} />
          </Route>

          <Route path="*" element={<Navigate to={fallback} replace />} />
        </Routes>
      </main>
      {/* 가계부 탭바는 FinanceLayout이 직접 렌더한다 */}
      {!isFinance && pathname !== '/settings' && <TabBar />}
    </div>
  )
}

/** 전환 토글을 띄우는 화면 — 양쪽 탭바가 가리키는 곳들이다 */
const ROOT_PATHS = [
  '/',
  '/exercises',
  '/templates',
  '/finance',
  '/finance/new',
  '/finance/assets',
  '/finance/settings',
]

const TABS = [
  { to: '/', label: '홈' },
  { to: '/exercises', label: '종목' },
  { to: '/templates', label: '템플릿' },
]

function TabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-md border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) =>
            `flex h-tabbar flex-1 items-center justify-center text-[13px] font-medium transition-colors ${
              isActive ? 'text-zinc-900' : 'text-zinc-400'
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
