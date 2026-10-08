import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, IconButton } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { getAppSettings, setAreaVisible } from '../db/appSettings'
import {
  BackupFormatError,
  backupFileName,
  exportBackup,
  parseBackup,
  restoreBackup,
  type WorkoutBackup,
} from '../db/backup'
import { accountName, signOutAccount } from '../sync/auth'
import { SyncSection } from './SyncSection'
import { useAuthUser } from '../sync/useAuthUser'

/**
 * 앱 설정 — 어느 영역을 쓸지.
 *
 * 이 화면은 양쪽 영역 어디서든 들어올 수 있어야 한다. 가계부 설정 안에만
 * 두면 가계부를 숨긴 뒤 다시 켤 방법이 없어진다.
 */
const AREAS = [
  {
    key: 'workout' as const,
    label: '운동 기록',
    hint: '종목·템플릿·세션·주간 리포트',
  },
  {
    key: 'finance' as const,
    label: '가계부',
    hint: '거래·예산·자산·목표',
  },
]

export function AppSettingsScreen() {
  const navigate = useNavigate()
  const settings = useLiveQuery(() => getAppSettings(), [])

  if (settings === undefined) return null

  const visible = {
    workout: settings.showWorkout,
    finance: settings.showFinance,
  }
  const onlyOneLeft = Number(visible.workout) + Number(visible.finance) === 1

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-1 bg-zinc-100/90 px-2 pt-2 pb-2 backdrop-blur">
        <IconButton onClick={() => navigate(-1)} aria-label="뒤로">
          <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
            <path
              d="M12 4l-6 6 6 6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </IconButton>
        <h1 className="flex-1 text-[17px] font-semibold text-zinc-900">
          앱 설정
        </h1>
      </header>

      <AccountSection />

      <section className="px-4 pt-1 pb-4">
        <h2 className="mb-2 text-[13px] font-medium text-zinc-500">
          사용할 기능
        </h2>
        <ul className="flex flex-col gap-1.5">
          {AREAS.map((area) => {
            const on = visible[area.key]
            // 마지막 하나는 끌 수 없다 — 끄면 남는 화면이 없다
            const locked = on && onlyOneLeft
            return (
              <li
                key={area.key}
                className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-zinc-200"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium text-zinc-900">
                    {area.label}
                  </p>
                  <p className="text-[12px] text-zinc-500">{area.hint}</p>
                </div>
                <input
                  type="checkbox"
                  aria-label={area.label}
                  className="size-5 shrink-0 accent-zinc-900 disabled:opacity-40"
                  checked={on}
                  disabled={locked}
                  onChange={(e) => setAreaVisible(area.key, e.target.checked)}
                />
              </li>
            )
          })}
        </ul>
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
          끈 기능은 화면과 전환 토글에서 사라집니다. 데이터는 지워지지 않고
          그대로 남아 있다가 다시 켜면 돌아옵니다. 하나는 반드시 켜 두어야 합니다.
        </p>
      </section>

      <SyncSection />
      <BackupSection />
    </div>
  )
}

/**
 * 계정 — docs/spec-sync-v0.1.md §2
 *
 * 로그아웃이 아직 로컬 DB를 지우지 않는다. 설계(§7.2)는 삭제까지지만
 * 동기화가 구현되기 전에 지우면 올리지 못한 기록이 복구 불가로 사라진다.
 * DB 삭제는 dirty 가드와 같은 단계에서 넣는다.
 */
function AccountSection() {
  const auth = useAuthUser()
  const [confirming, setConfirming] = useState(false)

  if (auth.state !== 'signedIn') return null
  const name = accountName(auth.user)

  return (
    <section className="px-4 pt-1 pb-4">
      <h2 className="mb-2 text-[13px] font-medium text-zinc-500">계정</h2>
      <div className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-zinc-200">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-zinc-900">{name}</p>
          <p className="text-[12px] text-zinc-500">
            이 이름으로 기록이 구분됩니다
          </p>
        </div>
        <Button onClick={() => setConfirming(true)}>로그아웃</Button>
      </div>

      {confirming && (
        <ConfirmDialog
          title="로그아웃할까요?"
          description={
            <>
              <p>
                다시 들어오려면 이름과 PIN이 필요합니다. PIN을 잊으면 복구할
                수 없습니다.
              </p>
              <p className="mt-1">
                이 기기의 기록은 지워지지 않고 남습니다. 아직 기기 간 동기화가
                켜지지 않았으니, 다른 이름으로 들어오면 이 기록이 그대로
                보입니다.
              </p>
            </>
          }
          confirmLabel="로그아웃"
          onConfirm={() => void signOutAccount()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </section>
  )
}

/**
 * 운동 기록 백업 — spec-sync-v0.1.md §10
 *
 * 가계부 설정의 BackupSection과 같은 구조다. 양쪽을 한 화면에 합치지 않는
 * 이유는 DB가 분리돼 있어 파일도 따로여야 하고, 한쪽만 복원하는 경우가
 * 실제로 있기 때문이다.
 */
function BackupSection() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<WorkoutBackup>()
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()

  async function download() {
    const backup = await exportBackup()
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = backupFileName()
    anchor.click()
    URL.revokeObjectURL(url)
    const count = Object.values(backup.tables).reduce(
      (sum, rows) => sum + rows.length,
      0,
    )
    setMessage(`${count}건을 내보냈습니다`)
    setError(undefined)
  }

  async function pick(file: File) {
    setError(undefined)
    setMessage(undefined)
    try {
      setPending(parseBackup(await file.text()))
    } catch (e) {
      setError(
        e instanceof BackupFormatError ? e.message : '파일을 읽지 못했습니다',
      )
    }
  }

  async function confirmRestore() {
    if (!pending) return
    const result = await restoreBackup(pending)
    const count = Object.values(result.restored).reduce(
      (sum, n) => sum + (n ?? 0),
      0,
    )
    setPending(undefined)
    setMessage(`${count}건을 복원했습니다`)
  }

  return (
    <section className="px-4 pb-6">
      <h2 className="mb-2 text-[13px] font-medium text-zinc-500">
        운동 기록 백업
      </h2>
      <div className="flex flex-col gap-2 rounded-xl bg-white p-3 ring-1 ring-zinc-200">
        <Button onClick={download}>JSON 내보내기</Button>
        <Button onClick={() => inputRef.current?.click()}>
          JSON 가져오기
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void pick(file)
            e.target.value = ''
          }}
        />
        <p className="text-[12px] text-zinc-400">
          운동 기록(<code>workout-log</code>) 데이터만 담깁니다. 가계부는 별도
          데이터베이스라 가계부 설정에서 따로 내보냅니다.
        </p>
        {message && <p className="text-[13px] text-emerald-700">{message}</p>}
        {error && <p className="text-[13px] text-red-600">{error}</p>}
      </div>

      {pending && (
        <ConfirmDialog
          title="백업을 복원할까요?"
          description={
            <>
              <p>
                현재 운동 기록을 전부 지우고 파일의 내용으로 바꿉니다.
                되돌릴 수 없습니다.
              </p>
              <p className="mt-1 tabular-nums">
                내보낸 시각:{' '}
                {new Date(pending.exportedAt).toLocaleString('ko-KR')}
              </p>
            </>
          }
          confirmLabel="복원"
          onConfirm={confirmRestore}
          onCancel={() => setPending(undefined)}
        />
      )}
    </section>
  )
}
