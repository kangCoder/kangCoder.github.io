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
import { accountName } from '../sync/auth'
import {
  pushBeforeSignOut,
  signOutAndClearDevice,
} from '../sync/signOutDevice'
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
 * 계정 — docs/spec-sync-v0.1.md §2, §7.2
 *
 * 로그아웃은 로컬 DB를 지운다. Dexie DB가 오리진당 하나라서, 남기면 다음에
 * 다른 이름으로 들어온 사람이 남의 기록을 본다.
 *
 * 그래서 지우기 전에 올리지 못한 변경을 먼저 올린다. 못 올리면 한 번 더
 * 묻는다 — 이 지점이 되돌릴 수 없는 유일한 곳이다.
 */
function AccountSection() {
  const auth = useAuthUser()
  const [stage, setStage] = useState<'idle' | 'confirm' | 'pushing' | 'unpushed'>(
    'idle',
  )
  const [unpushed, setUnpushed] = useState<string[]>([])

  if (auth.state !== 'signedIn') return null
  const name = accountName(auth.user)

  async function begin() {
    setStage('pushing')
    const failed = await pushBeforeSignOut()
    if (failed.length === 0) {
      await signOutAndClearDevice()
      return
    }
    setUnpushed(failed)
    setStage('unpushed')
  }

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
        <Button
          disabled={stage === 'pushing'}
          onClick={() => setStage('confirm')}
        >
          {stage === 'pushing' ? '올리는 중…' : '로그아웃'}
        </Button>
      </div>

      {stage === 'confirm' && (
        <ConfirmDialog
          title="로그아웃할까요?"
          description={
            <>
              <p>
                올리지 못한 변경을 먼저 올린 뒤, <b>이 기기의 기록을 지웁니다.</b>{' '}
                다른 사람이 이 기기에서 다른 이름으로 들어올 수 있게 하려면
                지워야 합니다.
              </p>
              <p className="mt-1">
                기록은 원격에 남아 있으니 같은 이름과 PIN으로 다시 들어오면
                돌아옵니다. PIN을 잊으면 복구할 수 없습니다.
              </p>
            </>
          }
          confirmLabel="로그아웃"
          onConfirm={() => void begin()}
          onCancel={() => setStage('idle')}
        />
      )}

      {stage === 'unpushed' && (
        <ConfirmDialog
          title="올리지 못한 변경이 있습니다"
          description={
            <>
              <p>
                <b>{unpushed.join(' · ')}</b>을 원격에 올리지 못했습니다.
                연결이 끊겼거나 다른 기기가 먼저 올렸을 수 있습니다.
              </p>
              <p className="mt-1">
                그래도 로그아웃하면 이 기기의 해당 기록은{' '}
                <b>복구할 수 없습니다.</b> 취소하고 연결을 확인하거나, 백업을
                내려둔 뒤 진행하세요.
              </p>
            </>
          }
          confirmLabel="지우고 로그아웃"
          onConfirm={() => void signOutAndClearDevice()}
          onCancel={() => setStage('idle')}
        />
      )}
    </section>
  )
}

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
