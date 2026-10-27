/**
 * 휴식 타이머 종료 알림 — spec-v0.1.md §6.2
 *
 * 오디오 파일 대신 WebAudio로 비프를 합성한다. 에셋이 없어 번들이 늘지 않고,
 * 헬스장 소음 위로 뚫고 나오는 톤을 직접 고를 수 있다.
 *
 * iOS는 사용자 제스처 없이 시작한 오디오를 막는다. 그래서 세트 완료를 탭하는
 * 순간 unlockAlarm()으로 컨텍스트를 열어 두고, 타이머가 끝나면 그 컨텍스트로
 * 재생한다. 열어 두지 못했으면 소리는 조용히 포기하고 진동만 시도한다.
 *
 * **비프를 미리 예약한다.** 타이머가 끝나는 순간 재생을 시작하면,
 * 백그라운드 탭에서 setInterval이 1초 이상으로 스로틀되거나 아예 멈춰
 * 소리가 늦거나 나지 않는다. WebAudio는 자체 클럭으로 동작하므로
 * `oscillator.start(미래 시각)`으로 걸어 두면 JS 타이머와 무관하게 울린다.
 */

let context: AudioContext | undefined
let scheduled: AudioScheduledSourceNode[] = []

/** 사용자 제스처 안에서 호출해야 한다 */
export function unlockAlarm(): void {
  try {
    context ??= new AudioContext()
    if (context.state === 'suspended') void context.resume()
  } catch {
    // 오디오를 못 열어도 앱은 계속 동작해야 한다
    context = undefined
  }
}

/**
 * `endsAt`(epoch ms)에 울리도록 예약한다. 이미 걸린 예약은 지운다 —
 * 휴식 연장은 같은 타이머의 종료 시각만 바꾸는 것이라 두 번 울려선 안 된다.
 */
export function scheduleAlarm(endsAt: number): void {
  cancelAlarm()
  if (!context || context.state !== 'running') return

  const delay = Math.max(0, (endsAt - Date.now()) / 1000)
  beepAt(context.currentTime + delay)
}

/** 휴식을 건너뛰거나 연장할 때. 예약된 노드를 멈춰 둔다 */
export function cancelAlarm(): void {
  for (const node of scheduled) {
    try {
      node.stop()
      node.disconnect()
    } catch {
      // 이미 끝난 노드. 무시한다
    }
  }
  scheduled = []
}

/**
 * 진동은 예약할 수 없어 종료 시점에 부른다. 소리와 달리 늦으면 늦은 대로
 * 울릴 뿐이고, 없는 플랫폼(iOS Safari)에서는 조용히 넘어간다.
 */
export function vibrateAlarm(): void {
  if (typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate([200, 100, 200, 100, 300])
  } catch {
    // 무시 — 알림의 보조 수단이다
  }
}

/** 880Hz 짧은 비프 3회를 주어진 컨텍스트 시각부터 */
function beepAt(at: number): void {
  if (!context) return

  for (let i = 0; i < 3; i++) {
    const start = at + i * 0.22
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.value = 880

    // 게인을 0에서 올렸다 내려야 시작·끝의 클릭 노이즈가 없다
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(0.3, start + 0.01)
    gain.gain.linearRampToValueAtTime(0, start + 0.15)

    oscillator.connect(gain).connect(context.destination)
    oscillator.start(start)
    oscillator.stop(start + 0.16)
    scheduled.push(oscillator)
  }
}

/**
 * 백그라운드에서 돌아올 때 컨텍스트가 정지돼 있으면 되살린다.
 * iOS는 앱을 벗어나면 AudioContext를 suspend하고, 그동안 예약된 소리는
 * 울리지 않는다. 복귀 후 뒤늦게 울리는 것도 혼란스러우므로 호출부가
 * 지난 예약은 취소한다.
 */
export function resumeAlarmContext(): void {
  if (context?.state === 'suspended') void context.resume()
}
