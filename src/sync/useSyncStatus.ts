import { useEffect, useSyncExternalStore } from 'react'
import {
  getSyncStatuses,
  startAutoSync,
  subscribeSyncStatus,
  type AreaSyncStatus,
} from './auto'

/** 자동 동기화를 켠다. 로그인된 트리 안에서 한 번만 마운트해야 한다 */
export function useStartAutoSync(): void {
  useEffect(() => startAutoSync(), [])
}

export function useSyncStatuses(): Readonly<Record<string, AreaSyncStatus>> {
  return useSyncExternalStore(
    subscribeSyncStatus,
    getSyncStatuses,
    getSyncStatuses,
  )
}
