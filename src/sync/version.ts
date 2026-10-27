/**
 * dbVersion 가드 — docs/spec-sync-v0.1.md §8
 *
 * 순수 함수로 떼어낸 이유: 방향이 뒤집히면 동기화가 교착에 빠지고,
 * 그 증상("동기화가 안 된다")으로는 원인을 짚기 어렵다. 실제로 한 번
 * 겪었다. 하네스가 못 박아 둔다(`npm run check:dbversion`).
 *
 * 핵심 — 원격의 `dbVersion`은 *마지막으로 올린 기기의 스키마 기록*이지
 * 상대 기기의 현재 스키마가 아니다. 스키마를 올리면 양쪽 기기가 모두 새
 * 버전이어도 원격 기록은 옛 번호로 남는다.
 */

/**
 * 올리기를 막아야 하는가.
 *
 * 내 앱이 원격 데이터보다 낡았을 때만 막는다 — 내가 모르는 필드를
 * 떨어뜨린 채 덮어쓰기 때문이다. 반대로 원격이 낡은 것은 정상이고,
 * 올려서 끌어올리는 것이 교착을 푸는 경로다.
 */
export function pushBlockedByVersion(
  remoteVersion: number,
  localVersion: number,
): boolean {
  return remoteVersion > localVersion
}

/**
 * 받기를 막아야 하는가.
 *
 * 원격이 내 앱보다 새로우면 막는다. 모르는 필드를 복원하면 다음 push에서
 * 그 필드가 사라진 채 올라가 데이터가 조용히 깎인다.
 *
 * 원격이 낡은 경우는 받는다. 스키마 변경을 **필드 추가로만** 제한하므로
 * 없는 필드는 비어 있을 뿐이고, 막으면 올릴 것이 없는 새 기기가 옛 원격을
 * 영원히 못 받는다.
 */
export function pullBlockedByVersion(
  remoteVersion: number,
  localVersion: number,
): boolean {
  return remoteVersion > localVersion
}
