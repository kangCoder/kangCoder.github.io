import { financeDb, newId } from './db'
import type { TxType } from './types'

/**
 * 초기 카테고리 골격 — spec-finance §4
 *
 * **금액을 담지 않는다.** 소스에 실제 급여·자산·부채를 박아 두면 저장소를
 * 공개하는 순간 그대로 노출된다. 데이터가 전부 로컬이라 저장소를 공개해도
 * 무방하다는 전제(§3.1)가 거기서 깨진다.
 *
 * 그래서 여기 있는 것은 **분류 골격뿐**이고 예산은 전부 0이다.
 * 금액·자산·부채·소득은 사용자가 화면에서 직접 넣는다.
 *
 * DB가 비어 있을 때만 1회 넣는다. categories가 0건이면 최초 실행으로 본다.
 * 백업 복원 직후 다시 시드되면 데이터가 섞이므로 복원 경로에서는 호출하지 않는다.
 */

interface SeedCategory {
  name: string
  group: string
  type: TxType
  isFixed: boolean
}

const CATEGORIES: SeedCategory[] = [
  { name: '월세·대출이자', group: '주거', type: 'EXPENSE', isFixed: true },
  { name: '관리비', group: '주거', type: 'EXPENSE', isFixed: true },
  { name: '전기·가스·수도', group: '주거', type: 'EXPENSE', isFixed: true },

  { name: '휴대폰', group: '통신', type: 'EXPENSE', isFixed: true },
  { name: '인터넷·TV', group: '통신', type: 'EXPENSE', isFixed: true },
  { name: '구독 서비스', group: '통신', type: 'EXPENSE', isFixed: true },

  { name: '유류비', group: '차량', type: 'EXPENSE', isFixed: false },
  { name: '보험료', group: '차량', type: 'EXPENSE', isFixed: true },
  { name: '자동차세·검사', group: '차량', type: 'EXPENSE', isFixed: true },
  { name: '주차·통행료', group: '차량', type: 'EXPENSE', isFixed: false },
  { name: '대중교통', group: '차량', type: 'EXPENSE', isFixed: false },

  { name: '아침', group: '식비', type: 'EXPENSE', isFixed: false },
  { name: '점심', group: '식비', type: 'EXPENSE', isFixed: false },
  { name: '저녁·식재료', group: '식비', type: 'EXPENSE', isFixed: false },
  { name: '카페·간식', group: '식비', type: 'EXPENSE', isFixed: false },

  { name: '운동', group: '건강', type: 'EXPENSE', isFixed: true },
  { name: '의료비', group: '건강', type: 'EXPENSE', isFixed: false },

  { name: '미용', group: '생활', type: 'EXPENSE', isFixed: false },
  { name: '의류·잡화', group: '생활', type: 'EXPENSE', isFixed: false },
  { name: '생필품', group: '생활', type: 'EXPENSE', isFixed: false },

  { name: '약속·데이트', group: '여가', type: 'EXPENSE', isFixed: false },
  { name: '취미', group: '여가', type: 'EXPENSE', isFixed: false },
  { name: '여행', group: '여가', type: 'EXPENSE', isFixed: false },
  { name: '경조사', group: '여가', type: 'EXPENSE', isFixed: false },

  // 자산으로 남는 지출 — 볼륨이 아니라 저축률의 분자다(§2.2)
  { name: '예적금', group: '저축·투자', type: 'SAVING', isFixed: true },
  { name: '주택청약', group: '저축·투자', type: 'SAVING', isFixed: true },
  { name: '투자', group: '저축·투자', type: 'SAVING', isFixed: false },
  { name: '연금', group: '저축·투자', type: 'SAVING', isFixed: true },

  // 부채 원금 상환 — 순자산이 늘므로 지출과 구분한다(§2.2)
  { name: '대출 원금 상환', group: '부채 상환', type: 'TRANSFER', isFixed: true },

  { name: '급여', group: '수입', type: 'INCOME', isFixed: false },
  { name: '기타 소득', group: '수입', type: 'INCOME', isFixed: false },
]

/** 한국 직장인 공통 항목. 금액은 사용자가 설정에서 넣는다. */
const DEDUCTION_LABELS = ['소득세', '지방소득세', '국민연금', '건강보험', '고용보험']

/** §2.1 — 급여일은 설정값이다. 25일은 흔한 기본값일 뿐 고정이 아니다. */
const DEFAULT_PAYDAY = 25

export async function isSeeded(): Promise<boolean> {
  return (await financeDb.categories.count()) > 0
}

/** 이미 데이터가 있으면 아무것도 하지 않는다 */
export async function seedIfEmpty(): Promise<boolean> {
  if (await isSeeded()) return false

  await financeDb.transaction(
    'rw',
    [financeDb.categories, financeDb.groups, financeDb.incomeSettings],
    async () => {
      const groupIdByName = new Map<string, string>()
      for (const name of [...new Set(CATEGORIES.map((seed) => seed.group))]) {
        const id = newId()
        groupIdByName.set(name, id)
        await financeDb.groups.add({
          id,
          name,
          sortOrder: groupIdByName.size - 1,
        })
      }

      await financeDb.categories.bulkAdd(
        CATEGORIES.map((seed, index) => ({
          id: newId(),
          name: seed.name,
          groupId: groupIdByName.get(seed.group)!,
          type: seed.type,
          budget: 0,
          isFixed: seed.isFixed,
          sortOrder: index,
          isArchived: false,
        })),
      )

      await financeDb.incomeSettings.add({
        id: 'default',
        grossPay: 0,
        netPay: 0,
        payday: DEFAULT_PAYDAY,
        deductions: DEDUCTION_LABELS.map((label) => ({
          label,
          amount: 0,
          isTransfer: false,
        })),
      })
    },
  )
  return true
}
