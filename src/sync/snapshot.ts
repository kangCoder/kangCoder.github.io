/**
 * 스냅샷 인코딩 — docs/spec-sync-v0.1.md §3.2
 *
 * 테이블 하나를 gzip된 바이트로 만들고 되돌린다.
 *
 * **왜 압축하는가.** Firestore 문서 한도는 1 MiB다. workoutSets 10년치가
 * 약 7.5 MB로 추정되므로 비압축으로는 테이블 하나도 못 담는다. JSON은
 * 3~5배 줄어든다.
 *
 * **왜 base64가 아닌가.** base64는 용량을 33% 늘린다. Firestore `Bytes`에
 * gzip 결과를 그대로 담으면 그 손실이 없다.
 *
 * **왜 라이브러리를 안 쓰는가.** `CompressionStream`이 표준이다.
 * Safari 16.4+ / iOS 16.4+ 가 요구 사양이고, 미지원 브라우저에서는
 * 비압축 JSON 문자열로 떨어진다(§3.2). 문서가 `gz`/`json` 중 어느 필드를
 * 가졌는지로 디코더가 구분하므로 섞여 있어도 읽는다.
 */

export function supportsCompression(): boolean {
  return (
    typeof CompressionStream === 'function' &&
    typeof DecompressionStream === 'function'
  )
}

/** 압축된 테이블 하나. gz와 json 중 정확히 하나가 들어 있다 */
export type EncodedTable =
  | { gz: Uint8Array; json?: undefined }
  | { json: string; gz?: undefined }

export async function encodeTable(rows: unknown[]): Promise<EncodedTable> {
  const text = JSON.stringify(rows)
  if (!supportsCompression()) return { json: text }

  const compressed = new Blob([text])
    .stream()
    .pipeThrough(new CompressionStream('gzip'))
  const buffer = await new Response(compressed).arrayBuffer()
  return { gz: new Uint8Array(buffer) }
}

export async function decodeTable(encoded: EncodedTable): Promise<unknown[]> {
  if (encoded.json !== undefined) return parseRows(encoded.json)

  if (!supportsCompression()) {
    throw new SnapshotFormatError(
      '이 브라우저는 압축을 지원하지 않아 동기화 데이터를 읽을 수 없습니다',
    )
  }

  // Uint8Array를 Blob에 그대로 넣는다 — 복사 한 번을 아낄 수 있지만
  // ArrayBuffer 소유권 문제가 생기므로 단순한 쪽을 택한다
  const decompressed = new Blob([encoded.gz as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
  return parseRows(await new Response(decompressed).text())
}

export class SnapshotFormatError extends Error {}

function parseRows(text: string): unknown[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new SnapshotFormatError('스냅샷이 JSON이 아닙니다')
  }
  if (!Array.isArray(parsed)) {
    throw new SnapshotFormatError('스냅샷 테이블이 배열이 아닙니다')
  }
  return parsed
}

/** 표시용 — 설정 화면에서 "1.2 MB" 처럼 쓴다 */
export function encodedSize(encoded: EncodedTable): number {
  return encoded.gz?.byteLength ?? new Blob([encoded.json ?? '']).size
}
