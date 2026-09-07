import { db } from './db'
import type { Bodyweight } from './types'

/**
 * 체중 쿼리. date는 'yyyy-MM-dd' 문자열 기본키라 문자열 범위로 조회한다.
 * 입력 화면은 아직 없고, 주간 리포트가 읽기만 한다.
 */
export function listBodyweightsBetween(
  from: string,
  to: string,
): Promise<Bodyweight[]> {
  return db.bodyweights.where('date').between(from, to, true, true).sortBy('date')
}
