import { db } from '../db/db'
import {
  WORKOUT_TABLE_NAMES,
  WORKOUT_USER_DATA_TABLES,
} from '../db/backup'
import { financeDb } from '../finance/db/db'
import {
  FINANCE_TABLE_NAMES,
  FINANCE_USER_DATA_TABLES,
} from '../finance/db/backup'
import type { SyncableDb } from './syncState'

/**
 * 동기화 단위 — docs/spec-sync-v0.1.md §3.1
 *
 * 운동과 가계부는 DB부터 독립이라 rev도 따로 둔다. 한쪽만 바뀌었을 때
 * 다른 쪽을 올리지 않고, 한쪽 충돌이 다른 쪽을 막지 않는다.
 *
 * 엔진이 두 영역을 같은 코드로 다루게 하는 유일한 접점이다. 테이블 목록은
 * 각 영역의 backup.ts가 원본이다 — 두 군데에 적으면 한쪽만 고치게 된다.
 */
export interface SyncArea {
  /** Firestore 문서 id가 된다 */
  id: 'workout' | 'finance'
  label: string
  db: SyncableDb
  /** 스냅샷에 담는 테이블. syncState는 들어 있지 않다 — §4 */
  tableNames: readonly string[]
  /** "이 기기에 기록이 있는가" 판단용. 시드 테이블 제외 — §7.3 */
  userDataTables: readonly string[]
}

export const WORKOUT_AREA: SyncArea = {
  id: 'workout',
  label: '운동 기록',
  db,
  tableNames: WORKOUT_TABLE_NAMES,
  userDataTables: WORKOUT_USER_DATA_TABLES,
}

export const FINANCE_AREA: SyncArea = {
  id: 'finance',
  label: '가계부',
  db: financeDb,
  tableNames: FINANCE_TABLE_NAMES,
  userDataTables: FINANCE_USER_DATA_TABLES,
}

export const SYNC_AREAS: readonly SyncArea[] = [WORKOUT_AREA, FINANCE_AREA]
