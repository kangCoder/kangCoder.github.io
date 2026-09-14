import { db } from './db'

/**
 * 앱 전역 설정 — 어느 영역을 쓸지.
 *
 * 운동과 가계부는 DB부터 분리돼 있지만, "무엇을 보여줄지"는 어느 한쪽에
 * 속하지 않는다. 원래 앱인 운동 쪽 DB에 두되 값 자체는 영역 중립이다.
 *
 * localStorage를 쓰지 않는 것은 기존 규약이다.
 */
export interface AppSettings {
  id: 'default'
  showWorkout: boolean
  showFinance: boolean
}

const ID = 'default' as const

export const DEFAULT_APP_SETTINGS: AppSettings = {
  id: ID,
  showWorkout: true,
  showFinance: true,
}

export async function getAppSettings(): Promise<AppSettings> {
  return (await db.appSettings.get(ID)) ?? DEFAULT_APP_SETTINGS
}

/**
 * 둘 다 끄면 아무 화면도 남지 않는다. 마지막 하나는 끌 수 없다.
 * 끄려는 쪽이 마지막이면 무시하고 현재 값을 그대로 돌려준다.
 */
export async function setAreaVisible(
  area: 'workout' | 'finance',
  visible: boolean,
): Promise<AppSettings> {
  const current = await getAppSettings()
  const next: AppSettings = {
    ...current,
    ...(area === 'workout' ? { showWorkout: visible } : { showFinance: visible }),
  }
  if (!next.showWorkout && !next.showFinance) return current

  await db.appSettings.put(next)
  return next
}
