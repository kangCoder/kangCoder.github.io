import { db } from './db'
import type { Run } from './types'

/**
 * 러닝 쿼리 — §4.1에 따라 웨이트와 별도 세션으로 다룬다.
 * 입력 화면(§5의 7번)은 아직 없고, 주간 리포트가 읽기만 한다.
 */
export function listRunsBetween(from: number, to: number): Promise<Run[]> {
  return db.runs.where('startedAt').between(from, to, true, true).sortBy('startedAt')
}
