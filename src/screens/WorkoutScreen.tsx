import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, IconButton } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { ExerciseTypeBadge } from '../components/ExerciseTypeBadge'
import { NumberField } from '../components/fields'
import {
  SET_TYPE_CLASS,
  SET_TYPE_MARK,
  nextSetType,
} from '../components/setTypeMeta'
import { unlockAlarm } from '../lib/alarm'
import { formatDuration } from '../lib/duration'
import { useRestTimer } from '../lib/restTimerContext'
import { useElapsed } from '../lib/useElapsed'
import { useWakeLock } from '../lib/useWakeLock'
import type { Exercise, WorkoutSet } from '../db/types'
import {
  addExerciseToWorkout,
  addWorkoutSet,
  discardWorkout,
  getWorkout,
  listWorkoutItems,
  removeLastWorkoutSet,
  removeWorkoutExercise,
  setChecklistChecked,
  setWorkoutSetCompleted,
  updateWorkoutSet,
  type WorkoutItem,
} from '../db/workouts'
import { ExercisePickerSheet } from './ExercisePickerSheet'
import { WorkoutDetailScreen } from './WorkoutDetailScreen'
import { WorkoutFinishSheet } from './WorkoutFinishSheet'

/** 진행 중인 휴식. 화면에만 사는 값이라 DB에 남기지 않는다. */
/**
 * 마지막 세트 후 이만큼 지나면 종료를 묻는다 — §6.3
 *
 * 종료를 깜빡하면 하룻밤이 운동 시간으로 기록된다. 그런데 **앱이 닫힌 뒤에
 * 울리는 알림은 만들 수 없다** — 웹 푸시는 서버가 필요하고(백엔드 없음 원칙),
 * 예약 알림 API는 iOS에 없다. 그래서 앱이 열려 있는 동안, 그리고 다시 열었을
 * 때 묻는다. 후자가 "깜빡한 세션"의 실제 해결책이다.
 */
const IDLE_LIMIT_MS = 10 * 60 * 1000

/**
 * 세션 진행 화면 — §5.1
 * 헬스장에서 땀난 손으로, 세트 사이 짧은 시간에, 한 손으로 조작한다.
 */
