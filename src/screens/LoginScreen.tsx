import { useState } from 'react'
import { Button } from '../components/Button'
import { Label } from '../components/fields'
import {
  authErrorMessage,
  register,
  signIn,
  validateCredentials,
} from '../sync/auth'

const INPUT_CLASS =
  'min-h-11 w-full rounded-xl bg-white px-3 text-[16px] text-zinc-900 ring-1 ring-zinc-300 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-900'

/**
 * 로그인 — docs/spec-sync-v0.1.md §2
 *
 * 로그인과 신규 등록을 **같은 화면의 다른 버튼**으로 둔다. 탭으로 나누지
 * 않는 이유는, 이메일 열거 방지 때문에 "이 이름이 있는지"를 미리 알 수
 * 없어서다(§2.5). 사용자가 어느 쪽인지 직접 고르게 하는 편이
 * "이름 또는 PIN이 맞지 않습니다"만 반복되는 것보다 낫다.
 *
 * `TextField`를 쓰지 않고 input을 직접 쓴 이유는 autoComplete·maxLength·
 * inputMode를 각각 지정해야 하고, 로그인 폼은 브라우저 비밀번호 관리자와
 * 맞물려야 하기 때문이다.
 */
export function LoginScreen() {
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function submit(mode: 'signIn' | 'register') {
    const invalid = validateCredentials(name, pin)
    if (invalid) {
      setError(invalid)
      return
    }

    setBusy(true)
    setError(undefined)
    try {
      if (mode === 'signIn') await signIn(name, pin)
      else await register(name, pin)
      // 성공하면 onAuthStateChanged가 화면을 바꾼다. 여기서 할 일이 없다
    } catch (e) {
      setError(authErrorMessage(e))
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 pb-16">
      <header className="mb-6">
        <h1 className="text-[22px] font-semibold text-zinc-900">
          기록 불러오기
        </h1>
        <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">
          이름으로 기록을 구분합니다. 같은 이름과 PIN으로 들어오면 폰과 PC에서
          같은 기록이 보입니다.
        </p>
      </header>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void submit('signIn')
        }}
      >
        <div>
          <Label hint="영문 소문자·숫자">이름</Label>
          <input
            type="text"
            className={INPUT_CLASS}
            value={name}
            placeholder="hyunsu"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={20}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <Label hint="숫자 4자리">PIN</Label>
          <input
            type="password"
            className={`${INPUT_CLASS} tabular-nums`}
            value={pin}
            placeholder="••••"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={4}
            disabled={busy}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          />
        </div>

        {error && <p className="text-[13px] text-red-600">{error}</p>}

        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? '확인 중…' : '들어가기'}
        </Button>
        <Button disabled={busy} onClick={() => void submit('register')}>
          새 이름으로 시작하기
        </Button>
      </form>

      <p className="mt-5 text-[11px] leading-relaxed text-zinc-400">
        PIN을 잊으면 복구할 수 없습니다. 비밀번호 재설정 메일을 보낼 서버가
        없기 때문입니다. 설정 화면에서 JSON 백업을 내려두세요.
      </p>
    </div>
  )
}
