/**
 * 휴식 타이머 종료 알림 — spec-v0.1.md §6.2
 *
 * 오디오 파일 대신 WebAudio로 비프를 합성한다. 에셋이 없어 번들이 늘지 않고,
 * 헬스장 소음 위로 뚫고 나오는 톤을 직접 고를 수 있다.
 *
 * iOS는 사용자 제스처 없이 시작한 오디오를 막는다. 그래서 세트 완료를 탭하는
 * 순간 unlockAlarm()으로 컨텍스트를 열어 두고, 타이머가 끝나면 그 컨텍스트로
 * 재생한다. 열어 두지 못했으면 소리는 조용히 포기하고 진동만 시도한다.
 */

let context: AudioContext | undefined

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

export function playAlarm(): void {
  vibrate()
  beep()
}

/** iOS Safari에는 Vibration API가 없다. 있는 곳에서만 울린다. */
function vibrate(): void {
  if (typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate([200, 100, 200, 100, 300])
  } catch {
    // 무시 — 알림의 보조 수단이다
  }
}

/** 880Hz 짧은 비프 3회 */
function beep(): void {
  if (!context || context.state !== 'running') return
  const start = context.currentTime

  for (let i = 0; i < 3; i++) {
    const at = start + i * 0.22
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.value = 880

    // 게인을 0에서 올렸다 내려야 시작·끝의 클릭 노이즈가 없다
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(0.3, at + 0.01)
    gain.gain.linearRampToValueAtTime(0, at + 0.15)

    oscillator.connect(gain).connect(context.destination)
    oscillator.start(at)
    oscillator.stop(at + 0.16)
  }
}