export function WorkoutScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [picking, setPicking] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  /** "계속하기"를 누른 시각. 여기서부터 다시 10분을 센다 */
  const [idleSnoozedAt, setIdleSnoozedAt] = useState(0)
  /** 자동 종료로 들어간 경우의 종료 시각 */
  const [finishAt, setFinishAt] = useState<number>()

  const workout = useLiveQuery(
    () => (id ? getWorkout(id) : undefined),
    [id],
    undefined,
  )
  const items = useLiveQuery(() => (id ? listWorkoutItems(id) : []), [id])
  // 카운트업이 아니라 매 틱마다 Date.now()와의 차이를 새로 구한다 — §6.1
  const elapsed = useElapsed(
    workout && workout.endedAt === undefined ? workout.startedAt : undefined,
  )

  const isRunning = workout !== undefined && workout.endedAt === undefined
  // 화면이 꺼지면 JS 타이머가 멈춘다 — 세션 동안 켜 둔다(§6.2)
  useWakeLock(isRunning)

  // 휴식 상태는 라우터 위의 프로바이더가 들고 있다 — 화면을 떠나도
  // 타이머가 살아 있어야 알람이 울린다(§6.2)
  const { start: startRest } = useRestTimer()

  if (!id) return null

  // 종료된 세션은 읽기 전용 상세로 보여준다
  if (workout?.endedAt !== undefined) {
    return <WorkoutDetailScreen workoutId={id} />
  }

  if (items !== undefined && workout === undefined) {
    return (
      <EmptyState
        title="세션을 찾을 수 없습니다"
        action={<Button onClick={() => navigate('/')}>홈으로</Button>}
      />
    )
  }

  const completedSets =
    items?.reduce(
      (sum, item) => sum + item.sets.filter((set) => set.isCompleted).length,
      0,
    ) ?? 0
  const totalSets =
    items?.reduce((sum, item) => sum + item.sets.length, 0) ?? 0

  // 마지막으로 완료 체크한 세트의 시각 — §6.3
  const lastCompletedAt =
    items?.reduce(
      (latest, item) =>
        item.sets.reduce(
          (inner, set) => Math.max(inner, set.completedAt ?? 0),
          latest,
        ),
      0,
    ) ?? 0

  /**
   * 렌더 중에 Date.now()를 부르지 않는다. elapsed가 250ms마다 갱신되므로
   * startedAt + elapsed 가 지금 시각이고, 이렇게 두면 순수하게 유지되면서
   * 포그라운드에 있는 동안 저절로 다시 평가된다.
   */
  const approxNow = (workout?.startedAt ?? 0) + elapsed
  const idleSince = Math.max(lastCompletedAt, idleSnoozedAt)
  // 세트를 한 번도 체크하지 않은 세션은 묻지 않는다 — 준비 중일 수 있다
  const askAutoFinish =
    isRunning &&
    lastCompletedAt > 0 &&
    finishAt === undefined &&
    !finishing &&
    approxNow - idleSince >= IDLE_LIMIT_MS

  async function discard() {
    await discardWorkout(id!)
    navigate('/', { replace: true })
  }

  /**
   * 세트 완료 체크 → 그 종목의 휴식 시간만큼 카운트다운을 건다.
   * restSeconds가 0이면 §4.4의 슈퍼세트 표현이므로 쉬지 않고 넘어간다.
   */
  async function toggleSet(set: WorkoutSet, item: WorkoutItem, next: boolean) {
    // iOS는 제스처 밖에서 시작한 오디오를 막는다. 이 탭이 그 제스처다.
    unlockAlarm()
    await setWorkoutSetCompleted(set.id, next)

    if (!next || !item.restSeconds || item.restSeconds <= 0) return
    startRest(item.exerciseName, item.restSeconds)
  }

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 bg-zinc-100/90 px-4 pt-3 pb-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[20px] font-bold text-zinc-900">
              {workout?.templateName ?? '세션'}
            </h1>
            <p className="text-[12px] text-zinc-500">
              세트 {completedSets}/{totalSets} 완료
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[22px] leading-tight font-semibold tabular-nums text-zinc-900">
              {formatDuration(elapsed)}
            </p>
            <p className="text-[11px] text-zinc-400">경과</p>
          </div>
        </div>
        <div className="mt-2 flex gap-2">
          <Button
            variant="danger"
            className="flex-1"
            onClick={() => setConfirmingDiscard(true)}
          >
            운동 취소
          </Button>
          <Button
            variant="primary"
            className="flex-2"
            onClick={() => setFinishing(true)}
          >
            운동 종료
          </Button>
        </div>
      </header>

      {items === undefined ? null : items.length === 0 ? (
        <EmptyState
          title="종목이 비어 있습니다"
          action={
            <Button variant="primary" onClick={() => setPicking(true)}>
              종목 추가
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3 px-4 pt-1">
          {items.map((item) => (
            <WorkoutItemCard
              key={item.id}
              item={item}
              onToggleSet={toggleSet}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 px-4 py-4">
        <Button onClick={() => setPicking(true)}>+ 종목 추가</Button>
      </div>


      {picking && (
        <ExercisePickerSheet
          onPick={async (exercise: Exercise) => {
            await addExerciseToWorkout(id, exercise)
          }}
          onClose={() => setPicking(false)}
        />
      )}

      {finishing && (
        <WorkoutFinishSheet
          workoutId={id}
          incompleteSets={totalSets - completedSets}
          endedAt={finishAt}
          onClose={() => {
            setFinishing(false)
            setFinishAt(undefined)
          }}
          onFinished={() => navigate('/', { replace: true })}
        />
      )}

      {askAutoFinish && (
        <ConfirmDialog
          title="운동을 종료할까요?"
          description={
            <>
              <p>
                마지막 세트를 체크한 뒤{' '}
                {Math.floor((approxNow - lastCompletedAt) / 60000)}분 동안
                변화가 없습니다.
              </p>
              <p className="mt-1">
                종료하면 지금이 아니라{' '}
                <b className="tabular-nums">
                  {new Date(lastCompletedAt).toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </b>
                로 기록됩니다. 쉬는 중이면 계속하기를 누르세요.
              </p>
            </>
          }
          confirmLabel="종료"
          onConfirm={() => {
            setFinishAt(lastCompletedAt)
            setFinishing(true)
          }}
          onCancel={() => setIdleSnoozedAt(approxNow)}
        />
      )}

      {confirmingDiscard && (
        <ConfirmDialog
          title="이 운동을 취소할까요?"
          description="입력한 세트가 모두 사라지고 기록이 남지 않습니다."
          confirmLabel="취소하기"
          onConfirm={discard}
          onCancel={() => setConfirmingDiscard(false)}
        />
      )}
    </div>
  )
}

function WorkoutItemCard({
  item,
  onToggleSet,
}: {
  item: WorkoutItem
  onToggleSet: (set: WorkoutSet, item: WorkoutItem, next: boolean) => void
}) {
  const done = item.sets.filter((set) => set.isCompleted).length
  // 지역 const로 받아야 아래 map 콜백 안에서도 타입 내로잉이 유지된다
  const type = item.exerciseType

  return (
    <li className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-zinc-900">
          {item.exerciseName}
        </span>
        <ExerciseTypeBadge type={type} />
        {type !== 'CHECKLIST' && (
          <span className="shrink-0 text-[12px] tabular-nums text-zinc-400">
            {done}/{item.sets.length}
          </span>
        )}
        <IconButton
          aria-label="종목 제거"
          className="text-zinc-300"
          onClick={() => removeWorkoutExercise(item.id)}
        >
          <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
            <path
              d="M5 5l10 10M15 5L5 15"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </IconButton>
      </div>

      {type === 'CHECKLIST' ? (
        <button
          type="button"
          onClick={() => setChecklistChecked(item.id, !item.isChecked)}
          className={`mt-2 flex min-h-12 w-full items-center gap-3 rounded-xl px-3 transition-colors ${
            item.isChecked
              ? 'bg-zinc-900 text-white'
              : 'bg-zinc-50 text-zinc-500 ring-1 ring-zinc-200'
          }`}
        >
          <CheckMark checked={!!item.isChecked} />
          <span className="text-[15px] font-medium">완료</span>
        </button>
      ) : (
        <>
          <ul className="mt-2 flex flex-col gap-1.5">
            {item.sets.map((set) => (
              <SetRow
                key={set.id}
                set={set}
                type={type}
                onToggle={(next) => onToggleSet(set, item, next)}
              />
            ))}
          </ul>
          {type !== 'CARDIO' && (
            <div className="mt-2 flex gap-2">
              <Button className="flex-1" onClick={() => addWorkoutSet(item.id)}>
                + 세트
              </Button>
              <Button
                className="flex-1"
                disabled={item.sets.length === 0}
                onClick={() => removeLastWorkoutSet(item.id)}
              >
                − 마지막 세트
              </Button>
            </div>
          )}
        </>
      )}
    </li>
  )
}

function SetRow({
  set,
  type,
  onToggle,
}: {
  set: WorkoutSet
  type: 'WEIGHT_REPS' | 'TIME' | 'CARDIO'
  onToggle: (next: boolean) => void
}) {
  // 유산소는 세트가 하나뿐이라 번호를 매기거나 타입을 바꿀 일이 없다
  const isCardio = type === 'CARDIO'
  return (
    <li className="flex items-center gap-1.5">
      {/* 세트 번호를 탭하면 워밍업·실패·드롭으로 순환한다 — §7 */}
      {!isCardio && (
        <button
          type="button"
          aria-label={`세트 ${set.setNumber} 타입 변경`}
          onClick={() =>
            updateWorkoutSet(set.id, { setType: nextSetType(set.setType) })
          }
          className={`size-11 shrink-0 rounded-xl text-[13px] font-semibold tabular-nums ${SET_TYPE_CLASS[set.setType]}`}
        >
          {SET_TYPE_MARK[set.setType] || set.setNumber}
        </button>
      )}

      {type === 'WEIGHT_REPS' ? (
        <>
          <NumberField
            key={`${set.id}-weight`}
            value={set.weight}
            suffix="kg"
            decimal
            onChange={(weight) => updateWorkoutSet(set.id, { weight })}
          />
          <NumberField
            key={`${set.id}-reps`}
            value={set.reps}
            suffix="회"
            onChange={(reps) => updateWorkoutSet(set.id, { reps })}
          />
        </>
      ) : isCardio ? (
        <NumberField
          key={`${set.id}-minutes`}
          value={
            set.seconds === undefined ? undefined : Math.round(set.seconds / 60)
          }
          suffix="분"
          onChange={(minutes) =>
            updateWorkoutSet(set.id, {
              seconds: minutes === undefined ? undefined : minutes * 60,
            })
          }
        />
      ) : (
        <NumberField
          key={`${set.id}-seconds`}
          value={set.seconds}
          suffix="초"
          onChange={(seconds) => updateWorkoutSet(set.id, { seconds })}
        />
      )}

      <button
        type="button"
        aria-label={set.isCompleted ? '완료 취소' : '완료'}
        onClick={() => onToggle(!set.isCompleted)}
        className={`flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
          set.isCompleted
            ? 'bg-zinc-900 text-white'
            : 'bg-zinc-50 text-zinc-300 ring-1 ring-zinc-200'
        }`}
      >
        <CheckMark checked={set.isCompleted} />
      </button>
    </li>
  )
}

function CheckMark({ checked }: { checked: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="size-5 shrink-0" aria-hidden="true">
      <path
        d="M4 10.5l4 4 8-9"
        stroke="currentColor"
        strokeWidth={checked ? 2.2 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
